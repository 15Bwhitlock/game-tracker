-- Rows can now be created without a description (a "not yet described" placeholder,
-- written when AI generation is unavailable — see TagDescriptionService.ensureDescribed).
ALTER TABLE tag_descriptions ALTER COLUMN description DROP NOT NULL;
