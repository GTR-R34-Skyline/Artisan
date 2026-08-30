ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS conversation_state jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_transcript text,
  ADD COLUMN IF NOT EXISTS catalog_status text DEFAULT 'in_progress' CHECK (catalog_status IN ('in_progress', 'complete'));

CREATE INDEX IF NOT EXISTS idx_products_catalog_status ON public.products(catalog_status);
