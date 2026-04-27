// run-suite.mjs — run N matches, check pass criteria, emit a summary.
//
// Shared flags (passed through to run-match.mjs):
//   --player, --opponent (optional for single-player games), --game,
//   --matchup, --verbose, --headed, --disable-throttle
//
// Suite-only flags:
//   --matches <n>                   default 10
//   --min-score <n>                 pass if score >= n (default 50: must at least draw)
//   --min-score-as-player1 <n>      threshold when playing first; alternates roles per match
//   --min-score-as-player2 <n>      threshold when playing second

import { spawn } from 'node:child_process';
import http from 'node:http';
import { runMatch } from './run-match.mjs';

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

function parseArgs(argv) {
  const out = { matches: 10, minScore: 50, swapRoles: false, throttle: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--player')            out.player = argv[++i];
    else if (a === '--opponent')          out.opponent = argv[++i];
    else if (a === '--game')              out.game = argv[++i];
    else if (a === '--matchup')           out.matchup = argv[++i];
    else if (a === '--matches')           out.matches = Number(argv[++i]);
    else if (a === '--min-score')         out.minScore = Number(argv[++i]);
    else if (a === '--min-score-as-player1') out.minScoreP1 = Number(argv[++i]);
    else if (a === '--min-score-as-player2') out.minScoreP2 = Number(argv[++i]);
    else if (a === '--swap-roles')        out.swapRoles = true;
    else if (a === '--verbose')          out.verbose = true;
    else if (a === '--headed')           out.headed = true;
    else if (a === '--disable-throttle') out.throttle = false;
  }
  return out;
}

const PORT = Number(process.env.PORT || 8765);

async function isUp() {
  return new Promise((r) => {
    const req = http.get(`http://localhost:${PORT}/`, (res) => { res.resume(); r(true); });
    req.on('error', () => r(false));
    req.setTimeout(1500, () => { req.destroy(); r(false); });
  });
}

async function ensureServer() {
  if (await isUp()) return null;
  const proc = spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await isUp()) return proc;
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error('Could not start http.server');
}

function getThreshold(opts, matchIdx) {
  if (opts.minScoreP1 !== undefined || opts.minScoreP2 !== undefined) {
    return (matchIdx % 2 === 1) ? opts.minScoreP1 : opts.minScoreP2;
  }
  return opts.minScore;
}

function passMatch(r, opts, matchIdx) {
  if (r.error) return false;
  if (r.our_errors !== 0) return false;
  if (!r.terminal) return false;
  if (r.timedOut) return false;

  const threshold = getThreshold(opts, matchIdx);
  if (threshold === undefined) return true;
  return r.our_score >= threshold;
}

function failReason(r, opts, matchIdx) {
  if (r.error) return `error: ${r.error}`;
  if (r.timedOut) return 'timed out';
  if (!r.terminal) return 'game did not finish';
  if (r.our_errors !== 0) return `${r.our_errors} illegal move(s)`;
  const threshold = getThreshold(opts, matchIdx);
  if (threshold !== undefined && r.our_score < threshold) {
    return `score ${r.our_score} < ${threshold}`;
  }
  return 'unknown';
}

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.player || !opts.game) {
    console.error('usage: run-suite.mjs --player P [--opponent O] --game G [--min-score N] [--matches N]');
    process.exit(2);
  }

  const hasThreshold = opts.minScore !== undefined || opts.minScoreP1 !== undefined || opts.minScoreP2 !== undefined;

  let header = opts.opponent
    ? `\n${bold(opts.player)} vs ${bold(opts.opponent)} on ${bold(opts.game)}`
    : `\n${bold(opts.player)} on ${bold(opts.game)}`;
  header += dim(` (${opts.matches} match${opts.matches === 1 ? '' : 'es'})`);
  if (hasThreshold) {
    if (opts.minScoreP1 !== undefined) {
      header += dim(` min-score: p1=${opts.minScoreP1} p2=${opts.minScoreP2}`);
    } else {
      header += dim(` min-score: ${opts.minScore}`);
    }
  }
  console.log(header + '\n');

  const server = await ensureServer();
  const suiteStart = Date.now();
  try {
    const results = [];
    for (let i = 1; i <= opts.matches; i++) {
      const label = `suite-${Date.now()}-${i}`;
      const swapRoles = opts.opponent && (opts.minScoreP1 !== undefined || opts.minScoreP2 !== undefined)
        ? (i % 2 === 0)
        : !!opts.swapRoles;

      const matchStart = Date.now();
      let r;
      try {
        r = await runMatch({
          player: opts.player,
          opponent: opts.opponent,
          game: opts.game,
          matchup: opts.matchup,
          label,
          swapRoles,
          verbose: opts.verbose,
          headed: opts.headed,
          throttle: opts.throttle,
        });
      } catch (e) {
        r = { matchId: label, error: String(e), our_errors: 999, opp_errors: 0, our_score: 0, opp_score: 0, winner: 'error', terminal: false, timedOut: false, solo: !opts.opponent };
      }
      r._matchIdx = i;
      r._elapsed = Date.now() - matchStart;
      results.push(r);

      const pass = passMatch(r, opts, i);
      const icon = pass ? green('  pass') : red('  FAIL');
      let detail = r.solo
        ? `score ${r.our_score} as ${r.our_role || '?'}`
        : `score ${r.our_score}-${r.opp_score} as ${r.our_role || '?'}`;
      if (!pass) detail += ` (${failReason(r, opts, i)})`;
      const time = dim(formatTime(r._elapsed));
      console.log(`${icon}  ${dim(`${i}/${opts.matches}`)}  ${detail}  ${time}`);
    }

    const passed = results.filter((r) => passMatch(r, opts, r._matchIdx)).length;
    const failed = results.length - passed;
    const elapsed = formatTime(Date.now() - suiteStart);

    console.log('');
    if (failed === 0) {
      console.log(green(bold(`${passed} passed`)) + dim(` (${elapsed})`));
    } else {
      console.log(red(bold(`${failed} failed`)) + (passed > 0 ? `, ${passed} passed` : '') + dim(` (${elapsed})`));
    }
    console.log('');
    process.exit(failed === 0 ? 0 : 1);
  } finally {
    if (server) server.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
