/**
 * Short-video render jobs (Content Engine Fase 2).
 *
 * Honest contract: this platform has no server-side MP4 renderer (no ffmpeg
 * sidecar, no TTS model in the dependency tree). Rendering runs on the
 * authoring machine via the `sd-create-short` skill (Kokoro TTS + Whisper
 * alignment → GSAP composition → QA → render → upload to the media library).
 *
 * So a "job" here is stateless and deterministic: the same plan always
 * yields the same jobId (sha256, 12 hex — natural dedupe on re-submit), plus
 * the exact step list and handoff artifacts (plan JSON, caption, video block)
 * the local renderer consumes. A future `server` driver can implement the
 * same interface once an ffmpeg sidecar exists; until then it reports
 * itself unavailable rather than pretending to render.
 */

import { createHash } from 'node:crypto';
import type { ShortPlan } from './short-plan';

export type RenderDriver = 'local-script' | 'server';
export type ShortAspect = '16x9' | '4x5';

export interface RenderJobRequest {
  plan: ShortPlan;
  driver?: RenderDriver;
  aspect?: ShortAspect;
}

export interface RenderJob {
  jobId: string;
  driver: RenderDriver;
  aspect: ShortAspect;
  title: string;
  totalDurationSec: number;
  sceneCount: number;
  available: boolean;
  unavailableReason?: string;
  steps: string[];
  artifacts: {
    planJson: ShortPlan;
    linkedinCaption: string;
    videoBlock: ShortPlan['videoBlock'];
  };
  notes: string[];
}

/** Deterministic id — same plan, same jobId (pure, tested). */
export function renderJobId(plan: ShortPlan, aspect: ShortAspect): string {
  return createHash('sha256')
    .update(JSON.stringify({ plan, aspect }))
    .digest('hex')
    .slice(0, 12);
}

const LOCAL_STEPS: string[] = [
  '1. Create a working folder per video (/tmp/sd-short-<slug>/, never committed).',
  '2. Synthesize narration with Kokoro TTS from the scene bodies.',
  '3. Align words with Whisper for beat-synced captions.',
  '4. Compose scenes in the GSAP template (hook → points → cta), text-first so it works muted.',
  '5. QA the render (timing, safe areas, caption legibility) and export the MP4.',
  '6. Mux background music with a 1s fade-in / 2s fade-out (verify track licensing for commercial use).',
  '7. Upload the MP4 to the portal media library and paste the video block JSON into the post.',
  '8. Upload natively to LinkedIn with the provided caption (manual step — LinkedIn has no draft API here).',
];

export function buildRenderJob(req: RenderJobRequest): RenderJob {
  const driver = req.driver ?? 'local-script';
  const aspect = req.aspect ?? '16x9';
  const base = {
    jobId: renderJobId(req.plan, aspect),
    driver,
    aspect,
    title: req.plan.title,
    totalDurationSec: req.plan.totalDurationSec,
    sceneCount: req.plan.scenes.length,
    artifacts: {
      planJson: req.plan,
      linkedinCaption: req.plan.linkedinCaption,
      videoBlock: req.plan.videoBlock,
    },
  };
  if (driver === 'server') {
    return {
      ...base,
      available: false,
      unavailableReason:
        'No server-side renderer is installed (requires an ffmpeg + TTS sidecar). Use driver local-script.',
      steps: [],
      notes: [
        'Track the ffmpeg-sidecar proposal before enabling this driver.',
        'The local-script driver below is the supported path today.',
      ],
    };
  }
  return {
    ...base,
    available: true,
    steps: LOCAL_STEPS,
    notes: [
      'Run on the authoring machine via the sd-create-short skill.',
      'Working folder is ephemeral (/tmp); only the MP4 (media library) and the caption persist.',
    ],
  };
}
