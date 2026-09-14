#!/usr/bin/env python3
"""
Load the NCES Private School Universe Survey (PSS) public-use CSV into
public.nces_private_school.

Data load, not a migration: the table comes from
supabase/migrations/20260914111943_nces_private_school.sql. Re-run this for a new PSS
vintage (PSS is biennial) with --url / --survey-year / --suffix.

Idempotent per vintage: inside ONE transaction it deletes that survey_year's rows and
re-inserts them, so a failed run leaves the previous load intact.

Usage (from the repo root):
    set -a && . ./.env && set +a
    python3 scripts/nces/load_pss.py            # 2023-24 defaults
    python3 scripts/nces/load_pss.py --dry-run  # parse + validate only
    # If Python can't verify TLS on this machine, download with curl and pass --zip:
    curl -sLo /tmp/pss.zip https://nces.ed.gov/surveys/pss/zip/pss2324_pu_csv.zip
    python3 scripts/nces/load_pss.py --zip /tmp/pss.zip

Source + codebook:
    https://nces.ed.gov/surveys/pss/pssdata.asp
    https://nces.ed.gov/pubs2024/2024011.pdf  (grade codes documented for 2021-22;
      the 2023-24 LOGR/HIGR values follow the same 1-17 scheme — checked against
      LEVEL for 99.6% of rows before decoding)
"""
import argparse
import csv
import io
import os
import subprocess
import sys
import tempfile
import urllib.request
import zipfile

DEFAULT_URL = "https://nces.ed.gov/surveys/pss/zip/pss2324_pu_csv.zip"

OUT_COLUMNS = [
    "ppin", "survey_year", "school_name", "address", "city", "state", "zip",
    "address_is_mailing", "county_name", "latitude", "longitude",
    "enrollment_k12_ungraded", "level_code", "lowest_grade_code", "highest_grade_code",
    "orientation_code", "typology_code", "source_file",
]


def int_or_none(v):
    v = (v or "").strip()
    if not v:
        return None
    n = int(float(v))
    return n


def transform(row, survey_year, suffix, source_file):
    # PSS fills PL_* (physical location) only when it differs from the mailing address.
    physical = bool((row.get("PL_ADD") or "").strip())
    lat = (row.get(f"LATITUDE{suffix}") or "").strip()
    lng = (row.get(f"LONGITUDE{suffix}") or "").strip()
    if not lat or not lng:
        return None
    enrollment = int_or_none(row.get("NUMSTUDS"))
    if enrollment is not None and enrollment < 0:  # PSS uses no negative sentinels today; guard anyway
        enrollment = None
    return {
        "ppin": row["PPIN"].strip(),
        "survey_year": survey_year,
        "school_name": row["PINST"].strip(),
        "address": (row["PL_ADD"] if physical else row["PADDRS"]).strip() or None,
        "city": (row["PL_CIT"] if physical else row["PCITY"]).strip() or None,
        "state": (row["PL_STABB"] if physical else row["PSTABB"]).strip() or None,
        "zip": (row["PL_ZIP"] if physical else row["PZIP"]).strip() or None,
        "address_is_mailing": "false" if physical else "true",
        "county_name": (row.get("PCNTNM") or "").strip() or None,
        "latitude": float(lat),
        "longitude": float(lng),
        "enrollment_k12_ungraded": enrollment,
        "level_code": int_or_none(row.get("LEVEL")),
        "lowest_grade_code": int_or_none(row.get(f"LOGR20{suffix}")),
        "highest_grade_code": int_or_none(row.get(f"HIGR20{suffix}")),
        "orientation_code": int_or_none(row.get("ORIENT")),
        "typology_code": int_or_none(row.get("TYPOLOGY")),
        "source_file": source_file,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_URL)
    ap.add_argument("--zip", help="load from a local copy of the zip instead of downloading")
    ap.add_argument("--survey-year", default="2023-2024")
    ap.add_argument("--suffix", default="24", help="two-digit year suffix on LATITUDExx / LOGR20xx")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if args.zip:
        source_file = args.url.rsplit("/", 1)[-1]  # record the official file name, not the local copy's
        print(f"Reading {args.zip} ...")
        with open(args.zip, "rb") as fh:
            payload = fh.read()
    else:
        source_file = args.url.rsplit("/", 1)[-1]
        print(f"Downloading {args.url} ...")
        with urllib.request.urlopen(args.url) as resp:
            payload = resp.read()
    zf = zipfile.ZipFile(io.BytesIO(payload))
    csv_name = next(n for n in zf.namelist() if n.lower().endswith(".csv"))
    text = zf.read(csv_name).decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    required = {"PPIN", "PINST", "PADDRS", "PCITY", "PSTABB", "PZIP", "NUMSTUDS", "LEVEL",
                f"LATITUDE{args.suffix}", f"LONGITUDE{args.suffix}",
                f"LOGR20{args.suffix}", f"HIGR20{args.suffix}"}
    missing = required - set(reader.fieldnames or [])
    if missing:
        sys.exit(f"CSV is missing expected columns: {sorted(missing)}")

    out, skipped = [], 0
    for row in reader:
        t = transform(row, args.survey_year, args.suffix, source_file)
        if t is None:
            skipped += 1
            continue
        out.append(t)

    ppins = [r["ppin"] for r in out]
    if len(set(ppins)) != len(ppins):
        sys.exit("Duplicate PPIN within one vintage — refusing to load.")
    print(f"Parsed {len(out)} schools from {csv_name} ({skipped} skipped for missing coordinates)")

    if args.dry_run:
        return

    db = os.environ.get("DATABASE_URL")
    if not db:
        sys.exit("DATABASE_URL not set (set -a && . ./.env && set +a)")

    with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="") as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLUMNS)
        w.writeheader()
        for r in out:
            w.writerow({k: ("" if v is None else v) for k, v in r.items()})
        tmp_csv = f.name

    sql = f"""
BEGIN;
DELETE FROM public.nces_private_school WHERE survey_year = '{args.survey_year}';
\\copy public.nces_private_school ({", ".join(OUT_COLUMNS)}) FROM '{tmp_csv}' WITH (FORMAT csv, HEADER true, NULL '')
SELECT survey_year, count(*) AS rows, count(enrollment_k12_ungraded) AS with_enrollment
  FROM public.nces_private_school WHERE survey_year = '{args.survey_year}' GROUP BY 1;
COMMIT;
"""
    try:
        subprocess.run(["psql", db, "-v", "ON_ERROR_STOP=1"], input=sql, text=True, check=True)
    finally:
        os.unlink(tmp_csv)


if __name__ == "__main__":
    main()
