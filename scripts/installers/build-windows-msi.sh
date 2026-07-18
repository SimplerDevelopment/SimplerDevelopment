#!/usr/bin/env bash
#
# Build the (eventually signed) Windows .msi installer for the SimplerDevelopment
# Claude skills bundle.
#
# IMPORTANT: this script invokes WiX, which the WiX project officially
# supports only on Windows. The recommended way to invoke this is via the
# `.github/workflows/sd2026-windows-installer.yml` workflow on a
# `windows-latest` runner. Local invocation on macOS / Linux is best-effort
# only and may fail at WiX's directory-resolution stage (the .claude
# dot-prefix path is validated differently outside Windows).
#
# Usage:
#   # Preferred — trigger the CI workflow:
#   gh workflow run sd2026-windows-installer.yml -f commit_back=true
#
#   # Local (Windows only):
#   bun run build:installer:windows
#
# Required prerequisites on Windows (the CI workflow installs these
# automatically):
#   - .NET SDK 8.0+
#   - WiX 5 tool                     dotnet tool install --global wix --version 5.0.2
#   - osslsigncode (or signtool)     for signing
#
# Optional env vars (only needed for a signed build):
#   SD_PFX_PATH        — path to a .pfx code-signing cert (Windows equivalent of .p12)
#   SD_PFX_PASSWORD    — password for the .pfx
#   SD_MSI_VERSION     — MSI ProductVersion (default: UTC YYYY.MM.DD.HHmm)
#   SD_MSI_SKIP_SIGN   — set to 1 to skip signing (smoke build)
#
# Output:
#   public/installers/SimplerDevelopmentSkills.msi
#
# Auto-sources ~/.simplerdev/signing.env if present so credentials never
# live in the repo.

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────
MSI_NAME="SimplerDevelopmentSkills"
OUT_DIR="public/installers"
FINAL_MSI="${OUT_DIR}/${MSI_NAME}.msi"

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "${REPO_ROOT}"
if [ -d "simplerdevelopment2026" ]; then
  cd simplerdevelopment2026
fi

SIGNING_ENV="${HOME}/.simplerdev/signing.env"
if [ -f "${SIGNING_ENV}" ]; then
  # shellcheck disable=SC1090
  set -a; . "${SIGNING_ENV}"; set +a
fi

# MSI requires a strict W.X.Y.Z numeric format. Build one from UTC date.
# Format YYYY.MM.DD.HHmm fits the 4-part 16-bit-each constraint (256 max
# per field is plenty since we only ever cross 256 if we ship >256x in
# the same minute, which we won't).
VERSION="${SD_MSI_VERSION:-$(date -u +%Y.%m.%d.%H%M | awk -F. '{printf "%d.%d.%d.%d\n", $1-2000, $2, $3, $4}')}"
SKIP_SIGN="${SD_MSI_SKIP_SIGN:-0}"

