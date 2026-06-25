# demo.tape — generates the above-the-fold hero GIF for the README.
#
# This is the single highest-ROI launch asset (per the OSS Launch Playbook):
# HN/Reddit traffic converts to stars at only ~1.4 stars/upvote, so the repo
# itself has to close the sale. For an "agent-operable platform", the most
# honest, highest-signal hero is a terminal showing an MCP client actually
# driving the 200+ tools.
#
# HOW TO RECORD:
#   1. Install vhs:      brew install vhs   (or: go install github.com/charmbracelet/vhs@latest)
#   2. Have a working instance + an MCP client configured (see docs/mcp.md).
#   3. From repo root:   vhs docs/launch/demo.tape
#   4. Output:           docs/launch/demo.gif  (referenced by README.md)
#
# IMPORTANT (honesty): the `Type`/`Sleep` lines below SIMULATE a representative
# session for a clean recording. Before publishing, re-record against a REAL
# running instance so the output is genuine, not staged — a faked demo is the
# fastest way to lose the HN crowd's trust. Replace the canned `echo` blocks
# with real `claude` / MCP-client invocations once your instance is up.

Output docs/launch/demo.gif

Set Theme "Catppuccin Mocha"
Set FontSize 18
Set Width 1200
Set Height 700
Set Padding 24
Set TypingSpeed 45ms

# --- Frame 1: the pitch -------------------------------------------------
Type "# SimplerDevelopment — operate an entire agency stack by talking to an agent"
Enter
Sleep 1200
Type "# 200+ MCP tools. Self-hostable. Apache-2.0."
Enter
Sleep 1500
Ctrl+L

# --- Frame 2: connect an MCP client -------------------------------------
# Replace with your real client invocation (claude / cursor / mcp-cli).
Type "claude mcp list"
Enter
Sleep 800
Type "#  simplerdev  ✓ connected  (200+ tools: content, crm, brain, email, bookings, billing)"
Enter
Sleep 1800
Ctrl+L

# --- Frame 3: build a page by asking ------------------------------------
Type `claude "Create a landing page for Acme Dental with a hero, services grid, and a booking CTA"`
Enter
Sleep 1000
Type "#  → posts_create        draft post #1042 created"
Enter
Sleep 600
Type "#  → posts_upload_html    5 blocks added (hero, services, cta, testimonial, footer)"
Enter
Sleep 600
Type "#  → booking_pages_create approval URL minted"
Enter
Sleep 700
Type "#  ✓ Draft ready for review → /portal/websites/acme/posts/1042/edit"
Enter
Sleep 2200
Ctrl+L

# --- Frame 4: the close -------------------------------------------------
Type "# Sites · CRM · Company Brain (RAG) · Email · Bookings · Storefront · e-Sign · Billing"
Enter
Sleep 1000
Type "# One codebase. One agent. github.com/DanielPCoyle/simplerdevelopment2026"
Enter
Sleep 2500
