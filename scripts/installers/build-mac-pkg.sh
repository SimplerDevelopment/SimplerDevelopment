#!/usr/bin/env bash
#
# Build the signed + notarized macOS .pkg installer for the SimplerDevelopment
# Claude skills bundle. Run this on a Mac with Xcode Command Line Tools
# installed and the Developer ID Installer cert already loaded into your
# login keychain (or available as a .p12 referenced via SD_PKG_P12_PATH).
#
# Usage:
#   bun run build:installer:mac
#   # or directly:
#   bash scripts/installers/build-mac-pkg.sh
#
# Required env vars (sourced from ~/.simplerdev/signing.env by convention):
#   SD_PKG_IDENTITY        — "Developer ID Installer: <Name> (TEAMID)"
#                            (omit to auto-detect from the login keychain)
#   SD_NOTARIZE_APPLE_ID   — Apple ID for notarization (your dev account email)
#   SD_NOTARIZE_APP_PASSWORD — app-specific password from appleid.apple.com
#   SD_NOTARIZE_TEAM_ID    — 10-char Apple Developer Team ID
#
# Optional env vars:
#   SD_PKG_P12_PATH        — path to .p12 file (only if cert isn't in keychain)
#   SD_PKG_P12_PASSWORD    — password for the .p12
#   SD_PKG_VERSION         — version string (default: UTC timestamp)
#   SD_PKG_SKIP_NOTARIZE   — set to 1 to build a signed-but-not-notarized .pkg
#                            for local smoke-testing (still gets Gatekeeper
#                            warning on first open)
#
# Output:
#   public/installers/SimplerDevelopmentSkills.pkg   — signed + stapled
#
# Auto-sources ~/.simplerdev/signing.env if present so you don't have to
# remember to export everything by hand.

set -euo pipefail

# ── Config ──────────────────────────────────────────────────────────────
PKG_NAME="SimplerDevelopmentSkills"
IDENTIFIER="com.simplerdevelopment.skills"
STAGING_PATH="/private/tmp/com.simplerdevelopment.skills"
OUT_DIR="public/installers"
FINAL_PKG="${OUT_DIR}/${PKG_NAME}.pkg"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${REPO_ROOT}"
# The Next.js app lives under simplerdevelopment2026/. All paths below
# assume that as the working dir.
if [ -d "simplerdevelopment2026" ]; then
  cd simplerdevelopment2026
fi

# ── Source credentials ────────────────────────────────────────────────
SIGNING_ENV="${HOME}/.simplerdev/signing.env"
if [ -f "${SIGNING_ENV}" ]; then
  # shellcheck disable=SC1090
  set -a; . "${SIGNING_ENV}"; set +a
fi

VERSION="${SD_PKG_VERSION:-$(date -u +%Y.%m.%d.%H%M)}"
SKIP_NOTARIZE="${SD_PKG_SKIP_NOTARIZE:-0}"

