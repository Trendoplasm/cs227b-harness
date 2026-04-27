// run-match.mjs — run a single player-vs-opponent match via Playwright.
// Flags:
//   --player    <name>          basename in players/ (required)
//   --opponent  <name>          basename in players/ (required for multi-player games)
//   --game      <name>          basename in games/   (required)
//   --label     <id>            output filename prefix under results/<matchup>/
//                               (default: timestamp)
//   --matchup   <name>          output subdir under results/
//                               (default: <player>-vs-<opponent>-on-<game>
//                                or <player>-on-<game> for single-player)
//   --swap-roles                if set, passes opponent as players[0] and
//                               player as players[1] instead of the default
//                               (player=players[0], opponent=players[1]).
//   --verbose                   log all protocol messages (SEND/RECV)
//   --headed                    run in a visible browser; stays open after game
//   --disable-throttle          disable background-tab timer throttling (on by default)

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DIR = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8765);
const BASE = `http://localhost:${PORT}`;

function allNames(kind) {
  const names = new Set();
  for (const sub of ['', 'dev', 'roster']) {
    const dir = path.join(TEST_DIR, kind, sub);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.html')) names.add(f.replace('.html', ''));
    }
  }
  return [...names];
}

function suggest(input, kind) {
  const clean = input.replace(/\.html$/, '');
  if (clean !== input) {
    for (const sub of ['', 'dev', 'roster']) {
      const rel = sub ? `${kind}/${sub}/${clean}.html` : `${kind}/${clean}.html`;
      if (fs.existsSync(path.join(TEST_DIR, rel))) return clean;
    }
  }
  const all = allNames(kind);
  const lower = input.toLowerCase();
  const match = all.find(n => n.toLowerCase() === lower)
    || all.find(n => n.includes(input) || input.includes(n));
  return match || null;
}

function resolvePlayer(name) {
  for (const sub of ['', 'dev', 'roster']) {
    const rel = sub ? `players/${sub}/${name}.html` : `players/${name}.html`;
    if (fs.existsSync(path.join(TEST_DIR, rel))) return rel;
  }
  const hint = suggest(name, 'players');
  const msg = hint ? `Player "${name}" not found. Did you mean "${hint}"?` : `Player "${name}" not found.`;
  throw new Error(msg);
}

function resolveGame(name) {
  for (const sub of ['', 'dev', 'roster']) {
    const rel = sub ? `games/${sub}/${name}.html` : `games/${name}.html`;
    if (fs.existsSync(path.join(TEST_DIR, rel))) return rel;
  }
  const hint = suggest(name, 'games');
  const msg = hint ? `Game "${name}" not found. Did you mean "${hint}"?` : `Game "${name}" not found.`;
  throw new Error(msg);
}
const PER_MATCH_TIMEOUT_MS = Number(process.env.MATCH_TIMEOUT_MS || 400_000);

function parseArgs(argv) {
  const out = { swapRoles: false, verbose: false, headed: false, throttle: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--player')    out.player   = argv[++i];
    else if (a === '--opponent')  out.opponent = argv[++i];
    else if (a === '--game')      out.game     = argv[++i];
    else if (a === '--label')     out.label    = argv[++i];
    else if (a === '--matchup')   out.matchup  = argv[++i];
    else if (a === '--swap-roles') out.swapRoles = true;
    else if (a === '--verbose')   out.verbose = true;
    else if (a === '--headed')    out.headed = true;
    else if (a === '--disable-throttle') out.throttle = false;
  }
  return out;
}

