# WhatsApp Web local automation (TEST/DEMO ONLY)

This is **not** the WhatsApp Business API. It drives WhatsApp Web in Brave via Playwright
for local demos. Production should replace this with the official API without changing
checkout/order architecture.

## Start

```bash
# Requires SUPABASE_SERVICE_ROLE_KEY in the environment for the purchase bridge.
npm run whatsapp
```

- HTTP API: `http://127.0.0.1:4177` (localhost only)
- Session: `../.whatsapp-session/` (gitignored)
- Brave: auto-detected or `BRAVE_EXECUTABLE_PATH`

## First authentication

1. Start the service.
2. Brave opens `https://web.whatsapp.com/`.
3. Scan the QR code manually once.
4. Later runs reuse `.whatsapp-session/`.

## Standalone test

```bash
npm run whatsapp:test
```

## Purchase bridge

The Edge Function still sends **Resend email**. Because cloud Edge cannot reach your
`127.0.0.1`, `bridge.js` watches successful `payments` rows and submits WhatsApp locally
(one message per seller per order, in-memory idempotency).

If you expose the local service via a tunnel, set Edge secret `WHATSAPP_LOCAL_URL` to that
URL so the Edge Function can call it directly as well.
