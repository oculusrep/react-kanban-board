-- Universal clause_type taxonomy seed
-- Source: Starbucks LOI Handbook table of contents + commercial real estate
-- LOI conventions. Names are stable canonical keys; display_name is human-readable.
-- This taxonomy is shared across all clients (per spec Q15 C-relaxed). Each
-- client's actual clause text and headings live in legal_playbook (next migration).
--
-- Confidence tiers:
--   HIGH   = playbook is explicit and structured; AI is aggressive
--   MEDIUM = some judgment needed; AI is conservative
--   LOW    = playbook is vague or stakes are low; AI auto-escalates

INSERT INTO clause_type (name, display_name, sort_order, default_confidence_tier, description) VALUES
  ('parties',                       'Parties',                       10,  'MEDIUM', 'Identifies tenant, landlord, and (where applicable) tenants-in-common structure.'),
  ('premises',                      'Premises',                      20,  'MEDIUM', 'Square footage, dimensions, type (in-line/end-cap/pad/drive-through), site plan attachment.'),
  ('landlord_property_interest',    'Landlord Property Interest',    30,  'MEDIUM', 'Landlord''s ownership status: fee owner, ground lessee, or under contract to purchase.'),
  ('lease',                         'Lease (Form)',                  40,  'MEDIUM', 'Which form lease serves as the basis for negotiation (Starbucks standard, landlord form, conforming precedent).'),
  ('term',                          'Term',                          50,  'HIGH',   'Initial term length and number/length of options to extend.'),
  ('rent',                          'Rent',                          60,  'HIGH',   'Base rent schedule across initial term and option periods.'),
  ('percentage_rent',               'Percentage Rent',               70,  'HIGH',   'Whether tenant pays a percentage of gross sales as additional rent.'),
  ('rent_commencement',             'Rent Commencement',             80,  'HIGH',   'Trigger and timing for when rent payments begin.'),
  ('use',                           'Use',                           90,  'HIGH',   'Permitted use clause — broad retail vs coffee-store-only.'),
  ('exclusive_use',                 'Exclusive Use & Prohibited Use',100, 'HIGH',   'Tenant''s exclusive right to sell certain products and prohibited co-tenant uses.'),
  ('early_termination',             'Early Termination',             110, 'HIGH',   'Tenant''s right to terminate the lease early and any associated fee.'),
  ('continuous_operations',         'Continuous Operations',         120, 'HIGH',   'Whether tenant must remain open and operating throughout the term.'),
  ('scheduled_delivery_date',       'Scheduled Delivery Date',       130, 'MEDIUM', 'Date by which landlord must deliver possession of the premises.'),
  ('delivery_date_delays',          'Delivery Date Delays',          140, 'MEDIUM', 'Remedies (free rent, termination, reimbursement) for late delivery.'),
  ('landlord_work_and_contribution','Landlord Work and Contribution',150, 'HIGH',   'Landlord''s construction obligations and Tenant Improvement Allowance.'),
  ('construction_contingency',      'Construction Contingency',      160, 'MEDIUM', 'Tenant relief if common areas / parking are not substantially complete.'),
  ('initial_cotenancy',             'Initial Co-Tenancy',            170, 'HIGH',   'Occupancy thresholds (e.g., 80%) and key-tenant requirements before tenant must open.'),
  ('ongoing_cotenancy',             'Ongoing Co-Tenancy',            180, 'HIGH',   'Occupancy thresholds during the term; remedies if center falls below.'),
  ('tenant_improvements',           'Tenant Improvements',           190, 'MEDIUM', 'Scope and approval process for tenant''s build-out.'),
  ('signage',                       'Signage',                       200, 'MEDIUM', 'Building signage, monument/pylon signage, and approval rights.'),
  ('condition_of_premises',         'Condition of Premises',         210, 'MEDIUM', 'Required physical condition at delivery (broom-clean, code-compliant, latent-defect coverage).'),
  ('utilities',                     'Utilities',                     220, 'LOW',    'Tenant''s utility connections and metering.'),
  ('trash_and_recycling',           'Trash and Recycling',           230, 'LOW',    'Trash service, hauler selection, dumpster access.'),
  ('hazardous_materials',           'Hazardous Materials',           240, 'MEDIUM', 'Landlord representations and indemnities re: environmental contamination.'),
  ('cam_taxes_insurance',           'CAM, Taxes and Insurance',      250, 'HIGH',   'Operating expense pass-throughs, exclusions, caps, and audit rights.'),
  ('pro_rata_share',                'Pro-Rata Share',                260, 'HIGH',   'Method for calculating tenant''s share of operating expenses.'),
  ('outdoor_seating',               'Outdoor Seating',               270, 'LOW',    'Outdoor seating area dimensions, exclusivity, and operations.'),
  ('parking',                       'Parking',                       280, 'MEDIUM', 'Reserved spaces, ratios, and exclusivity.'),
  ('permit_contingency',            'Permit Contingency',            290, 'MEDIUM', 'Tenant''s ability to terminate if required permits cannot be obtained.'),
  ('assignment_and_subletting',     'Assignment and Subletting',     300, 'HIGH',   'Tenant''s right to assign or sublet without landlord consent.'),
  ('alternative_energy_systems',    'Alternative Energy Systems',    310, 'LOW',    'Solar / EV charging / other alternative energy installations.'),
  ('brokers_commission',            'Broker''s Commission',          320, 'MEDIUM', 'Landlord''s obligation to pay broker commissions.'),
  ('audit_right',                   'Audit Right',                   330, 'MEDIUM', 'Tenant''s right to audit landlord''s operating expense calculations.'),
  ('warranty_and_representation',   'Warranty and Representation',   340, 'MEDIUM', 'Landlord''s warranties about title, authority, environmental status.'),
  ('confidentiality',               'Confidentiality',               350, 'LOW',    'Treatment of LOI as confidential between the parties.')
ON CONFLICT (name) DO NOTHING;
