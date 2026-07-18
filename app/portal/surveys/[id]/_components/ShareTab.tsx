'use client';

/**
 * ShareTab — public link, embed code, and integration callouts.
 *
 * Lifted verbatim from page.tsx. The page owns the publicUrl + clipboard
 * state so we accept those via props.
 */

import type { Survey } from '../_lib/api';

interface Props {
  survey: Survey;
  publicUrl: string;
  copied: boolean;
  onCopyLink: () => void;
  onCopyEmbed: () => void;
}

export default function ShareTab({ survey, publicUrl, copied, onCopyLink, onCopyEmbed }: Props) {
  const embedSnippet = `<iframe src="${publicUrl}?embed=1" width="100%" height="600" frameborder="0" style="border:none;border-radius:12px;"></iframe>`;

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">link</span>
          Public Link
        </h3>
        <p className="text-sm text-muted-foreground">Share this link with anyone to collect responses</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={publicUrl}
            className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground font-mono"
          />
          <button
            onClick={onCopyLink}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-lg">{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-3">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">code</span>
          Embed on Website
        </h3>
        <p className="text-sm text-muted-foreground">Embed this survey on any website or your client sites</p>
        <div className="bg-muted border border-border rounded-lg p-3">
          <code className="text-xs text-foreground font-mono break-all">{embedSnippet}</code>
        </div>
        <button
          onClick={onCopyEmbed}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <span className="material-icons text-lg">{copied ? 'check' : 'content_copy'}</span>
          {copied ? 'Copied!' : 'Copy Embed Code'}
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">hub</span>
          Integrations
        </h3>
        <p className="text-sm text-muted-foreground">
          Connect this survey to other tools for automatic distribution
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-lg text-primary">email</span>
              <p className="font-medium text-foreground text-sm">Email Campaigns</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Include survey link in email campaigns. Add{' '}
              <code className="bg-muted px-1 rounded">{`{{survey:${survey.slug}}}`}</code> to any email
              template.
            </p>
          </div>
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-lg text-primary">handshake</span>
              <p className="font-medium text-foreground text-sm">CRM Deals & Proposals</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Attach to a deal or proposal. Responses are linked to the contact record for follow-up.
            </p>
          </div>
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-lg text-primary">calendar_month</span>
              <p className="font-medium text-foreground text-sm">Booking Follow-up</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Send survey after a booking is completed. Set up in Automations with the
              &ldquo;booking.completed&rdquo; trigger.
            </p>
          </div>
          <div className="border border-border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-icons text-lg text-primary">web</span>
              <p className="font-medium text-foreground text-sm">Website Embed</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Use the embed code above or add to your site via the website builder&apos;s custom HTML block.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
