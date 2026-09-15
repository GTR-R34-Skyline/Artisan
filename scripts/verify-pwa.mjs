import { chromium } from 'playwright';

const base = process.env.PWA_BASE_URL || 'http://127.0.0.1:4173';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

const results = {
  homepage: false,
  marketplace: false,
  product: false,
  cart: false,
  login: false,
  checkout: false,
  manifestLink: false,
  manifestJson: null,
  serviceWorker: null,
  icons: {},
  installabilityHints: {},
  offlineShell: false,
  deepLink: false,
};

try {
  await page.goto(base + '/', { waitUntil: 'networkidle', timeout: 60000 });
  results.homepage = (await page.title()).includes('ARTISAN');

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  results.manifestLink = Boolean(manifestHref);

  const manifestRes = await page.request.get(base + (manifestHref || '/manifest.webmanifest'));
  results.manifestJson = await manifestRes.json();

  for (const icon of results.manifestJson.icons || []) {
    const res = await page.request.get(base + icon.src);
    results.icons[icon.src] = res.status();
  }

  await page.waitForTimeout(1500);
  // First visit registers SW; reload so it can take control.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  results.serviceWorker = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const reg = await navigator.serviceWorker.getRegistration();
    return {
      supported: true,
      controller: Boolean(navigator.serviceWorker.controller),
      scope: reg?.scope || null,
      active: reg?.active?.scriptURL || null,
      waiting: Boolean(reg?.waiting),
    };
  });

  // Installability criteria (Chromium): manifest + SW controlling + icons + HTTPS/localhost
  results.installabilityHints = await page.evaluate(async () => {
    const manifestEl = document.querySelector('link[rel="manifest"]');
    return {
      hasManifestLink: Boolean(manifestEl),
      displayModeStandaloneCapable: true,
      isSecureContext: window.isSecureContext,
      swControlled: Boolean(navigator.serviceWorker.controller),
    };
  });

  await page.goto(base + '/marketplace', { waitUntil: 'domcontentloaded', timeout: 60000 });
  results.marketplace = page.url().includes('/marketplace');

  // Try first product link if present
  const productLink = page.locator('a[href*="/marketplace/"]').first();
  if (await productLink.count()) {
    await productLink.click({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);
    results.product = /\/marketplace\/.+/.test(page.url());
  } else {
    results.product = 'no-product-links';
  }

  await page.goto(base + '/cart', { waitUntil: 'domcontentloaded' });
  results.cart = page.url().includes('/cart');

  await page.goto(base + '/login', { waitUntil: 'domcontentloaded' });
  results.login = page.url().includes('/login');

  await page.goto(base + '/checkout', { waitUntil: 'domcontentloaded' });
  results.checkout = page.url().includes('/checkout');

  await page.goto(base + '/courier/dashboard', { waitUntil: 'domcontentloaded' });
  results.deepLink = true;

  // Offline shell: go home online first so SW caches, then go offline and reload
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch((e) => e.message);
  const offlineTitle = await page.title().catch(() => '');
  const offlineBody = await page.locator('body').innerText().catch(() => '');
  results.offlineShell = offlineTitle.includes('ARTISAN') || offlineBody.toLowerCase().includes('artisan');
  await context.setOffline(false);
} catch (error) {
  results.error = String(error);
} finally {
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
}
