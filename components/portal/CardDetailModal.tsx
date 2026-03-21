'use client';

import { useState, useEffect, useRef } from 'react';
import { priorityColor } from '@/lib/portal-utils';

interface CardDetail {
  id: number; columnId: number; projectId: number; title: string;
  description: string | null; priority: string | null; dueDate: string | null;
  assignedTo: number | null; order: number;
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
interface Props {
  cardId: number; isStaff: boolean; currentUserId: number;
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
function renderMentions(text: string) {
  return text.split(/(@\w+)/g).map((p, i) =>
    p.startsWith('@') ? <strong key={i} className="text-primary font-medium">{p}</strong> : p,
  );
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

export default function CardDetailModal({ cardId, isStaff, currentUserId, onClose, onDeleted, onUpdated }: Props) {
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

  useEffect(() => {
    async function load() {
      try {
        const [cardRes, usersRes] = await Promise.all([
          fetch(`/api/portal/cards/${cardId}`),
          fetch('/api/portal/mentionable-users'),
        ]);
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
          }
        }
        if (usersRes.ok) { const d = await usersRes.json(); if (d.success) setMentionUsers(d.data); }
      } catch (e) { console.error(e); } finally { setLoading(false); }
    }
    load();
  }, [cardId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !editingTitle && !editingDesc) onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, editingTitle, editingDesc]);

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

  const totalMinutes = timeLogs.reduce((s, t) => s + t.minutes, 0);
  const canDeleteFile = (f: FileAttachment) => isStaff || f.userId === currentUserId;

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
                {editingTitle ? (
                  <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
                    onBlur={saveTitle} onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                    className="w-full text-xl font-bold bg-transparent border-b-2 border-primary focus:outline-none text-foreground" />
                ) : (
                  <h2 className={`text-xl font-bold text-foreground leading-tight ${isStaff ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                    onClick={() => { if (isStaff) { setTitleDraft(card.title); setEditingTitle(true); } }}>
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

                {/* Description */}
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Description</h3>
                  {editingDesc ? (
                    <div>
                      <textarea autoFocus value={descDraft} onChange={e => setDescDraft(e.target.value)} rows={4}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                      <div className="flex gap-2 mt-2">
                        <button onClick={saveDesc} disabled={savingField === 'description'}
                          className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50">
                          {savingField === 'description' ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingDesc(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => { if (isStaff) { setDescDraft(card.description ?? ''); setEditingDesc(true); } }}
                      className={`text-sm text-foreground rounded-lg p-2 -m-2 min-h-[40px] ${isStaff ? 'cursor-pointer hover:bg-accent/50 transition-colors' : ''}`}>
                      {card.description
                        ? <p className="whitespace-pre-wrap">{card.description}</p>
                        : <span className="text-muted-foreground italic">{isStaff ? 'Add a description…' : 'No description'}</span>
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
                          {c.body && <p className="text-sm text-foreground whitespace-pre-wrap break-words">{renderMentions(c.body)}</p>}
                          {c.files?.length > 0 && (
                            <div className="mt-2 grid grid-cols-3 gap-2">
                              {c.files.map(f => (
                                <FileThumb key={f.id} file={f}
                                  onDelete={canDeleteFile(f) ? () => deleteFile(f.id, true, c.id) : undefined} />
                              ))}
                            </div>
                          )}
                        </div>
                        {(c.userId === currentUserId || isStaff) && (
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
              </div>

              {/* Sidebar */}
              <div className="w-52 shrink-0 border-l border-border p-4 space-y-5 overflow-y-auto bg-card">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Priority</label>
                  {isStaff ? (
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
                  {isStaff ? (
                    <input type="date" value={card.dueDate ? new Date(card.dueDate).toISOString().split('T')[0] : ''}
                      onChange={e => saveField('dueDate', e.target.value || null)} disabled={savingField === 'dueDate'}
                      className="w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  ) : (
                    <span className="text-sm text-foreground">
                      {card.dueDate ? new Date(card.dueDate).toLocaleDateString() : <span className="text-muted-foreground">—</span>}
                    </span>
                  )}
                </div>
                {isStaff && (
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
