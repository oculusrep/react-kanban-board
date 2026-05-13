#!/usr/bin/env python3
"""
import_starbucks_kml.py

Parses a Starbucks GA target-areas KML file and emits idempotent SQL upserts into
the public.starbucks_target_area table.

Usage:
    python scripts/import_starbucks_kml.py path/to/GA_Target_Areas.kml > seed.sql
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f seed.sql

The output is wrapped in a single BEGIN/COMMIT transaction. Each INSERT uses
ON CONFLICT (target_area_id) DO UPDATE so re-imports are safe and pick up
edits Starbucks made to existing target areas. Rows removed from the KML
remain in the database — that's intentional so any OVIS-side annotations we
attach to a target_area in the future are preserved. Delete manually if needed.

History:
- 2026-05-12: Saved to scripts/. The spec-provided version targeted a plural
  table name (public.starbucks_target_areas); this version uses the singular
  starbucks_target_area to match OVIS naming conventions (see
  STARBUCKS_LAYER_SPEC.md and the supabase migration named
  20260512000001_starbucks_target_area_layer.sql).
"""
import sys
import xml.etree.ElementTree as ET
from datetime import datetime

KML_NS = {"kml": "http://www.opengis.net/kml/2.2"}

# Map KML SimpleData "name" -> (DB column, SQL type).
FIELD_MAP = {
    "TARGET_AREA_ID":                  ("target_area_id",                "text"),
    "TARGETAREA_NAME_ENGLISH":         ("name",                          "text"),
    "Target Area Store Type":          ("store_type",                    "text"),
    "TARGET_OPEN_DATE":                ("target_open_date",              "text"),
    "TargetArea_Notes":                ("notes",                         "text"),
    "PREFERRED_REAL_ESTATE_AVAILABIL": ("re_availability",               "text"),
    "TargetArea_Priority":             ("priority",                      "int"),
    "TargetArea_UpdateUser":           ("target_area_update_user",       "text"),
    "TargetArea_UpdateDate":           ("target_area_update_date",       "timestamptz"),
    "CBSA":                            ("cbsa",                          "text"),
    "CBSA_NAME":                       ("cbsa_name",                     "text"),
    "COUNTRY":                         ("country",                       "text"),
    "MINIMARKET_ID":                   ("minimarket_id",                 "text"),
    "MINIMARKET_NAME":                 ("minimarket_name",               "text"),
    "MARKET_ID":                       ("market_id",                     "bigint"),
    "MARKET_NAME":                     ("market_name",                   "text"),
    "Model_Yr1_Sales":                 ("model_yr1_sales",               "numeric"),
    "Model_TC_PER":                    ("model_tc_per",                  "numeric"),
    "Model_Yr1_TC":                    ("model_yr1_tc",                  "numeric"),
    "Model_Cann_Risk":                 ("model_cann_risk",               "text"),
    "Model_Rent":                      ("model_rent",                    "numeric"),
    "Model_Other_Occ":                 ("model_other_occ",               "numeric"),
    "Model_Store_Cost":                ("model_store_cost",              "numeric"),
    "Model_Last_Update_Date":          ("model_last_update_date",        "date"),
    "REGION_ID":                       ("region_id",                     "int"),
    "PLANNED_OPS_AREA_ID":             ("planned_ops_area_id",           "int"),
    "PLANNED_OPS_AREA_NAME":           ("planned_ops_area_name",         "text"),
    "RE_CONSTRAINT_PRIMARY":           ("re_constraint_primary",         "text"),
    "RE_CONSTRAINT_SECONDARY":         ("re_constraint_secondary",       "text"),
    "RE_CONSTRAINT_TERTIARY":          ("re_constraint_tertiary",        "text"),
    "RECOMMENDATION_DISTANCE":         ("recommendation_distance",       "numeric"),
    "RECOMMENDATION_ID":               ("recommendation_id",             "text"),
    "SDM/MDM":                         ("sdm_mdm",                       "text"),
    "STATE_PROVINCE":                  ("state_province",                "text"),
    "URBANITY_CODE":                   ("urbanity_code",                 "text"),
    "URBANITY_DESCRIPTION":            ("urbanity_description",          "text"),
    "TARGET_AREA_CREATED_DT":          ("target_area_created_dt",        "timestamptz"),
    "TARGET_AREA_CREATED_USER":        ("target_area_created_user",      "text"),
    "TARGET_AREA_PROXIMITY_ALERT":     ("target_area_proximity_alert",   "text"),
    "TARGET_AREA_SECONDARY_CONCEPT":   ("target_area_secondary_concept", "text"),
    "TARGET_AREA_STORE_FORMAT":        ("target_area_store_format",      "text"),
}

