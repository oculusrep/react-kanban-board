// Compact label used in the Municipal Projects slideout and KML export.
// Format: "+<total_units> <stage_abbreviation>", with each side dropped if
// missing — so we still show what we have for in-progress projects.
//
// Examples:
//   formatUnitsLabel(50, 'UR')   -> "+50 UR"
//   formatUnitsLabel(50, null)   -> "+50"
//   formatUnitsLabel(null, 'UR') -> "UR"
//   formatUnitsLabel(null, null) -> ""

export function formatUnitsLabel(
  totalUnits: number | null | undefined,
  abbreviation: string | null | undefined,
): string {
  const unitPart = totalUnits != null && Number.isFinite(totalUnits) ? `+${totalUnits}` : '';
  const abbrPart = (abbreviation ?? '').trim();
  return [unitPart, abbrPart].filter(Boolean).join(' ');
}
