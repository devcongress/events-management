-- Existing descriptions remain literal plain text; rich documents are opt-in.
ALTER TABLE public.annual_conference_tasks
  ADD COLUMN IF NOT EXISTS details_format text NOT NULL DEFAULT 'plain_text'
  CHECK (details_format IN ('plain_text', 'rich_text'));
