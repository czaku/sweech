#!/usr/bin/env bash
# Install git hooks so the global `sweech` CLI keeps working after `git pull`.
# Idempotent — re-running just refreshes the hook scripts.

set -euo pipefail

HOOKS_DIR="$(git rev-parse --git-path hooks)"
mkdir -p "$HOOKS_DIR"

write_hook() {
  local name="$1"
  local path="$HOOKS_DIR/$name"
  cat > "$path" <<'HOOK'
#!/usr/bin/env bash
# Keep dist/ in sync with src/ after pulls, checkouts, or rebases.
# Silent no-op if node/npm aren't installed — safe for non-dev clones.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

needs_build=0

# Rebuild if dist/cli.js is missing.
if [ ! -f dist/cli.js ]; then
  needs_build=1
else
  # Rebuild if anything under src/ or tsconfig.json is newer than dist/cli.js.
  newest_src="$(find src tsconfig.json -type f -newer dist/cli.js 2>/dev/null | head -1 || true)"
  [ -n "$newest_src" ] && needs_build=1
fi

# Reinstall deps if package files changed since the last install.
# Compare against node_modules/.package-lock.json — npm refreshes this on every
# install, while node_modules/ directory mtime stays stuck at the first install.
needs_install=0
install_marker="node_modules/.package-lock.json"
if [ ! -d node_modules ] || [ ! -f "$install_marker" ]; then
  needs_install=1
elif [ package.json -nt "$install_marker" ] || [ package-lock.json -nt "$install_marker" ]; then
  needs_install=1
fi

[ "$needs_install$needs_build" = "00" ] && exit 0

if ! command -v npm >/dev/null 2>&1; then
  echo "sweech hook: npm not found, skipping auto-rebuild" >&2
  exit 0
fi

if [ "$needs_install" = "1" ]; then
  echo "sweech: package files changed — running npm install" >&2
  npm install --silent
  # `prepare` already ran build during install — nothing more to do.
  exit 0
fi

if [ "$needs_build" = "1" ]; then
  echo "sweech: src changed — rebuilding dist/" >&2
  npm run build --silent
fi
HOOK
  chmod +x "$path"
  echo "installed: $path"
}

write_hook post-merge
write_hook post-checkout
write_hook post-rewrite

echo "Done. Hooks will rebuild dist/ automatically after pulls/checkouts/rebases."
