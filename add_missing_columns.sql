ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS last_transcript text,
ADD COLUMN IF NOT EXISTS conversation_state jsonb,
ADD COLUMN IF NOT EXISTS catalog_status text DEFAULT 'in_progress';
