# CS 227B Local Test Harness

A local test harness for Stanford CS 227B (General Game Playing). Develop and test your GGP player from your IDE instead of juggling browser tabs on the Gamemaster website.

The harness uses [Playwright](https://playwright.dev/) to automate the same 3-tab workflow (game manager + two players) in a headless browser. All public roster players, games, and classmates' custom players from the developer portal are included — clone the repo and start testing.

## Quick Start

```bash
git clone https://github.com/Trendoplasm/cs227b-harness.git && cd cs227b-harness
npm install
npx playwright install chromium

# Fetch the latest classmate-created games and players (will prompt login)
npm run fetch-dev-players
npm run fetch-dev-games
```

## Developing Your Player

1. Copy the starter template:
   ```bash
   cp players/myplayer.html players/yourname.html
   ```

2. Edit `players/yourname.html` — change `var player = 'myplayer'` to your player name and add your strategy code. The player interface has five functions:
   - `ping()` — return `'ready'`
   - `start(role, rules, startclock, playclock)` — initialize, return `'ready'`
   - `play(move)` — return your move (or `false` if it's not your turn)
   - `stop(move)` — cleanup after game ends
   - `abort()` — cleanup on abort

3. Test it:
   ```bash
   npm run match -- --player yourname --opponent legal --game tictactoe
   ```

4. When you're happy, export for upload to Stanford:
   ```bash
   npm run port -- yourname | pbcopy
   ```
   Paste into your Gamemaster account. The port script rewrites local `/vendor/` paths back to Stanford URLs.

## Running Matches

**Single match:**

```bash
npm run match -- --player <you> --opponent <them> --game <game> [flags]
```

| Flag | Description |
|------|-------------|
| `--player <name>` | Your player (required) |
| `--opponent <name>` | Opponent player (required) |
| `--game <name>` | Game to play (required) |
| `--swap-roles` | Your player plays as the second role instead of first |
| `--verbose` | Log all protocol messages (SEND/RECV) between manager and players |
| `--headed` | Run in a visible browser window; stays open after the game for inspection |
| `--disable-throttle` | Disable background-tab timer throttling (see [Realism](#realism)) |
| `--label <id>` | Custom name for result files |
| `--matchup <name>` | Custom subdirectory under `results/` |

**Suite (N matches with pass/fail criteria):**

```bash
npm run suite -- --player <you> --opponent <them> --game <game> [flags]
```

All single-match flags work, plus:

| Flag | Description |
|------|-------------|
| `--matches <n>` | Number of matches (default 10) |
| `--min-score <n>` | Pass if your score >= n every match (default 50) |
| `--min-score-as-player1 <n>` | Score threshold when you're the first-mover |
| `--min-score-as-player2 <n>` | Score threshold when you're the second-mover |

By default, `--min-score` is 50 — your player must at least draw. Set `--min-score 100` to require wins, or `--min-score 0` for a basic "does it crash?" check.

When using `--min-score-as-player1` / `--min-score-as-player2`, the harness automatically alternates which side you play: odd matches = player1, even matches = player2. These flags are useful because some games favor the first or second player, so you might want different thresholds for each side.

**Examples:**

```bash
# Quick test against the dumbest possible opponent
npm run match -- --player yourname --opponent legal --game tictactoe

# 10-match suite: must win as first-mover, at least draw as second
npm run suite -- --player yourname --opponent legal --game tictactoe \
  --min-score-as-player1 100 --min-score-as-player2 50 --matches 10

# Test against a smarter opponent on a different game
npm run match -- --player yourname --opponent minimax --game connectfour

# Watch the game play out in a real browser
npm run match -- --player yourname --opponent random --game breakthrough --headed

# Debug protocol issues with full message trace
npm run match -- --player yourname --opponent legal --game tictactoe --verbose
```

## Results

Match results go to `results/<matchup>/`:
- `match-<id>.json` — scores, errors, winner, terminal state
- `match-<id>-console.log` — full console output from all three tabs

Suite results print a color-coded summary to stdout with pass/fail per match.

## Directory Structure

Players and games are organized into three tiers, searched in priority order:

```
players/
  yourname.html          ← your own players (highest priority)
  dev/                   ← classmates' custom players (from developer portal)
  roster/                ← Stanford's built-in players (legal, minimax, etc.)

games/
  yourgame.html          ← your own custom games (highest priority)
  dev/                   ← classmates' custom games
  roster/                ← Stanford's built-in games (tictactoe, breakthrough, etc.)
```

When you run `--player legal`, the harness checks the top level first, then `dev/`, then `roster/`. This means your own players always take priority, and refreshing roster or dev content never overwrites your work.

## Available Players

**Built-in (roster):** All players from the public Gamemaster roster.

| Player | Strategy |
|--------|----------|
| `legal` | Always picks the first legal move (simplest baseline) |
| `random` | Picks a random legal move |
| `minimax` | Minimax search |
| `minimaxdepth` | Depth-limited minimax |
| `minimaxid` | Iterative-deepening minimax |
| `mcs` | Monte Carlo search |
| `mcts` | Monte Carlo tree search |

**Dev (classmates):** Custom players from the developer portal are in `players/dev/`. Run `ls players/dev/` to see the full list.

## Available Games

**Built-in (roster):** 64 games from the public Gamemaster site.

| Game | Roles | Description |
|------|-------|-------------|
| `tictactoe` | x, o | Standard 3x3 tic-tac-toe |
| `connectfour` | red, black | Connect Four |
| `breakthrough` | white, black | Breakthrough (first to reach opposite side) |
| `hex7x7` | red, blue | Hex on a 7x7 board |
| `pentago` | red, black | Pentago |
| `knights` | white, black | Knights game |

Run `ls games/roster/` for the full list, `ls games/dev/` for classmates' custom games.

## Fetching Players & Games

**Public roster (no login required):**

```bash
npm run fetch-roster-players
npm run fetch-roster-games
npm run bootstrap              # re-vendorize JS dependencies after fetching
```

**Developer portal (requires login):**

```bash
npm run fetch-dev-players
npm run fetch-dev-games
npm run bootstrap
```

The dev fetch scripts automatically open a browser for login if no saved session exists or if the session has expired. After you sign in, cookies are saved locally and reused on subsequent runs. Dev players that already exist in the public roster are automatically skipped.

## Realism

The harness runs the same JavaScript in the same browser engine as the real Gamemaster, but there are some differences to be aware of.

**Timer throttling (on by default):** Real browsers throttle `setTimeout`/`setInterval` to 1000ms minimum for background tabs. Since the Gamemaster workflow has two player tabs that are effectively "in the background" while the manager runs, the harness simulates this throttling by default. If your player uses timers internally (e.g., for iterative deepening with a time limit), this affects how much work it can do per turn. Use `--disable-throttle` to remove this constraint.

**Performance:** Even with throttling, your player gets slightly more CPU time locally than on the real Gamemaster — there's no browser UI, extensions, or other tabs competing for resources. If your player barely finishes within the playclock locally, give yourself extra margin.

**Environment detection:** Players can detect they're running locally (e.g., via `window.location.hostname`, headless browser flags, or network requests) and behave differently. Always verify your results on the actual Gamemaster before a competition.

## How It Works

The harness replicates what you'd do manually on the Gamemaster website:

1. Opens three browser tabs in headless Chromium (via Playwright)
2. Tab 1: your player
3. Tab 2: opponent player
4. Tab 3: game manager
5. Clicks **Ping** — manager discovers both players via `localStorage`
6. Clicks **Run** — manager sends the game rules, then alternates `play()` messages
7. Polls until the game reaches a terminal state or times out
8. Writes results to `results/`

All communication between tabs uses the browser's `localStorage` API — the same protocol the Stanford site uses. Your player code runs in exactly the same environment as it would on the real Gamemaster.

## Environment

- Requires **Node.js >= 18** and **Python 3** (for the local HTTP server)
- Run `npx playwright install chromium` after `npm install`
- The match timeout defaults to 400 seconds; override with `MATCH_TIMEOUT_MS=<ms>`
- The HTTP server defaults to port 8765; override with `PORT=<port>`
