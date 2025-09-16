-- Fix note.body field type from VARCHAR(255) to TEXT and re-migrate
-- Run this in Supabase SQL Editor

-- Step 1: Check current field type
SELECT 'CURRENT FIELD TYPE' as status;
SELECT data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'note' AND column_name = 'body';

-- Step 2: Change field type to TEXT (unlimited length)
SELECT 'CHANGING FIELD TYPE TO TEXT' as status;
ALTER TABLE note ALTER COLUMN body TYPE TEXT;

-- Step 3: Verify field type change
SELECT 'FIELD TYPE AFTER CHANGE' as status;
SELECT data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'note' AND column_name = 'body';

-- Step 4: Clear existing truncated data and re-migrate with full content
SELECT 'CLEARING TRUNCATED DATA' as status;
SET session_replication_role = replica;  -- Disable foreign key checks
DELETE FROM note;                        -- Clear all note data
SET session_replication_role = DEFAULT;  -- Re-enable foreign key checks

-- Step 5: Re-migrate with full TextPreview content (no truncation)
SELECT 'RE-MIGRATING WITH FULL CONTENT' as status;
INSERT INTO note (
    sf_content_note_id,
    sf_content_document_id,
    sf_content_version_id,
    sf_content_document_link_id,
    sf_created_by_id,
    sf_updated_by_id,
    created_by,
    updated_by,
    client_id,
    deal_id,
    property_id,
    site_submit_id,
    assignment_id,
    contact_id,
    related_object_type,
    related_object_id,
    title,
    body,
    content_size,
    share_type,
    visibility,
    created_at,
    updated_at
)
SELECT DISTINCT ON (cn."Id", cdl."LinkedEntityId")
    cn."Id" as sf_content_note_id,
    cd."Id" as sf_content_document_id,
    cv."Id" as sf_content_version_id,
    cdl."Id" as sf_content_document_link_id,
    cd."CreatedById" as sf_created_by_id,
    cd."LastModifiedById" as sf_updated_by_id,

    -- Map created_by from CreatedById
    (SELECT u.id FROM "user" u WHERE u.sf_id = cd."CreatedById" LIMIT 1) as created_by,

    -- Map updated_by from LastModifiedById
    (SELECT u.id FROM "user" u WHERE u.sf_id = cd."LastModifiedById" LIMIT 1) as updated_by,

    -- Map LinkedEntityId to appropriate relationship fields based on prefix
    CASE
        WHEN cdl."LinkedEntityId" LIKE '001%' THEN (SELECT c.id FROM client c WHERE c.sf_id = cdl."LinkedEntityId" LIMIT 1)
        ELSE NULL
    END as client_id,

    CASE
        WHEN cdl."LinkedEntityId" LIKE '006%' THEN (SELECT d.id FROM deal d WHERE d.sf_id = cdl."LinkedEntityId" LIMIT 1)
        ELSE NULL
    END as deal_id,

    CASE
        WHEN cdl."LinkedEntityId" LIKE 'a00%' THEN (SELECT p.id FROM property p WHERE p.sf_id = cdl."LinkedEntityId" LIMIT 1)
        ELSE NULL
    END as property_id,

    CASE
        WHEN cdl."LinkedEntityId" LIKE 'a05%' THEN (SELECT ss.id FROM site_submit ss WHERE ss.sf_id = cdl."LinkedEntityId" LIMIT 1)
        ELSE NULL
    END as site_submit_id,

    CASE
        WHEN cdl."LinkedEntityId" LIKE 'a02%' THEN (SELECT a.id FROM assignment a WHERE a.sf_id = cdl."LinkedEntityId" LIMIT 1)
        ELSE NULL
    END as assignment_id,

    CASE
        WHEN cdl."LinkedEntityId" LIKE '003%' THEN (SELECT c.id FROM contact c WHERE c.sf_id = cdl."LinkedEntityId" LIMIT 1)
        ELSE NULL
    END as contact_id,

    -- Handle unmapped LinkedEntityId values
    CASE
        WHEN cdl."LinkedEntityId" IS NOT NULL
        AND cdl."LinkedEntityId" NOT LIKE '001%'  -- not client
        AND cdl."LinkedEntityId" NOT LIKE '006%'  -- not deal
        AND cdl."LinkedEntityId" NOT LIKE 'a00%'  -- not property
        AND cdl."LinkedEntityId" NOT LIKE 'a05%'  -- not site_submit
        AND cdl."LinkedEntityId" NOT LIKE 'a02%'  -- not assignment
        AND cdl."LinkedEntityId" NOT LIKE '003%'  -- not contact
        THEN
            CASE
                WHEN cdl."LinkedEntityId" LIKE 'a03%' THEN 'property_research'
                WHEN cdl."LinkedEntityId" LIKE '0XB%' THEN 'list_email'
                WHEN cdl."LinkedEntityId" LIKE 'a2R%' THEN 'individual_email'
                WHEN cdl."LinkedEntityId" LIKE 'a1n%' THEN 'restaurant_trends'
                ELSE 'unknown'
            END
        ELSE NULL
    END as related_object_type,

    CASE
        WHEN cdl."LinkedEntityId" IS NOT NULL
        AND cdl."LinkedEntityId" NOT LIKE '001%'  -- not client
        AND cdl."LinkedEntityId" NOT LIKE '006%'  -- not deal
        AND cdl."LinkedEntityId" NOT LIKE 'a00%'  -- not property
        AND cdl."LinkedEntityId" NOT LIKE 'a05%'  -- not site_submit
        AND cdl."LinkedEntityId" NOT LIKE 'a02%'  -- not assignment
        AND cdl."LinkedEntityId" NOT LIKE '003%'  -- not contact
        THEN cdl."LinkedEntityId"
        ELSE NULL
    END as related_object_id,

    cd."Title" as title,

    -- ✅ FIXED: Use TextPreview field which contains the actual readable note content
    -- (Content field contains file paths, TextPreview contains the formatted text)
    cn."TextPreview" as body,

    cv."ContentSize" as content_size,
    cdl."ShareType" as share_type,
    cdl."Visibility" as visibility,
    cd."CreatedDate"::TIMESTAMPTZ as created_at,
    cd."LastModifiedDate"::TIMESTAMPTZ as updated_at

