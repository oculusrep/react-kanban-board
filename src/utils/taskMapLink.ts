import { TaskWithRelations } from '../types/task';

// Deep-link paths into the map (/mapping) that center a pin and open its
// detail slideout on mount (handled in MappingPageNew). Used to send a task's
// linked object to the map instead of the record's edit page.
//
// Note the query-param spelling: property uses `property`, site submit uses
// the hyphenated `site-submit` — matching the handlers in MappingPageNew and
// CopyMapLinkButton usages elsewhere.

export const mapPathForProperty = (propertyId: string): string =>
  `/mapping?property=${propertyId}`;

export const mapPathForSiteSubmit = (siteSubmitId: string): string =>
  `/mapping?site-submit=${siteSubmitId}`;

// A deal has no pin of its own; it resolves to its linked property first, then
// its site submit (same precedence as DealDetailsSlideout's map link). Returns
// null when the deal has neither, so callers can fall back to the deal page.
export const mapPathForDeal = (
  deal: { property_id?: string | null; site_submit_id?: string | null }
): string | null =>
  deal.property_id
    ? mapPathForProperty(deal.property_id)
    : deal.site_submit_id
    ? mapPathForSiteSubmit(deal.site_submit_id)
    : null;

// Best single map target for a whole task (property > site submit > deal),
// or null if the task links to nothing mappable.
export const taskMapPath = (task: TaskWithRelations): string | null => {
  if (task.property) return mapPathForProperty(task.property.id);
  if (task.site_submit) return mapPathForSiteSubmit(task.site_submit.id);
  if (task.deal) return mapPathForDeal(task.deal);
  return null;
};
