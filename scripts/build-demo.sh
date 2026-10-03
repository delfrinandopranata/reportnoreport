#!/usr/bin/env bash
set -euo pipefail

# Build the browser-only demo from the demo-local tag into dist/demo/

cd "$(dirname "$0")/.."

# Ensure we have the demo-local tag
if ! git rev-parse demo-local >/dev/null 2>&1; then
  # Tag not found locally; try fetching from origin (handles shallow clones on Vercel)
  if ! git fetch --depth=1 origin tag demo-local 2>/dev/null; then
    echo "Error: git tag 'demo-local' not found locally or on origin. Cannot build demo." >&2
    exit 1
  fi
fi

WORKTREE_PATH=".demo-build"
DIST_PATH="dist/demo"

# Cleanup function: always remove the worktree in case of error or normal exit
cleanup() {
  if [ -d "$WORKTREE_PATH" ]; then
    git worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Remove any stale worktree from a previous failed run
if [ -d "$WORKTREE_PATH" ]; then
  git worktree remove --force "$WORKTREE_PATH" 2>/dev/null || true
fi

# Create a temporary worktree for the demo-local tag
git worktree add --force --detach "$WORKTREE_PATH" demo-local

# Install dependencies in the temporary worktree
cd "$WORKTREE_PATH"
# Try frozen-lockfile first; fall back to no-frozen-lockfile if it fails
if ! pnpm install --frozen-lockfile 2>/dev/null; then
  echo "Note: frozen-lockfile failed, falling back to --no-frozen-lockfile"
  pnpm install --no-frozen-lockfile
fi

# Build with vite, outputting to ../dist/demo (relative to worktree)
pnpm exec vite build --base /demo/ --outDir ../dist/demo --emptyOutDir

# Return to repo root
cd ..

# Inject a visible banner into the built demo HTML
if [ -f "$DIST_PATH/index.html" ]; then
  # Use sed to insert the banner after <body>
  # Match <body> and insert the banner on the next line (portable across macOS and Linux)
  sed -i.bak '/<body>/a\
    <div style="background: #fff3cd; border-bottom: 2px solid #ffc107; padding: 12px 16px; font-size: 14px; font-family: system-ui, -apple-system, sans-serif; text-align: center; color: #333;">Demo — data stays in your browser. <a href="/app/" style="color: #0066cc; text-decoration: none; font-weight: 500;">Sign in</a></div>' \
    "$DIST_PATH/index.html"
  # Remove the backup file created by sed
  rm -f "$DIST_PATH/index.html.bak"
else
  echo "Error: $DIST_PATH/index.html not found after build" >&2
  exit 1
fi

# Clean up git worktree state
git worktree prune

echo "✓ Demo built successfully at $DIST_PATH/index.html"
