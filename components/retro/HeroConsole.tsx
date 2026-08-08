'use client';

/**
 * Animated mission-console for the hero — the still illustration, but with the
 * screens running a website, CRM, project board, email campaign and AI chat.
 *
 * The source was shot on a green screen (#39AF21) and is keyed to a VP9 WebM
 * with a real alpha channel, so the console sits directly on the hero ground
 * with no plate behind it. Keying notes, in case this is ever re-cut:
 *   - similarity 0.12. Lower (0.09) leaves a green fringe along the silhouette;
 *     higher (0.18+) starts eating the console itself, whose teal body is
 *     chroma-adjacent to the key.
 *   - NO despill. It looks like the right call and is not: the artwork is
 *     genuinely green-ish, so despill pulls the teal panels magenta.
 *   - the first ~24 frames are a black-to-green fade that cannot key cleanly,
 *     so the encode starts at 1.0s.
 *
 * WHY THE ALPHA PROBE: Safari plays VP9 WebM but does not composite its alpha.
 * Feature-detecting with canPlayType is therefore a trap — it reports
 * "probably", the video plays, and the user gets a bright green rectangle in
 * the hero. So a frame is drawn to a 1x1 canvas and its corner alpha is read.
 * Transparent → play the video. Anything else → leave the static poster up.
 * The poster is the same keyed frame, so the fallback costs motion, not
 * composition.
 *
 * WHY THE PROBE IS ITS OWN 604-BYTE FILE. This used to probe the real clip,
 * which meant Safari downloaded ~500KB over cellular, decoded it, failed the
 * check, and showed the poster anyway — every byte wasted. alpha-probe.webm is
 * a single 16x16 fully-transparent VP9-alpha frame, and it returns the *same*
 * verdict as the real clip in both engines (measured: Chromium 0/0, WebKit
 * 255/255). So the decision now happens before the real file is requested, and
 * `src` is only set once alpha is confirmed.
 *
 * Two things this is deliberately NOT:
 *   - not a UA sniff. This is a capability test, so the day WebKit ships alpha
 *     compositing the video simply starts working with no code change.
 *   - not a data: URI. WebKit taints a canvas drawn from data:-sourced media,
 *     so the read threw SecurityError instead of returning a pixel. It failed
 *     closed, which is the right outcome for the wrong reason — a same-origin
 *     file gives an honest pixel value and can't mask a real alpha reading.
 */
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

import { usePrefersReducedMotion } from './use-motion-gates';

export default function HeroConsole({ className = '' }: { className?: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [alphaOk, setAlphaOk] = useState(false);
  const reduced = usePrefersReducedMotion();

  // Decode the 604-byte probe and read one pixel of it. Every exit path that
  // is not "definitely transparent" leaves alphaOk false, so the real clip is
  // never requested: a decode error, a 404, a canvas the browser refuses to
  // read, or a browser that simply paints the frame opaque.
  useEffect(() => {
    if (reduced) return;

    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';

    const read = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(v, 0, 0, 8, 8, 0, 0, 1, 1);
        setAlphaOk(ctx.getImageData(0, 0, 1, 1).data[3] === 0);
      } catch {
        setAlphaOk(false);
      }
    };

    v.addEventListener('loadeddata', read, { once: true });
    v.addEventListener('error', () => setAlphaOk(false), { once: true });
    v.src = '/retro/alpha-probe.webm';

    return () => {
      v.removeEventListener('loadeddata', read);
      // Drop the source so a probe still in flight cannot resolve after unmount.
      v.removeAttribute('src');
      v.load();
    };
  }, [reduced]);

  // Loops continuously, but only while it is actually on screen — a hero that
  // keeps decoding video after the visitor has scrolled to the footer is just
  // burning battery. Resumes rather than rewinds on re-entry: for an ambient
  // loop, dropping back in mid-cycle reads as "still running", where a hard
  // restart draws attention to itself every time the hero scrolls back.
  useEffect(() => {
    const v = video.current;
    if (!v || !alphaOk) return;

    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          // Autoplay can still be refused (low-power mode); the poster is
          // underneath, so a rejection degrades to the still rather than a gap.
          void v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [alphaOk]);

  return (
    <div className={`relative w-full max-w-[959px] self-center ${className}`}>
      {/* self-center is load-bearing: the parent is a flex row, so a stretched
          wrapper made the poster sit at the top while the absolutely-placed
          video centred itself vertically — the two drew the console at
          different heights and it ghosted. Sizing the wrapper to the poster
          makes inset-0 line the video up exactly. */}
      {/* The poster is the LCP candidate and always renders; the video fades in
          over it only once alpha is confirmed. Identical first frame, so the
          handover is invisible. */}
      <Image
        src="/retro/hero-console-poster.webp"
        alt=""
        width={1128}
        height={320}
        priority
        className="h-auto w-full object-contain"
      />
      {/* Mounted only once the probe has confirmed alpha, so the ~500KB clip is
          never requested on an engine that would refuse to composite it. */}
      {!reduced && alphaOk && (
        <video
          ref={video}
          className="absolute inset-0 h-full w-full object-contain opacity-100 transition-opacity duration-300"
          src="/retro/hero-console.webm"
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden
          tabIndex={-1}
        />
      )}
    </div>
  );
}
