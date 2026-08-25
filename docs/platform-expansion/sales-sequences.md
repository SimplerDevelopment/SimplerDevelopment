# Sales Sequences

## Status

**Foundation exists; extension planned (Phase 18–19).**

The codebase already has an email-only cadence engine in
`lib/db/schema/crm.ts`:

- `crm_sequences` — the sequence definition.
- `crm_sequence_steps` — ordered steps with `delayHours`, subject, body.
- `crm_sequence_enrollments` — per-contact status, `currentStep`, `haltedReason`.
- `crm_sequence_sends` — unique `(enrollmentId, stepId)` idempotency.
- `app/api/cron/process-crm-sequences` — the scheduler that advances steps.

Sales Sequences extends this rather than replacing it: the same engine becomes
omnichannel and gains the step types, stop conditions, and reply detection the
spec requires.

## Sequence model (target shape)

- `Sequence` — id, tenantId, name, description, status, targetType (contact |
  deal), owner.
- `SequenceStep` — id, sequenceId, order, type, delay, channel, template,
  agentId, conditions, settings.
- `SequenceEnrollment` — id, tenantId, sequenceId, contactId, dealId, status,
  currentStep, nextExecutionAt, startedAt, pausedAt, completedAt, stoppedAt,
  stopReason.

## Step types (initial)

`SEND_EMAIL · SEND_WHATSAPP · SEND_INSTAGRAM · SEND_MESSENGER · CREATE_TASK ·
WAIT · CONDITION · AGENT_ACTION · UPDATE_CONTACT · UPDATE_DEAL · MOVE_DEAL ·
ASSIGN_OWNER · WEBHOOK`.

Every channel-send step goes through the Channel Gateway (never a raw provider
call), so policies + outbox + idempotency apply uniformly.

## Enrollment guards

Enroll verifies: consent (no opt-out), channel availability (connection +
identity), no existing active enrollment, suppression/opt-out lists. Auto-
enrollment from the Automation Engine on `deal.created` (qualify → enroll).

## Stop conditions (configurable per sequence)

Contact replies · deal closes · booking created · customer opts out · human
stops · contact converted · policy failure.

## Reply detection

Any inbound omnichannel message (via the Channel Gateway) is checked against
active enrollments; a reply pauses/stops the sequence so it never ignores a
human response. The Follow-up / Sales agent then evaluates.

## Business hours + personalization

- Sends respect tenant timezone, allowed weekdays/hours, and channel policies
  (no 03:00 sends). The Channel Gateway's policy engine is the enforcement
  point.
- `AI Personalize` steps personalize content from contact/company/deal/prior
  interactions + Company Brain + a template. The LLM never invents
  offers/prices — economic data comes from real sources.

## Sales tasks

`CREATE_TASK` produces call/email/meeting/review/manual-WhatsApp/custom tasks,
assigned to owner/team/round-robin (reuses `crm_activities`).

## Lead score

Reuses the existing `crm_scoring_rules` (event → points). Signals: replies,
opens, clicks, site activity, bookings, deal stage, company size, engagement,
channel activity. The LLM is never the sole source of score.

## Analytics

Dashboard + per-step + per-channel rollups: enrolled, active, completed,
replied, converted, opted-out, failed; sent, delivered, opened, clicked,
replied, converted (per step); email/WhatsApp/Instagram/Messenger (per channel).

## Templates

Reusable templates: New-lead follow-up, Quote follow-up, No response,
Appointment follow-up, Customer reactivation, Post-demo follow-up. No sector
hardcoding.
