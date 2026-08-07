'use client';

/**
 * Travelling starfield behind the retro hero.
 *
 * Stars stream toward the viewer along Z and recycle to the far plane, so the
 * hero reads as forward motion rather than a drifting backdrop. It stays a
 * backdrop in every other sense — the design's period read comes from flat
 * illustration, and anything that competes with the artwork in front of it is
 * wrong for this page.
 *
 * HOW THE CLEAR CENTRE WORKS. The hero copy is centred over this, so the middle
 * has to stay quiet. Culling stars by *world* radius does not achieve that: a
 * star's screen position is x/|z|, so one spawned far away lands near the
 * vanishing point no matter how large its world radius is. Instead each star is
 * spawned by SCREEN radius — pick `sr` (world units per unit of depth), then set
 * its world x/y to `sr * |z|`. Because travel only decreases |z|, screen radius
 * `sr` is the star's minimum for its whole life, so nothing ever crosses into
 * the hole. The result is a clear cone down the middle that widens toward the
 * viewer, which is also what travelling through a tunnel actually looks like.
 * The hole is stretched horizontally because the text block is wider than tall.
 *
 * Performance rules this obeys, because it renders behind the first thing a
 * visitor sees:
 *   - dpr capped at 1.5 (retina at full dpr triples fragment cost for a field
 *     of 1px points nobody can see the extra resolution on)
 *   - frameloop pauses when the hero scrolls out of view (IntersectionObserver)
 *   - honours prefers-reduced-motion by rendering ONE static frame — the stars
 *     still appear, they just stop moving. Removing them entirely would leave a
 *     flat void where the design expects a night sky.
 *   - positions are mutated in place on one Float32Array; no per-frame
 *     allocation, no geometry rebuild.
 *
 * Callers should lazy-load this with `next/dynamic({ ssr: false })`; there is
 * no server-rendered fallback for a WebGL canvas.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Seeded LCG, defined at module scope on purpose.
 *
 * Inlining `let s = seed` inside a useMemo trips react-hooks/immutability —
 * the compiler cannot tell a scratch variable inside a pure computation from a
 * render-phase mutation of shared state. Hoisting the closure factory here
 * makes the reassignment plainly local to a normal function, and reads better
 * besides. Deterministic by design: a field that reshuffles between mounts
 * reads as a flicker rather than as stars.
 */
function lcg(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 9301 + 49297) % 233280) / 233280);
}

/**
 * Star tints, read from the live design tokens rather than pinned as hex.
 *
 * These used to be literal `#F4E9CF` / `#E1B24A`. That silently rotted the
 * moment the marketing palette moved to Deep Space (2026-08-07): the ground
 * changed to a near-black and the stars kept painting themselves in the old
 * teal palette's cream and gold. WebGL does not inherit CSS, so nothing warned
 * about it — the whole point of routing every colour through eight tokens is
 * lost the moment one component copies a value out.
 *
 * `--retro-*` lives on `.retro`, not `:root`, so the read has to happen from an
 * element inside that subtree — the canvas host, which is always under it.
 */
const FALLBACK_CREAM = '#F6F4F0';
const FALLBACK_GOLD = '#D8B15A';

function readTint(from: HTMLElement | null, token: string, fallback: string): THREE.Color {
  if (typeof window === 'undefined' || !from) return new THREE.Color(fallback);
  const v = getComputedStyle(from).getPropertyValue(token).trim();
  return new THREE.Color(v || fallback);
}

// Depth range the stars occupy, in world units in front of the camera.
const Z_FAR = 60;
const Z_NEAR = 1.5;
// Screen radius, as world-units-per-unit-depth. The camera's 60° fov gives a
// half-height of tan(30°) ≈ 0.577, so SR_MIN 0.2 keeps roughly the middle third
// of the frame height empty; X_STRETCH widens that hole to clear the headline.
const SR_MIN = 0.2;
const SR_MAX = 1.45;
const X_STRETCH = 2.1;

/**
 * One depth band. Splitting into bands rather than one cloud lets the near
 * band be sparse, large and fast and the far band dense, small and slow, which
 * is what sells depth — a single uniform cloud reads as flat noise moving.
 */
function Layer({
  count,
  speed,
  size,
  tint,
  opacity,
  seed,
  reduced,
}: {
  count: number;
  speed: number;
  size: number;
  tint: THREE.Color;
  opacity: number;
  seed: number;
  reduced: boolean;
}) {
  const ref = useRef<THREE.Points>(null);

  // Deterministic scatter: a seeded LCG rather than Math.random(), so the field
  // is identical between renders and React strict-mode double mounts. A field
  // that reshuffles on remount reads as a flicker.
  const { positions, rand } = useMemo(() => {
    const rnd = lcg(seed);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const z = -(Z_NEAR + rnd() * (Z_FAR - Z_NEAR));
      const sr = SR_MIN + rnd() * (SR_MAX - SR_MIN);
      const a = rnd() * Math.PI * 2;
      const d = Math.abs(z);
      arr[i * 3] = Math.cos(a) * sr * d * X_STRETCH;
      arr[i * 3 + 1] = Math.sin(a) * sr * d;
      arr[i * 3 + 2] = z;
    }
    return { positions: arr, rand: rnd };
  }, [count, seed]);

  useFrame((_, delta) => {
    if (reduced || !ref.current) return;
    const attr = ref.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    // Clamp delta: a backgrounded tab resumes with a huge delta, which would
    // teleport the whole field forward and recycle every star at once.
    const step = Math.min(delta, 0.05) * speed;

    for (let i = 0; i < count; i++) {
      const zi = i * 3 + 2;
      arr[zi] += step;
      if (arr[zi] > -Z_NEAR) {
        // Respawn at the far plane on a fresh spoke, keeping the centre clear.
        const sr = SR_MIN + rand() * (SR_MAX - SR_MIN);
        const a = rand() * Math.PI * 2;
        arr[i * 3] = Math.cos(a) * sr * Z_FAR * X_STRETCH;
        arr[i * 3 + 1] = Math.sin(a) * sr * Z_FAR;
        arr[zi] = -Z_FAR;
      }
    }
    attr.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={size}
        color={tint}
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToMotionPreference(onChange: () => void): () => void {
  const mq = window.matchMedia(MOTION_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeToMotionPreference,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false, // server: assume motion is fine, the client corrects on mount
  );
}

export default function StarField({ className = '' }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [tints, setTints] = useState(() => ({
    cream: new THREE.Color(FALLBACK_CREAM),
    gold: new THREE.Color(FALLBACK_GOLD),
  }));
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setTints({
      cream: readTint(el, '--retro-cream', FALLBACK_CREAM),
      gold: readTint(el, '--retro-gold', FALLBACK_GOLD),
    });
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={host} className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 0], fov: 60, near: 0.1, far: Z_FAR + 10 }}
        // 'demand' renders a single frame and stops — exactly the static field
        // reduced-motion should get, with no rAF loop left running.
        frameloop={reduced ? 'demand' : visible ? 'always' : 'never'}
        gl={{ antialias: false, alpha: true }}
      >
        <Layer count={220} speed={5.5} size={0.055} tint={tints.cream} opacity={0.9} seed={9301} reduced={reduced} />
        <Layer count={150} speed={9} size={0.075} tint={tints.cream} opacity={0.75} seed={49297} reduced={reduced} />
        <Layer count={45} speed={13} size={0.1} tint={tints.gold} opacity={0.6} seed={233280} reduced={reduced} />
      </Canvas>
    </div>
  );
}
