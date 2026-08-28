'use client';

// Extracted verbatim from app/portal/crm/contacts/[id]/page.tsx (PUX-170) — the page is pinned at 636 code lines.

import { useState } from 'react';
import { pBtnGhost, pBtnPrimary, pCard, pInput, pSectionTitle } from '@/components/portal/portal-ui';

export default function ContactEmailForm({ contactId, contactEmail, open, onClose, onSent }: {
  contactId: string;
  contactEmail: string;
  open: boolean;
  onClose: () => void;
  // Not part of the minimal prop list called out on PUX-170, but kept to
  // preserve behavior: the original inline handler refetched the activity
  // timeline after a successful send (an email send logs an activity
  // server-side). Page passes fetchActivities.
  onSent: () => void;
}) {
  const [emailForm, setEmailForm] = useState({ subject: '', body: '' });
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailForm.subject.trim() || !emailForm.body.trim()) return;
    setEmailSending(true);
    setEmailError('');
    setEmailSuccess('');
    const res = await fetch(`/api/portal/crm/contacts/${contactId}/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emailForm),
    });
    const d = await res.json();
    setEmailSending(false);
    if (d.success) {
      setEmailSuccess('Email sent successfully.');
      setEmailForm({ subject: '', body: '' });
      onClose();
      onSent();
      setTimeout(() => setEmailSuccess(''), 3000);
    } else {
      setEmailError(d.message ?? 'Failed to send email.');
    }
  }

  return (
    <>
      {/* Email Success Banner */}
      {emailSuccess && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-100 border border-green-200 rounded-lg px-3 py-2">
          <span className="material-icons text-base">check_circle</span>
          {emailSuccess}
        </div>
      )}

      {/* Send Email Form */}
      {open && (
        <form onSubmit={sendEmail} className={`${pCard} p-6 space-y-4`}>
          <div className="flex items-center justify-between">
            <h2 className={pSectionTitle}>Send Email to {contactEmail}</h2>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <span className="material-icons text-base">close</span>
            </button>
          </div>
          {emailError && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <span className="material-icons text-base">error</span>
              {emailError}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Subject</label>
            <input
              required
              value={emailForm.subject}
              onChange={e => setEmailForm(f => ({ ...f, subject: e.target.value }))}
              className={pInput}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Body</label>
            <textarea
              required
              value={emailForm.body}
              onChange={e => setEmailForm(f => ({ ...f, body: e.target.value }))}
              rows={6}
              className={`${pInput} resize-y`}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={pBtnGhost}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={emailSending}
              className={pBtnPrimary}
            >
              {emailSending && <span className="material-icons animate-spin text-sm">refresh</span>}
              <span className="material-icons text-sm">send</span>
              Send Email
            </button>
          </div>
        </form>
      )}
    </>
  );
}
