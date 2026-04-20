# CS 227B Local Test Harness

A local test harness for Stanford CS 227B (General Game Playing). Develop and test your GGP player from your IDE instead of juggling browser tabs on the Gamemaster website.

The harness uses [Playwright](https://playwright.dev/) to automate the same 3-tab workflow (game manager + two players) in a headless browser. All 33 roster players and 64 games from the Gamemaster site are included — clone the repo and start testing.

## Quick Start

```bash
git clone https://github.com/Trendoplasm/cs227b-harness.git && cd cs227b-harness
npm install
npx playwright install chromium
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
| `--player <name>` | Your player (basename in `players/`, no `.html`) |
| `--opponent <name>` | Opponent player |
| `--game <name>` | Game to play (basename in `games/`) |
| `--swap-roles` | Your player plays as the second role instead of first |
| `--label <id>` | Custom name for result files |
| `--matchup <name>` | Custom subdirectory under `results/` |
| `--verbose` | Log all protocol messages (SEND/RECV) between manager and players |
| `--headed` | Run in a visible browser window; stays open after the game for inspection |

**Suite (N matches with pass/fail criteria):**

```bash
npm run suite -- --player <you> --opponent <them> --game <game> [flags]
```

All single-match flags work, plus:

| Flag | Description |
|------|-------------|
| `--matches <n>` | Number of matches (default 10) |
| `--min-score <n>` | Pass if your score >= n every match |
| `--min-score-as-player1 <n>` | Score threshold when you're the first-mover |
| `--min-score-as-player2 <n>` | Score threshold when you're the second-mover |

By default, `--min-score` is set to 50 so the tests will pass if your player draws or wins (useful for games where optimal play from both parties results in a draw). Change accordingly if you only want to pass on a win.

When using `--min-score-as-player1` / `--min-score-as-player2`, the harness automatically alternates which side you play: odd matches = player1, even matches = player2. These flags are useful because sometimes a game may favor the first or second player, so you might have different score thresholds for the two scenarios.

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

Suite results print a summary table to stdout with PASS/FAIL per match.

## Available Players

All players from the Stanford Gamemaster roster are included in `players/`. Some notable ones:

| Player | Strategy |
|--------|----------|
| `legal` | Always picks the first legal move (simplest baseline) |
| `random` | Picks a random legal move |
| `minimax` | Minimax search |
| `minimaxdepth` | Depth-limited minimax |
| `minimaxid` | Iterative-deepening minimax |
| `mcs` | Monte Carlo search |
| `mcts` | Monte Carlo tree search |

## Available Games

64 games from the Gamemaster site are in `games/`. A few to start with:

| Game | Roles | Description |
|------|-------|-------------|
| `tictactoe` | x, o | Standard 3x3 tic-tac-toe |
| `connectfour` | red, black | Connect Four |
| `breakthrough` | white, black | Breakthrough (first to reach opposite side) |
| `hex7x7` | red, blue | Hex on a 7x7 board |
| `pentago` | red, black | Pentago |
| `knights` | white, black | Knights game |

Run `ls games/` to see the full list.

## Refreshing Content

To pull the latest players and games from Stanford:

```bash
npm run fetch-players    # download all roster players
npm run fetch-games      # download all game manager pages
npm run bootstrap        # re-vendorize JS dependencies
```

This overwrites existing files in `players/`, `games/`, and `vendor/`. Your custom player files (anything not on the Stanford roster) are unaffected.

## How It Works

The harness replicates what you'd do manually on the Gamemaster website:

1. Opens three browser tabs in headless Chromium (via Playwright)
2. Tab 1: your player (`players/<name>.html`)
3. Tab 2: opponent player (`players/<name>.html`)
4. Tab 3: game manager (`games/<game>.html`)
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
