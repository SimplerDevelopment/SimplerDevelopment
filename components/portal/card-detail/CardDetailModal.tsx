/**
 * CardDetailModal — kanban card detail dispatcher.
 *
 * Hosts the modal frame and lays out the per-section components in
 * `./_sections/`. All state + mutations live in `./_hooks/useCardDetail.ts`;
 * the dispatcher exists only to wire props down.
 *
 * The original 1207-LOC implementation lived at
 * components/portal/CardDetailModal.tsx and is preserved as a re-export shim
 * for callers that import the old path.
 */
'use client';

import { useState } from 'react';
import type { CardDetailModalProps, FileAttachment } from './_lib/types';
import { useCardDetail } from './_hooks/useCardDetail';
import { CardActivity } from './_sections/CardActivity';
import { CardArtifacts } from './_sections/CardArtifacts';
import { CardChecklist } from './_sections/CardChecklist';
import { CardChildren } from './_sections/CardChildren';
import { CardComments } from './_sections/CardComments';
import { CardDependencies } from './_sections/CardDependencies';
import { CardDescription } from './_sections/CardDescription';
import { CardFiles } from './_sections/CardFiles';
import { CardHeader } from './_sections/CardHeader';
import { CardLabels } from './_sections/CardLabels';
import { CardSidebar } from './_sections/CardSidebar';
import { CardTimeLogs } from './_sections/CardTimeLogs';