bold()  { printf '\033[1m==> %s\033[0m\n' "$*"; }
ok()    { printf '\033[32m   ✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[33m   ⚠\033[0m %s\n' "$*"; }
fail()  { printf '\033[31m   ✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Sanity checks ─────────────────────────────────────────────────────
bold "Sanity checks"
for cmd in pkgbuild productbuild productsign xcrun security shasum stapler bun; do
  if [ "${cmd}" = "stapler" ]; then
    # xcrun shim — check via xcrun
    xcrun --find stapler >/dev/null 2>&1 || fail "xcrun stapler not found (install Xcode Command Line Tools: xcode-select --install)"
    continue
  fi
  command -v "${cmd}" >/dev/null 2>&1 || fail "Required command not found: ${cmd}"
done
ok "All required tools present"

if [ "${SKIP_NOTARIZE}" != "1" ]; then
  : "${SD_NOTARIZE_APPLE_ID:?Set SD_NOTARIZE_APPLE_ID (Apple ID email) or set SD_PKG_SKIP_NOTARIZE=1}"
  : "${SD_NOTARIZE_APP_PASSWORD:?Set SD_NOTARIZE_APP_PASSWORD (app-specific password)}"
  : "${SD_NOTARIZE_TEAM_ID:?Set SD_NOTARIZE_TEAM_ID (10-char Apple Team ID)}"
fi

# ── Resolve signing identity ──────────────────────────────────────────
bold "Resolving signing identity"
if [ -n "${SD_PKG_IDENTITY:-}" ]; then
  IDENTITY="${SD_PKG_IDENTITY}"
  ok "Using explicit identity: ${IDENTITY}"
else
  IDENTITY=$(security find-identity -p basic -v 2>/dev/null \
    | grep "Developer ID Installer" \
    | head -1 \
    | sed -E 's/^[[:space:]]*[0-9]+\)[[:space:]]+[A-F0-9]+[[:space:]]+"(.+)"$/\1/' || true)
  if [ -z "${IDENTITY}" ]; then
    fail "No 'Developer ID Installer' identity found in keychain. Either install the cert + private key (.p12) or set SD_PKG_IDENTITY=\"Developer ID Installer: ...\""
  fi
  ok "Auto-detected identity: ${IDENTITY}"
fi

# ── Build the skills bundle ───────────────────────────────────────────
bold "Building skills bundle"
bun run scripts/build-client-skills-bundle.ts
if [ ! -d "dist/_stage-skills" ]; then
  fail "dist/_stage-skills/ missing after bundle build — did the build fail silently?"
fi
ok "Skills staged in dist/_stage-skills/"

# ── Build the component .pkg ──────────────────────────────────────────
bold "Building component .pkg"
TMP_DIR="$(mktemp -d -t sd-pkg)"
trap 'rm -rf "${TMP_DIR}"' EXIT
COMPONENT_PKG="${TMP_DIR}/component.pkg"

# Make sure postinstall is executable. Some checkouts strip the +x bit.
chmod 755 scripts/installers/pkg-scripts/postinstall

pkgbuild \
  --root "dist/_stage-skills" \
  --identifier "${IDENTIFIER}" \
  --version "${VERSION}" \
  --install-location "${STAGING_PATH}" \
  --scripts "scripts/installers/pkg-scripts" \
  "${COMPONENT_PKG}" \
  >/dev/null
ok "Component .pkg: ${COMPONENT_PKG}"

# ── Build distribution .pkg ───────────────────────────────────────────
bold "Building distribution .pkg"
DIST_XML="${TMP_DIR}/distribution.xml"
sed -e "s|@@IDENTIFIER@@|${IDENTIFIER}|g" \
    -e "s|@@VERSION@@|${VERSION}|g" \
    -e "s|@@COMPONENT_PKG@@|$(basename "${COMPONENT_PKG}")|g" \
    scripts/installers/pkg-distribution.xml.template > "${DIST_XML}"

UNSIGNED_PKG="${TMP_DIR}/unsigned.pkg"
productbuild \
  --distribution "${DIST_XML}" \
  --package-path "${TMP_DIR}" \
  --resources "scripts/installers/pkg-resources" \
  "${UNSIGNED_PKG}" \
  >/dev/null
ok "Distribution .pkg: ${UNSIGNED_PKG}"

# ── Optional: import .p12 if SD_PKG_P12_PATH is set ──────────────────
if [ -n "${SD_PKG_P12_PATH:-}" ]; then
  bold "Importing .p12 into a temporary keychain"
  : "${SD_PKG_P12_PASSWORD:?Set SD_PKG_P12_PASSWORD when using SD_PKG_P12_PATH}"
  KEYCHAIN="${TMP_DIR}/build.keychain-db"
  KEYCHAIN_PW="$(uuidgen)"
  security create-keychain -p "${KEYCHAIN_PW}" "${KEYCHAIN}" >/dev/null
  security set-keychain-settings -lut 7200 "${KEYCHAIN}" >/dev/null
  security unlock-keychain -p "${KEYCHAIN_PW}" "${KEYCHAIN}" >/dev/null
  security import "${SD_PKG_P12_PATH}" -k "${KEYCHAIN}" -P "${SD_PKG_P12_PASSWORD}" -T /usr/bin/productsign >/dev/null
  security set-key-partition-list -S apple-tool:,apple: -k "${KEYCHAIN_PW}" "${KEYCHAIN}" >/dev/null
  # Prepend the build keychain to the search list so productsign sees it.
  EXISTING_KEYCHAINS=$(security list-keychains -d user | xargs)
  security list-keychains -d user -s "${KEYCHAIN}" ${EXISTING_KEYCHAINS}
  ok "Temporary keychain primed: ${KEYCHAIN}"
fi

# ── Sign ──────────────────────────────────────────────────────────────
bold "Signing"
mkdir -p "${OUT_DIR}"
productsign --sign "${IDENTITY}" "${UNSIGNED_PKG}" "${FINAL_PKG}" >/dev/null
ok "Signed: ${FINAL_PKG}"

# ── Verify signature ──────────────────────────────────────────────────
pkgutil --check-signature "${FINAL_PKG}" || fail "Signature verification failed."
ok "Signature verified"

# ── Notarize ──────────────────────────────────────────────────────────
if [ "${SKIP_NOTARIZE}" = "1" ]; then
  warn "Skipping notarization (SD_PKG_SKIP_NOTARIZE=1)."
  warn "First-time open on another Mac will hit a Gatekeeper warning."
else
  bold "Submitting to Apple notarization (this can take a few minutes)"
  xcrun notarytool submit "${FINAL_PKG}" \
    --apple-id "${SD_NOTARIZE_APPLE_ID}" \
    --password "${SD_NOTARIZE_APP_PASSWORD}" \
    --team-id "${SD_NOTARIZE_TEAM_ID}" \
    --wait
  ok "Notarized"

  bold "Stapling notarization ticket"
  xcrun stapler staple "${FINAL_PKG}"
  ok "Stapled"

  xcrun stapler validate "${FINAL_PKG}" || fail "Stapler validation failed."
  ok "Stapler validation passed"
fi

# ── Summary ───────────────────────────────────────────────────────────
echo
bold "Done"
SIZE=$(du -h "${FINAL_PKG}" | cut -f1)
SHA=$(shasum -a 256 "${FINAL_PKG}" | awk '{print $1}')
echo "  Output:  ${FINAL_PKG}"
echo "  Size:    ${SIZE}"
echo "  SHA-256: ${SHA}"
echo "  Version: ${VERSION}"
echo
echo "Next steps:"
echo "  1. git add ${FINAL_PKG} && git commit"
echo "  2. Update /install page CTA to point at /installers/${PKG_NAME}.pkg"
echo "  3. Test the .pkg by double-clicking it in Finder"
