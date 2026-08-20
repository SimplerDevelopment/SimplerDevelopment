# Does the video survive, and in what form?

Type: grilling
Status: open

## Question

The stated consumer is a coding agent, and an agent reads SRT and JSON, not
pixels. The video is also by far the most expensive artifact — encode time, disk,
and the only reason `tabCapture`/`getDisplayMedia` permissions are needed at all.

- **Keep the full webm, keep only frames at event boundaries, or drop video
  entirely?** A frame captured at each click is a fraction of the size and is
  something a multimodal agent can actually look at.
- Who is the video *for* — the agent, a human reviewing the bug later, or the
  person who recorded it proving what they saw?
- If frames only: at what events, at what resolution, and does that lose the
  "watch the bug happen" value that makes screen recording worth doing?
- If full video: resolution/bitrate defaults, and does it get referenced from the
  timeline by timestamp so an agent can tell a human "watch from 2:14"?
- Does the answer change if the video is cheap to keep but simply never read?

Note this is decidable independently of the capture and transcription branches,
but it constrains the artifact contract.
