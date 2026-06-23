# macOS .pkg Installer — Build + Signing Guide

> One-time setup notes for whoever holds the Apple Developer credentials.
> After this is set up, every release is `bun run build:installer:mac`.

## What this installer is

A signed + notarized macOS `.pkg` that installs the SimplerDevelopment Claude skills
bundle into `~/.claude/skills/`. Replaces the awkward `.command` shell-script
flow with a native Installer.app experience — no Gatekeeper warning, no
"right-click → Open" dance.

- **Source layout:** `scripts/installers/` — `build-mac-pkg.sh`, `pkg-scripts/postinstall`, `pkg-resources/*.html`, `pkg-distribution.xml.template`
- **Output:** `public/installers/SimplerDevelopmentSkills.pkg` — committed to the repo (1–5 MB; Vercel serves it as a static asset)
- **Install location:** `$HOME/.claude/skills/` — user-domain, no admin password
- **The `.command` script** is kept around as the "Advanced" fallback on `/install`

## One-time setup

### 1. Apple Developer Program enrollment

Confirm membership at https://developer.apple.com/account. You need the
$99/year Apple Developer Program (not the free tier — that doesn't grant
Developer ID Installer certs).

### 2. Generate a "Developer ID Installer" certificate

This is the cert type used to sign `.pkg` distribution. **It is different
from "Developer ID Application"** (which signs `.app` bundles); both can
exist simultaneously.

1. Open Keychain Access → Certificate Assistant → "Request a Certificate
   From a Certificate Authority". Save the CSR file.
2. developer.apple.com → Account → Certificates → **+** → choose
   **"Developer ID Installer"**. Upload the CSR.
3. Download the issued `.cer`. Double-click to install into your login
   keychain. Verify with:
   ```bash
   security find-identity -p basic -v | grep "Developer ID Installer"
   ```
   You should see a line like `1) ABCDEF... "Developer ID Installer: Your Name (TEAMID)"`.
4. Right-click the cert in Keychain Access → **Export Items…** → save as
   `.p12` with a strong password. Stash this safely (1Password, a sealed
   backup drive, etc.). You'll need the `.p12` again if you set up CI or
   build from a different Mac.

### 3. Generate an app-specific password for notarytool

Apple's notarization service (`xcrun notarytool`) authenticates with an
app-specific password, NOT your real Apple ID password.

1. appleid.apple.com → Sign-In and Security → **App-Specific Passwords** → Generate.
2. Name it something like "SimplerDev notarytool".
3. Apple shows the 19-character password once (`xxxx-xxxx-xxxx-xxxx`). Save it.

### 4. Find your Team ID

developer.apple.com → Account → Membership → **Team ID** (10 chars, e.g. `ABCD123456`).

### 5. Stash credentials in `~/.simplerdev/signing.env`

The build script auto-sources this file if it exists. Outside the repo,
so no chance of it landing in git.

```bash
mkdir -p ~/.simplerdev
chmod 700 ~/.simplerdev
cat > ~/.simplerdev/signing.env <<'EOF'
# Auto-sourced by scripts/installers/build-mac-pkg.sh

# Apple developer credentials
SD_NOTARIZE_APPLE_ID="you@example.com"
SD_NOTARIZE_APP_PASSWORD="xxxx-xxxx-xxxx-xxxx"
SD_NOTARIZE_TEAM_ID="ABCD123456"

# Optional: explicit identity. If unset, build-mac-pkg.sh auto-detects
# the first "Developer ID Installer" identity in the login keychain.
# SD_PKG_IDENTITY="Developer ID Installer: Your Name (ABCD123456)"

# Optional: build from a .p12 instead of relying on the login keychain
# (uncomment for CI/headless builds; leave commented for local dev).
# SD_PKG_P12_PATH="${HOME}/.simplerdev/dev-id-installer.p12"
# SD_PKG_P12_PASSWORD="the-p12-password-you-chose"
EOF
chmod 600 ~/.simplerdev/signing.env
```

## Building the .pkg

After one-time setup, every build is one command:

```bash
bun run build:installer:mac
```

What it does, in order:

