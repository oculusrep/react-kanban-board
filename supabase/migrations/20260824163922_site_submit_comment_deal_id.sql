-- Allow chat/comments to attach to a deal that has no site submit (e.g. Broker
-- of Record deals). Existing site-submit comments are unchanged; the app only
-- keys off deal_id when a comment has no site submit.
alter table site_submit_comment
  add column if not exists deal_id uuid references deal(id) on delete cascade;

alter table site_submit_comment
  alter column site_submit_id drop not null;

-- Every comment must target exactly one of the two (at least one).
alter table site_submit_comment
  drop constraint if exists site_submit_comment_target_present;
alter table site_submit_comment
  add constraint site_submit_comment_target_present
  check (site_submit_id is not null or deal_id is not null);

create index if not exists idx_site_submit_comment_deal_id
  on site_submit_comment(deal_id) where deal_id is not null;
