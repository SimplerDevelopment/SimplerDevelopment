// Publishing Command Center — runtime constants shared between bootstrap,
// permissions enforcement, board UI, and the channel adapters.
//
// Schema-side these are NOT enforced as DB enums — they are plain strings so
// future custom-stage support (phase 2) doesn't require a migration. Use the
// constants here for any code that compares against a known stage / key.

/** The flag value on `projects.system_kind` that identifies the per-client
 *  Publishing board project. There is exactly one such project per client. */
export const PUBLISHING_SYSTEM_KIND = 'publishing' as const;

/** The six default stages, in board order. The bootstrap action creates one
 *  `kanban_columns` row per stage with matching name, order, color, and
 *  `is_done` (only `Published` is done-ish — `Archived` is "removed from
 *  active view," not "completed"). */
export const PUBLISHING_STAGES = [
  { key: 'idea',        name: 'Idea',        color: '#94a3b8', isDone: false },
  { key: 'draft',       name: 'Draft',       color: '#eab308', isDone: false },
  { key: 'in_review',   name: 'In Review',   color: '#6366f1', isDone: false },
  { key: 'scheduled',   name: 'Scheduled',   color: '#3b82f6', isDone: false },
  { key: 'published',   name: 'Published',   color: '#10b981', isDone: true  },
  { key: 'archived',    name: 'Archived',    color: '#6b7280', isDone: false },
] as const;

export type PublishingStageKey = typeof PUBLISHING_STAGES[number]['key'];

/** All permission keys recognized by `publishing_permissions.permission_key`.
 *  Anything not in this list is rejected at the API boundary. */
export const PUBLISHING_PERMISSION_KEYS = [
  // Stage-transition permissions. Granting `move_to_<stage>` allows the user
  // to move ANY card into that stage; absence falls back to the role default
  // (owners + admins implicit grant, others implicit deny).
  'move_to_idea',
  'move_to_draft',
  'move_to_in_review',
  'move_to_scheduled',
  'move_to_published',
  'move_to_archived',
  // Card-action permissions.
  'create_card',
  'delete_card',
  // Admin-action permissions. Only owners can grant `manage_permissions`.
  'manage_campaigns',
  'manage_tags',
  'manage_permissions',
] as const;

export type PublishingPermissionKey = typeof PUBLISHING_PERMISSION_KEYS[number];

/** All artifact types a Publishing card can link to via
 *  `kanban_card_artifacts.artifact_type`. These map 1:1 to a channel adapter
 *  in `lib/publishing/channels/`. `linkedin_draft` lands in Phase 2 alongside
 *  the LinkedIn OAuth + posting worker. */
export const PUBLISHING_ARTIFACT_TYPES = [
  'cms_post',
  'email_campaign',
  'linkedin_draft',
  'pitch_deck',
  'survey',
  'booking_page',
] as const;

export type PublishingArtifactType = typeof PUBLISHING_ARTIFACT_TYPES[number];

/** How long (in days) cards in the `Archived` stage stay visible in the
 *  default board view before being hidden. They remain queryable via the
 *  "Show archived" filter. */
export const PUBLISHING_ARCHIVE_HIDE_AFTER_DAYS = 30;
