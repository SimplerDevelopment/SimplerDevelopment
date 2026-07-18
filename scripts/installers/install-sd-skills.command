#!/usr/bin/env bash
#
# SimplerDevelopment skills — macOS installer
#
# Double-click this file in Finder to install the SimplerDevelopment Claude
# skills (sd-init, sd-create-page, sd-create-deck, etc.) into
# ~/.claude/skills/. Works with Claude Desktop and Claude Code.
#
# This installer is unsigned. The first time you run it macOS may say
# "this file was downloaded from the internet" — right-click → Open the
# first time to bypass Gatekeeper. (Future versions will be signed.)

set -euo pipefail

BUNDLE_URL="${SD_BUNDLE_URL:-https://simplerdevelopment.com/api/skills/bundle.tgz}"
BUNDLE_SHA_URL="${SD_BUNDLE_URL:-https://simplerdevelopment.com/api/skills/bundle.tgz.sha256}"
SKILLS_DIR="${HOME}/.claude/skills"
TMP_TGZ="$(mktemp -t sd-skills-bundle).tgz"

cleanup() { rm -f "${TMP_TGZ}" "${TMP_TGZ}.sha256" 2>/dev/null || true; }
trap cleanup EXIT

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[33m⚠\033[0m %s\n' "$*"; }
err()  { printf '\033[31m✗\033[0m %s\n' "$*" >&2; }

echo
bold "SimplerDevelopment skills — macOS installer"
echo

# Sanity checks
for cmd in curl tar shasum mkdir; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    err "Required command not found: ${cmd}"
    exit 1
  fi
done

echo "Target:        ${SKILLS_DIR}"
echo "Bundle source: ${BUNDLE_URL}"
echo

# Download
bold "1. Downloading skills bundle..."
if ! curl -fsSL "${BUNDLE_URL}" -o "${TMP_TGZ}"; then
  err "Download failed. Is the portal reachable? Try opening ${BUNDLE_URL} in a browser."
  echo
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi
ok "Downloaded $(du -h "${TMP_TGZ}" | cut -f1)"

# Verify (best-effort — skip if checksum endpoint is unreachable)
bold "2. Verifying checksum..."
if curl -fsSL "${BUNDLE_SHA_URL}" -o "${TMP_TGZ}.sha256" 2>/dev/null; then
  EXPECTED=$(awk '{print $1}' "${TMP_TGZ}.sha256")
  ACTUAL=$(shasum -a 256 "${TMP_TGZ}" | awk '{print $1}')
  if [ "${EXPECTED}" != "${ACTUAL}" ]; then
    err "Checksum mismatch:"
    err "  expected: ${EXPECTED}"
    err "  actual:   ${ACTUAL}"
    err "Refusing to install — bundle may be tampered or partially downloaded."
    echo
    read -n 1 -s -r -p "Press any key to close..."
    exit 1
  fi
  ok "Checksum verified"
else
  warn "Checksum endpoint not reachable — skipping verification (install proceeds anyway)."
fi

# Extract
bold "3. Installing to ${SKILLS_DIR}..."
mkdir -p "${SKILLS_DIR}"
if ! tar -xzf "${TMP_TGZ}" -C "${SKILLS_DIR}"; then
  err "Extraction failed."
  echo
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi
ok "Skills installed"

# Summary
echo
bold "Installed skills:"
for s in sd-init sd-create-page sd-create-deck sd-create-email sd-create-survey \
         sd-create-booking-page sd-create-website sd-build-html-embed sd-learn \
         html-render-block; do
  if [ -d "${SKILLS_DIR}/${s}" ]; then
    printf '  ✓ %s\n' "${s}"
  else
    printf '  ✗ %s  (MISSING — bundle may be incomplete)\n' "${s}"
  fi
done

echo
bold "Next steps:"
cat <<'EOF'

  1. Configure the MCP server in Claude Desktop:

     Open  ~/Library/Application Support/Claude/claude_desktop_config.json
     Add:

       {
         "mcpServers": {
           "simplerdevelopment": {
             "command": "npx",
             "args": [
               "-y", "mcp-remote",
               "https://<your-tenant>.simplerdevelopment.com/api/mcp"
             ]
           }
         }
       }

     Replace <your-tenant> with your tenant subdomain (your account
     manager has this if you don't).

  2. Restart Claude Desktop.

  3. In Claude, say:   Run sd-init

     Claude will OAuth into your portal, pull your brand profile, and
     write a .sd/config.json into your current working directory. After
     that, all the other sd-* skills are ready to use.

  Full quickstart:  ~/.claude/skills/CLIENT_QUICKSTART.md

EOF

read -n 1 -s -r -p "Press any key to close..."
echo
