/**
 * Shared types for CardDetailModal and its section components.
 *
 * Extracted verbatim from the pre-refactor components/portal/CardDetailModal.tsx
 * so the dispatcher and the per-section components agree on shapes without
 * importing each other.
 */

export type CardType = 'task' | 'story' | 'epic' | 'bug' | 'spike';
export type WorkflowState = 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';

export interface CardDetail {
  id: number;
  columnId: number;
  projectId: number;
  title: string;
  description: string | null;
  priority: string | null;
  dueDate: string | null;
  order: number;
  number?: number | null;
  key?: string | null;
  projectKey?: string | null;
  storyPoints?: number | null;
  cardType?: CardType;
  parentCardId?: number | null;
  workflowState?: WorkflowState;
}

export interface Label {
  id: number;
  name: string;
  color: string;
}

export interface Activity {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  userId: number | null;
  userName: string | null;
}

export interface ChecklistItem {
  id: number;
  text: string;
  completed: boolean;
  order: number;
  createdAt: string;
  completedAt: string | null;
}

export interface Assignee {
  id: number;
  name: string;
  email: string;
}

export interface DependencyRef {
  id: number;
  title: string;
  number: number | null;
  key: string | null;
  columnIsDone: boolean | null;
  cardType?: CardType;
  parentCardId?: number | null;
  storyPoints?: number | null;
}

export interface FileAttachment {
  id: number;
  originalName: string;
  mimeType: string;
  fileSize: number;
  url: string;
  commentId: number | null;
  userId: number | null;
  userName: string | null;
  createdAt: string;
}

export interface Comment {
  id: number;
  body: string;
  mentions: number[] | null;
  createdAt: string;
  userId: number | null;
  userName: string | null;
  files: FileAttachment[];
}

export interface TimeLog {
  id: number;
  minutes: number;
  note: string | null;
  loggedAt: string;
  userId: number | null;
  userName: string | null;
}

export interface MentionUser {
  id: number;
  name: string;
}

export interface Artifact {
  id: number;
  cardId: number;
  artifactType: string;
  artifactId: number;
  displayTitle: string;
  pinned: boolean;
  createdAt: string;
}

export interface AvailableArtifact {
  type: string;
  id: number;
  title: string;
}

export interface CardDetailModalProps {
  cardId: number;
  /**
   * The project the card belongs to. Passed by the board so the detail hook can
   * fire project-scoped fetches (labels, sibling cards) in parallel with the
   * card bundle instead of waiting for the bundle to reveal the project, and so
   * the header can render a shareable `/portal/projects/<id>/<cardId>` link.
   */
  projectId?: number;
  isStaff: boolean;
  canEdit: boolean;
  currentUserId: number;
  onClose: () => void;
  onDeleted: (cardId: number) => void;
  onUpdated: (update: { id: number } & Partial<CardDetail>) => void;
}