export default function CardDetailModal({
  cardId, isStaff, canEdit, currentUserId, onClose, onDeleted, onUpdated,
}: CardDetailModalProps) {
  const s = useCardDetail({ cardId, onClose, onDeleted, onUpdated });
  const totalMinutes = s.timeLogs.reduce((sum, t) => sum + t.minutes, 0);
  const canDeleteFile = (f: FileAttachment) => canEdit || f.userId === currentUserId;

  const [showParentPicker, setShowParentPicker] = useState(false);
  const parent = s.card?.parentCardId
    ? s.projectCards.find(c => c.id === s.card?.parentCardId) ?? null
    : null;
  const parentCandidates = s.projectCards.filter(c => c.id !== cardId && c.id !== s.card?.parentCardId);
  const children = s.projectCards.filter(c => c.parentCardId === cardId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {s.loading ? (
          <div className="flex items-center justify-center h-64">
            <span className="material-icons text-4xl text-muted-foreground animate-spin">refresh</span>
          </div>
        ) : !s.card ? (
          <div className="flex items-center justify-center h-64 text-muted-foreground">Card not found.</div>
        ) : (
          <>
            <CardHeader
              card={s.card} canEdit={canEdit} onClose={onClose}
              editingTitle={s.editingTitle} titleDraft={s.titleDraft}
              setTitleDraft={s.setTitleDraft} setEditingTitle={s.setEditingTitle}
              saveTitle={s.saveTitle}
              parent={parent}
              onClearParent={() => s.saveField('parentCardId', null)}
              onPickParent={() => setShowParentPicker(true)}
            />

            {showParentPicker && (
              <div className="absolute inset-0 z-30 flex items-start justify-center pt-24 px-4" onClick={() => setShowParentPicker(false)}>
                <div className="bg-popover border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Pick a parent card</p>
                    <button onClick={() => setShowParentPicker(false)} aria-label="Close">
                      <span className="material-icons text-muted-foreground hover:text-foreground">close</span>
                    </button>
                  </div>
                  {parentCandidates.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic p-4">No other cards in this project.</p>
                  ) : (
                    parentCandidates.map(c => (
                      <button
                        key={c.id}
                        onClick={() => {
                          s.saveField('parentCardId', c.id);
                          setShowParentPicker(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-xs hover:bg-accent text-left border-b border-border last:border-b-0"
                      >
                        {c.key && <span className="font-mono text-muted-foreground">{c.key}</span>}
                        <span className="text-foreground truncate">{c.title}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-1 overflow-hidden min-h-0">
              <div className="flex-1 overflow-y-auto p-5 space-y-6 bg-card">
                <CardLabels
                  labels={s.labels} projectLabels={s.projectLabels} canEdit={canEdit}
                  showLabelMenu={s.showLabelMenu} setShowLabelMenu={s.setShowLabelMenu}
                  newLabelName={s.newLabelName} setNewLabelName={s.setNewLabelName}
                  newLabelColor={s.newLabelColor} setNewLabelColor={s.setNewLabelColor}
                  toggleLabel={s.toggleLabel} createAndAttachLabel={s.createAndAttachLabel}
                />

                <CardDependencies
                  cardId={cardId} canEdit={canEdit}
                  blockers={s.blockers} blocking={s.blocking} projectCards={s.projectCards}
                  showDepMenu={s.showDepMenu} setShowDepMenu={s.setShowDepMenu}
                  openDepMenu={s.openDepMenu}
                  addBlocker={s.addBlocker} removeBlocker={s.removeBlocker}
                />

                <CardChildren children={children} />

                <CardChecklist
                  checklist={s.checklist} canEdit={canEdit}
                  newChecklistText={s.newChecklistText} setNewChecklistText={s.setNewChecklistText}
                  addChecklist={s.addChecklist}
                  toggleChecklistItem={s.toggleChecklistItem} removeChecklistItem={s.removeChecklistItem}
                />

                <CardDescription
                  card={s.card} canEdit={canEdit} savingField={s.savingField}
                  editingDesc={s.editingDesc} descDraft={s.descDraft}
                  setDescDraft={s.setDescDraft} setEditingDesc={s.setEditingDesc}
                  saveDesc={s.saveDesc}
                />

                <CardFiles
                  cardFiles={s.cardFiles} canDeleteFile={canDeleteFile}
                  uploadFile={s.uploadFile} deleteFile={s.deleteFile}
                  uploadingFile={s.uploadingFile}
                  isDragOver={s.isDragOver} setIsDragOver={s.setIsDragOver}
                  handleFileInput={s.handleFileInput}
                />

                <CardArtifacts
                  canEdit={canEdit}
                  artifacts={s.artifacts} artifactsLoaded={s.artifactsLoaded}
                  availableArtifacts={s.availableArtifacts}
                  showArtifactPicker={s.showArtifactPicker} setShowArtifactPicker={s.setShowArtifactPicker}
                  artifactTypeFilter={s.artifactTypeFilter} setArtifactTypeFilter={s.setArtifactTypeFilter}
                  addArtifact={s.addArtifact}
                  toggleArtifactPin={s.toggleArtifactPin} removeArtifact={s.removeArtifact}
                />

                <CardComments
                  comments={s.comments} currentUserId={currentUserId} canEdit={canEdit}
                  canDeleteFile={canDeleteFile} mentionUsers={s.mentionUsers}
                  commentBody={s.commentBody} setCommentBody={s.setCommentBody}
                  pendingCommentFiles={s.pendingCommentFiles} setPendingCommentFiles={s.setPendingCommentFiles}
                  submittingComment={s.submittingComment}
                  uploadFile={s.uploadFile} deleteFile={s.deleteFile}
                  submitComment={s.submitComment} removeComment={s.removeComment}
                />

                {isStaff && (
                  <CardTimeLogs
                    timeLogs={s.timeLogs} totalMinutes={totalMinutes}
                    showTimeForm={s.showTimeForm} setShowTimeForm={s.setShowTimeForm}
                    timeHours={s.timeHours} setTimeHours={s.setTimeHours}
                    timeMinutesInput={s.timeMinutesInput} setTimeMinutesInput={s.setTimeMinutesInput}
                    timeNote={s.timeNote} setTimeNote={s.setTimeNote}
                    loggingTime={s.loggingTime}
                    logTime={s.logTime} removeTimeLog={s.removeTimeLog}
                  />
                )}

                <CardActivity
                  activities={s.activities}
                  showActivity={s.showActivity} setShowActivity={s.setShowActivity}
                />
              </div>

              <CardSidebar
                card={s.card} canEdit={canEdit}
                assignees={s.assignees} mentionUsers={s.mentionUsers}
                showAssigneeMenu={s.showAssigneeMenu} setShowAssigneeMenu={s.setShowAssigneeMenu}
                addAssignee={s.addAssignee} removeAssignee={s.removeAssignee}
                watching={s.watching} toggleWatch={s.toggleWatch}
                saveField={s.saveField} savingField={s.savingField}
                confirmDelete={s.confirmDelete} setConfirmDelete={s.setConfirmDelete}
                deleting={s.deleting} removeCard={s.removeCard}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
