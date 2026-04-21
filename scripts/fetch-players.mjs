// fetch-players.mjs — fetch player pages from Stanford Gamemaster.
//
// Usage:
//   npm run fetch-players              fetch public roster players
//   npm run fetch-players -- --dev     fetch developer portal players (login if needed)
//
// Automatically runs bootstrap.sh afterward to vendorize JS deps.

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COOKIES_PATH = path.join(ROOT, '.cookies.json');
const ROSTER_DIR = path.join(ROOT, 'players', 'roster');
const DEV_DIR = path.join(ROOT, 'players', 'dev');

const isDev = process.argv.includes('--dev');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function runBootstrap() {
  console.log('\n[bootstrap] vendorizing JS dependencies...');
  try {
    execFileSync(path.join(__dirname, 'bootstrap.sh'), { cwd: ROOT, stdio: 'inherit' });
  } catch (e) {
    console.error('[bootstrap] failed:', e.message);
  }
}

async function fetchRoster() {
  fs.mkdirSync(ROSTER_DIR, { recursive: true });
  console.log('[fetch-players] fetching public roster...');

  const html = await httpGet('http://gamemaster.stanford.edu/homepage/showplayers.php');
  const names = [...html.matchAll(/href='\.\.\/roster\/([^']+)\.html'/g)].map(m => m[1]);

  if (names.length === 0) {
    console.error('[fetch-players] no players found on roster page');
    process.exit(1);
  }

  console.log(`[fetch-players] found ${names.length} roster players`);

  let downloaded = 0;
  let failed = 0;
  for (const name of names) {
    const out = path.join(ROSTER_DIR, `${name}.html`);
    try {
      const html = await httpGet(`http://gamemaster.stanford.edu/roster/${name}.html`);
      fs.writeFileSync(out, html);
      console.log(`  ${name}`);
      downloaded++;
    } catch {
      console.log(`  ${name} (failed, skipping)`);
      failed++;
    }
  }

  console.log(`\n[fetch-players] ${downloaded} downloaded, ${failed} failed.`);
}

async function loginIfNeeded(browser) {
  console.log('\nOpening Stanford Gamemaster login page...');
  console.log('Sign in with your developer account. The browser will close automatically.\n');

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://gamemaster.stanford.edu/developer/signin.php');

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

async function fetchDev() {
  fs.mkdirSync(DEV_DIR, { recursive: true });

  let cookies = null;
  if (fs.existsSync(COOKIES_PATH)) {
    cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf-8'));
  }

  const browser = await chromium.launch({ headless: !!cookies });

  if (!cookies) {
    cookies = await loginIfNeeded(browser);
  }

  const ctx = await browser.newContext();
  await ctx.addCookies(cookies);

  console.log('[fetch-players] loading developer portal...');
  const page = await ctx.newPage();
  const resp = await page.goto('http://gamemaster.stanford.edu/developer/players.php', { waitUntil: 'networkidle' });

  if (resp.url().includes('signin')) {
    console.log('[fetch-players] session expired, re-authenticating...');
    await ctx.close();
    const headed = await chromium.launch({ headless: false });
    cookies = await loginIfNeeded(headed);
    await headed.close();
    await browser.close();

    const fresh = await chromium.launch({ headless: true });
    const freshCtx = await fresh.newContext();
    await freshCtx.addCookies(cookies);
    const freshPage = await freshCtx.newPage();
    await freshPage.goto('http://gamemaster.stanford.edu/developer/players.php', { waitUntil: 'networkidle' });
    await doDevFetch(freshPage, fresh);
    return;
  }

  await doDevFetch(page, browser);
}

async function doDevFetch(page, browser) {
  const names = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('img[onclick*="player.php?player="]')];
    return imgs.map(img => {
      const m = img.getAttribute('onclick').match(/player=([^"&]+)/);
      return m ? m[1] : null;
    }).filter(Boolean);
  });

  const unique = [...new Set(names)];
  console.log(`[fetch-players] found ${unique.length} players on developer portal`);

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  for (const name of unique) {
    if (fs.existsSync(path.join(ROSTER_DIR, `${name}.html`))) {
      skipped++;
      continue;
    }
    try {
      const res = await page.context().request.get(`http://gamemaster.stanford.edu/gameplayers/${name}.html`);
      if (res.ok()) {
        fs.writeFileSync(path.join(DEV_DIR, `${name}.html`), await res.text());
        console.log(`  ${name}`);
        downloaded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  await browser.close();
  console.log(`\n[fetch-players] ${downloaded} new, ${skipped} in roster, ${failed} failed.`);
}

async function main() {
  if (isDev) {
    await fetchDev();
  } else {
    await fetchRoster();
  }
  runBootstrap();
}

main().catch((e) => { console.error(e); process.exit(1); });
