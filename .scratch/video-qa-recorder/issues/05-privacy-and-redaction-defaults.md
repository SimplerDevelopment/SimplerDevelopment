# Privacy and redaction defaults

Type: grilling
Status: open

## Question

This tool records real sessions against real apps and writes the result to disk
as plain files, then hands those files to an AI coding agent. Everything below
is a default that ships to strangers, so it needs deciding rather than
discovering:

- **Typed input.** Do keystrokes get captured at all? Skreno records that keys
  were typed but not the characters. Passwords, API keys and customer PII all go
  through `<input>`. What is the default, and how is a password field detected
  beyond `type="password"`?
- **Request/response bodies.** These routinely carry bearer tokens, cookies,
  session ids and customer records. Are `Authorization`/`Cookie`/`Set-Cookie`
  headers stripped by default? Are bodies captured for successful requests at
  all, or only failures?
- **The video.** It shows whatever was on screen, including other tabs' content
  reflected in the page, and any secrets rendered in the UI.
- **Is there an allowlist?** Does recording only work on origins the user
  explicitly enables, or on any tab?
- **Does redaction happen at capture time or review time?** Capturing then
  redacting means the raw secret existed on disk; redacting at capture means
  irreversibly losing data you may have needed.
- What does the README have to say out loud so a user does not hand a session
  full of production tokens to a third-party model?
