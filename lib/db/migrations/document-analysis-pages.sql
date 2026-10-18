-- Nullable snapshots distinguish historical whole-document results; never
-- invent original page mappings for analyses that predate page selection.
ALTER TABLE sbu_document_analyses ADD COLUMN IF NOT EXISTS source_pages jsonb;
ALTER TABLE sbu_document_analyses ADD COLUMN IF NOT EXISTS source_page_count integer;
ALTER TABLE sbu_document_analyses ADD COLUMN IF NOT EXISTS source_version integer;