1. Runs `scripts/build-client-skills-bundle.ts` to stage the skills under `dist/_stage-skills/`.
2. Runs `pkgbuild` to create a component .pkg that drops the staged
   files at `/private/tmp/com.simplerdevelopment.skills/` during install.
3. Writes a temporary `distribution.xml` from the template + version stamp.
4. Runs `productbuild` to wrap the component .pkg with the welcome /
   conclusion screens.
5. Runs `productsign` with the Developer ID Installer identity.
6. Runs `xcrun notarytool submit --wait` (typically 2–15 min).
7. Runs `xcrun stapler staple` so the .pkg verifies offline.
8. Writes the final signed .pkg to `public/installers/SimplerDevelopmentSkills.pkg`.

On a successful run you'll see:

```
==> Done
  Output:  public/installers/SimplerDevelopmentSkills.pkg
  Size:    1.4M
  SHA-256: <hex>
  Version: 2026.05.22.0900
```

### Testing the .pkg locally before committing

Double-click the .pkg in Finder. It should:

1. Show the welcome screen with the SimplerDevelopment skills description.
2. Skip the customize step (`customize="never"` in distribution.xml).
3. Install with no admin password prompt.
4. Show the conclusion screen with the MCP-config snippet.
5. Drop the skills into `~/.claude/skills/`.

Verify:

```bash
ls ~/.claude/skills/sd-init/
ls ~/.claude/skills/CLIENT_QUICKSTART.md
```

## Shipping the .pkg

```bash
git add public/installers/SimplerDevelopmentSkills.pkg
git commit -m "chore(installer): rebuild macOS .pkg (vX.Y.Z)"
git push
```

Deploy. The static asset is served via Vercel's CDN with cache headers
controlled by `next.config.js` (defaults are fine for an immutable build
artifact named with the same path every time).

## Quick-and-dirty smoke build (no notarization)

For verifying the build pipeline works before you've nailed down
notarization credentials:

```bash
SD_PKG_SKIP_NOTARIZE=1 bun run build:installer:mac
```

The resulting .pkg is signed but not stapled. Other Macs will hit the
"unsigned developer" Gatekeeper warning on first open, but the build
pipeline itself works end-to-end.

## Troubleshooting

### `productsign: error: certificate not found`

Either:
- The login keychain doesn't have the cert. Re-import the `.cer` or `.p12`.
- The cert is there but the private key isn't (you imported a `.cer` from
  Apple's site on a different Mac). Re-export the `.p12` with both cert
  and private key on the Mac that issued the CSR.
- Run `security find-identity -p basic -v` and confirm an entry that
  starts with "Developer ID Installer" appears.

### `notarytool: error: HTTP status: 401`

Wrong Apple ID, wrong app-specific password, or expired app-specific
password. Generate a fresh one at appleid.apple.com and update
`~/.simplerdev/signing.env`.

### `notarytool: status: Invalid`

Apple rejected the .pkg. Check the log:

```bash
xcrun notarytool log <submission-id> \
  --apple-id "$SD_NOTARIZE_APPLE_ID" \
  --password "$SD_NOTARIZE_APP_PASSWORD" \
  --team-id "$SD_NOTARIZE_TEAM_ID"
```

Common causes: hardened runtime not enabled on embedded binaries (we
don't ship binaries, so this shouldn't happen), bad identifier, malformed
distribution.xml.

### "The package is damaged and can't be opened" on the recipient Mac

The notarization ticket didn't get stapled. Re-run:

```bash
xcrun stapler staple public/installers/SimplerDevelopmentSkills.pkg
```

Or rebuild from scratch.

## CI migration (later)

When we want to build on GitHub Actions instead of locally:

1. Encode the `.p12` as base64 and store as a repo secret
   (`MAC_INSTALLER_P12_BASE64`).
2. Store the `.p12` password, notarytool credentials, and team ID as
   secrets too.
3. Add a workflow that runs on `macos-latest`, decodes the `.p12`,
   imports into a temp keychain, calls `build-mac-pkg.sh` with
   `SD_PKG_P12_PATH` / `SD_PKG_P12_PASSWORD` set. The build script
   already supports this code path.

Until then, `bun run build:installer:mac` from a developer's Mac is the
release procedure.
