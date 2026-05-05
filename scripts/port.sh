#!/usr/bin/env bash
# port.sh — emit a production-ready player HTML to stdout.
#
# Rewrites /vendor/*.js srcs back to absolute Stanford URLs so the HTML can
# be pasted into a Gamemaster account. Optionally flips <PLAYER>_DEBUG off.
# Prepends a banner with git SHA + timestamp.
#
# Usage:
#   ./scripts/port.sh <player-name> | pbcopy
#   ./scripts/port.sh <player-name> --debug | pbcopy
#
# Writes nothing to disk.

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: port.sh <player-name> [--debug]" >&2
  exit 1
fi

PLAYER="$1"; shift || true
HERE="$(cd "$(dirname "$0")/.." && pwd)"

SRC=""
for sub in local "" dev roster; do
  if [[ -n "$sub" ]]; then
    candidate="$HERE/players/$sub/${PLAYER}.html"
  else
    candidate="$HERE/players/${PLAYER}.html"
  fi
  if [[ -f "$candidate" ]]; then
    SRC="$candidate"
    break
  fi
done

if [[ -z "$SRC" ]]; then
  echo "[port] player '${PLAYER}' not found" >&2; exit 1
fi

SHA=$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo unknown)
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

python3 - "$SRC" "$SHA" "$TS" "$PLAYER" "$@" <<'PY'
import re, sys
src, sha, ts, player, *flags = sys.argv[1:]
keep_debug = '--debug' in flags

with open(src) as f:
    text = f.read()

MAP = {
    'epilog.js':        'http://epilog.stanford.edu/javascript/epilog.js',
    'localstorage.js':  'http://gamemaster.stanford.edu/javascript/localstorage.js',
    'general.js':       'http://gamemaster.stanford.edu/reasoning/general.js',
    'ground.js':        'http://gamemaster.stanford.edu/reasoning/ground.js',
    'hybrid.js':        'http://gamemaster.stanford.edu/reasoning/hybrid.js',
    'symbol.js':        'http://gamemaster.stanford.edu/reasoning/symbol.js',
    'grounder.js':      'http://gamemaster.stanford.edu/metagaming/grounder.js',
    'materializer.js':  'http://gamemaster.stanford.edu/metagaming/materializer.js',
    'optimizer.js':     'http://gamemaster.stanford.edu/metagaming/optimizer.js',
    'pruner.js':        'http://gamemaster.stanford.edu/metagaming/pruner.js',
    'simplifier.js':    'http://gamemaster.stanford.edu/metagaming/simplifier.js',
    'symbolizer.js':    'http://gamemaster.stanford.edu/metagaming/symbolizer.js',
    'greedy.js':        'http://gamemaster.stanford.edu/gameplaying/greedy.js',
    'legal.js':         'http://gamemaster.stanford.edu/gameplaying/legal.js',
    'maximax.js':       'http://gamemaster.stanford.edu/gameplaying/maximax.js',
    'mcs.js':           'http://gamemaster.stanford.edu/gameplaying/mcs.js',
    'mcts.js':          'http://gamemaster.stanford.edu/gameplaying/mcts.js',
    'minimax.js':       'http://gamemaster.stanford.edu/gameplaying/minimax.js',
    'minimaxdepth.js':  'http://gamemaster.stanford.edu/gameplaying/minimaxdepth.js',
    'minimaxid.js':     'http://gamemaster.stanford.edu/gameplaying/minimaxid.js',
    'onestep.js':       'http://gamemaster.stanford.edu/gameplaying/onestep.js',
    'pts.js':           'http://gamemaster.stanford.edu/gameplaying/pts.js',
    'random.js':        'http://gamemaster.stanford.edu/gameplaying/random.js',
    'twostep.js':       'http://gamemaster.stanford.edu/gameplaying/twostep.js',
}

unknown = []
def repl(m):
    q = m.group(1); path = m.group(2)
    base = path.rsplit('/', 1)[-1]
    if base in MAP:
        return 'src=' + q + MAP[base] + q
    unknown.append(base)
    return m.group(0)

text = re.sub(r"""src=(['"])(/vendor/[^'"]+)\1""", repl, text)

if unknown:
    sys.stderr.write(
        '[port] WARNING: unknown vendor file(s), left as /vendor/... : '
        + ', '.join(sorted(set(unknown))) + '\n'
    )

debug_flag = f'{player.upper()}_DEBUG'
if not keep_debug:
    text = text.replace(f'var {debug_flag} = true;',
                        f'var {debug_flag} = false;')

banner = (
    f'<!-- {player} (ported). git=' + sha + ' built=' + ts +
    ('  DEBUG=on' if keep_debug else '') + ' -->\n'
)
text = re.sub(r'(<html[^>]*>)', r'\1\n' + banner.rstrip('\n'), text, count=1)

sys.stdout.write(text)
PY
