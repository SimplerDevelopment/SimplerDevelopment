'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewPitchDeckPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'idle' | 'creating' | 'generating' | 'branding'>('idle');
  const [error, setError] = useState('');

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
        body: JSON.stringify({ title: title.trim(), sourceUrl: websiteUrl.trim() || undefined }),
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
      <div>
        <Link
          href="/portal/tools/pitch-decks"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <span className="material-icons text-lg">arrow_back</span>
          Back to Pitch Decks
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Create Pitch Deck</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Describe what you need and let AI generate a professional pitch deck
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
            <span className="material-icons">error</span>
            {error}
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Deck Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q1 2026 Investor Pitch"
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              required
              disabled={loading}
            />
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
                className="w-full pl-10 pr-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
                disabled={loading}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              We&apos;ll extract your brand colors, fonts, and company info to customize the deck
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
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
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
          className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
