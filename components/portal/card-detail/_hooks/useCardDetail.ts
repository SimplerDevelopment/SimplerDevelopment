/**
 * State + mutation orchestrator for the card-detail modal.
 *
 * Owns the entire stateful surface that used to live inline in
 * CardDetailModal.tsx — load, edit drafts, mutations, and section-local UI
 * toggles — and exposes them as a single API the dispatcher destructures and
 * threads down to section components.
 *
 * The behaviour here is a near-verbatim move from the pre-refactor file; only
 * the network calls were swapped for the helpers in `../_lib/api`.
 */
'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as api from '../_lib/api';
import type {
  Activity,
  Artifact,
  Assignee,
  AvailableArtifact,
  CardDetail,
  CardDetailModalProps,
  ChecklistItem,
  Comment,
  CustomFieldValue,
  DependencyRef,
  FileAttachment,
  Label,
  MentionUser,
  TimeLog,
} from '../_lib/types';

export interface UseCardDetail {
  /* Load lifecycle */
  loading: boolean;
  card: CardDetail | null;

  /* Core data */
  comments: Comment[];
  timeLogs: TimeLog[];
  cardFiles: FileAttachment[];
  pendingCommentFiles: FileAttachment[];
  mentionUsers: MentionUser[];
  labels: Label[];
  projectLabels: Label[];
  activities: Activity[];
  checklist: ChecklistItem[];
  assignees: Assignee[];
  watching: boolean;
  blockers: DependencyRef[];
  blocking: DependencyRef[];
  projectCards: DependencyRef[];
  artifacts: Artifact[];
  availableArtifacts: AvailableArtifact[];
  artifactsLoaded: boolean;
  customFields: CustomFieldValue[];

  /* Edit drafts / per-section UI flags */
  editingTitle: boolean;
  setEditingTitle: (v: boolean) => void;
  titleDraft: string;
  setTitleDraft: (v: string) => void;
  editingDesc: boolean;
  setEditingDesc: (v: boolean) => void;
  descDraft: string;
  setDescDraft: (v: string) => void;
  savingField: string | null;

  commentBody: string;
  setCommentBody: (v: string) => void;
  setPendingCommentFiles: React.Dispatch<React.SetStateAction<FileAttachment[]>>;
  submittingComment: boolean;

  showTimeForm: boolean;
  setShowTimeForm: (v: boolean | ((prev: boolean) => boolean)) => void;
  timeHours: string;
  setTimeHours: (v: string) => void;
  timeMinutesInput: string;
  setTimeMinutesInput: (v: string) => void;
  timeNote: string;
  setTimeNote: (v: string) => void;
  loggingTime: boolean;

  uploadingFile: boolean;
  isDragOver: boolean;
  setIsDragOver: (v: boolean) => void;

  confirmDelete: boolean;
  setConfirmDelete: (v: boolean) => void;
  deleting: boolean;

  showLabelMenu: boolean;
  setShowLabelMenu: (v: boolean | ((prev: boolean) => boolean)) => void;
  newLabelName: string;
  setNewLabelName: (v: string) => void;
  newLabelColor: string;
  setNewLabelColor: (v: string) => void;

  showActivity: boolean;
  setShowActivity: (v: boolean | ((prev: boolean) => boolean)) => void;

  newChecklistText: string;
  setNewChecklistText: (v: string) => void;

  showAssigneeMenu: boolean;
  setShowAssigneeMenu: (v: boolean | ((prev: boolean) => boolean)) => void;

  showDepMenu: boolean;
  setShowDepMenu: (v: boolean) => void;

  showArtifactPicker: boolean;
  setShowArtifactPicker: (v: boolean | ((prev: boolean) => boolean)) => void;
  artifactTypeFilter: string;
  setArtifactTypeFilter: (v: string) => void;

  /* Mutations */
  saveField: (field: string, value: unknown) => Promise<void>;
  saveTitle: () => Promise<void>;
  saveDesc: () => Promise<void>;

