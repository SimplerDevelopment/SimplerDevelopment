'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/Button';

/**
 * "Get a quote" form for /ai-consulting.
 *
 * Posts to `/api/contact`, deliberately, rather than to a new endpoint. That
 * route already does everything an enquiry needs — emails CONTACT_INBOX,
 * upserts a CRM contact, opens a deal on the default pipeline, and attaches
 * first-touch attribution read from a cookie that middleware may have stamped
 * weeks earlier. A parallel /api/quote would have had to reimplement all four,
 * and would have drifted from them the first time one changed.
 *
 * The cost of that reuse is this file's one piece of cleverness: `contactSchema`
 * on the server accepts only name/email/subject/message, and a zod object
 * STRIPS unknown keys rather than rejecting them — so extra fields posted as
 * their own properties would vanish silently, with no error to notice. The
 * scoping answers are therefore folded into `message` as labelled lines before
 * the request goes out (see buildMessage). They arrive readable in the sales
 * inbox and on the CRM deal. If these ever need to be queryable as structured
 * data, that is the point to widen the server schema — not to start posting
 * loose keys and hope.
 *
 * NOTE: no budget-range field, on purpose. Budget pickers render dollar bands
 * on the page, and this page is deliberately price-free; adding one would
 * reintroduce published pricing through the back door.
 */

// Must match HONEYPOT_FIELD in app/api/contact/route.ts. The server drops any
// submission that fills it and answers 200 anyway, so bots learn nothing.
// Worth noting ContactForm never renders this field, so the marketing site's
// other form gets no benefit from the check the API is already doing.
const HONEYPOT_FIELD = 'website';

const PROJECT_TYPES = [
  'AI agents & multi-agent workflows',
  'Retrieval over our documents (RAG)',
  'Automation & systems integration',
  'MCP server / tool infrastructure',
  'Not sure yet — help us scope it',
] as const;

const TIMELINES = [
  'As soon as you can start',
  'Within 1–3 months',
  'This quarter or later',
  'Still exploring',
] as const;

const quoteSchema = z.object({
  name: z.string().min(2, 'Please enter your name'),
  email: z.string().email('Please enter a valid email address'),
  company: z.string().optional(),
  projectType: z.string().min(1, 'Pick the closest match'),
  timeline: z.string().optional(),
  details: z.string().min(10, 'A sentence or two is enough to quote against'),
  [HONEYPOT_FIELD]: z.string().optional(),
});

type QuoteFormData = z.infer<typeof quoteSchema>;

/** Fold the scoping answers into the one free-text field the API accepts. */
function buildMessage(data: QuoteFormData): string {
  const lines = [
    data.details,
    '',
    '--- Quote request ---',
    `Project type: ${data.projectType}`,
  ];
  if (data.company?.trim()) lines.push(`Company: ${data.company.trim()}`);
  if (data.timeline?.trim()) lines.push(`Timeline: ${data.timeline.trim()}`);
  return lines.join('\n');
}

const FIELD_CLASS =
  'w-full rounded-md border px-4 py-3 bg-background focus:outline-none focus:ring-2 focus:ring-primary';

export function QuoteForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<QuoteFormData>({
    resolver: zodResolver(quoteSchema),
    defaultValues: { projectType: '', timeline: '' },
  });

  const onSubmit = async (data: QuoteFormData) => {
    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          subject: `Quote request — ${data.projectType}`,
          message: buildMessage(data),
          [HONEYPOT_FIELD]: data[HONEYPOT_FIELD] ?? '',
        }),
      });

      if (!response.ok) throw new Error('Failed to send quote request');

      setSubmitStatus('success');
      reset();
    } catch (error) {
      console.error('Error submitting quote request:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Honeypot. Hidden from people and from assistive tech, reachable by bots. */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="quote-website">Leave this field empty</label>
        <input
          id="quote-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register(HONEYPOT_FIELD)}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="quote-name" className="mb-2 block text-sm font-medium">
            Name *
          </label>
          <input id="quote-name" type="text" {...register('name')} className={FIELD_CLASS} placeholder="Your name" />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="quote-email" className="mb-2 block text-sm font-medium">
            Email *
          </label>
          <input
            id="quote-email"
            type="email"
            {...register('email')}
            className={FIELD_CLASS}
            placeholder="you@company.com"
          />
          {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="quote-company" className="mb-2 block text-sm font-medium">
            Company
          </label>
          <input
            id="quote-company"
            type="text"
            {...register('company')}
            className={FIELD_CLASS}
            placeholder="Optional"
          />
        </div>

        <div>
          <label htmlFor="quote-timeline" className="mb-2 block text-sm font-medium">
            Timeline
          </label>
          <select id="quote-timeline" {...register('timeline')} className={FIELD_CLASS}>
            <option value="">No strong preference</option>
            {TIMELINES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="quote-project-type" className="mb-2 block text-sm font-medium">
          What do you need built? *
        </label>
        <select id="quote-project-type" {...register('projectType')} className={FIELD_CLASS}>
          <option value="">Choose the closest match…</option>
          {PROJECT_TYPES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        {errors.projectType && <p className="mt-1 text-sm text-red-600">{errors.projectType.message}</p>}
      </div>

      <div>
        <label htmlFor="quote-details" className="mb-2 block text-sm font-medium">
          Tell us about the work *
        </label>
        <textarea
          id="quote-details"
          rows={5}
          {...register('details')}
          className={`${FIELD_CLASS} resize-none`}
          placeholder="What does the workflow look like today, who does it, and roughly how often? Rough notes are fine — we will come back with questions."
        />
        {errors.details && <p className="mt-1 text-sm text-red-600">{errors.details.message}</p>}
      </div>

      {submitStatus === 'success' && (
        <div
          role="status"
          className="rounded-md border border-[var(--retro-mid)] bg-[color-mix(in_srgb,var(--retro-gold)_18%,var(--retro-cream))] p-4"
        >
          <p className="text-sm text-[var(--retro-ink)]">
            Received — we will come back to you with scope and a price, usually within one working day.
          </p>
        </div>
      )}

      {submitStatus === 'error' && (
        <div role="alert" className="rounded-md border border-red-500 bg-red-50 p-4">
          <p className="text-sm text-red-700">
            That didn’t send. Try again, or email{' '}
            <a className="underline" href="mailto:info@simplerdevelopment.com">
              info@simplerdevelopment.com
            </a>
            .
          </p>
        </div>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full" size="lg">
        {isSubmitting ? 'Sending…' : 'Request A Quote'}
      </Button>

      <p className="text-center text-xs text-[color-mix(in_srgb,var(--retro-ink)_60%,transparent)]">
        No obligation, and no sales sequence — one human reply.
      </p>
    </form>
  );
}
