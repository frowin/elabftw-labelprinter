#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT_DIR="$SCRIPT_DIR"
MANIFEST="$EXT_DIR/manifest.json"
VERSION_FILE="$SCRIPT_DIR/VERSION"

bold()   { printf "\033[1m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }

valid_semver() { [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; }

# semver compare: returns 0 if $1 >= $2
semver_gte() {
  local a="$1" b="$2"
  if [[ "$a" == "$b" ]]; then return 0; fi
  local IFS=.
  read -ra A <<< "$a"; read -ra B <<< "$b"
  for i in 0 1 2; do
    local av="${A[$i]:-0}" bv="${B[$i]:-0}"
    (( 10#$av > 10#$bv )) && return 0
    (( 10#$av < 10#$bv )) && return 1
  done
  return 0
}

# ── fetch latest remote tags ──────────────────────────────────────────────────

echo ""
bold "Fetching latest tags from GitHub..."
git -C "$SCRIPT_DIR" fetch --tags --quiet

LATEST_TAG=$(git -C "$SCRIPT_DIR" tag --list 'v*' --sort=-version:refname | head -n1)
LATEST_REMOTE="${LATEST_TAG#v}"
[[ -z "$LATEST_REMOTE" ]] && LATEST_REMOTE="0.0.0"

# ── current version ───────────────────────────────────────────────────────────

CURRENT=$(node -e "process.stdout.write(require('$MANIFEST').version)")

IFS='.' read -r maj min pat <<< "$CURRENT"
PATCH_BUMP="${maj}.${min}.$((pat+1))"

bold "Current version : $CURRENT"
bold "Latest on GitHub: $LATEST_REMOTE"
echo ""

# ── prompt ────────────────────────────────────────────────────────────────────

read -rp "Release version [$PATCH_BUMP]: " INPUT
NEW_VERSION="${INPUT:-$PATCH_BUMP}"

if ! valid_semver "$NEW_VERSION"; then
  red "Invalid version format: '$NEW_VERSION' (must be x.y.z)"
  exit 1
fi

if ! semver_gte "$NEW_VERSION" "$LATEST_REMOTE"; then
  red "Version $NEW_VERSION is older than latest GitHub tag $LATEST_REMOTE"
  exit 1
fi

if [[ "$NEW_VERSION" == "$LATEST_REMOTE" ]]; then
  red "Version $NEW_VERSION already exists on GitHub"
  exit 1
fi

bold "\nReleasing: $CURRENT → $NEW_VERSION\n"

# ── warn on dirty tree ────────────────────────────────────────────────────────

if [[ -n "$(git -C "$SCRIPT_DIR" status --porcelain)" ]]; then
  yellow "⚠ Working tree has uncommitted changes (version files will still be committed)."
  read -rp "Continue anyway? [y/N]: " CONT
  CONT=$(echo "$CONT" | tr '[:upper:]' '[:lower:]')
  [[ "$CONT" == "y" ]] || exit 1
fi

# ── update version files ──────────────────────────────────────────────────────

node -e "
const fs = require('fs');
const m = JSON.parse(fs.readFileSync('$MANIFEST', 'utf8'));
m.version = '$NEW_VERSION';
fs.writeFileSync('$MANIFEST', JSON.stringify(m, null, 2) + '\n');
"
green "✓ manifest.json → $NEW_VERSION"

echo "$NEW_VERSION" > "$VERSION_FILE"
green "✓ VERSION → $NEW_VERSION"

# ── build ─────────────────────────────────────────────────────────────────────

(cd "$EXT_DIR" && RELEASE_BUILD=1 npm run build)
green "✓ Build complete"

# ── zip ───────────────────────────────────────────────────────────────────────

ZIP_NAME="elabftw-niimbot-labelprinter-v${NEW_VERSION}.zip"
ZIP_DIR="$SCRIPT_DIR/releases"
ZIP_PATH="$ZIP_DIR/$ZIP_NAME"
mkdir -p "$ZIP_DIR"
rm -f "$ZIP_PATH"
(cd "$EXT_DIR" && zip -r "$ZIP_PATH" manifest.json dist/background.js dist/content.js dist/popup.js icons/)
green "✓ releases/$ZIP_NAME created"

# ── git commit + tag + push ───────────────────────────────────────────────────

git -C "$SCRIPT_DIR" add "$MANIFEST" "$VERSION_FILE"
git -C "$SCRIPT_DIR" commit -m "chore: release v${NEW_VERSION}"
git -C "$SCRIPT_DIR" tag "v${NEW_VERSION}"
git -C "$SCRIPT_DIR" push origin HEAD --tags
green "✓ Committed, tagged and pushed v${NEW_VERSION}"

# ── github release ────────────────────────────────────────────────────────────

gh release create "v${NEW_VERSION}" "$ZIP_PATH" \
  --title "v${NEW_VERSION}" \
  --notes "Chrome extension v${NEW_VERSION}" \
  --latest

green "\n✓ GitHub release v${NEW_VERSION} published!"
bold "$(gh release view "v${NEW_VERSION}" --json url -q .url)"
echo ""
