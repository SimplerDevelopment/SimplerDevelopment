# Install and distribution across macOS, Linux and Windows

Type: grilling
Status: open
Blocked by: 01, 07

## Question

The destination is "another developer can follow the README and record their
first session." That is a shipping requirement, not a design principle.

- **Chrome Web Store listing or unpacked load from a release zip?** The Store
  means review (and review may care about `chrome.debugger` and
  `host_permissions: <all_urls>`); unpacked means every user needs developer
  mode, and Chrome nags about it on every launch.
- If there is a sidecar: how is it distributed and started? `npx`, a single
  prebuilt binary per platform, a Docker image, or a build-from-source step?
- What is the **honest minimum** README install path, in numbered steps, and how
  many steps is too many before someone gives up?
- Windows specifically — the most likely place a Unix-shaped design breaks.
- Versioning and release process: how does a user find out the extension and the
  sidecar have gone out of sync?
- What does "works" mean on first run — is there a self-test that proves capture,
  transcription and disk output all function before a user trusts a real session?
