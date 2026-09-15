# ARTISAN

ARTISAN is an India-wide digital home for independent artisans and their work. It supports considered onboarding, product catalog creation, image preparation, and a curated public collection while preserving the existing Supabase data model.

## Run locally

```bash
npm install
npm run dev
```

The application expects these client-safe values in `.env`:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Provider credentials must never use a `VITE_` prefix. Keep them in Supabase Edge Function secrets:

- `DEEPGRAM_API_KEY`
- `CARTESIA_API_KEY`
- `CARTESIA_VOICE_ID`
- `GEMINI_API_KEY` (profile/catalog conversation only — not image enhancement)
- `PHOTOROOM_API_KEY` (image enhancement via `enhance-image`)
- `DEEPGRAM_MODEL` (optional)
- `CARTESIA_MODEL` (optional)
- `GEMINI_REASONING_MODEL` (optional, defaults to `gemini-3.6-flash`)
- `GST_DISCOUNT_RATE` (optional percent for bulk/business GSTIN discount; e.g. `18`. If unset, no GST discount is applied)
- `RESEND_API_KEY` (optional; required to send seller purchase emails)
- `EMAIL_FROM` or `SELLER_NOTIFY_FROM` (optional From address for seller emails)
- `APP_BASE_URL` (optional public site URL used in seller dashboard email links)

## Supabase

Apply migrations and deploy the existing functions from the project root:

```bash
supabase db push
supabase functions deploy catalog-conversation
supabase functions deploy profile-conversation
supabase functions deploy enhance-image
supabase functions deploy register-vendor
```

The migration `20260829100000_fix_profiles_rls_recursion.sql` replaces recursive admin policy checks with a `SECURITY DEFINER` helper. Apply it before testing admin access on an existing project.

## Product flow

1. An artisan applies through the guided English-language introduction.
2. A new product begins with a photograph and is saved as a draft.
3. The catalog service turns short spoken or written notes into editable English listing details.
4. The artisan reviews the details, sets their own price, and submits the work.
5. Published products appear in the collection only when their existing status allows public discovery.

Deepgram transcription, profile/catalog extraction, and Cartesia speech responses remain server-side. The interface exposes no provider credentials; onboarding uses one visible language choice to configure the voice session.

## Verification

```bash
npm run lint
npm run build
```