bold()  { printf '\033[1m==> %s\033[0m\n' "$*"; }
ok()    { printf '\033[32m   ✓\033[0m %s\n' "$*"; }
warn()  { printf '\033[33m   ⚠\033[0m %s\n' "$*"; }
fail()  { printf '\033[31m   ✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Sanity checks ─────────────────────────────────────────────────────
bold "Sanity checks"

if ! command -v dotnet >/dev/null 2>&1; then
  fail "dotnet not found. Install with: brew install --cask dotnet-sdk"
fi
ok "dotnet $(dotnet --version)"

# wix tool ships under ~/.dotnet/tools/ when installed via `dotnet tool install -g wix`.
# Make sure that path is on PATH for this shell session.
if [ -d "${HOME}/.dotnet/tools" ] && [[ ":${PATH}:" != *":${HOME}/.dotnet/tools:"* ]]; then
  export PATH="${HOME}/.dotnet/tools:${PATH}"
fi

if ! command -v wix >/dev/null 2>&1; then
  fail "wix not found. Install with: dotnet tool install --global wix"
fi
ok "wix $(wix --version 2>&1 | head -1)"

if [ "${SKIP_SIGN}" = "1" ]; then
  warn "Smoke build (SD_MSI_SKIP_SIGN=1) — output .msi will be unsigned."
else
  if ! command -v osslsigncode >/dev/null 2>&1; then
    fail "osslsigncode not found. Install with: brew install osslsigncode"
  fi
  : "${SD_PFX_PATH:?Set SD_PFX_PATH to your .pfx file (or SD_MSI_SKIP_SIGN=1 for unsigned smoke build)}"
  : "${SD_PFX_PASSWORD:?Set SD_PFX_PASSWORD}"
  if [ ! -f "${SD_PFX_PATH}" ]; then
    fail "SD_PFX_PATH does not exist: ${SD_PFX_PATH}"
  fi
  ok "osslsigncode $(osslsigncode --version 2>&1 | head -1 | awk '{print $NF}')"
  ok "PFX: ${SD_PFX_PATH}"
fi

# ── Build the skills bundle ───────────────────────────────────────────
bold "Building skills bundle"
bun run scripts/build-client-skills-bundle.ts
STAGE_DIR_ABS="$(pwd)/dist/_stage-skills"
if [ ! -d "${STAGE_DIR_ABS}" ]; then
  fail "dist/_stage-skills/ missing after bundle build."
fi
ok "Skills staged at ${STAGE_DIR_ABS}"

# ── Build the MSI via wix ─────────────────────────────────────────────
bold "Building MSI"
TMP_DIR="$(mktemp -d -t sd-msi)"
trap 'rm -rf "${TMP_DIR}"' EXIT
UNSIGNED_MSI="${TMP_DIR}/unsigned.msi"

# wix preprocessor variables: SD_VERSION + SD_STAGE_DIR (consumed in product.wxs)
wix build \
  scripts/installers/wix/product.wxs \
  -d "SD_VERSION=${VERSION}" \
  -d "SD_STAGE_DIR=${STAGE_DIR_ABS}" \
  -arch x64 \
  -out "${UNSIGNED_MSI}"
ok "MSI built: ${UNSIGNED_MSI} ($(du -h "${UNSIGNED_MSI}" | cut -f1))"

# ── Sign (or skip) ────────────────────────────────────────────────────
mkdir -p "${OUT_DIR}"
if [ "${SKIP_SIGN}" = "1" ]; then
  cp "${UNSIGNED_MSI}" "${FINAL_MSI}"
  warn "Skipping signature (SD_MSI_SKIP_SIGN=1). Output is unsigned."
  warn "End users will hit Windows SmartScreen on first run."
else
  bold "Signing with osslsigncode"
  # SHA-256 is the modern-required digest; the timestamp URL pins a
  # cross-signed RFC3161 timestamp so the signature stays valid after
  # the cert expires.
  osslsigncode sign \
    -pkcs12 "${SD_PFX_PATH}" \
    -pass "${SD_PFX_PASSWORD}" \
    -h sha256 \
    -ts "http://timestamp.digicert.com" \
    -n "SimplerDevelopment Skills" \
    -i "https://simplerdevelopment.com/install" \
    -in "${UNSIGNED_MSI}" \
    -out "${FINAL_MSI}"
  ok "Signed: ${FINAL_MSI}"

  bold "Verifying signature"
  osslsigncode verify "${FINAL_MSI}"
  ok "Signature verified"
fi

# ── Summary ───────────────────────────────────────────────────────────
echo
bold "Done"
SIZE=$(du -h "${FINAL_MSI}" | cut -f1)
SHA=$(shasum -a 256 "${FINAL_MSI}" | awk '{print $1}')
echo "  Output:  ${FINAL_MSI}"
echo "  Size:    ${SIZE}"
echo "  SHA-256: ${SHA}"
echo "  Version: ${VERSION}"
echo
if [ "${SKIP_SIGN}" = "1" ]; then
  echo "Smoke build only. To produce a signed installer:"
  echo "  1. Buy a code-signing cert (EV recommended; standard works with reputation delay)"
  echo "  2. Export as .pfx; stash at ~/.simplerdev/code-signing.pfx"
  echo "  3. Add SD_PFX_PATH + SD_PFX_PASSWORD to ~/.simplerdev/signing.env"
  echo "  4. Re-run this script without SD_MSI_SKIP_SIGN"
else
  echo "Next steps:"
  echo "  1. git add ${FINAL_MSI} && git commit"
  echo "  2. Update /install page to point Windows CTA at /installers/${MSI_NAME}.msi"
fi
