#!/usr/bin/env bash
# Nightly guardrail-distillation runner.
#
# Runs Claude Code headless to invoke the saved `distill-guardrails` workflow,
# which fans sub-agents over captured dev feedback (learnings.md QA-log,
# git reverts/fixups, claude-mem) and writes a human-review proposal report to
# .claude/distill/guardrail-proposals-<date>.md. Nothing is auto-applied.
#
# ── Install as a real nightly job (macOS launchd) ──────────────────────────
# Point it at your PRIMARY checkout (not an ephemeral worktree). Create
# ~/Library/LaunchAgents/com.simplerdev.distill-guardrails.plist with:
#
#   <?xml version="1.0" encoding="UTF-8"?>
#   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
#     "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
#   <plist version="1.0"><dict>
#     <key>Label</key><string>com.simplerdev.distill-guardrails</string>
#     <key>ProgramArguments</key>
#       <array>
#         <string>/ABSOLUTE/PATH/TO/REPO/scripts/distill-guardrails.sh</string>
#       </array>
#     <key>StartCalendarInterval</key>
#       <dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>17</integer></dict>
#     <key>StandardOutPath</key><string>/tmp/distill-guardrails.log</string>
#     <key>StandardErrorPath</key><string>/tmp/distill-guardrails.err</string>
#   </dict></plist>
#
# Then: launchctl load ~/Library/LaunchAgents/com.simplerdev.distill-guardrails.plist
# (launchd runs it at 3:17am only while the Mac is awake; a sleeping laptop
#  defers to the next wake. For a guaranteed run, host it on an always-on box.)
#
# Linux/cron equivalent:  17 3 * * *  /ABSOLUTE/PATH/TO/REPO/scripts/distill-guardrails.sh
set -euo pipefail

# Resolve repo root from this script's own location so it works regardless of cwd.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

command -v claude >/dev/null 2>&1 || { echo "distill: \`claude\` CLI not on PATH"; exit 127; }

SINCE_DAYS="${DISTILL_SINCE_DAYS:-14}"

PROMPT="Run the saved workflow named 'distill-guardrails' using the Workflow tool with { name: 'distill-guardrails', args: { sinceDays: ${SINCE_DAYS} } }. This is an explicit request to run that saved workflow. When it finishes, reply with only the report file path it wrote."

# Headless run. acceptEdits lets the report writer create the proposals file
# without an interactive prompt; the workflow only writes under .claude/distill.
exec claude -p "$PROMPT" --permission-mode acceptEdits
