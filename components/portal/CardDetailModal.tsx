'use client';

import { useState, useEffect, useRef } from 'react';
import { priorityColor } from '@/lib/portal-utils';
import MarkdownView from './MarkdownView';

interface CardDetail {
  id: number; columnId: number; projectId: number; title: string;
  description: string | null; priority: string | null; dueDate: string | null;
  order: number;
  number?: number | null; key?: string | null; projectKey?: string | null;
}
interface Label {
  id: number; name: string; color: string;
}
interface Activity {
  id: number; type: string; payload: Record<string, unknown>; createdAt: string;
  userId: number | null; userName: string | null;
}
interface ChecklistItem {
  id: number; text: string; completed: boolean; order: number;
  createdAt: string; completedAt: string | null;
}
interface Assignee {
  id: number; name: string; email: string;
}
interface DependencyRef {
  id: number; title: string; number: number | null; key: string | null; columnIsDone: boolean | null;
}
interface FileAttachment {
  id: number; originalName: string; mimeType: string; fileSize: number;
  url: string; commentId: number | null; userId: number | null; userName: string | null; createdAt: string;
}
interface Comment {
  id: number; body: string; mentions: number[] | null; createdAt: string;
  userId: number | null; userName: string | null; files: FileAttachment[];
}
interface TimeLog {
  id: number; minutes: number; note: string | null; loggedAt: string;
  userId: number | null; userName: string | null;
}
interface MentionUser { id: number; name: string; }
interface Artifact {
  id: number;
  cardId: number;
  artifactType: string;
  artifactId: number;
  displayTitle: string;
  pinned: boolean;
  createdAt: string;
}
interface AvailableArtifact {
  type: string;
  id: number;
  title: string;
}

const ARTIFACT_ICONS: Record<string, string> = {
  website: 'language',
  email_campaign: 'campaign',
  pitch_deck: 'slideshow',
  proposal: 'description',
  booking: 'calendar_month',
  survey: 'poll',
  project: 'folder',
};

const ARTIFACT_LABELS: Record<string, string> = {
  website: 'Website',
  email_campaign: 'Email Campaign',
  pitch_deck: 'Pitch Deck',
  proposal: 'Proposal',
  booking: 'Booking',
  survey: 'Survey',
  project: 'Project',
};

function artifactUrl(type: string, id: number): string | null {
  switch (type) {
    case 'website': return `/portal/websites/${id}`;
    case 'email_campaign': return `/portal/email/campaigns/${id}`;
    case 'pitch_deck': return `/portal/tools/pitch-decks/${id}`;
    case 'proposal': return `/portal/crm/proposals/${id}`;
    case 'booking': return `/portal/tools/booking/${id}`;
    case 'survey': return `/portal/surveys/${id}`;
    case 'project': return `/portal/projects/${id}`;
    default: return null;
  }
}
interface Props {
  cardId: number; isStaff: boolean; canEdit: boolean; currentUserId: number;
  onClose: () => void; onDeleted: (cardId: number) => void;
  onUpdated: (update: { id: number } & Partial<CardDetail>) => void;
}

function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `${m}m`; if (m === 0) return `${h}h`; return `${h}h ${m}m`;
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function FileThumb({ file, onDelete }: { file: FileAttachment; onDelete?: () => void }) {
  const isImage = file.mimeType.startsWith('image/');
  return (
    <div className="relative group border border-border rounded-lg overflow-hidden">
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="block">
        {isImage
          ? <img src={file.url} alt={file.originalName} className="w-full h-20 object-cover bg-muted" />
          : <div className="w-full h-20 flex flex-col items-center justify-center bg-muted gap-1">
              <span className="material-icons text-2xl text-muted-foreground">
                {file.mimeType === 'application/pdf' ? 'picture_as_pdf' : 'insert_drive_file'}
              </span>
            </div>
        }
      </a>
      <div className="p-1.5 bg-card">
        <p className="text-xs text-foreground truncate">{file.originalName}</p>
        <p className="text-xs text-muted-foreground">{formatSize(file.fileSize)}</p>
      </div>
      {onDelete && (
        <button onClick={onDelete}
          className="absolute top-1 right-1 p-0.5 rounded bg-background/80 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="material-icons text-sm">close</span>
        </button>
      )}
    </div>
  );
}