FROM "salesforce_ContentNote" cn
JOIN "salesforce_ContentVersion" cv ON cn."LatestPublishedVersionId" = cv."Id"
JOIN "salesforce_ContentDocument" cd ON cv."ContentDocumentId" = cd."Id"
JOIN "salesforce_ContentDocumentLink" cdl ON cd."Id" = cdl."ContentDocumentId"
WHERE cdl."LinkedEntityId" IS NOT NULL
  AND cn."Id" IS NOT NULL
  AND cd."Id" IS NOT NULL
ORDER BY cn."Id", cdl."LinkedEntityId", cd."CreatedDate" DESC;

-- Step 6: Verification
SELECT 'MIGRATION COMPLETE' as status;
SELECT 'Total notes migrated' as info, count(*) as count FROM note;

-- Check content length distribution
SELECT
    'Content length analysis' as info,
    MIN(LENGTH(body)) as min_length,
    MAX(LENGTH(body)) as max_length,
    AVG(LENGTH(body))::integer as avg_length,
    COUNT(CASE WHEN LENGTH(body) > 255 THEN 1 END) as notes_over_255_chars,
    COUNT(CASE WHEN LENGTH(body) > 1000 THEN 1 END) as notes_over_1000_chars
FROM note
WHERE body IS NOT NULL;

-- Sample of longest notes to verify full content
SELECT
    'Sample of longest notes' as info,
    id,
    LENGTH(body) as content_length,
    LEFT(body, 100) as content_preview
FROM note
WHERE body IS NOT NULL
ORDER BY LENGTH(body) DESC
LIMIT 5;

SELECT 'FIELD TYPE NOW SUPPORTS UNLIMITED LENGTH! ✅' as status;