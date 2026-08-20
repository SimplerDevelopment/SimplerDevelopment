# How a coding agent consumes a session

Type: grilling
Status: open
Blocked by: 09

## Question

The point of the tool is the handoff. Both surveyed competitors that thought
about this (Skreno, DevRecorder) shipped an MCP server.

- **Plain files the user @-mentions**, a **CLI** that prints a digest, or an
  **MCP server** the agent queries? Files are free and require nothing; MCP means
  the agent can ask "what failed" without a 40k-token timeline in context.
- A full session's `timeline.json` could be very large. Is there a summarization
  or query layer, or does the consumer just get the raw file?
- Does the tool ship a **skill/prompt** — "here is how to read one of these" — or
  is the format meant to be self-evident?
- If MCP: does it run inside the sidecar (free, if a sidecar exists) or as a
  separate process?
- Does the answer change between the local-me case and a stranger's case?