  uploadFile: (file: File, forComment?: boolean) => Promise<FileAttachment | null>;
  deleteFile: (fileId: number, fromComment?: boolean, commentId?: number) => Promise<void>;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;

  submitComment: () => Promise<void>;
  removeComment: (commentId: number) => Promise<void>;

  logTime: () => Promise<void>;
  removeTimeLog: (logId: number) => Promise<void>;

  removeCard: () => Promise<void>;

  toggleLabel: (label: Label) => Promise<void>;
  createAndAttachLabel: () => Promise<void>;

  addChecklist: () => Promise<void>;
  toggleChecklistItem: (item: ChecklistItem) => Promise<void>;
  removeChecklistItem: (itemId: number) => Promise<void>;

  addAssignee: (user: MentionUser) => Promise<void>;
  removeAssignee: (userId: number) => Promise<void>;

  toggleWatch: () => Promise<void>;

  openDepMenu: () => Promise<void>;
  addBlocker: (target: DependencyRef) => Promise<void>;
  removeBlocker: (blockerId: number) => Promise<void>;

  addArtifact: (type: string, artifactId: number) => Promise<void>;
  toggleArtifactPin: (artifactDbId: number, pinned: boolean) => Promise<void>;
  removeArtifact: (artifactDbId: number) => Promise<void>;
}

