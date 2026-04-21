// fetch-dev-games.mjs — fetch custom game pages from the developer portal.
// Automatically prompts for login if no saved cookies or session has expired.
// Skips any game that already exists in games/roster/ (built-in).

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COOKIES_PATH = path.join(ROOT, '.cookies.json');
const DEV_DIR = path.join(ROOT, 'games', 'dev');
const ROSTER_DIR = path.join(ROOT, 'games', 'roster');
const GAMES_URL = 'http://gamemaster.stanford.edu/developer/games.php';
const SIGNIN_URL = 'http://gamemaster.stanford.edu/developer/signin.php';

async function login(browser) {
  console.log('\nOpening Stanford Gamemaster login page...');
  console.log('Sign in with your developer account. The browser will close automatically.\n');

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(SIGNIN_URL);

  await page.waitForURL((url) => {
    const u = url.toString();
    return u.includes('/developer/') && !u.includes('signin');
  }, { timeout: 300_000 });

  const cookies = await ctx.cookies();
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
  await ctx.close();
  console.log('Login successful.\n');
  return cookies;
}

async function main() {
  fs.mkdirSync(DEV_DIR, { recursive: true });

  let cookies = null;
  if (fs.existsSync(COOKIES_PATH)) {
    cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  }

  const browser = await chromium.launch({ headless: !!(cookies) ? true : false });

  if (!cookies) {
    cookies = await login(browser);
  }

  const ctx = await browser.newContext();
  await ctx.addCookies(cookies);

  console.log('[fetch-dev-games] loading developer games page...');
  const page = await ctx.newPage();
  const resp = await page.goto(GAMES_URL, { waitUntil: 'networkidle' });

  if (resp.url().includes('signin')) {
    console.log('[fetch-dev-games] session expired, re-authenticating...');
    await ctx.close();
    const headed = await chromium.launch({ headless: false });
    cookies = await login(headed);
    await headed.close();
    await browser.close();

    const freshBrowser = await chromium.launch({ headless: true });
    const freshCtx = await freshBrowser.newContext();
    await freshCtx.addCookies(cookies);
    const freshPage = await freshCtx.newPage();
    await freshPage.goto(GAMES_URL, { waitUntil: 'networkidle' });
    return await fetchGames(freshPage, freshBrowser);
  }

  await fetchGames(page, browser);
}

async function fetchGames(page, browser) {
  const names = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[onclick*="game.php?game="], [onclick*="manager.php?game="]')];
    if (els.length > 0) {
      return els.map(el => {
        const m = el.getAttribute('onclick').match(/game=([^"&]+)/);
        return m ? m[1] : null;
      }).filter(Boolean);
    }
    const links = [...document.querySelectorAll('a[href*="game="]')];
    return links.map(a => {
      const m = a.getAttribute('href').match(/game=([^"&]+)/);
      return m ? m[1] : null;
    }).filter(Boolean);
  });

  const unique = [...new Set(names)];
  console.log(`[fetch-dev-games] found ${unique.length} games on developer portal`);

  let downloaded = 0;
  let skipped = 0;
  for (const name of unique) {
    if (fs.existsSync(path.join(ROSTER_DIR, `${name}.html`))) {
      skipped++;
      continue;
    }
    const url = `http://gamemaster.stanford.edu/homepage/manager.php?game=${name}`;
    try {
      const res = await page.context().request.get(url);
      if (res.ok()) {
        const out = path.join(DEV_DIR, `${name}.html`);
        fs.writeFileSync(out, await res.text());
        console.log(`  ${name}`);
        downloaded++;
      }
    } catch (e) {
      console.log(`  ${name} FAILED (${e.message})`);
    }
  }

  await browser.close();
  console.log(`\n[fetch-dev-games] ${downloaded} new, ${skipped} skipped (already in roster).`);
  if (downloaded > 0) {
    console.log('[fetch-dev-games] Run npm run bootstrap to vendorize JS deps.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
