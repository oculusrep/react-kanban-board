-- ============================================
-- FIX NOTE CONTENT - USE TEXTPREVIEW INSTEAD OF CONTENT
-- ============================================
-- Updates existing notes to use the correct TextPreview field

-- First, let's see what we currently have
SELECT 'Current note content sample' as info,
       LEFT(body, 100) as current_body_sample,
       content_size
FROM note
WHERE body IS NOT NULL
LIMIT 3;

-- Check what TextPreview contains in ContentNotes
SELECT 'ContentNote TextPreview sample' as info,
       cn."Id",
       LEFT(cn."TextPreview", 100) as textpreview_sample,
       LEFT(cn."Content", 50) as content_sample
FROM "salesforce_ContentNote" cn
LIMIT 3;

-- Update all existing notes to use TextPreview instead of decoded Content
UPDATE note
SET body = cn."TextPreview"
FROM "salesforce_ContentNote" cn
JOIN "salesforce_ContentVersion" cv ON cn."LatestPublishedVersionId" = cv."Id"
JOIN "salesforce_ContentDocument" cd ON cv."ContentDocumentId" = cd."Id"
JOIN "salesforce_ContentDocumentLink" cdl ON cd."Id" = cdl."ContentDocumentId"
WHERE note.sf_content_note_id = cn."Id"
  AND note.sf_content_document_link_id = cdl."Id"
  AND cn."TextPreview" IS NOT NULL
  AND cn."TextPreview" != '';

-- Verify the update worked
SELECT 'Updated note content sample' as info,
       LEFT(body, 100) as updated_body_sample,
       content_size
FROM note
WHERE body IS NOT NULL
LIMIT 5;

-- Count how many notes now have readable content
SELECT
    'Note content statistics' as info,
    COUNT(*) as total_notes,
    COUNT(CASE WHEN body IS NOT NULL AND body != '' THEN 1 END) as notes_with_content,
    COUNT(CASE WHEN body IS NULL OR body = '' THEN 1 END) as notes_without_content
FROM note;