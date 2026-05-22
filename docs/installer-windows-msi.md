# Windows .msi Installer — Build + Signing Guide

> Scaffolding is in place; the cross-platform build runs on macOS. A signed
> .msi requires a Windows code-signing certificate ($200–700/year from a
> CA, or ~$10/month via Azure Trusted Signing). Until you've bought one,
> use the smoke-build flag to produce an unsigned .msi for testing.

## What this installer is

A real Windows `.msi` (not the `.bat` script) that installs the
SimplerDevelopment Claude skills bundle into `%USERPROFILE%\.claude\skills\`.
Replaces the awkward `.bat` flow — no SmartScreen scariness (when signed),
no terminal window, no `right-click → Run anyway` dance.

- **Source layout:** `scripts/installers/wix/product.wxs` + `scripts/installers/build-windows-msi.sh`
- **Output:** `public/installers/SimplerDevelopmentSkills.msi` — committed to repo + served as a Vercel static asset
- **Install location:** `%USERPROFILE%\.claude\skills\` — per-user, no UAC prompt
- **The `.bat` script** stays around as the "Advanced" fallback on `/install`

## Why this works without a Windows machine

WiX 5+ runs on .NET. The MSI is a portable archive format. `osslsigncode`
signs Windows binaries from any OS. The whole pipeline — `wix build`,
`osslsigncode sign`, timestamp, verify — runs on macOS or Linux without a
single Windows VM.

## One-time setup

### 1. Install build tools (one time, per Mac)

```bash
brew install dotnet osslsigncode
dotnet tool install --global wix
# wix lands in ~/.dotnet/tools/ — the build script adds that to PATH automatically.
```

Verify:

```bash
dotnet --version
wix --version
osslsigncode --version
```

### 2. Buy a code-signing certificate

| Option | Cost | Reputation behavior | Friction |
|---|---|---|---|
| **Azure Trusted Signing** | ~$9.99/month | EV-equivalent. Bypasses SmartScreen reputation **on day zero**. | Requires Microsoft business verification (D-U-N-S, etc.). Cloud API signing, no hardware token. **Most recommended if you qualify.** |
| **EV** (Extended Validation) — Sectigo, DigiCert, SSL.com | $300–700/year | Bypasses SmartScreen reputation **on day zero**. | Most CAs ship the cert on a USB hardware token, which prevents cross-platform CI signing. Some CAs offer cloud-based EV — ask before buying. |
| **Standard ("OV")** — Sectigo, DigiCert, etc. | $200–400/year | Removes "unrecognized publisher" warning. **SmartScreen still warns until reputation builds** (weeks/months of accumulated downloads). | None — pure file-based `.pfx`, signs from anywhere. |

Whatever you pick, the CA delivers either a `.pfx` file directly (standard
certs) or a method to export from the hardware token (EV) into a usable
form. Stash the `.pfx` outside the repo:

```bash
mkdir -p ~/.simplerdev
mv ~/Downloads/your-code-signing.pfx ~/.simplerdev/code-signing.pfx
chmod 600 ~/.simplerdev/code-signing.pfx
```

### 3. Add credentials to `~/.simplerdev/signing.env`

Append (or create) `~/.simplerdev/signing.env`:

```bash
SD_PFX_PATH="${HOME}/.simplerdev/code-signing.pfx"
SD_PFX_PASSWORD="the-password-you-chose-or-the-CA-gave-you"
```

The macOS .pkg build script auto-sources this same file — sharing it
between both build scripts is intentional.

## Building the .msi

### Smoke build (no cert needed, verifies the pipeline)

```bash
SD_MSI_SKIP_SIGN=1 bun run build:installer:windows
```

Produces `public/installers/SimplerDevelopmentSkills.msi` — unsigned. End
users would hit SmartScreen, but the binary is a real, openable .msi that
installs correctly when run on Windows.

Useful when:
- You're verifying the WiX file before buying a cert
- You're testing a bundle-content change locally before re-signing
- You want to confirm the file harvest picks up new skills

### Signed build (production)

```bash
bun run build:installer:windows
```

With `SD_PFX_PATH` / `SD_PFX_PASSWORD` set in `~/.simplerdev/signing.env`,
the script:

1. Stages the skills bundle (`bun run scripts/build-client-skills-bundle.ts`)
2. Runs `wix build` to produce an unsigned .msi
3. Signs with `osslsigncode` using SHA-256 + a DigiCert RFC3161 timestamp
4. Verifies the signature
5. Writes the signed .msi to `public/installers/SimplerDevelopmentSkills.msi`

### Testing on Windows

The .msi runs on Windows 10 build 17763+ and Windows 11. To test:

1. Copy the .msi to a Windows VM (or hand off to a Windows colleague).
2. Double-click in Explorer.
3. **Unsigned:** SmartScreen warning → "More info" → "Run anyway".
   **Signed (standard OV):** SmartScreen warning until reputation builds.
   **Signed (EV / Azure Trusted Signing):** No warning, single-click install.
4. Windows Installer UI shows a progress bar (no welcome/EULA dialog by
   default — we deliberately used WiX's minimal UI). Install completes
   silently.
5. Verify: `%USERPROFILE%\.claude\skills\sd-init\SKILL.md` exists.
6. Uninstall via Settings → Apps → "SimplerDevelopment Skills" → Uninstall.

## Shipping the .msi

```bash
git add public/installers/SimplerDevelopmentSkills.msi
git commit -m "chore(installer): rebuild Windows .msi (vX.Y.Z)"
git push
```

Vercel serves it from the static `/installers/` path. Hyperlinks on
`/install` already point there once the page CTA is swapped.

## How the version number works

MSI requires a 4-part numeric version: `major.minor.build.revision`, each
0–65535. The build script auto-derives:

```
YY.MM.DD.HHmm  →  YY=26 etc.
```

So a build at 2026-05-22 13:42 UTC becomes `26.5.22.1342`. WiX's
MajorUpgrade rule means each new install upgrades any older version on
the machine — no manual uninstall required.

Override with `SD_MSI_VERSION="1.2.3.4"` if you want explicit control.

## Troubleshooting

### `wix: command not found` after install

The `dotnet tool install --global wix` step drops `wix` into
`~/.dotnet/tools/`. That dir must be on `$PATH`. The build script adds
it automatically; if you're invoking `wix` from your shell directly, add
to your shell rc:

```bash
export PATH="${HOME}/.dotnet/tools:${PATH}"
```

### `osslsigncode: Failed PKCS12 file ...`

Wrong `.pfx` password, or the `.pfx` is corrupt / wasn't exported with
the private key. Re-export from your cert store with both cert + private
key included.

### Signed .msi still triggers SmartScreen

Standard OV certs don't bypass SmartScreen reputation. The "first hundreds
of users see warnings" period is normal. EV certs (or Azure Trusted
Signing) bypass it on day zero.

If you really need to verify reputation built up, Microsoft has a partner
site: https://www.microsoft.com/en-us/wdsi/filesubmission — submit the
.msi for review.

### WiX build error: "Light: ICE43"

This is a benign warning about the install being per-user vs per-machine
classification. Our `Scope="perUser"` setting is intentional and works
correctly. If it becomes a blocker, suppress with `-suppress ICE43` in
the build script.

### `dotnet --info` says "Could not execute because..."

The Homebrew formula puts the `dotnet` binary at a custom location.
Source `brew --prefix dotnet`'s `libexec/bin` into your PATH if needed.
This usually resolves itself on the next terminal restart.

## CI migration (later)

When ready to move to GitHub Actions:

1. Encode the `.pfx` as base64 and store as a repo secret
   (`WINDOWS_PFX_BASE64`).
2. Store the `.pfx` password as a secret (`WINDOWS_PFX_PASSWORD`).
3. Workflow runs on `ubuntu-latest` or `macos-latest` (both work — WiX +
   osslsigncode are cross-platform).
4. Decode the `.pfx` to a temp file, export `SD_PFX_PATH` +
   `SD_PFX_PASSWORD`, call `build-windows-msi.sh`.

Until then, `bun run build:installer:windows` from a developer's Mac is
the release procedure.
