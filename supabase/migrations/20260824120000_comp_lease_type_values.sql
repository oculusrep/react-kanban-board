-- Comp Database — redefine lease_comp.lease_type to the domain's real lease structures.
-- Old placeholder set (nnn/gross/modified_gross/ground) -> Ground Lease, BTS (NNN), BTS (NN),
-- Multi-Tenant. The comp DB is new with no production lease rows yet, so this is a straight swap.
-- Conditional entry fields per type live in src/lib/compTypes.ts (LEASE_TYPE_FIELDS).

-- Drop the old constraint FIRST so the remap below isn't blocked by it, then remap, then re-add.
ALTER TABLE lease_comp DROP CONSTRAINT IF EXISTS lease_comp_lease_type_check;

UPDATE lease_comp SET lease_type = 'ground_lease' WHERE lease_type = 'ground';
UPDATE lease_comp SET lease_type = 'bts_nnn'      WHERE lease_type = 'nnn';
UPDATE lease_comp SET lease_type = 'multi_tenant' WHERE lease_type IN ('gross', 'modified_gross');

ALTER TABLE lease_comp ADD CONSTRAINT lease_comp_lease_type_check
  CHECK (lease_type IN ('ground_lease', 'bts_nnn', 'bts_nn', 'multi_tenant'));
