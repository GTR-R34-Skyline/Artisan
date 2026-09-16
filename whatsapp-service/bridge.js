/**
 * Local purchase→WhatsApp bridge (TEST/DEMO).
 *
 * Cloud Edge Functions cannot reach 127.0.0.1 on your PC. This bridge watches
 * successful payments via Supabase (existing tables only) and calls the
 * local WhatsApp sender — keeping Resend email on the Edge path unchanged.
 *
 * Idempotency: in-memory key artisan-seller-whatsapp-{orderId}-{vendorId}
 * (same key the Edge Function uses when a tunnel is configured).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  isPlaceholderPhone,
  normalizeIndianWhatsAppPhone,
  buildSellerWhatsAppMessage,
} from './phone.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const loadEnv = () => {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const key = line.slice(0, i);
    const value = line.slice(i + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
};

loadEnv();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SERVICE = process.env.WHATSAPP_SERVICE_URL || 'http://127.0.0.1:4177';
const TOKEN = (process.env.WHATSAPP_LOCAL_TOKEN || '').trim();
const POLL_MS = Number(process.env.WHATSAPP_BRIDGE_POLL_MS || 4000);

if (!url || !serviceKey) {
  console.error('[WhatsApp Bridge] Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const handled = new Set();

const resolveSellerPhone = async (vendorId, sellerName) => {
  const { data: profile } = await admin
    .from('profiles')
    .select('full_name, phone_number')
    .eq('id', vendorId)
    .maybeSingle();

  let phone = profile?.phone_number || null;
  const name = profile?.full_name || sellerName || 'Artisan';

  if (isPlaceholderPhone(phone)) {
    const { data: apps } = await admin
      .from('vendor_applications')
      .select('phone, name, created_at')
      .ilike('name', name)
      .order('created_at', { ascending: false })
      .limit(5);
    const candidate = (apps || []).map((row) => row.phone).find((value) => value && !isPlaceholderPhone(value));
    if (candidate) phone = candidate;
  }

  return { phone, sellerName: name };
};

const notifyOrder = async (orderId) => {
  const { data: items, error } = await admin
    .from('order_items')
    .select('vendor_id')
    .eq('order_id', orderId);
  if (error) throw error;

  const vendorIds = [...new Set((items || []).map((row) => row.vendor_id).filter(Boolean))];
  for (const vendorId of vendorIds) {
    const key = `artisan-seller-whatsapp-${orderId}-${vendorId}`;
    if (handled.has(key)) continue;
    handled.add(key); // claim immediately to avoid overlapping polls

    const { phone, sellerName } = await resolveSellerPhone(vendorId, 'Artisan');
    const normalized = normalizeIndianWhatsAppPhone(phone);
    if (!normalized) {
      console.warn('[WhatsApp Bridge] No deliverable phone', { orderId, vendorId, sellerName });
      continue;
    }

    console.log('[WhatsApp Bridge] Preparing notification', { orderId, sellerName, phone: normalized });
    const headers = { 'Content-Type': 'application/json' };
    if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

    try {
      const response = await fetch(`${SERVICE}/send-whatsapp`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          phone: normalized,
          sellerName,
          message: buildSellerWhatsAppMessage(sellerName),
          idempotencyKey: key,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      console.log('[WhatsApp Bridge] Result', {
        ok: payload.ok,
        submitted: payload.submitted,
        duplicate: payload.duplicate,
        status: payload.status,
        error: payload.error ? String(payload.error).slice(0, 200) : null,
      });
      if (!payload.submitted && !payload.duplicate) {
        // Do not infinite-retry the same paid order on transient browser errors.
        console.warn('[WhatsApp Bridge] Giving up for this order/seller until process restart', key);
      }
    } catch (err) {
      console.warn('[WhatsApp Bridge] request_error', err instanceof Error ? err.message : err);
    }
  }
};

const tick = async () => {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: payments, error } = await admin
    .from('payments')
    .select('order_id, status, updated_at')
    .eq('status', 'success')
    .gte('updated_at', since)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) {
    console.warn('[WhatsApp Bridge] poll_error', error.message);
    return;
  }

  for (const payment of payments || []) {
    if (!payment.order_id) continue;
    try {
      await notifyOrder(payment.order_id);
    } catch (err) {
      console.warn('[WhatsApp Bridge] order_error', err instanceof Error ? err.message : err);
    }
  }
};

console.log('[WhatsApp Bridge] Watching successful payments → local WhatsApp (TEST/DEMO)');
console.log('[WhatsApp Bridge] Poll every', POLL_MS, 'ms');

let ticking = false;
const safeTick = async () => {
  if (ticking) return;
  ticking = true;
  try {
    await tick();
  } finally {
    ticking = false;
  }
};

await safeTick();
setInterval(() => {
  void safeTick();
}, POLL_MS);
