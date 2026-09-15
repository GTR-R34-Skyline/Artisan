/**
 * Starts local WhatsApp HTTP API only (TEST/DEMO).
 * Does NOT auto-poll purchases — that caused duplicate sends.
 *
 *   npm run whatsapp          → HTTP API
 *   npm run whatsapp:bridge   → optional purchase watcher (opt-in)
 *   npm run whatsapp:test     → one explicit standalone send
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  stdio: 'inherit',
  env: process.env,
  windowsHide: false,
});

child.on('exit', (code, signal) => {
  console.log(`[WhatsApp] server exited code=${code} signal=${signal}`);
  process.exit(code ?? 1);
});

const shutdown = () => {
  try { child.kill(); } catch { /* ignore */ }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