export function useCardDetail({
  cardId,
  onClose,
  onDeleted,
  onUpdated,
}: Pick<CardDetailModalProps, 'cardId' | 'onClose' | 'onDeleted' | 'onUpdated'>): UseCardDetail {
  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<CardDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [timeLogs, setTimeLogs] = useState<TimeLog[]>([]);
  const [cardFiles, setCardFiles] = useState<FileAttachment[]>([]);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [savingField, setSavingField] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState('');
  const [pendingCommentFiles, setPendingCommentFiles] = useState<FileAttachment[]>([]);
  const [submittingComment, setSubmittingComment] = useState(false);

  const [showTimeForm, setShowTimeForm] = useState(false);
  const [timeHours, setTimeHours] = useState('');
  const [timeMinutesInput, setTimeMinutesInput] = useState('');
  const [timeNote, setTimeNote] = useState('');
  const [loggingTime, setLoggingTime] = useState(false);

  const [uploadingFile, setUploadingFile] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [labels, setLabels] = useState<Label[]>([]);
  const [projectLabels, setProjectLabels] = useState<Label[]>([]);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('#6366f1');
  const [activities, setActivities] = useState<Activity[]>([]);
  const [showActivity, setShowActivity] = useState(true);

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [showAssigneeMenu, setShowAssigneeMenu] = useState(false);
  const [watching, setWatching] = useState(false);
  const [blockers, setBlockers] = useState<DependencyRef[]>([]);
  const [blocking, setBlocking] = useState<DependencyRef[]>([]);
  const [showDepMenu, setShowDepMenu] = useState(false);
  const [projectCards, setProjectCards] = useState<DependencyRef[]>([]);

  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [availableArtifacts, setAvailableArtifacts] = useState<AvailableArtifact[]>([]);
  const [artifactsLoaded, setArtifactsLoaded] = useState(false);
  const [availableArtifactsLoaded, setAvailableArtifactsLoaded] = useState(false);
  const [showArtifactPicker, setShowArtifactPicker] = useState(false);
  const [artifactTypeFilter, setArtifactTypeFilter] = useState('');
  const [customFields, setCustomFields] = useState<CustomFieldValue[]>([]);

  /* ─── Initial load ────────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        // The card bundle now returns everything the modal needs in ONE
        // request — card + comments/files/labels/activity/checklist/assignees/
        // deps AND the project label palette, sibling cards, mentionable users,
        // linked artifacts, and custom fields. Opening a card is a single
        // round-trip. The heavy availableArtifacts scan is still deferred until
        // the artifact picker is opened.
        const cardRes = await api.fetchCardBundle(cardId);
        if (cancelled) return;
        if (cardRes.success && cardRes.data) {
          const d = cardRes.data as {
            card: CardDetail;
            timeLogs: TimeLog[];
            files?: FileAttachment[];
            comments: Comment[];
            labels?: Label[];
            activities?: Activity[];
            checklist?: ChecklistItem[];
            assignees?: Assignee[];
            watching?: boolean;
            blockers?: DependencyRef[];
            blocking?: DependencyRef[];
            projectLabels?: Label[];
            projectCards?: DependencyRef[];
            mentionableUsers?: MentionUser[];
            artifacts?: Artifact[];
            customFields?: CustomFieldValue[];
          };
          setCard(d.card);
          setTimeLogs(d.timeLogs);
          const allFiles: FileAttachment[] = d.files ?? [];
          setCardFiles(allFiles.filter(f => f.commentId === null));
          setComments(
            d.comments.map((c: Comment) => ({
              ...c,
              files: allFiles.filter(f => f.commentId === c.id),
            })),
          );
          setLabels(d.labels ?? []);
          setActivities(d.activities ?? []);
          setChecklist(d.checklist ?? []);
          setAssignees(d.assignees ?? []);
          setWatching(d.watching ?? false);
          setBlockers(d.blockers ?? []);
          setBlocking(d.blocking ?? []);
          setProjectLabels(d.projectLabels ?? []);
          setProjectCards(d.projectCards ?? []);
          setMentionUsers(d.mentionableUsers ?? []);
          setArtifacts(d.artifacts ?? []);
          setCustomFields(d.customFields ?? []);
          setArtifactsLoaded(true);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  /* ─── Lazy-load the artifact library only when the picker opens ──────── */

  useEffect(() => {
    if (!showArtifactPicker || availableArtifactsLoaded) return;
    let cancelled = false;
    api.fetchAvailableArtifacts(cardId).then(res => {
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) setAvailableArtifacts(res.data as AvailableArtifact[]);
      setAvailableArtifactsLoaded(true);
    }).catch(() => { if (!cancelled) setAvailableArtifactsLoaded(true); });
    return () => { cancelled = true; };
  }, [showArtifactPicker, availableArtifactsLoaded, cardId]);

  /* ─── Esc to close (when not editing) ─────────────────────────────── */

  const escStateRef = useRef({ onClose, editingTitle, editingDesc });
  useLayoutEffect(() => {
    escStateRef.current = { onClose, editingTitle, editingDesc };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = escStateRef.current;
      if (e.key === 'Escape' && !s.editingTitle && !s.editingDesc) s.onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ─── Field mutations ─────────────────────────────────────────────── */

  async function saveField(field: string, value: unknown) {
    setSavingField(field);
    const data = await api.patchCardField(cardId, field, value);
    setSavingField(null);
    if (data.success) {
      setCard(prev => (prev ? { ...prev, [field]: value } : prev));
      onUpdated({ id: cardId, [field]: value });
    }
  }

  async function saveTitle() {
    if (!titleDraft.trim() || titleDraft.trim() === card?.title) {
      setEditingTitle(false);
      return;
    }
    await saveField('title', titleDraft.trim());
    setEditingTitle(false);
  }

  async function saveDesc() {
    if (descDraft === (card?.description ?? '')) {
      setEditingDesc(false);
      return;
    }
    await saveField('description', descDraft || null);
    setEditingDesc(false);
  }

  /* ─── Files ───────────────────────────────────────────────────────── */

  async function uploadFile(file: File, forComment = false): Promise<FileAttachment | null> {
    setUploadingFile(true);
    const data = await api.uploadCardFile(cardId, file);
    setUploadingFile(false);
    if (!data.success) return null;
    const f = data.data as FileAttachment;
    if (forComment) setPendingCommentFiles(prev => [...prev, f]);
    else setCardFiles(prev => [...prev, f]);
    return f;
  }

  async function deleteFile(fileId: number, fromComment = false, commentId?: number) {
    await api.deleteCardFile(cardId, fileId);
    if (fromComment && commentId != null) {
      setComments(prev =>
        prev.map(c =>
          c.id === commentId ? { ...c, files: c.files.filter(f => f.id !== fileId) } : c,
        ),
      );
    } else {
      setCardFiles(prev => prev.filter(f => f.id !== fileId));
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach(f => uploadFile(f));
    e.target.value = '';
  }

  /* ─── Comments ────────────────────────────────────────────────────── */

  async function submitComment() {
    if (!commentBody.trim() && pendingCommentFiles.length === 0) return;
    setSubmittingComment(true);
    const mentions = mentionUsers
      .filter(u => commentBody.includes(`@${u.name}`))
      .map(u => u.id);
    const data = await api.postComment(
      cardId,
      commentBody,
      mentions,
      pendingCommentFiles.map(f => f.id),
    );
    setSubmittingComment(false);
    if (data.success) {
      setComments(prev => [
        ...prev,
        { ...(data.data as Comment), files: pendingCommentFiles },
      ]);
      setCommentBody('');
      setPendingCommentFiles([]);
    }
  }

  async function removeComment(commentId: number) {
    await api.deleteComment(cardId, commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  /* ─── Time logs ───────────────────────────────────────────────────── */

  async function logTime() {
    const total =
      Math.round(parseFloat(timeHours || '0') * 60) + parseInt(timeMinutesInput || '0', 10);
    if (total <= 0) return;
    setLoggingTime(true);
    const data = await api.postTimeLog(cardId, total, timeNote || null);
    setLoggingTime(false);
    if (data.success) {
      setTimeLogs(prev => [data.data as TimeLog, ...prev]);
      setTimeHours('');
      setTimeMinutesInput('');
      setTimeNote('');
      setShowTimeForm(false);
    }
  }

  async function removeTimeLog(logId: number) {
    await api.deleteTimeLog(cardId, logId);
    setTimeLogs(prev => prev.filter(t => t.id !== logId));
  }

  /* ─── Card delete ─────────────────────────────────────────────────── */

  async function removeCard() {
    setDeleting(true);
    await api.deleteCard(cardId);
    onDeleted(cardId);
  }

  /* ─── Labels ──────────────────────────────────────────────────────── */

  async function toggleLabel(label: Label) {
    const attached = labels.some(l => l.id === label.id);
    if (attached) {
      setLabels(prev => prev.filter(l => l.id !== label.id));
      await api.detachLabel(cardId, label.id);
    } else {
      setLabels(prev => [...prev, label]);
      await api.attachLabel(cardId, label.id);
    }
  }

  async function createAndAttachLabel() {
    if (!card || !newLabelName.trim()) return;
    const data = await api.createProjectLabel(card.projectId, newLabelName.trim(), newLabelColor);
    if (data.success) {
      const created = data.data as Label;
      setProjectLabels(prev => [...prev, created]);
      await toggleLabel(created);
      setNewLabelName('');
    }
  }

  /* ─── Checklist ───────────────────────────────────────────────────── */

  async function addChecklist() {
    if (!newChecklistText.trim()) return;
    const data = await api.addChecklistItem(cardId, newChecklistText.trim());
    if (data.success) {
      setChecklist(prev => [...prev, data.data as ChecklistItem]);
      setNewChecklistText('');
    }
  }

  async function toggleChecklistItem(item: ChecklistItem) {
    const next = !item.completed;
    setChecklist(prev => prev.map(i => (i.id === item.id ? { ...i, completed: next } : i)));
    await api.patchChecklistItem(item.id, next);
  }

  async function removeChecklistItem(itemId: number) {
    setChecklist(prev => prev.filter(i => i.id !== itemId));
    await api.deleteChecklistItem(itemId);
  }

  /* ─── Assignees ───────────────────────────────────────────────────── */

  async function addAssignee(user: MentionUser) {
    if (assignees.some(a => a.id === user.id)) return;
    setAssignees(prev => [...prev, { id: user.id, name: user.name, email: '' }]);
    await api.addAssigneeApi(cardId, user.id);
  }

  async function removeAssignee(userId: number) {
    setAssignees(prev => prev.filter(a => a.id !== userId));
    await api.removeAssigneeApi(cardId, userId);
  }

  /* ─── Watch ───────────────────────────────────────────────────────── */

  async function toggleWatch() {
    const next = !watching;
    setWatching(next);
    await api.watchCard(cardId, next);
  }

  /* ─── Dependencies ────────────────────────────────────────────────── */

  async function openDepMenu() {
    setShowDepMenu(true);
    if (!card || projectCards.length > 0) return;
    const data = await api.fetchProjectCards(card.projectId);
    if (data.success && Array.isArray(data.data)) setProjectCards(data.data as DependencyRef[]);
  }

  async function addBlocker(target: DependencyRef) {
    if (blockers.some(b => b.id === target.id)) return;
    setBlockers(prev => [...prev, target]);
    await api.addBlockerApi(cardId, target.id);
  }

  async function removeBlocker(blockerId: number) {
    setBlockers(prev => prev.filter(b => b.id !== blockerId));
    await api.removeBlockerApi(cardId, blockerId);
  }

  /* ─── Artifacts ───────────────────────────────────────────────────── */

  async function addArtifact(type: string, artifactId: number) {
    const data = await api.linkArtifact(cardId, type, artifactId);
    if (data.success) {
      setArtifacts(prev => [data.data as Artifact, ...prev]);
      setShowArtifactPicker(false);
    }
  }

  async function toggleArtifactPin(artifactDbId: number, pinned: boolean) {
    await api.updateArtifact(cardId, artifactDbId, pinned);
    setArtifacts(prev => prev.map(a => (a.id === artifactDbId ? { ...a, pinned } : a)));
  }

  async function removeArtifact(artifactDbId: number) {
    await api.unlinkArtifact(cardId, artifactDbId);
    setArtifacts(prev => prev.filter(a => a.id !== artifactDbId));
  }

  return {
    loading,
    card,

    comments,
    timeLogs,
    cardFiles,
    pendingCommentFiles,
    mentionUsers,
    labels,
    projectLabels,
    activities,
    checklist,
    assignees,
    watching,
    blockers,
    blocking,
    projectCards,
    artifacts,
    availableArtifacts,
    artifactsLoaded,
    customFields,

    editingTitle,
    setEditingTitle,
    titleDraft,
    setTitleDraft,
    editingDesc,
    setEditingDesc,
    descDraft,
    setDescDraft,
    savingField,

    commentBody,
    setCommentBody,
    setPendingCommentFiles,
    submittingComment,

    showTimeForm,
    setShowTimeForm,
    timeHours,
    setTimeHours,
    timeMinutesInput,
    setTimeMinutesInput,
    timeNote,
    setTimeNote,
    loggingTime,

    uploadingFile,
    isDragOver,
    setIsDragOver,

    confirmDelete,
    setConfirmDelete,
    deleting,

    showLabelMenu,
    setShowLabelMenu,
    newLabelName,
    setNewLabelName,
    newLabelColor,
    setNewLabelColor,

    showActivity,
    setShowActivity,

    newChecklistText,
    setNewChecklistText,

    showAssigneeMenu,
    setShowAssigneeMenu,

    showDepMenu,
    setShowDepMenu,

    showArtifactPicker,
    setShowArtifactPicker,
    artifactTypeFilter,
    setArtifactTypeFilter,

    saveField,
    saveTitle,
    saveDesc,

    uploadFile,
    deleteFile,
    handleFileInput,

    submitComment,
    removeComment,

    logTime,
    removeTimeLog,

    removeCard,

    toggleLabel,
    createAndAttachLabel,

    addChecklist,
    toggleChecklistItem,
    removeChecklistItem,

    addAssignee,
    removeAssignee,

    toggleWatch,

    openDepMenu,
    addBlocker,
    removeBlocker,

    addArtifact,
    toggleArtifactPin,
    removeArtifact,
  };
}
