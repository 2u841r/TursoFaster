-- Add a case-insensitive index for product name search
-- This will significantly speed up search queries

-- Create an index with NOCASE collation for faster searches
CREATE INDEX IF NOT EXISTS products_name_nocase_idx ON products(name COLLATE NOCASE);

-- Note: SQLite doesn't support functional indexes directly in CREATE INDEX,
-- but the COLLATE NOCASE in queries will still benefit from the regular index
-- when using prefix matching (LIKE 'term%')

