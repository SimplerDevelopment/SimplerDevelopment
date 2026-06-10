---
type: index
date: 2026-06-09
---

# Daily Logs

Optional. claude-mem auto-captures episodic session history — write here only when a session produced durable insight (use [[Session Summary]]) or you want a human-readable day plan (use [[Daily Log]]).

```dataview
TABLE date, status
FROM "01 - Daily Logs"
WHERE type = "log"
SORT date DESC
```
