'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BrandingProfileSelector from '@/components/portal/BrandingProfileSelector';
import UploadHtmlDeckButton from '@/components/portal/UploadHtmlDeckButton';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pCard, pInput } from '@/components/portal/portal-ui';

export default function NewPitchDeckPage() {
  const router = useRouter();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [brandingProfileId, setBrandingProfileId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [step, setStep] = useState<'idle' | 'creating' | 'generating' | 'branding'>('idle');
  const [error, setError] = useState('');

  async function handleStartBlank() {
    if (!title.trim()) {
      setError('Add a title above before starting a blank deck.');
      titleInputRef.current?.focus();
      return;
    }
    setCreatingBlank(true);
    setError('');
    try {
      const res = await fetch('/api/portal/tools/pitch-decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          brandingProfileId: brandingProfileId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Failed to create deck');
        setCreatingBlank(false);
        return;
      }
      router.push(`/portal/tools/pitch-decks/${data.data.id}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setCreatingBlank(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Step 1: Create the deck
      setStep('creating');
      const createRes = await fetch('/api/portal/tools/pitch-decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          sourceUrl: websiteUrl.trim() || undefined,
          brandingProfileId: brandingProfileId ?? undefined,
        }),
      });
      const createData = await createRes.json();
      if (!createData.success) {
        setError(createData.message || 'Failed to create deck');
        setLoading(false);
        setStep('idle');
        return;
      }

      const deckId = createData.data.id;

      // Step 2: Generate slides with AI
      setStep(websiteUrl.trim() ? 'branding' : 'generating');
      const genRes = await fetch(`/api/portal/tools/pitch-decks/${deckId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), websiteUrl: websiteUrl.trim() || undefined }),
      });
      const genData = await genRes.json();

      if (!genData.success) {
        // Deck was created but generation failed — navigate to editor anyway
        router.push(`/portal/tools/pitch-decks/${deckId}?genError=1`);
        return;
      }

      router.push(`/portal/tools/pitch-decks/${deckId}`);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
      setStep('idle');
    }
  }

  const stepMessages = {
    idle: '',
    creating: 'Creating your deck...',
    branding: 'Analyzing your website for branding...',
    generating: 'AI is generating your slides...',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <Link href="/portal/tools/pitch-decks" className="hover:text-foreground inline-flex items-center gap-1 transition-colors">
          <span className="material-icons text-base">arrow_back</span>
          Back to Pitch Decks
        </Link>
      </div>
      <PortalPageHeader
        eyebrow="Pitch Decks"
        title="Create Pitch Deck"
        subtitle="Describe what you need and let AI generate a professional pitch deck"
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <div className={`${pCard} p-5 flex flex-col gap-3`}>
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span className="material-icons text-primary text-base">add_box</span>
              Start blank
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Skip generation. Add a title, hit start, build slides yourself in the editor.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStartBlank}
            disabled={creatingBlank || loading}
            className={`${pBtnPrimary} self-start`}
          >
            {creatingBlank ? (
              <>
                <span className="material-icons animate-spin text-base">autorenew</span>
                Creating...
              </>
            ) : (
              <>
                <span className="material-icons text-base">arrow_forward</span>
                Start blank deck
              </>
            )}
          </button>
        </div>
        <div className={`${pCard} p-5 flex flex-col gap-3`}>
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <span className="material-icons text-primary text-base">upload_file</span>
              Already have HTML?
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Upload a single .html file and we&apos;ll wrap it in a one-slide deck.
            </p>
          </div>
          <div className="self-start">
            <UploadHtmlDeckButton />
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
            <span className="material-icons">error</span>
            {error}
          </div>
        )}

        <div className={`${pCard} p-5 space-y-4`}>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Deck Title</label>
            <input
              ref={titleInputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q1 2026 Investor Pitch"
              className={pInput}
              required
              disabled={loading || creatingBlank}
            />
          </div>

          <div>
            <BrandingProfileSelector
              value={brandingProfileId}
              onChange={setBrandingProfileId}
              label="Brand Profile"
              allowNone
              noneLabel="None"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Applies your saved brand colors, fonts, and messaging to style and write the deck content.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Website URL
              <span className="font-normal text-muted-foreground ml-1">(optional)</span>
            </label>
            <div className="relative">
              <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">language</span>
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://yourcompany.com"
                className="w-full rounded-xl border border-border bg-card pl-10 pr-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
                disabled={loading}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {brandingProfileId
                ? 'Additional context will be pulled from this URL to supplement your brand profile.'
                : 'We\'ll extract brand colors, fonts, and company info to customize the deck.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              What should this pitch deck be about?
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={"e.g. Create a pitch deck for our financial advisory firm that highlights our AI-powered investment strategies, team expertise, track record, and why clients should choose us over traditional advisors."}
              rows={5}
              className={`${pInput} resize-none`}
              required
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Be specific about your audience, key points, and tone. The more detail you give, the better the result.
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !title.trim() || !prompt.trim()}
          className={`${pBtnPrimary} w-full py-3`}
        >
          {loading ? (
            <>
              <span className="material-icons animate-spin text-lg">autorenew</span>
              {stepMessages[step]}
            </>
          ) : (
            <>
              <span className="material-icons text-lg">auto_awesome</span>
              Generate Pitch Deck
            </>
          )}
        </button>
      </form>
    </div>
  );
}