function MentionTextarea({ value, onChange, placeholder, rows = 3, users, onFilePaste }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number;
  users: MentionUser[]; onFilePaste?: (f: File) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [query, setQuery] = useState('');
  const [triggerStart, setTriggerStart] = useState(-1);
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? 0;
    onChange(val);
    const match = val.slice(0, cursor).match(/@(\w*)$/);
    if (match) { setQuery(match[1]); setTriggerStart(cursor - match[0].length); setShowMenu(true); }
    else setShowMenu(false);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (imageItem && onFilePaste) {
      const file = imageItem.getAsFile();
      if (file) { e.preventDefault(); onFilePaste(file); }
    }
  }

  function pickUser(user: MentionUser) {
    const cursor = ref.current?.selectionStart ?? triggerStart + query.length + 1;
    const newVal = `${value.slice(0, triggerStart)}@${user.name} ${value.slice(cursor)}`;
    onChange(newVal); setShowMenu(false);
    setTimeout(() => { ref.current?.focus(); const p = triggerStart + user.name.length + 2; ref.current?.setSelectionRange(p, p); }, 0);
  }

  const filtered = users.filter(u => !query || u.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6);

  return (
    <div className="relative">
      <textarea ref={ref} value={value} onChange={handleChange} onPaste={handlePaste}
        onBlur={() => setTimeout(() => setShowMenu(false), 150)}
        placeholder={placeholder} rows={rows}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
      {showMenu && filtered.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 bg-popover border border-border rounded-lg shadow-lg z-50 w-48 overflow-hidden">
          {filtered.map(u => (
            <button key={u.id} onMouseDown={e => { e.preventDefault(); pickUser(u); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2">
              <span className="material-icons text-sm text-muted-foreground">person</span>{u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CardDetailModal({ cardId, isStaff, canEdit, currentUserId, onClose, onDeleted, onUpdated }: Props) {
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
  const [showArtifactPicker, setShowArtifactPicker] = useState(false);
  const [artifactTypeFilter, setArtifactTypeFilter] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const [cardRes, usersRes] = await Promise.all([
          fetch(`/api/portal/cards/${cardId}`),
          fetch('/api/portal/mentionable-users'),
        ]);
        let projectId: number | null = null;
        if (cardRes.ok) {
          const d = await cardRes.json();
          if (d.success) {
            setCard(d.data.card);
            setTimeLogs(d.data.timeLogs);
            const allFiles: FileAttachment[] = d.data.files ?? [];
            setCardFiles(allFiles.filter(f => f.commentId === null));
            setComments(d.data.comments.map((c: Comment) => ({
              ...c, files: allFiles.filter(f => f.commentId === c.id),
            })));
            setLabels(d.data.labels ?? []);
            setActivities(d.data.activities ?? []);
            setChecklist(d.data.checklist ?? []);
            setAssignees(d.data.assignees ?? []);
            setWatching(d.data.watching ?? false);
            setBlockers(d.data.blockers ?? []);
            setBlocking(d.data.blocking ?? []);
            projectId = d.data.card?.projectId ?? null;
          }
        }
        if (usersRes.ok) { const d = await usersRes.json(); if (d.success) setMentionUsers(d.data); }
        if (projectId != null) {
          const res = await fetch(`/api/portal/projects/${projectId}/labels`);
          if (res.ok) { const d = await res.json(); if (d.success) setProjectLabels(d.data); }
        }
        const [aRes, availRes] = await Promise.all([
          fetch(`/api/portal/cards/${cardId}/artifacts`),
          fetch(`/api/portal/cards/${cardId}/artifacts/available`),
        ]);
        if (aRes.ok) { const d = await aRes.json(); if (d.success) setArtifacts(d.data ?? []); }
        if (availRes.ok) { const d = await availRes.json(); if (d.success) setAvailableArtifacts(d.data ?? []); }
        setArtifactsLoaded(true);
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    load();
  }, [cardId]);

  async function addArtifact(type: string, artifactId: number) {
    const res = await fetch(`/api/portal/cards/${cardId}/artifacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactType: type, artifactId }),
    });
    const data = await res.json();
    if (data.success) {
      setArtifacts(prev => [data.data, ...prev]);
      setShowArtifactPicker(false);
    }
  }

  async function toggleArtifactPin(artifactDbId: number, pinned: boolean) {
    await fetch(`/api/portal/cards/${cardId}/artifacts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactDbId, pinned }),
    });
    setArtifacts(prev => prev.map(a => a.id === artifactDbId ? { ...a, pinned } : a));
  }

  async function removeArtifact(artifactDbId: number) {
    await fetch(`/api/portal/cards/${cardId}/artifacts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactDbId }),
    });
    setArtifacts(prev => prev.filter(a => a.id !== artifactDbId));
  }

  const escStateRef = useRef({ onClose, editingTitle, editingDesc });
  escStateRef.current = { onClose, editingTitle, editingDesc };
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const s = escStateRef.current;
      if (e.key === 'Escape' && !s.editingTitle && !s.editingDesc) s.onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function saveField(field: string, value: unknown) {
    setSavingField(field);
    const res = await fetch(`/api/portal/cards/${cardId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json();
    setSavingField(null);
    if (data.success) { setCard(prev => prev ? { ...prev, [field]: value } : prev); onUpdated({ id: cardId, [field]: value }); }
  }

  async function saveTitle() {
    if (!titleDraft.trim() || titleDraft.trim() === card?.title) { setEditingTitle(false); return; }
    await saveField('title', titleDraft.trim()); setEditingTitle(false);
  }
  async function saveDesc() {
    if (descDraft === (card?.description ?? '')) { setEditingDesc(false); return; }
    await saveField('description', descDraft || null); setEditingDesc(false);
  }

  async function uploadFile(file: File, forComment = false): Promise<FileAttachment | null> {
    setUploadingFile(true);
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch(`/api/portal/cards/${cardId}/files`, { method: 'POST', body: fd });
    setUploadingFile(false);
    const data = await res.json();
    if (!data.success) return null;
    const f: FileAttachment = data.data;
    if (forComment) setPendingCommentFiles(prev => [...prev, f]);
    else setCardFiles(prev => [...prev, f]);
    return f;
  }

  async function deleteFile(fileId: number, fromComment = false, commentId?: number) {
    await fetch(`/api/portal/cards/${cardId}/files/${fileId}`, { method: 'DELETE' });
    if (fromComment && commentId != null) {
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, files: c.files.filter(f => f.id !== fileId) } : c));
    } else {
      setCardFiles(prev => prev.filter(f => f.id !== fileId));
    }
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    Array.from(e.target.files ?? []).forEach(f => uploadFile(f));
    e.target.value = '';
  }

  async function submitComment() {
    if (!commentBody.trim() && pendingCommentFiles.length === 0) return;
    setSubmittingComment(true);
    const mentions = mentionUsers.filter(u => commentBody.includes(`@${u.name}`)).map(u => u.id);
    const res = await fetch(`/api/portal/cards/${cardId}/comments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: commentBody, mentions, fileIds: pendingCommentFiles.map(f => f.id) }),
    });
    const data = await res.json();
    setSubmittingComment(false);
    if (data.success) {
      setComments(prev => [...prev, { ...data.data, files: pendingCommentFiles }]);
      setCommentBody(''); setPendingCommentFiles([]);
    }
  }

  async function deleteComment(commentId: number) {
    await fetch(`/api/portal/cards/${cardId}/comments/${commentId}`, { method: 'DELETE' });
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  async function logTime() {
    const total = Math.round(parseFloat(timeHours || '0') * 60) + parseInt(timeMinutesInput || '0', 10);
    if (total <= 0) return;
    setLoggingTime(true);
    const res = await fetch(`/api/portal/cards/${cardId}/time-logs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: total, note: timeNote || null }),
    });
    const data = await res.json();
    setLoggingTime(false);
    if (data.success) { setTimeLogs(prev => [data.data, ...prev]); setTimeHours(''); setTimeMinutesInput(''); setTimeNote(''); setShowTimeForm(false); }
  }

  async function deleteTimeLog(logId: number) {
    await fetch(`/api/portal/cards/${cardId}/time-logs/${logId}`, { method: 'DELETE' });
    setTimeLogs(prev => prev.filter(t => t.id !== logId));
  }

  async function deleteCard() {
    setDeleting(true);
    await fetch(`/api/portal/cards/${cardId}`, { method: 'DELETE' });
    onDeleted(cardId);
  }

  async function toggleLabel(label: Label) {
    const attached = labels.some(l => l.id === label.id);
    if (attached) {
      setLabels(prev => prev.filter(l => l.id !== label.id));
      await fetch(`/api/portal/cards/${cardId}/labels?labelId=${label.id}`, { method: 'DELETE' });
    } else {
      setLabels(prev => [...prev, label]);
      await fetch(`/api/portal/cards/${cardId}/labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelId: label.id }),
      });
    }
  }

  async function createAndAttachLabel() {
    if (!card || !newLabelName.trim()) return;
    const res = await fetch(`/api/portal/projects/${card.projectId}/labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newLabelName.trim(), color: newLabelColor }),
    });
    const data = await res.json();
    if (data.success) {
      setProjectLabels(prev => [...prev, data.data]);
      await toggleLabel(data.data);
      setNewLabelName('');
    }
  }

  async function addChecklistItem() {
    if (!newChecklistText.trim()) return;
    const res = await fetch(`/api/portal/cards/${cardId}/checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: newChecklistText.trim() }),
    });
    const data = await res.json();
    if (data.success) {
      setChecklist(prev => [...prev, data.data]);
      setNewChecklistText('');
    }
  }

  async function toggleChecklistItem(item: ChecklistItem) {
    const next = !item.completed;
    setChecklist(prev => prev.map(i => i.id === item.id ? { ...i, completed: next } : i));
    await fetch(`/api/portal/checklist-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: next }),
    });
  }

  async function deleteChecklistItem(itemId: number) {
    setChecklist(prev => prev.filter(i => i.id !== itemId));
    await fetch(`/api/portal/checklist-items/${itemId}`, { method: 'DELETE' });
  }

  async function addAssignee(user: MentionUser) {
    if (assignees.some(a => a.id === user.id)) return;
    setAssignees(prev => [...prev, { id: user.id, name: user.name, email: '' }]);
    await fetch(`/api/portal/cards/${cardId}/assignees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    });
  }

  async function removeAssignee(userId: number) {
    setAssignees(prev => prev.filter(a => a.id !== userId));
    await fetch(`/api/portal/cards/${cardId}/assignees?userId=${userId}`, { method: 'DELETE' });
  }

  async function toggleWatch() {
    const next = !watching;
    setWatching(next);
    await fetch(`/api/portal/cards/${cardId}/watch`, { method: next ? 'POST' : 'DELETE' });
  }

  async function openDepMenu() {
    setShowDepMenu(true);
    if (!card || projectCards.length > 0) return;
    const res = await fetch(`/api/portal/projects/${card.projectId}/cards`);
    const data = await res.json();
    if (data.success) setProjectCards(data.data);
  }

  async function addBlocker(target: DependencyRef) {
    if (blockers.some(b => b.id === target.id)) return;
    setBlockers(prev => [...prev, target]);
    await fetch(`/api/portal/cards/${cardId}/dependencies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockerCardId: target.id }),
    });
  }

  async function removeBlocker(blockerId: number) {
    setBlockers(prev => prev.filter(b => b.id !== blockerId));
    await fetch(`/api/portal/cards/${cardId}/dependencies?blockerCardId=${blockerId}`, { method: 'DELETE' });
  }

  const totalMinutes = timeLogs.reduce((s, t) => s + t.minutes, 0);
  const canDeleteFile = (f: FileAttachment) => canEdit || f.userId === currentUserId;

  function formatActivity(a: Activity): string {
    const who = a.userName ?? 'Someone';
    const p = a.payload ?? {};
    const q = (v: unknown) => (typeof v === 'string' ? `"${v}"` : String(v));
    switch (a.type) {
      case 'card.created': return `${who} created this card`;
      case 'card.title_changed': return `${who} renamed to ${q(p.to)}`;
      case 'card.description_changed': return `${who} edited the description`;
      case 'card.priority_changed': return `${who} set priority to ${p.to ?? 'none'}`;
      case 'card.due_date_changed': return p.to ? `${who} set due date to ${new Date(String(p.to)).toLocaleDateString()}` : `${who} cleared the due date`;
      case 'card.assigned': return `${who} assigned the card`;
      case 'card.unassigned': return `${who} unassigned the card`;
      case 'card.sprint_changed': return p.to ? `${who} moved to a sprint` : `${who} removed from the sprint`;
      case 'card.column_changed': return `${who} moved the card to another column`;
      case 'card.label_added': return `${who} added label "${p.name}"`;
      case 'card.label_removed': return `${who} removed label "${p.name}"`;
      case 'card.commented': return `${who} commented`;
      case 'card.file_added': return `${who} attached a file`;
      case 'card.checklist_item_added': return `${who} added checklist item "${p.text}"`;
      case 'card.checklist_item_completed': return `${who} completed "${p.text}"`;
      case 'card.checklist_item_uncompleted': return `${who} reopened "${p.text}"`;
      case 'card.checklist_item_removed': return `${who} removed checklist item "${p.text}"`;
      case 'card.assignee_added': return `${who} assigned ${p.name ?? 'someone'}`;
      case 'card.assignee_removed': return `${who} removed ${p.name ?? 'someone'}`;
      case 'card.dependency_added': return `${who} added blocker "${p.title ?? p.blockerCardId}"`;
      case 'card.dependency_removed': return `${who} removed a blocker`;
      default: return `${who} ${a.type}`;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <span className="material-icons text-4xl text-muted-foreground animate-spin">refresh</span>
          </div>
        ) : !card ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">Card not found.</div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-start gap-3 p-5 border-b border-border shrink-0 bg-card">
              <div className="flex-1 min-w-0">
                {card.key && (
                  <p className="text-xs font-mono text-muted-foreground mb-1">{card.key}</p>
                )}
                {editingTitle ? (
                  <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                    onBlur={saveTitle} onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                    className="w-full text-xl font-bold bg-transparent border-b-2 border-primary focus:outline-none text-foreground" />
                ) : (
                  <h2 className={`text-xl font-bold text-foreground leading-tight ${canEdit ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                    onClick={() => { if (canEdit) { setTitleDraft(card.title); setEditingTitle(true); } }}>
                    {card.title}
                  </h2>
                )}
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors shrink-0">
                <span className="material-icons text-xl text-muted-foreground">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="flex flex-1 overflow-hidden min-h-0">
              {/* Main column */}
              <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-card">

                {/* Labels */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Labels</h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {labels.map(l => (
                      <span key={l.id}
                        className="text-xs px-2 py-0.5 rounded font-medium flex items-center gap-1"
                        style={{ backgroundColor: `${l.color}22`, color: l.color }}>
                        {l.name}
                        {canEdit && (
                          <button onClick={() => toggleLabel(l)} className="hover:opacity-70" aria-label={`Remove ${l.name}`}>
                            <span className="material-icons text-xs">close</span>
                          </button>
                        )}
                      </span>
                    ))}
                    {labels.length === 0 && <span className="text-xs text-muted-foreground italic">No labels</span>}
                    {canEdit && (
                      <div className="relative">
                        <button onClick={() => setShowLabelMenu(v => !v)}
                          className="flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary">
                          <span className="material-icons text-xs">{showLabelMenu ? 'close' : 'add'}</span>
                          {showLabelMenu ? 'Close' : 'Add label'}
                        </button>
                        {showLabelMenu && (
                          <div className="absolute top-full left-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg w-64 p-2 space-y-2">
                            <div className="max-h-48 overflow-y-auto space-y-0.5">
                              {projectLabels.length === 0 && <p className="text-xs text-muted-foreground italic p-2">No labels yet. Create one below.</p>}
                              {projectLabels.map(l => {
                                const on = labels.some(x => x.id === l.id);
                                return (
                                  <button key={l.id} onClick={() => toggleLabel(l)}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left ${on ? 'bg-accent/50' : ''}`}>
                                    <span className="w-3 h-3 rounded shrink-0" style={{ backgroundColor: l.color }} />
                                    <span className="flex-1 truncate">{l.name}</span>
                                    {on && <span className="material-icons text-sm text-primary">check</span>}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="border-t border-border pt-2 flex items-center gap-1.5">
                              <input type="color" value={newLabelColor} onChange={e => setNewLabelColor(e.target.value)}
                                className="w-8 h-8 rounded cursor-pointer shrink-0" />
                              <input type="text" value={newLabelName} onChange={e => setNewLabelName(e.target.value)}
                                placeholder="New label…" maxLength={50}
                                onKeyDown={e => { if (e.key === 'Enter') createAndAttachLabel(); }}
                                className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary" />
                              <button onClick={createAndAttachLabel} disabled={!newLabelName.trim()}
                                className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                                Add
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dependencies */}
                {(blockers.length > 0 || blocking.length > 0 || canEdit) && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dependencies</h3>
                      {canEdit && (
                        <div className="relative">
                          <button onClick={openDepMenu}
                            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                            <span className="material-icons text-sm">{showDepMenu ? 'close' : 'add_link'}</span>
                            {showDepMenu ? 'Close' : 'Add blocker'}
                          </button>
                          {showDepMenu && (
                            <div className="absolute right-0 top-full mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg w-72 max-h-64 overflow-y-auto">
                              {projectCards.filter(c => c.id !== cardId && !blockers.some(b => b.id === c.id)).map(c => (
                                <button key={c.id}
                                  onClick={() => { addBlocker(c); setShowDepMenu(false); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left">
                                  {c.key && <span className="font-mono text-muted-foreground shrink-0">{c.key}</span>}
                                  <span className={`flex-1 truncate ${c.columnIsDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{c.title}</span>
                                </button>
                              ))}
                              {projectCards.filter(c => c.id !== cardId && !blockers.some(b => b.id === c.id)).length === 0 && (
                                <p className="text-xs text-muted-foreground italic p-3">No other cards to depend on.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {blockers.length > 0 && (
                      <>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Blocked by</p>
                        <ul className="space-y-1 mb-2">
                          {blockers.map(b => (
                            <li key={b.id} className="flex items-center gap-2 text-sm group">
                              <span className="material-icons text-sm text-destructive">block</span>
                              {b.key && <span className="font-mono text-xs text-muted-foreground shrink-0">{b.key}</span>}
                              <span className={`flex-1 truncate ${b.columnIsDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{b.title}</span>
                              {canEdit && (
                                <button onClick={() => removeBlocker(b.id)}
                                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity" aria-label="Remove blocker">
                                  <span className="material-icons text-sm">close</span>
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {blocking.length > 0 && (
                      <>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 mt-2">Blocking</p>
                        <ul className="space-y-1">
                          {blocking.map(b => (
                            <li key={b.id} className="flex items-center gap-2 text-sm">
                              <span className="material-icons text-sm text-amber-600">bolt</span>
                              {b.key && <span className="font-mono text-xs text-muted-foreground shrink-0">{b.key}</span>}
                              <span className={`flex-1 truncate ${b.columnIsDone ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{b.title}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {blockers.length === 0 && blocking.length === 0 && !showDepMenu && (
                      <p className="text-xs text-muted-foreground italic">No dependencies.</p>
                    )}
                  </div>
                )}

                {/* Checklist */}
                {(checklist.length > 0 || canEdit) && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Checklist {checklist.length > 0 && (
                          <span className="ml-1.5 normal-case text-foreground">
                            {checklist.filter(i => i.completed).length}/{checklist.length}
                          </span>
                        )}
                      </h3>
                    </div>
                    {checklist.length > 0 && (
                      <>
                        <div className="h-1 bg-muted rounded overflow-hidden mb-2">
                          <div
                            className="h-full bg-green-500 transition-all"
                            style={{ width: `${checklist.length === 0 ? 0 : Math.round((checklist.filter(i => i.completed).length / checklist.length) * 100)}%` }}
                          />
                        </div>
                        <ul className="space-y-1 mb-2">
                          {checklist.map(item => (
                            <li key={item.id} className="flex items-start gap-2 group text-sm">
                              <button
                                onClick={() => canEdit && toggleChecklistItem(item)}
                                disabled={!canEdit}
                                className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                  item.completed
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'border-border bg-background hover:border-primary'
                                } ${!canEdit ? 'cursor-default opacity-80' : ''}`}
                                aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
                              >
                                {item.completed && <span className="material-icons text-xs">check</span>}
                              </button>
                              <span className={`flex-1 ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                {item.text}
                              </span>
                              {canEdit && (
                                <button
                                  onClick={() => deleteChecklistItem(item.id)}
                                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                                  aria-label="Delete item"
                                >
                                  <span className="material-icons text-sm">close</span>
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newChecklistText}
                          onChange={e => setNewChecklistText(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') addChecklistItem(); }}
                          placeholder="Add an item…"
                          maxLength={500}
                          className="flex-1 px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <button
                          onClick={addChecklistItem}
                          disabled={!newChecklistText.trim()}
                          className="px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Description */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h3>
                  {editingDesc ? (
                    <div>
                      <textarea autoFocus value={descDraft} onChange={e => setDescDraft(e.target.value)} rows={8}
                        placeholder="Supports Markdown — **bold**, # headings, - lists, `code`, [links](url)…"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y" />
                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={saveDesc} disabled={savingField === 'description'}
                          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                          {savingField === 'description' ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingDesc(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                        <span className="ml-auto text-xs text-muted-foreground">Markdown supported</span>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => { if (canEdit) { setDescDraft(card.description ?? ''); setEditingDesc(true); } }}
                      className={`text-sm text-foreground rounded-lg p-2 -m-2 min-h-[40px] ${canEdit ? 'cursor-pointer hover:bg-accent/50 transition-colors' : ''}`}>
                      {card.description
                        ? <MarkdownView>{card.description}</MarkdownView>
                        : <span className="text-muted-foreground italic">{canEdit ? 'Add a description…' : 'No description'}</span>
                      }
                    </div>
                  )}
                </div>

                {/* Attachments */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Attachments {cardFiles.length > 0 && `(${cardFiles.length})`}
                  </h3>
                  {cardFiles.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {cardFiles.map(f => (
                        <FileThumb key={f.id} file={f} onDelete={canDeleteFile(f) ? () => deleteFile(f.id) : undefined} />
                      ))}
                    </div>
                  )}
                  <label
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={e => { e.preventDefault(); setIsDragOver(false); Array.from(e.dataTransfer.files).forEach(f => uploadFile(f)); }}
                    className={`flex items-center gap-2 px-3 py-2.5 border border-dashed rounded-lg text-sm cursor-pointer transition-colors ${isDragOver ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-primary hover:text-primary'}`}>
                    <span className="material-icons text-base">{uploadingFile ? 'refresh' : 'attach_file'}</span>
                    {uploadingFile ? 'Uploading…' : 'Attach file or drop here'}
                    <input type="file" className="hidden" onChange={handleFileInput} multiple disabled={uploadingFile} />
                  </label>
                </div>

                {/* Artifacts */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Artifacts {artifacts.length > 0 && `(${artifacts.length})`}
                    </h3>
                    {canEdit && (
                      <button onClick={() => setShowArtifactPicker(v => !v)}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                        <span className="material-icons text-sm">{showArtifactPicker ? 'close' : 'add'}</span>
                        {showArtifactPicker ? 'Close' : 'Link Artifact'}
                      </button>
                    )}
                  </div>

                  {showArtifactPicker && canEdit && (
                    <div className="mb-3 p-3 rounded-lg border border-border bg-background/50 space-y-2">
                      <div className="flex flex-wrap gap-1">
                        <button onClick={() => setArtifactTypeFilter('')}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${!artifactTypeFilter ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/80'}`}>All</button>
                        {Object.entries(ARTIFACT_LABELS).map(([type, label]) => (
                          <button key={type} onClick={() => setArtifactTypeFilter(type)}
                            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${artifactTypeFilter === type ? 'bg-primary text-primary-foreground' : 'bg-accent text-foreground hover:bg-accent/80'}`}>{label}</button>
                        ))}
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {availableArtifacts
                          .filter(a => !artifactTypeFilter || a.type === artifactTypeFilter)
                          .filter(a => !artifacts.some(linked => linked.artifactType === a.type && linked.artifactId === a.id))
                          .map(a => (
                            <button key={`${a.type}-${a.id}`}
                              onClick={() => addArtifact(a.type, a.id)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent text-left">
                              <span className="material-icons text-sm text-muted-foreground">{ARTIFACT_ICONS[a.type] || 'attachment'}</span>
                              <span className="flex-1 truncate">{a.title}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{ARTIFACT_LABELS[a.type]}</span>
                            </button>
                          ))}
                        {availableArtifacts.filter(a => !artifactTypeFilter || a.type === artifactTypeFilter).filter(a => !artifacts.some(linked => linked.artifactType === a.type && linked.artifactId === a.id)).length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-4">No available artifacts{artifactTypeFilter ? ` of type "${ARTIFACT_LABELS[artifactTypeFilter]}"` : ''}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {artifactsLoaded && artifacts.length === 0 && !showArtifactPicker && (
                    <p className="text-xs text-muted-foreground italic">No artifacts linked.</p>
                  )}

                  {artifacts.length > 0 && (
                    <div className="space-y-2">
                      {artifacts.map(a => {
                        const url = artifactUrl(a.artifactType, a.artifactId);
                        return (
                          <div key={a.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors ${a.pinned ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'}`}>
                            <span className="material-icons text-lg text-muted-foreground">{ARTIFACT_ICONS[a.artifactType] || 'attachment'}</span>
                            {url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 group" title="Open artifact">
                                <p className="text-sm font-medium text-foreground truncate group-hover:text-primary group-hover:underline">{a.displayTitle}</p>
                                <p className="text-[10px] text-muted-foreground">{ARTIFACT_LABELS[a.artifactType]}</p>
                              </a>
                            ) : (
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{a.displayTitle}</p>
                                <p className="text-[10px] text-muted-foreground">{ARTIFACT_LABELS[a.artifactType]}</p>
                              </div>
                            )}
                            {url && (
                              <a href={url} target="_blank" rel="noopener noreferrer"
                                className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-accent transition-colors" title="Open in new tab">
                                <span className="material-icons text-sm">open_in_new</span>
                              </a>
                            )}
                            {canEdit && (
                              <>
                                <button onClick={() => toggleArtifactPin(a.id, !a.pinned)}
                                  className={`p-1 rounded transition-colors ${a.pinned ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-accent'}`}
                                  title={a.pinned ? 'Unpin' : 'Pin'}>
                                  <span className="material-icons text-sm">push_pin</span>
                                </button>
                                <button onClick={() => removeArtifact(a.id)}
                                  className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title="Remove">
                                  <span className="material-icons text-sm">close</span>
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Comments */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Comments {comments.length > 0 && `(${comments.length})`}
                  </h3>
                  <div className="space-y-4 mb-4">
                    {comments.map(c => (
                      <div key={c.id} className="flex gap-3">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="material-icons text-sm text-primary">person</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-semibold text-foreground">{c.userName ?? 'Unknown'}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(c.createdAt)}</span>
                          </div>
                          {c.body && <MarkdownView className="text-sm text-foreground break-words" highlightMentions>{c.body}</MarkdownView>}
                          {c.files?.length > 0 && (
                            <div className="mt-2 grid grid-cols-3 gap-2">
                              {c.files.map(f => (
                                <FileThumb key={f.id} file={f}
                                  onDelete={canDeleteFile(f) ? () => deleteFile(f.id, true, c.id) : undefined} />
                              ))}
                            </div>
                          )}
                        </div>
                        {(c.userId === currentUserId || canEdit) && (
                          <button onClick={() => deleteComment(c.id)}
                            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors shrink-0 self-start">
                            <span className="material-icons text-sm">delete</span>
                          </button>
                        )}
                      </div>
                    ))}
                    {comments.length === 0 && <p className="text-xs text-muted-foreground italic">No comments yet.</p>}
                  </div>

                  {/* Pending pasted files */}
                  {pendingCommentFiles.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      {pendingCommentFiles.map(f => (
                        <FileThumb key={f.id} file={f} onDelete={() => setPendingCommentFiles(prev => prev.filter(p => p.id !== f.id))} />
                      ))}
                    </div>
                  )}

                  <div className="space-y-2">
                    <MentionTextarea value={commentBody} onChange={setCommentBody}
                      placeholder="Add a comment… type @ to mention, paste an image to attach"
                      rows={3} users={mentionUsers}
                      onFilePaste={file => uploadFile(file, true)} />
                    <div className="flex justify-end">
                      <button onClick={submitComment}
                        disabled={(!commentBody.trim() && pendingCommentFiles.length === 0) || submittingComment}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                        {submittingComment
                          ? <span className="material-icons text-sm animate-spin">refresh</span>
                          : <span className="material-icons text-sm">send</span>}
                        Comment
                      </button>
                    </div>
                  </div>
                </div>

                {/* Time Tracking */}
                {isStaff && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Time Tracked {totalMinutes > 0 && <span className="ml-2 normal-case font-semibold text-foreground">{formatMinutes(totalMinutes)}</span>}
                      </h3>
                      <button onClick={() => setShowTimeForm(v => !v)} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
                        <span className="material-icons text-sm">add</span>Log time
                      </button>
                    </div>
                    {showTimeForm && (
                      <div className="bg-muted/50 rounded-lg p-3 mb-3 space-y-2">
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="block text-xs text-muted-foreground mb-1">Hours</label>
                            <input type="number" min="0" step="0.5" value={timeHours} onChange={e => setTimeHours(e.target.value)} placeholder="0"
                              className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                          <div className="flex-1">
                            <label className="block text-xs text-muted-foreground mb-1">Minutes</label>
                            <input type="number" min="0" max="59" value={timeMinutesInput} onChange={e => setTimeMinutesInput(e.target.value)} placeholder="0"
                              className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                          </div>
                        </div>
                        <input type="text" value={timeNote} onChange={e => setTimeNote(e.target.value)} placeholder="Note (optional)"
                          className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                        <div className="flex gap-2">
                          <button onClick={logTime} disabled={loggingTime || (!timeHours && !timeMinutesInput)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                            {loggingTime && <span className="material-icons text-xs animate-spin">refresh</span>}Log
                          </button>
                          <button onClick={() => setShowTimeForm(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                        </div>
                      </div>
                    )}
                    {timeLogs.length > 0 ? (
                      <div className="space-y-2">
                        {timeLogs.map(t => (
                          <div key={t.id} className="flex items-start gap-2 text-sm">
                            <span className="material-icons text-sm text-muted-foreground mt-0.5">schedule</span>
                            <div className="flex-1">
                              <span className="font-medium text-foreground">{formatMinutes(t.minutes)}</span>
                              {t.note && <span className="text-muted-foreground ml-1.5">— {t.note}</span>}
                              <div className="text-xs text-muted-foreground mt-0.5">{t.userName ?? 'Unknown'} · {formatDate(t.loggedAt)}</div>
                            </div>
                            <button onClick={() => deleteTimeLog(t.id)}
                              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors shrink-0">
                              <span className="material-icons text-sm">delete</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-muted-foreground italic">No time logged yet.</p>}
                  </div>
                )}

                {/* Activity */}
                <div>
                  <button onClick={() => setShowActivity(v => !v)}
                    className="flex items-center justify-between w-full mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground">
                    <span>Activity {activities.length > 0 && `(${activities.length})`}</span>
                    <span className={`material-icons text-sm transition-transform ${showActivity ? 'rotate-90' : ''}`}>chevron_right</span>
                  </button>
                  {showActivity && (
                    activities.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No activity yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {activities.map(a => (
                          <li key={a.id} className="flex items-start gap-2 text-xs">
                            <span className="material-icons text-sm text-muted-foreground mt-0.5">history</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-foreground">{formatActivity(a)}</p>
                              <p className="text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )
                  )}
                </div>
              </div>

              {/* Sidebar */}
              <div className="w-52 shrink-0 border-l border-border p-4 space-y-5 overflow-y-auto bg-card">

                <div>
                  <button
                    onClick={toggleWatch}
                    className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors ${
                      watching
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <span className="material-icons text-base">{watching ? 'notifications_active' : 'notifications_none'}</span>
                    {watching ? 'Watching' : 'Watch'}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Assignees</label>
                  <div className="space-y-1.5">
                    {assignees.map(a => (
                      <div key={a.id} className="flex items-center gap-2 text-sm">
                        <span className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                          {(a.name ?? '?').trim().charAt(0).toUpperCase()}
                        </span>
                        <span className="flex-1 text-foreground truncate">{a.name}</span>
                        {canEdit && (
                          <button onClick={() => removeAssignee(a.id)} className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${a.name}`}>
                            <span className="material-icons text-sm">close</span>
                          </button>
                        )}
                      </div>
                    ))}
                    {assignees.length === 0 && <p className="text-xs text-muted-foreground italic">No one assigned</p>}
                    {canEdit && (
                      <div className="relative">
                        <button onClick={() => setShowAssigneeMenu(v => !v)}
                          className="w-full flex items-center justify-center gap-1 px-2 py-1 rounded border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary">
                          <span className="material-icons text-sm">{showAssigneeMenu ? 'close' : 'person_add'}</span>
                          {showAssigneeMenu ? 'Close' : 'Add'}
                        </button>
                        {showAssigneeMenu && (
                          <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-popover border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {mentionUsers.filter(u => !assignees.some(a => a.id === u.id)).map(u => (
                              <button key={u.id}
                                onClick={() => { addAssignee(u); setShowAssigneeMenu(false); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left">
                                <span className="material-icons text-sm text-muted-foreground">person</span>
                                {u.name}
                              </button>
                            ))}
                            {mentionUsers.filter(u => !assignees.some(a => a.id === u.id)).length === 0 && (
                              <p className="text-xs text-muted-foreground italic p-3">No one left to add</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Priority</label>
                  {canEdit ? (
                    <select value={card.priority ?? 'medium'} onChange={e => saveField('priority', e.target.value)} disabled={savingField === 'priority'}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="low">Low</option><option value="medium">Medium</option>
                      <option value="high">High</option><option value="urgent">Urgent</option>
                    </select>
                  ) : (
                    <span className={`text-xs px-2 py-1 rounded font-medium ${priorityColor(card.priority ?? 'medium')}`}>{card.priority ?? 'medium'}</span>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Due Date</label>
                  {canEdit ? (
                    <input type="date" value={card.dueDate ? new Date(card.dueDate).toISOString().split('T')[0] : ''}
                      onChange={e => saveField('dueDate', e.target.value || null)} disabled={savingField === 'dueDate'}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  ) : (
                    <span className="text-sm text-foreground">
                      {card.dueDate ? new Date(card.dueDate).toLocaleDateString() : <span className="text-muted-foreground">—</span>}
                    </span>
                  )}
                </div>
                {canEdit && (
                  <div className="pt-4 border-t border-border">
                    {confirmDelete ? (
                      <div className="space-y-2">
                        <p className="text-xs text-destructive font-medium">Delete this card?</p>
                        <div className="flex gap-2">
                          <button onClick={deleteCard} disabled={deleting}
                            className="flex-1 px-2 py-1.5 bg-destructive text-destructive-foreground rounded text-xs font-medium hover:bg-destructive/90 disabled:opacity-50">
                            {deleting ? 'Deleting…' : 'Delete'}
                          </button>
                          <button onClick={() => setConfirmDelete(false)} className="flex-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(true)}
                        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors w-full">
                        <span className="material-icons text-base">delete_outline</span>Delete card
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
