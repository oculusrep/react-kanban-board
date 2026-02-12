-- Deactivate Franchise Times Dealmakers source
-- This source was incorrectly configured as a podcast but has no RSS feed
-- The dealmakers content is covered by the main Franchise Times source via RSS

UPDATE hunter_source
SET is_active = false,
    last_error = 'Deactivated: No RSS feed available. Dealmakers content covered by main franchise-times source.'
WHERE slug = 'ft-dealmakers';
