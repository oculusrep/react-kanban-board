-- Starbucks playbook seed (V1 — 10 highest-stakes clauses)
-- Source: LOI Handbook (Revised October 8, 2024).
--
-- This seed populates the most-negotiated clauses end-to-end so the schema
-- and review UI can be exercised against real Starbucks data immediately.
-- The remaining ~25 clause types in the taxonomy will be filled in by the
-- handbook ingestion Edge Function (next deliverable) — that function reads
-- the full handbook and emits playbook + position rows for the long tail.
--
-- Idempotent: ON CONFLICT clauses make this safe to re-run.

DO $$
DECLARE
  sbux_id uuid := '39933b5b-3e8c-438d-be2f-e48cd9228c00';
  pb_id uuid;
  ct_id uuid;
BEGIN
  ----------------------------------------------------------------------------
  -- 1. TERM (Handbook pp. 10-11)
  ----------------------------------------------------------------------------
  SELECT id INTO ct_id FROM clause_type WHERE name = 'term';
  INSERT INTO legal_playbook (client_id, clause_type_id, display_heading, rationale, guidelines, source_document)
  VALUES (
    sbux_id, ct_id, 'TERM',
    'Control great sites as long as possible with as much flexibility as possible. Starbucks needs at least 30 years of control (10 initial + 20 in options) to depreciate improvements over 10 years and accurately forecast rent. Never less than 10 years total.',
    'Preferred: 10-year initial + four 5-year options. Holiday extension language preserves Sept-Jan year boundary. Option exercise notice ≥ 90 days. Tenant may exercise multiple options at once.',
    'LOI Handbook §Term, pp. 10-11'
  )
  ON CONFLICT (client_id, clause_type_id) DO UPDATE
    SET display_heading = EXCLUDED.display_heading,
        rationale = EXCLUDED.rationale,
        guidelines = EXCLUDED.guidelines,
        source_document = EXCLUDED.source_document,
        updated_at = NOW()
  RETURNING id INTO pb_id;

  INSERT INTO legal_playbook_position (legal_playbook_id, position_rank, position_label, clause_text, default_comment_text, requires_approval, is_floor)
  VALUES
    (pb_id, 1, 'Preferred',
     'Ten (10) years plus four (4) consecutive five (5)-year options to extend the term. If the last day of the first Lease Year falls between September 1 and January 31, then the first Lease Year shall be extended to end on the last day in February and each subsequent Lease Year shall begin on March 1. To exercise an extension option, Tenant shall give Landlord notice at least ninety (90) days prior to the then-current expiration date. Tenant may exercise more than one option at a time.',
     'Tenant requires control of strong sites for the full Term plus options to depreciate improvements over a 10-year window and forecast rent accurately. Option rights benefit Tenant; Tenant may elect not to exercise.',
     NULL, FALSE),
    (pb_id, 2, 'Alternative — 120-day notice',
     'Ten (10) years plus four (4) consecutive five (5)-year options to extend the term, with extension exercised by Tenant''s notice at least one hundred twenty (120) days prior to the then-current expiration date. Holiday-extension and multiple-option-exercise rights remain.',
     'Per Starbucks Standards, the preferred option-notice period is 90 days; a 120-day notice period is an acceptable alternative.',
     NULL, FALSE),
    (pb_id, 3, 'Floor — 10-year term, no options',
     'Ten (10) years.',
     'Starbucks must have a 10-year minimum term to depreciate improvements. Any term shorter than 10 years total requires Director / VP / Real Estate Committee approval and should be escalated.',
     'Director, VP, Real Estate Committee', TRUE);

  ----------------------------------------------------------------------------
  -- 2. RENT (Handbook pp. 11-17)
  ----------------------------------------------------------------------------
  SELECT id INTO ct_id FROM clause_type WHERE name = 'rent';
  INSERT INTO legal_playbook (client_id, clause_type_id, display_heading, rationale, guidelines, source_document)
  VALUES (
    sbux_id, ct_id, 'RENT',
    'Rent must be a small percentage of sales and never above market. Inclusive of all charges other than CAM, taxes, and insurance. Years 1-10 must be a fixed amount — never CPI-tied. Option-period rents should be calculable (preferably fixed). Back out TIA contribution when calculating option rent steps; TIA should never amortize past 10 years.',
    'Preferred: fixed annual amounts for years 1-10 with stepped escalations for option periods. R0 (set annual) preferred over R1 (psf-tied). If psf-tied, adjust only downward (or cap at +3%). Always render schedule with both monthly and annual columns.',
    'LOI Handbook §Rent, pp. 11-17'
  )
  ON CONFLICT (client_id, clause_type_id) DO UPDATE
    SET display_heading = EXCLUDED.display_heading,
        rationale = EXCLUDED.rationale,
        guidelines = EXCLUDED.guidelines,
        source_document = EXCLUDED.source_document,
        updated_at = NOW()
  RETURNING id INTO pb_id;

  INSERT INTO legal_playbook_position (legal_playbook_id, position_rank, position_label, clause_text, default_comment_text, requires_approval, is_floor)
  VALUES
    (pb_id, 1, 'Preferred (R0 — fixed annual)',
     'The rent schedule below is inclusive of all charges other than taxes, insurance and common area maintenance expenses, and Tenant will not pay any other charges to Landlord except those described in this letter. [INSERT FIXED SCHEDULE: Years 1-5 / 6-10 / option periods 11-15, 16-20, 21-25, 26-30 — Monthly and Yearly columns.]',
     'Rent is fixed for the initial term and stepped at 5-year intervals through option periods. This avoids CPI uncertainty and makes the deal economically predictable for both parties.',
     NULL, FALSE),
    (pb_id, 2, 'Alternative (R1 — psf-tied with downward-only adjustment)',
     'The rent schedule below is inclusive of all charges other than taxes, insurance and common area maintenance expenses. The rent schedule is based on Landlord''s estimate of the ground floor area of the Premises, excluding mezzanine, basement and storage space, if any, and the rent will be adjusted [downward only] if the actual number of square feet of the Premises is less than Landlord''s estimate. [INSERT SCHEDULE WITH PER SF COLUMN.]',
     'Per-square-foot rent is acceptable when paired with a downward-only or capped adjustment so Tenant is not exposed to demising-wall placement risk. If Landlord cannot agree to downward-only, cap revised square footage at not-to-exceed 103% of stated Premises area.',
     NULL, FALSE);

  ----------------------------------------------------------------------------
  -- 3. PERCENTAGE RENT (Handbook pp. 17-18)
  ----------------------------------------------------------------------------
  SELECT id INTO ct_id FROM clause_type WHERE name = 'percentage_rent';
  INSERT INTO legal_playbook (client_id, clause_type_id, display_heading, rationale, guidelines, source_document)
  VALUES (
    sbux_id, ct_id, 'PERCENTAGE RENT',
    'Avoid sharing our success with our Landlords. Percentage rent also complicates assignment because the Landlord will want assurance the same percentage rent will continue. Starbucks should never pay percentage rent except in narrow mall scenarios.',
    'Preferred: None. Mall stores may negotiate percentage rent ≤5% with breakpoint ≥ natural breakpoint. Annual reporting and reconciliation preferred. Sales Kickout Termination should be paired with any percentage-rent obligation.',
    'LOI Handbook §Percentage Rent, pp. 17-18'
  )
  ON CONFLICT (client_id, clause_type_id) DO UPDATE
    SET display_heading = EXCLUDED.display_heading,
        rationale = EXCLUDED.rationale,
        guidelines = EXCLUDED.guidelines,
        source_document = EXCLUDED.source_document,
        updated_at = NOW()
  RETURNING id INTO pb_id;

  INSERT INTO legal_playbook_position (legal_playbook_id, position_rank, position_label, clause_text, default_comment_text, requires_approval, is_floor)
  VALUES
    (pb_id, 1, 'Preferred — None',
     'None.',
     'Starbucks does not pay percentage rent. Sharing sales upside with Landlord undermines profitability and complicates lease assignment.',
     NULL, FALSE),
    (pb_id, 2, 'Floor — Mall scenario only (≤5%, natural breakpoint)',
     'Tenant shall pay percentage rent equal to [≤ 5%] of Gross Sales in excess of the natural breakpoint, computed as Annual Base Rent divided by the percentage rate. Sales statements due annually within thirty (30) days after Lease Year end. No continuous-operation obligation shall be implied from this provision.',
     'Percentage rent is permitted only at mall locations and requires Director, VP, and Real Estate Committee approval. If negotiated, breakpoint must be ≥ natural breakpoint, rate ≤5%, and reporting annual. Pair with a Sales Kickout Termination right where possible.',
     'Director, VP, Real Estate Committee', TRUE);

  ----------------------------------------------------------------------------
  -- 4. RENT COMMENCEMENT (Handbook pp. 18-20)
  ----------------------------------------------------------------------------
  SELECT id INTO ct_id FROM clause_type WHERE name = 'rent_commencement';
  INSERT INTO legal_playbook (client_id, clause_type_id, display_heading, rationale, guidelines, source_document)
  VALUES (
    sbux_id, ct_id, 'RENT COMMENCEMENT',
    'Preserve the rent-free build-out period and the ability to operate rent-free for as long as possible. Avoid pre-term rent. Include downside-protection language for force-majeure and government restrictions.',
    'Preferred: 120 days after the earlier of opening or possession+permits. Fallback 1: 90 days. Always include Alternative Rent Period at 50%/0% for ≥25% sales drops or store closures.',
    'LOI Handbook §Rent Commencement, pp. 18-20'
  )
  ON CONFLICT (client_id, clause_type_id) DO UPDATE
    SET display_heading = EXCLUDED.display_heading,
        rationale = EXCLUDED.rationale,
        guidelines = EXCLUDED.guidelines,
        source_document = EXCLUDED.source_document,
        updated_at = NOW()
  RETURNING id INTO pb_id;

  INSERT INTO legal_playbook_position (legal_playbook_id, position_rank, position_label, clause_text, default_comment_text, requires_approval, is_floor)
  VALUES
    (pb_id, 1, 'Preferred — 120 days',
     'Tenant will not commence payment of rent (nor charges for common area maintenance, taxes or insurance) until the date that is one hundred twenty (120) days following the earlier of: (a) the date Tenant opens for business at the Premises, or (b) one hundred eighty (180) days after the later of the date Tenant accepts possession of the Premises with Landlord''s Work complete and a mutually executed possession letter and the date Tenant receives all permits, variances and governmental approvals necessary to construct and operate Tenant''s store. The 120-day period extends day-for-day for any Force Majeure delay. Alternative Rent Period: in the event Force Majeure or governmental action reduces gross sales by ≥25%, Tenant pays 50% of Base Rent until lifted; if Tenant ceases operations, Tenant pays no Base Rent (Annual Additional Rent continues). Either party may terminate if the Alternative Rent Period exceeds 120 days, with Tenant''s right to nullify by resuming full rent.',
     'Preserves a rent-free build-out and protects against operational disruption beyond Tenant''s control. The 120-day post-opening grace also covers post-launch sales ramp.',
     NULL, FALSE),
    (pb_id, 2, 'Fallback — 90 days',
     'Same as Preferred, except the rent-free post-opening period is ninety (90) days following the earlier of opening or possession+permits, and the Alternative Rent Period termination threshold is ninety (90) days.',
     'Falling back to 90 days reduces Tenant''s rent-free grace period by one month. Acceptable when Landlord otherwise meets Starbucks Standards on the Alternative Rent Period and downside-protection language.',
     NULL, FALSE),
    (pb_id, 3, 'Floor — Pre-term rent',
     '[ANY language requiring rent prior to store opening]',
     'Pre-term rent is non-standard for Starbucks. Any obligation to pay rent prior to store opening requires Director, VP, and Real Estate Committee approval. Escalate before agreeing.',
     'Director, VP, Real Estate Committee', TRUE);

  ----------------------------------------------------------------------------
  -- 5. USE (Handbook pp. 22-23)
  ----------------------------------------------------------------------------
  SELECT id INTO ct_id FROM clause_type WHERE name = 'use';
  INSERT INTO legal_playbook (client_id, clause_type_id, display_heading, rationale, guidelines, source_document)
  VALUES (
    sbux_id, ct_id, 'USE',
    'Broad use rights enable continued product innovation, beer/wine sales, and resale value if we assign the lease. Narrow uses constrain the warming program and limit sublease/assignment options.',
    'Preferred: any lawful retail or restaurant use, including beer and wine. Fallback: coffee store + retail with carve-outs for prior-existing tenant exclusives (must be attached to the LOI).',
    'LOI Handbook §Use, pp. 22-23'
  )
  ON CONFLICT (client_id, clause_type_id) DO UPDATE
    SET display_heading = EXCLUDED.display_heading,
        rationale = EXCLUDED.rationale,
        guidelines = EXCLUDED.guidelines,
        source_document = EXCLUDED.source_document,
        updated_at = NOW()
  RETURNING id INTO pb_id;

  INSERT INTO legal_playbook_position (legal_playbook_id, position_rank, position_label, clause_text, default_comment_text, requires_approval, is_floor)
  VALUES
    (pb_id, 1, 'Preferred (U0) — Broad retail',
     'Any lawful retail or restaurant use, including the sale of beer and wine.',
     'Maximum flexibility for product innovation and assignment. Tenant requires the broadest possible use clause to preserve resale value and accommodate menu evolution.',
     NULL, FALSE),
    (pb_id, 2, 'Fallback (U1) — Coffee + retail with carve-outs',
     'A coffee store or any other lawful retail or restaurant use, including the sale of beer and wine, which does not conflict with any written exclusive use granted to another tenant in the [Building or Shopping Center] prior to the date of this Letter of Intent and disclosed to Tenant in writing. [LANDLORD TO ATTACH LIST OF EXCLUSIVES, PROHIBITED USES, AND USE RESTRICTIONS.]',
     'Acceptable fallback when Landlord cannot grant unrestricted use. The list of existing exclusives must be attached so Tenant''s warming program and beer/wine sales are not later challenged.',
     NULL, TRUE);

  ----------------------------------------------------------------------------
  -- 6. EXCLUSIVE USE & PROHIBITED USE (Handbook pp. 23-25)
  ----------------------------------------------------------------------------
  SELECT id INTO ct_id FROM clause_type WHERE name = 'exclusive_use';
  INSERT INTO legal_playbook (client_id, clause_type_id, display_heading, rationale, guidelines, source_document)
  VALUES (
    sbux_id, ct_id, 'EXCLUSIVE USE & PROHIBITED USE',
    'Protect competitive position and profitability by preventing landlord from leasing to coffee/tea competitors on the property. Prohibited Use Exhibit (Exhibit N) gives Tenant termination remedies if the center is leased to incompatible co-tenants.',
    'Preferred (EU0): full exclusive on coffee beans, espresso, espresso/coffee/tea drinks, brewed coffee, blended beverages. Fallback (EU1): allows non-gourmet, non-brand-identified brewed coffee/tea by other tenants. Fallback (EU2): adds carve-out for pre-bottled tea. Carve-outs for full-service restaurants and 20K+ sq ft anchors / 10K+ sq ft grocers are acceptable. Remedy for violation: 50% rent abatement until cured; termination + reimbursement of unamortized improvements after 90 days.',
    'LOI Handbook §Exclusive Use, pp. 23-25'
  )
  ON CONFLICT (client_id, clause_type_id) DO UPDATE
    SET display_heading = EXCLUDED.display_heading,
        rationale = EXCLUDED.rationale,
        guidelines = EXCLUDED.guidelines,
        source_document = EXCLUDED.source_document,
        updated_at = NOW()
  RETURNING id INTO pb_id;

  INSERT INTO legal_playbook_position (legal_playbook_id, position_rank, position_label, clause_text, default_comment_text, requires_approval, is_floor)
  VALUES
    (pb_id, 1, 'Preferred (EU0)',
     'Landlord will not sell or permit any party, other than Tenant, to sell on the Property: (a) whole or ground coffee beans, (b) espresso, espresso-based drinks or coffee-based drinks, (c) tea or tea-based drinks, (d) brewed coffee, and/or (e) blended beverages. Landlord shall not lease to any other tenant nor use or allow any other person or entity to use any portion of the Property for or in support of any of the uses or activities described on Exhibit N. In the event of a violation, all rent shall be reduced by fifty percent (50%) until cured; Tenant may terminate after 90 days and recover unamortized improvements.',
     'Full exclusive on Tenant''s core product set protects the store''s competitive position. Combined with the Prohibited Use exhibit, gives Tenant termination remedies if the center is leased to incompatible co-tenants.',
     NULL, FALSE),
    (pb_id, 2, 'Fallback (EU1) — Non-gourmet/non-brand carve-out',
     'Same as EU0, except other tenants on the Property may sell brewed coffee or brewed tea that is neither (i) gourmet (Arabica-bean-based, or sourced from gourmet brands such as Coffee Bean & Tea Leaf, Intelligentsia, Peets, Caribou) nor (ii) brand-identified (advertised in-premises by brand name or served in branded cup).',
     'Fallback when Landlord pushes back on the full exclusive. Allows commodity brewed coffee/tea (e.g., diner-style) without compromising Starbucks''s gourmet/branded protection.',
     NULL, FALSE),
    (pb_id, 3, 'Fallback (EU2) — Adds pre-bottled tea',
     'Same as EU1, plus other tenants may also sell pre-bottled tea or pre-bottled tea-based drinks.',
     'Further fallback adding pre-bottled tea to the carve-out. Acceptable when Landlord has a c-store or grocery co-tenant whose product mix would otherwise violate.',
     NULL, FALSE);

  ----------------------------------------------------------------------------
  -- 7. EARLY TERMINATION (Handbook pp. 25-27)
  ----------------------------------------------------------------------------
  SELECT id INTO ct_id FROM clause_type WHERE name = 'early_termination';
  INSERT INTO legal_playbook (client_id, clause_type_id, display_heading, rationale, guidelines, source_document)
  VALUES (
    sbux_id, ct_id, 'EARLY TERMINATION',
    'Underperforming stores must have an exit strategy. Writing off unamortized investment + paying a small termination fee is often cheaper than continuing to operate at a loss. Early Termination is one of three exit strategies (along with broad assignment rights and the absence of continuous-operations).',
    'Preferred: ongoing right to terminate at or after end of month 36 with ≤120 days notice and termination fee ≤ 6 months base rent + unamortized TIA + broker commission. If termination fee exceeds the formula, Director / VP / RE Committee approval required.',
    'LOI Handbook §Early Termination, pp. 25-27'
  )
  ON CONFLICT (client_id, clause_type_id) DO UPDATE
    SET display_heading = EXCLUDED.display_heading,
        rationale = EXCLUDED.rationale,
        guidelines = EXCLUDED.guidelines,
        source_document = EXCLUDED.source_document,
        updated_at = NOW()
  RETURNING id INTO pb_id;

  INSERT INTO legal_playbook_position (legal_playbook_id, position_rank, position_label, clause_text, default_comment_text, requires_approval, is_floor)
  VALUES
    (pb_id, 1, 'Preferred — Ongoing right at month 36',
     'Upon giving Landlord at least one hundred-twenty (120) days prior written notice, Tenant may terminate the Lease on or after the last day of the thirty-sixth (36th) full calendar month of the Lease term. Tenant will pay Landlord a termination fee equal to six (6) months'' Base Rent plus the unamortized portion of the Tenant Improvement Allowance and broker''s commission, prorated if the early termination date is other than the last day of a full calendar month.',
     'Tenant requires an ongoing exit strategy at month 36. The fee formula (6 months rent + unamortized TIA + commission) caps Landlord''s exposure while letting Tenant cut losses on underperforming stores.',
     NULL, FALSE),
    (pb_id, 2, 'Fallback — End of Year 5',
     'Same as Preferred, except the right is exercisable at or after the end of the fifth (5th) Lease Year rather than month 36.',
     'When Landlord cannot grant a 36-month right, ETR shifted to end of Year 5 is acceptable per Director consultation.',
     NULL, FALSE),
    (pb_id, 3, 'Floor — Option-period only',
     'Tenant may terminate the Lease only effective at the start of an option period, with at least one hundred twenty (120) days prior written notice.',
     'Last-resort fallback: an option-period-only ETR. Pair with assignment/sublet flexibility and no continuous-operations clause to preserve other exit strategies. Requires Director consultation.',
     'Director', TRUE),
    (pb_id, 4, 'Floor — No early termination',
     '[OMIT — no early termination right]',
     'No ETR removes one of Tenant''s three exit strategies. Requires Director, VP, and Real Estate Committee approval. Escalate before agreeing.',
     'Director, VP, Real Estate Committee', TRUE);

  ----------------------------------------------------------------------------
  -- 8. CONTINUOUS OPERATIONS (Handbook pp. 27-28)
  ----------------------------------------------------------------------------
  SELECT id INTO ct_id FROM clause_type WHERE name = 'continuous_operations';
  INSERT INTO legal_playbook (client_id, clause_type_id, display_heading, rationale, guidelines, source_document)
  VALUES (
    sbux_id, ct_id, 'CONTINUOUS OPERATIONS',
    'Tenant requires the ability to "go dark" while continuing to pay rent on underperforming stores. A continuous-operations clause negates the early-termination exit strategy and prevents store closures for renovations or assignment.',
    'Preferred: None. Fallback: Landlord recapture-and-terminate right after 180 days dark, with reimbursement of unamortized improvements. Any continuous-operations requirement requires Director / VP / RE Committee approval.',
    'LOI Handbook §Continuous Operations, pp. 27-28'
  )
  ON CONFLICT (client_id, clause_type_id) DO UPDATE
    SET display_heading = EXCLUDED.display_heading,
        rationale = EXCLUDED.rationale,
        guidelines = EXCLUDED.guidelines,
        source_document = EXCLUDED.source_document,
        updated_at = NOW()
  RETURNING id INTO pb_id;

  INSERT INTO legal_playbook_position (legal_playbook_id, position_rank, position_label, clause_text, default_comment_text, requires_approval, is_floor)
  VALUES
    (pb_id, 1, 'Preferred (CO1) — None',
     'None.',
     'Tenant must not be encumbered with continuous-operations, hours-of-operation, or go-dark restrictions. These preserve all three exit strategies (assignment/sublet, ETR, going dark while paying rent).',
     NULL, FALSE),
    (pb_id, 2, 'Fallback — 180-day recapture+terminate',
     'If Tenant ceases operations in the Premises for a period of one hundred eighty (180) consecutive days, excluding closure(s) due to force majeure, casualty, condemnation, inventory, renovation, remodeling, or assignment of the Lease or subletting of the Premises, then Landlord may recapture the Premises and terminate the Lease upon thirty (30) days prior written notice to Tenant unless Tenant resumes operations in the Premises prior to the expiration of such thirty (30) day notice period, in which case Landlord''s recapture and termination notice shall be null and void. If Landlord terminates the Lease, Landlord shall reimburse Tenant for the unamortized cost of Tenant''s improvements to the Premises.',
     'Fallback offered to Landlords who insist on a continuous-operations remedy. The recapture-and-terminate structure (vs. default) preserves Tenant''s right to walk away cleanly with reimbursement of unamortized improvements.',
     NULL, FALSE),
    (pb_id, 3, 'Floor — 60-day cure',
     'Same as Fallback, except the dark period is sixty (60) consecutive days rather than 180.',
     'Last-resort cure period of 60 days. Significantly tightens Tenant''s ability to go dark for renovations or assignment. Requires Director, VP, and Real Estate Committee approval.',
     'Director, VP, Real Estate Committee', TRUE);

  ----------------------------------------------------------------------------
  -- 9. INITIAL CO-TENANCY (Handbook pp. 33-34)
  ----------------------------------------------------------------------------
  SELECT id INTO ct_id FROM clause_type WHERE name = 'initial_cotenancy';
  INSERT INTO legal_playbook (client_id, clause_type_id, display_heading, rationale, guidelines, source_document)
  VALUES (
    sbux_id, ct_id, 'INITIAL CO-TENANCY CONTINGENCY',
    'A co-tenancy provision protects Tenant from operating in an under-occupied center where customer traffic is dependent on co-tenants. If the center fails to lease up, Tenant should not be obligated to open and pay full rent.',
    'Preferred: 80%+ occupancy threshold; until met, Tenant pays no rent/CAM/taxes/insurance and is not obligated to open. If Tenant elects to open early, 50% rent reduction until threshold met. After 6 months unmet, Tenant may terminate with reimbursement of unamortized expenses.',
    'LOI Handbook §Initial Co-Tenancy, pp. 33-34'
  )
  ON CONFLICT (client_id, clause_type_id) DO UPDATE
    SET display_heading = EXCLUDED.display_heading,
        rationale = EXCLUDED.rationale,
        guidelines = EXCLUDED.guidelines,
        source_document = EXCLUDED.source_document,
        updated_at = NOW()
  RETURNING id INTO pb_id;

  INSERT INTO legal_playbook_position (legal_playbook_id, position_rank, position_label, clause_text, default_comment_text, requires_approval, is_floor)
  VALUES
    (pb_id, 1, 'Preferred — 80% + key tenant',
     'Tenant will not be obligated to pay rent, common area maintenance charges, or any other charges, nor operate for business in the Premises, until at least eighty percent (80%) of the gross leasable area of the [Building or Shopping Center], excluding Tenant, [and/or KEY TENANT(S)] is/are occupied and operating for business (for at least eight (8) hours per day, six (6) days per week). Tenant may elect to operate before such conditions are satisfied, in which event the lease term will commence and Tenant will be entitled to a rent reduction of fifty percent (50%) until the conditions are satisfied. If such conditions are not satisfied for six (6) consecutive months, Tenant may terminate the Lease and Landlord shall reimburse Tenant''s unamortized expenses.',
     'An 80%-occupancy threshold protects Tenant from opening into an under-leased center. The 50%-rent election keeps the door open while Landlord builds occupancy; the 6-month termination right is the backstop.',
     NULL, FALSE),
    (pb_id, 2, 'Fallback — 70%',
     'Same as Preferred, except the occupancy threshold is seventy percent (70%) instead of 80%.',
     'When Landlord pushes back on 80%, 70% is acceptable. Pair with an explicit list of key tenants whose presence is also required.',
     NULL, FALSE),
    (pb_id, 3, 'Floor — 50%',
     'Same as Preferred, except the occupancy threshold is fifty percent (50%) instead of 80%.',
     'Last-resort fallback at 50%. Significantly weakens the protection. Requires Director consultation; do not drop further without VP and Real Estate Committee approval.',
     'Director', TRUE);

  ----------------------------------------------------------------------------
  -- 10. LANDLORD WORK AND CONTRIBUTION (Handbook pp. 30-32)
  ----------------------------------------------------------------------------
  SELECT id INTO ct_id FROM clause_type WHERE name = 'landlord_work_and_contribution';
  INSERT INTO legal_playbook (client_id, clause_type_id, display_heading, rationale, guidelines, source_document)
  VALUES (
    sbux_id, ct_id, 'LANDLORD CONTRIBUTION AND WORK',
    'Landlord contribution and work offsets Tenant''s construction costs and holds Landlord accountable for site delivery. The Tenant Improvement Allowance (TIA) is never a "loan" — Tenant does not owe and does not repay TIA. TIA should not amortize past 10 years; back it out when calculating option-period rent.',
    'Preferred (LCW0): Landlord performs Workletter scope AND provides cash TIA. Fallback (LCW1): Landlord pays TIA in lieu of doing the work. Alternative (LCW2): Landlord delivers in current condition with no work or TIA, conditioned on Tenant''s feasibility study. TIA must be payable on store opening; offset rights, interest at greater of 12% or Wells Fargo prime + 3% on unpaid amounts.',
    'LOI Handbook §Landlord Contribution and Work, pp. 30-32'
  )
  ON CONFLICT (client_id, clause_type_id) DO UPDATE
    SET display_heading = EXCLUDED.display_heading,
        rationale = EXCLUDED.rationale,
        guidelines = EXCLUDED.guidelines,
        source_document = EXCLUDED.source_document,
        updated_at = NOW()
  RETURNING id INTO pb_id;

  INSERT INTO legal_playbook_position (legal_playbook_id, position_rank, position_label, clause_text, default_comment_text, requires_approval, is_floor)
  VALUES
    (pb_id, 1, 'Preferred (LCW0) — Workletter + TIA',
     'Prior to delivering the Premises to Tenant, Landlord will, at its expense, perform the work described on the attached Landlord Workletter. Landlord will also provide Tenant an improvement allowance of $[AMOUNT] toward the cost of Tenant''s improvements (the "Allowance"), payable on store opening. If Landlord fails to pay within thirty (30) days of Tenant''s written request, Tenant has the right to offset against rent and Landlord owes interest at the greater of twelve percent (12%) per annum or the Wells Fargo prime rate plus three percent (3%).',
     'Best position: Landlord performs Workletter scope and pays cash TIA on opening. Offset rights and interest protect Tenant from late payment.',
     NULL, FALSE),
    (pb_id, 2, 'Fallback (LCW1) — TIA only (no Workletter)',
     'Landlord will provide Tenant an improvement allowance of $[AMOUNT] toward the cost of Tenant''s new store (the "Allowance"), payable on store opening. Same offset rights, interest, and Letter of Credit security (if Allowance ≥ $200K and not offsettable within 24 months OR no offset rights) as in LCW0.',
     'Acceptable when Landlord delivers shell only. TIA ≥ $200K with no offset must be secured by a conforming Letter of Credit.',
     NULL, FALSE),
    (pb_id, 3, 'Alternative (LCW2) — Current condition, no work, no TIA',
     'Landlord will not be required to install any tenant improvements in the Premises. Tenant will take possession of the Premises when it is in broom-clean condition with all partition walls, fixtures, personal property, hazardous materials and debris removed. Common areas, the Building, structural elements, roof, and MEP systems will comply with all applicable laws and be in good, workable, sanitary order at delivery; Landlord shall correct latent defects promptly. Tenant''s interest is contingent on Tenant''s feasibility study (physical, economic, environmental, title, geotechnical, survey, zoning).',
     'Used only when Landlord delivers in current condition. Never use the term "as-is." Pair with a feasibility-study contingency so Tenant can walk if the site has hidden issues.',
     NULL, FALSE);

END $$;
