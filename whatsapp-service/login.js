/**
 * One-time WhatsApp Web login helper.
 * Opens Brave with the dedicated .whatsapp-session profile and waits until
 * you scan the QR code. Then exits so subsequent sends can reuse the session.
 *
 *   node whatsapp-service/login.js
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectBraveExecutable } from './brave.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_DIR = process.env.WHATSAPP_SESSION_DIR
  || path.join(__dirname, '..', '.whatsapp-session');

const brave = detectBraveExecutable();
if (!brave) {
  console.error('Brave not found. Set BRAVE_EXECUTABLE_PATH.');
  process.exit(1);
}

console.log('[WhatsApp] Brave:', brave);
console.log('[WhatsApp] Session:', SESSION_DIR);
console.log('[WhatsApp] Scan the QR code in Brave when it appears.');

const context = await chromium.launchPersistentContext(SESSION_DIR, {
  executablePath: brave,
  headless: false,
  args: ['--disable-blink-features=AutomationControlled', '--no-default-browser-check'],
  ignoreDefaultArgs: ['--enable-automation'],
  viewport: { width: 1280, height: 900 },
});

const page = context.pages()[0] || await context.newPage();
await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded', timeout: 120000 });

const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  const ok = await page.evaluate(() => Boolean(
    document.querySelector('#pane-side')
    || document.querySelector('[data-testid="chat-list"]')
    || document.querySelector('[data-testid="chat-list-search"]'),
  )).catch(() => false);
  if (ok) {
    console.log('[WhatsApp] Session authenticated. You can close this window.');
    await page.waitForTimeout(3000);
    await context.close();
    process.exit(0);
  }
  await page.waitForTimeout(2000);
}

console.error('[WhatsApp] Timed out waiting for QR scan.');
await context.close().catch(() => undefined);
process.exit(1);