async function isServerUp(ms = 1500) {
  return new Promise((resolve) => {
    const req = http.get(`${BASE}/`, (res) => {
      res.resume(); resolve(res.statusCode === 200 || res.statusCode === 404);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(ms, () => { req.destroy(); resolve(false); });
  });
}

async function maybeSpawnServer() {
  if (await isServerUp()) return null;
  const proc = spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: TEST_DIR,
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: false,
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await isServerUp(500)) return proc;
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error('Could not start http.server on port ' + PORT);
}

async function runMatch(opts) {
  const { player, opponent, game, swapRoles } = opts;
  if (!player || !game) {
    throw new Error('runMatch requires --player and --game');
  }
  const playerPath = resolvePlayer(player);
  const opponentPath = opponent ? resolvePlayer(opponent) : null;
  const gamePath = resolveGame(game);
  const matchup = opts.matchup || (opponent ? `${player}-vs-${opponent}-on-${game}` : `${player}-on-${game}`);
  const resultsDir = path.join(TEST_DIR, 'results', matchup);
  fs.mkdirSync(resultsDir, { recursive: true });

  const ts = Date.now();
  const matchId = opts.label || String(ts);
  const consolePath = path.join(resultsDir, `match-${matchId}-console.log`);
  const jsonPath = path.join(resultsDir, `match-${matchId}.json`);
  const logStream = fs.createWriteStream(consolePath);
  const log = (tag, line) => logStream.write(`[${tag}] ${line}\n`);

  const spawnedServer = await maybeSpawnServer();
  const browser = await chromium.launch({ headless: !opts.headed });
  let result;
  try {
    const ctx = await browser.newContext({ ignoreHTTPSErrors: true });

    const hookPage = (page, tag) => {
      page.on('dialog', async (d) => {
        log(tag, `dialog (${d.type()}): ${d.message()}`);
        try { await d.accept(); } catch {}
      });
      page.on('console', (msg) => {
        if (msg.type() === 'error' && msg.text().includes('Failed to load resource')) return;
        log(tag, `console.${msg.type()}: ${msg.text()}`);
      });
      page.on('pageerror', (err) => log(tag, `pageerror: ${err.message}`));
      page.on('requestfailed', (req) => {
        log(tag, `requestfailed: ${req.url()} ${req.failure()?.errorText || ''}`);
      });
      page.on('response', (res) => {
        if (res.status() >= 400) {
          log(tag, `http ${res.status()}: ${res.url()}`);
        }
      });
    };

    // Open opponent tab only for multi-player games
    let oppPage = null;
    if (opponentPath) {
      log('runner', `opening opponent tab (${opponent})…`);
      oppPage = await ctx.newPage();
      hookPage(oppPage, 'opp');
      await oppPage.goto(`${BASE}/${opponentPath}`, { waitUntil: 'load' });
    }

    log('runner', `opening player tab (${player})…`);
    const usPage = await ctx.newPage();
    hookPage(usPage, 'us');
    await usPage.goto(`${BASE}/${playerPath}`, { waitUntil: 'load' });

    log('runner', `opening manager tab (${game})…`);
    const mgrPage = await ctx.newPage();
    hookPage(mgrPage, 'mgr');
    await mgrPage.goto(`${BASE}/${gamePath}`, { waitUntil: 'load' });

    await mgrPage.waitForFunction(
      () => Array.isArray(window.roles) && window.roles.length >= 1 && window.library && window.library.length > 0,
      null, { timeout: 15_000 },
    );
    const managerRoles = await mgrPage.evaluate(() => window.roles.map((r) => window.grind ? window.grind(r) : String(r)));
    log('runner', `manager roles: ${JSON.stringify(managerRoles)}`);

    const solo = managerRoles.length === 1;

    if (solo && opponent) {
      throw new Error(`"${game}" is a single-player game — do not pass --opponent`);
    }
    if (!solo && !opponent) {
      throw new Error(`"${game}" is a ${managerRoles.length}-player game — --opponent is required`);
    }

    const usIdentifier  = player;
    const oppIdentifier = opponent ? ((player === opponent) ? `${opponent}-opp` : opponent) : null;

    await usPage.evaluate((n) => { window.player = n;
      var el = document.getElementById('player'); if (el) el.innerText = n; }, usIdentifier);
    if (oppPage) {
      await oppPage.evaluate((n) => { window.player = n;
        var el = document.getElementById('player'); if (el) el.innerText = n; }, oppIdentifier);
    }

    let ourIsP0;
    if (solo) {
      await mgrPage.evaluate((name) => {
        window.players = [name];
        window.createscoreboard();
      }, usIdentifier);
      ourIsP0 = true;
      log('runner', `players[0]=${usIdentifier} (single-player)`);
    } else {
      let p0name, p1name;
      if (player === opponent) {
        p0name = usIdentifier;
        p1name = oppIdentifier;
        ourIsP0 = true;
      } else if (swapRoles) {
        p0name = oppIdentifier;
        p1name = usIdentifier;
        ourIsP0 = false;
      } else {
        p0name = usIdentifier;
        p1name = oppIdentifier;
        ourIsP0 = true;
      }
      await mgrPage.evaluate(({ a, b }) => {
        window.players = [a, b];
        window.createscoreboard();
      }, { a: p0name, b: p1name });
      log('runner', `players[0]=${p0name} players[1]=${p1name} swapRoles=${swapRoles}`);
    }

    if (opts.verbose) {
      const verboseHook = (identity) => {
        const el = document.getElementById('transcript');
        if (!el) return;
        const desc = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        Object.defineProperty(el, 'value', {
          get() { return desc.get.call(this); },
          set(v) {
            const prev = desc.get.call(this);
            const added = v.substring(prev.length).trim();
            if (!added) { desc.set.call(this, v); return; }
            var m = added.match(/^message\(\d+,([^,]+),([^,]+),/);
            var dir = '???';
            if (m) {
              if (m[1] === identity) dir = 'SEND';
              else if (m[2] === identity) dir = 'RECV';
            }
            console.log(dir + ': ' + added);
            desc.set.call(this, v);
          },
        });
      };
      await mgrPage.evaluate(verboseHook, 'manager');
      await usPage.evaluate(verboseHook, usIdentifier);
      if (oppPage) await oppPage.evaluate(verboseHook, oppIdentifier);
    }

    if (opts.throttle) {
      const throttleHook = () => {
        const MIN_DELAY = 1000;
        const origTimeout = window.setTimeout;
        window.setTimeout = function(fn, delay, ...args) {
          return origTimeout.call(window, fn, Math.max(delay || 0, MIN_DELAY), ...args);
        };
        const origInterval = window.setInterval;
        window.setInterval = function(fn, delay, ...args) {
          return origInterval.call(window, fn, Math.max(delay || 0, MIN_DELAY), ...args);
        };
      };
      await usPage.evaluate(throttleHook);
      if (oppPage) await oppPage.evaluate(throttleHook);
      log('runner', 'timer throttling enabled on player tabs (1000ms min)');
    }

    const numPlayers = solo ? 1 : 2;
    log('runner', 'click Ping');
    await mgrPage.click('#pinger');
    await mgrPage.waitForFunction(
      (n) => window.waiter === 'load' && Array.isArray(window.actives) && window.actives.length >= n,
      numPlayers, { timeout: 30_000 },
    );
    log('runner', 'ping complete');

    log('runner', 'click Run');
    await mgrPage.click('#starter');

    const deadline = Date.now() + PER_MATCH_TIMEOUT_MS;
    let final = null;
    let lastMsgId = -1;
    while (Date.now() < deadline) {
      const snap = await mgrPage.evaluate(() => {
        try {
          return {
            waiter: window.waiter,
            errors: window.errors,
            msgid: window.messageid,
            rewards: (window.roles || []).map((r) => window.findreward(r, window.state, window.library)),
            roles: (window.roles || []).map((r) => window.grind ? window.grind(r) : String(r)),
            terminal: !!window.findterminalp(window.state, window.library),
          };
        } catch (e) {
          return { error: String(e) };
        }
      });
      if (snap.error) {
        log('runner', `snap error: ${snap.error}`);
      }
      if (snap.msgid !== lastMsgId) {
        log('runner', `progress waiter=${snap.waiter} msgid=${snap.msgid} rewards=${JSON.stringify(snap.rewards)} errs=${JSON.stringify(snap.errors)} terminal=${snap.terminal}`);
        lastMsgId = snap.msgid;
      }
      if (snap.terminal && snap.waiter === 'load') {
        final = snap;
        break;
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    if (!final) {
      final = await mgrPage.evaluate(() => ({
        waiter: window.waiter,
        errors: window.errors,
        msgid: window.messageid,
        rewards: (window.roles || []).map((r) => window.findreward(r, window.state, window.library)),
        roles: (window.roles || []).map((r) => window.grind ? window.grind(r) : String(r)),
        terminal: false,
        TIMEOUT: true,
      }));
      log('runner', `TIMEOUT: ${JSON.stringify(final)}`);
    }

    const rewardByRole = {};
    (final.roles || []).forEach((r, i) => { rewardByRole[r] = Number(final.rewards[i]); });

    if (solo) {
      const ourRole = final.roles[0];
      result = {
        matchId, matchup, ts,
        player, opponent: null, game,
        solo: true,
        swap_roles: false,
        our_name: usIdentifier, opp_name: null,
        our_role: ourRole, opp_role: null,
        our_score: rewardByRole[ourRole] || 0,
        opp_score: null,
        our_errors: Number(final.errors?.[ourRole] || 0),
        opp_errors: null,
        turns: final.msgid,
        terminal: !!final.terminal,
        timedOut: !!final.TIMEOUT,
        winner: null,
        consoleLog: consolePath,
      };
    } else {
      const ourRole = final.roles[ourIsP0 ? 0 : 1];
      const oppRole = final.roles[ourIsP0 ? 1 : 0];
      result = {
        matchId, matchup, ts,
        player, opponent, game,
        solo: false,
        swap_roles: swapRoles,
        our_name: usIdentifier, opp_name: oppIdentifier,
        our_role: ourRole, opp_role: oppRole,
        our_score: rewardByRole[ourRole] || 0,
        opp_score: rewardByRole[oppRole] || 0,
        our_errors: Number(final.errors?.[ourRole] || 0),
        opp_errors: Number(final.errors?.[oppRole] || 0),
        turns: final.msgid,
        terminal: !!final.terminal,
        timedOut: !!final.TIMEOUT,
        winner: (rewardByRole[ourRole] || 0) > (rewardByRole[oppRole] || 0) ? ourRole
              : (rewardByRole[oppRole] || 0) > (rewardByRole[ourRole] || 0) ? oppRole
              : 'draw',
        consoleLog: consolePath,
      };
    }

    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
    log('runner', `DONE: ${JSON.stringify(result)}`);
  } finally {
    logStream.end();
    if (opts.headed) {
      console.log('\nGame finished. Browser left open for inspection. Press Ctrl+C to close.');
      await new Promise(() => {});
    }
    await browser.close();
    if (spawnedServer) spawnedServer.kill();
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv.slice(2));
  runMatch(opts).then((r) => {
    const green = (s) => `\x1b[32m${s}\x1b[0m`;
    const red = (s) => `\x1b[31m${s}\x1b[0m`;
    const dim = (s) => `\x1b[2m${s}\x1b[0m`;
    const bold = (s) => `\x1b[1m${s}\x1b[0m`;

    if (r.timedOut) {
      console.log(red('\nTimed out.'));
    } else if (!r.terminal) {
      console.log(red('\nGame did not finish.'));
    } else if (r.solo) {
      const scoreColor = r.our_score >= 100 ? green : r.our_score > 0 ? bold : red;
      console.log(`\n${scoreColor(bold('Score'))}  ${r.player} ${dim('(' + r.our_role + ')')} ${r.our_score}`);
      if (r.our_errors > 0) console.log(red(`  ${r.our_errors} illegal move(s) by ${r.player}`));
    } else {
      const ourScore = r.our_score, oppScore = r.opp_score;
      const outcome = ourScore > oppScore ? green(bold('Win'))
        : ourScore < oppScore ? red(bold('Loss'))
        : bold('Draw');
      console.log(`\n${outcome}  ${r.player} ${dim('(' + r.our_role + ')')} ${ourScore}-${oppScore} ${r.opponent} ${dim('(' + r.opp_role + ')')}`);
      if (r.our_errors > 0) console.log(red(`  ${r.our_errors} illegal move(s) by ${r.player}`));
      if (r.opp_errors > 0) console.log(dim(`  ${r.opp_errors} illegal move(s) by ${r.opponent}`));
    }
    console.log('');

    const pass = r.our_errors === 0 && !r.timedOut && r.terminal;
    process.exit(pass ? 0 : 1);
  }).catch((e) => {
    console.error(`\x1b[31mERROR: ${e.message}\x1b[0m`);
    process.exit(2);
  });
}

export { runMatch, parseArgs };