TABLE_NAME = "public.starbucks_target_area"


def sql_literal(value, sqltype):
    """Return a SQL literal for a value cast to sqltype, or NULL."""
    if value is None or value == "":
        return "NULL"
    if sqltype == "text":
        return "'" + value.replace("'", "''") + "'"
    if sqltype in ("int", "bigint"):
        return str(int(float(value)))  # tolerate "9.0"
    if sqltype == "numeric":
        return str(float(value))
    if sqltype == "date":
        # Starbucks sends YYYY-MM-DD
        return "'" + value + "'::date"
    if sqltype == "timestamptz":
        # Format: "2026-01-20 14:10:40"
        return "'" + value + "'::timestamptz"
    raise ValueError(f"Unknown sqltype: {sqltype}")


def parse_polygon_to_wkt(placemark):
    """Convert KML Polygon -> WKT POLYGON((...)). Returns None if no polygon."""
    coords_el = placemark.find(
        ".//kml:Polygon/kml:outerBoundaryIs/kml:LinearRing/kml:coordinates",
        KML_NS,
    )
    if coords_el is None or not coords_el.text:
        return None
    pairs = []
    for token in coords_el.text.strip().split():
        parts = token.split(",")
        if len(parts) < 2:
            continue
        lon, lat = parts[0], parts[1]
        pairs.append(f"{float(lon)} {float(lat)}")
    if len(pairs) < 4:
        return None
    # Ensure ring is closed
    if pairs[0] != pairs[-1]:
        pairs.append(pairs[0])
    return "POLYGON((" + ", ".join(pairs) + "))"


def main(path):
    tree = ET.parse(path)
    root = tree.getroot()
    placemarks = root.findall(".//kml:Placemark", KML_NS)

    print("-- Auto-generated by scripts/import_starbucks_kml.py")
    print(f"-- Source: {path}")
    print(f"-- Generated: {datetime.utcnow().isoformat()}Z")
    print(f"-- Placemark count: {len(placemarks)}")
    print("begin;")
    print()

    columns = [col for col, _ in FIELD_MAP.values()] + ["geom"]
    col_list = ", ".join(columns)

    update_cols = [c for c in columns if c != "target_area_id"]
    update_set = ", ".join(f"{c} = excluded.{c}" for c in update_cols)

    for pm in placemarks:
        values = {}
        for sd in pm.findall(".//kml:SimpleData", KML_NS):
            kml_name = sd.get("name")
            if kml_name in FIELD_MAP:
                col, sqltype = FIELD_MAP[kml_name]
                values[col] = sql_literal((sd.text or "").strip(), sqltype)

        wkt = parse_polygon_to_wkt(pm)
        if wkt is None:
            sys.stderr.write(
                f"WARN: skipped placemark with no polygon "
                f"(target_area_id={values.get('target_area_id')})\n"
            )
            continue
        values["geom"] = f"ST_GeomFromText('{wkt}', 4326)"

        # Fill in any unset columns as NULL.
        row_values = [values.get(c, "NULL") for c in columns]
        print(
            f"insert into {TABLE_NAME} ({col_list}) values\n"
            f"  ({', '.join(row_values)})\n"
            f"on conflict (target_area_id) do update set {update_set};"
        )

    print()
    print("commit;")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.stderr.write("Usage: python scripts/import_starbucks_kml.py <path-to-kml>\n")
        sys.exit(1)
    main(sys.argv[1])
