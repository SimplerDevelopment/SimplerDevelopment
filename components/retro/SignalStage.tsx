'use client';

/**
 * Lunar backdrop for the AI Connect band.
 *
 * The ground station is flat illustration; this puts it somewhere. A WebGL
 * scene sits behind it — receding stars, a moon horizon, a distant planet —
 * and the flat art rides in front on its own layers, each moving at a
 * different rate as the band scrolls past. The depth comes from the rate
 * difference, not from the art itself, which never scales or distorts.
 *
 * WHY EVERYTHING IS UNLIT. Every material here is MeshBasic / Points with flat
 * colour. Lighting the moon with a real light and a normal-shaded sphere makes
 * a soft photographic gradient, which is exactly the "2020s 3D hero" look the
 * retro system is built to avoid — and next to hand-drawn flat illustration it
 * reads as two unrelated pieces of art. Flat fills plus one gold rim line keep
 * the backdrop in the same visual language as the foreground.
 *
 * Layer order, front to back:
 *   z-20  radio tower, astronaut   (nearest, moves most)
 *   z-10  dish, probe              (mid)
 *   z-0   WebGL: stars → planet → moon horizon
 *
 * Performance, because this is the page's second WebGL context (the hero
 * starfield is the first):
 *   - dpr capped at 1.5
 *   - frameloop stops entirely when the band is off screen
 *   - prefers-reduced-motion renders ONE frame and never starts the loop, and
 *     the parallax transforms are not applied at all
 *   - scroll work happens in a rAF-throttled handler writing to refs, so it
 *     never triggers a React render
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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
    () => false,
  );
}

function token(host: HTMLElement | null, name: string, fallback: string): string {
  if (typeof window === 'undefined' || !host) return fallback;
  return getComputedStyle(host).getPropertyValue(name).trim() || fallback;
}

/** Shared scroll progress (0 → 1 as the band crosses the viewport). */
type Progress = { current: number; pointerX: number; pointerY: number };

// ─── Scene pieces ───────────────────────────────────────────────────────────

function Stars({ colors, progress, reduced }: { colors: { cream: string; gold: string }; progress: React.RefObject<Progress>; reduced: boolean }) {
  const near = useRef<THREE.Points>(null);
  const far = useRef<THREE.Points>(null);

  // Seeded so the field is identical across mounts — a backdrop that reshuffles
  // on remount reads as a flicker.
  const make = (count: number, spread: number, depth: number, seed: number) => {
    const rnd = lcg(seed);
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (rnd() - 0.5) * spread;
      // biased upward: stars belong in the sky, not buried in the regolith
      a[i * 3 + 1] = rnd() * spread * 0.42 - 1;
      a[i * 3 + 2] = -depth - rnd() * 10;
    }
    return a;
  };

  const farPts = useMemo(() => make(260, 90, 34, 9301), []);
  const nearPts = useMemo(() => make(90, 60, 16, 49297), []);

  useFrame(() => {
    if (reduced) return;
    const p = progress.current?.current ?? 0;
    // Opposite-signed drift: the two fields separate as the band scrolls, which
    // is what actually sells distance between them.
    if (far.current) far.current.position.y = p * 1.6;
    if (near.current) near.current.position.y = p * 3.4;
  });

  return (
    <>
      <points ref={far}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[farPts, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.09} color={colors.cream} transparent opacity={0.75} sizeAttenuation depthWrite={false} />
      </points>
      <points ref={near}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[nearPts, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.14} color={colors.gold} transparent opacity={0.55} sizeAttenuation depthWrite={false} />
      </points>
    </>
  );
}

/** Distant planet — flat disc plus a thin terminator arc, not a lit sphere. */
function Planet({ colors, progress, reduced }: { colors: { mid: string; gold: string }; progress: React.RefObject<Progress>; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!g.current) return;
    const p = reduced ? 0 : progress.current?.current ?? 0;
    g.current.position.y = 5.4 + p * 2.2;
    g.current.rotation.z = reduced ? 0 : state.clock.elapsedTime * 0.02;
  });
  return (
    <group ref={g} position={[6.4, 5.4, -26]}>
      <mesh>
        <circleGeometry args={[2.1, 48]} />
        <meshBasicMaterial color={colors.mid} transparent opacity={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.01]}>
        <ringGeometry args={[2.1, 2.16, 48]} />
        <meshBasicMaterial color={colors.gold} transparent opacity={0.55} />
      </mesh>
      {/* off-centre inner disc reads as a lit limb without any actual lighting */}
      <mesh position={[0.5, 0.25, 0.02]}>
        <circleGeometry args={[1.5, 40]} />
        <meshBasicMaterial color={colors.gold} transparent opacity={0.09} />
      </mesh>
    </group>
  );
}

/**
 * Moon horizon. A big sphere pushed mostly below the frame so only its curve
 * shows — cheaper and more convincing than a displaced ground plane, and the
 * curvature is what says "small world" rather than "floor".
 */
function Moon({ colors, progress, reduced }: { colors: { deep: string; gold: string; mid: string }; progress: React.RefObject<Progress>; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!g.current) return;
    const p = reduced ? 0 : progress.current?.current ?? 0;
    // Rises slightly as the band scrolls — the horizon dropping away underfoot.
    g.current.position.y = -35 + p * 1.1;
  });

  // Craters scattered along the visible arc only; anything below the frame is
  // wasted geometry.
  const craters = useMemo(() => {
    const rnd = lcg(12345);
    return Array.from({ length: 14 }, () => {
      const a = (rnd() - 0.5) * 1.35;        // around the top of the disc
      const r = 23.5 + rnd() * 5.6;           // INSIDE the rim, never on it
      return {
        x: Math.sin(a) * r,
        y: Math.cos(a) * r,
        s: 0.45 + rnd() * 1.5,
        o: 0.1 + rnd() * 0.14,
      };
    });
  }, []);

  return (
    <group ref={g} position={[0, -35, -14]}>
      <mesh>
        <circleGeometry args={[30, 96]} />
        <meshBasicMaterial color={colors.deep} />
      </mesh>
      {/* rim light along the horizon — the one bright line in the backdrop */}
      <mesh position={[0, 0, 0.02]}>
        <ringGeometry args={[30, 30.09, 96]} />
        <meshBasicMaterial color={colors.gold} transparent opacity={0.5} />
      </mesh>
      {craters.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, 0.03]}>
          <circleGeometry args={[c.s, 24]} />
          <meshBasicMaterial color={colors.mid} transparent opacity={c.o} />
        </mesh>
      ))}
    </group>
  );
}

/** Camera drifts with scroll + pointer — the parallax that ties it together. */
function Rig({ progress, reduced }: { progress: React.RefObject<Progress>; reduced: boolean }) {
  const { camera } = useThree();
  useFrame(() => {
    if (reduced) return;
    const p = progress.current;
    if (!p) return;
    camera.position.x += (p.pointerX * 0.9 - camera.position.x) * 0.05;
    camera.position.y += (1.2 - p.current * 2.4 + p.pointerY * 0.5 - camera.position.y) * 0.05;
    camera.lookAt(0, 0.5, -20);
  });
  return null;
}

// ─── Stage ──────────────────────────────────────────────────────────────────

/** Per-image parallax depth. Nearer things move more. */
const ART = [
  { src: 'satellite', w: 789, h: 743, cls: 'absolute right-[24%] top-0 w-[34%] opacity-90', depth: 10, z: 'z-10' },
  { src: 'satellite-dish', w: 803, h: 800, cls: 'absolute bottom-[4%] left-0 w-[56%]', depth: 16, z: 'z-10' },
  { src: 'astronaut-pointing', w: 900, h: 875, cls: 'absolute bottom-[2%] left-[44%] w-[40%]', depth: 26, z: 'z-20' },
  { src: 'radio-tower', w: 491, h: 900, cls: 'absolute bottom-0 right-[8%] w-[26%]', depth: 34, z: 'z-20' },
] as const;

export default function SignalStage({ className = '' }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const artRefs = useRef<(HTMLDivElement | null)[]>([]);
  const progress = useRef<Progress>({ current: 0, pointerX: 0, pointerY: 0 });
  const [visible, setVisible] = useState(false);
  const [colors, setColors] = useState({
    cream: '#F6F4F0', gold: '#D8B15A', mid: '#3D4558', deep: '#171B27',
  });
  const reduced = usePrefersReducedMotion();

  const setArtRef = useCallback((i: number) => (el: HTMLDivElement | null) => { artRefs.current[i] = el; }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    setColors({
      cream: token(el, '--retro-cream', '#F6F4F0'),
      gold: token(el, '--retro-gold', '#D8B15A'),
      mid: token(el, '--retro-mid', '#3D4558'),
      deep: token(el, '--retro-deep', '#171B27'),
    });

    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '200px' });
    io.observe(el);
    if (reduced) return () => io.disconnect();

    let ticking = false;
    const measure = () => {
      ticking = false;
      const r = el.getBoundingClientRect();
      // 0 as the band enters from below, 1 as it leaves past the top.
      const p = 1 - (r.bottom / (window.innerHeight + r.height));
      progress.current.current = Math.max(0, Math.min(1, p)) * 2 - 1;
      for (let i = 0; i < ART.length; i++) {
        const node = artRefs.current[i];
        if (node) node.style.transform = `translate3d(0, ${(progress.current.current * ART[i].depth).toFixed(1)}px, 0)`;
      }
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(measure); } };
    const onPointer = (e: PointerEvent) => {
      progress.current.pointerX = (e.clientX / window.innerWidth - 0.5) * 2;
      progress.current.pointerY = (e.clientY / window.innerHeight - 0.5) * -2;
    };

    measure();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll, { passive: true });
    addEventListener('pointermove', onPointer, { passive: true });
    return () => {
      io.disconnect();
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
      removeEventListener('pointermove', onPointer);
    };
  }, [reduced]);

  return (
    <div ref={host} className={`relative ${className}`} aria-hidden>
      {/* The WebGL backdrop is deliberately larger than the art stage and bleeds
          left, so the horizon reads as continuing under the copy rather than
          stopping in a box. */}
      <div className="pointer-events-none absolute inset-y-0 -left-[60%] right-0 z-0 lg:-left-[110%]">
        <Canvas
          dpr={[1, 1.5]}
          camera={{ position: [0, 1.2, 0], fov: 55, near: 0.1, far: 120 }}
          frameloop={reduced ? 'demand' : visible ? 'always' : 'never'}
          gl={{ antialias: false, alpha: true }}
        >
          <Stars colors={colors} progress={progress} reduced={reduced} />
          <Planet colors={colors} progress={progress} reduced={reduced} />
          <Moon colors={colors} progress={progress} reduced={reduced} />
          <Rig progress={progress} reduced={reduced} />
        </Canvas>
      </div>

      {ART.map((a, i) => (
        <div key={a.src} ref={setArtRef(i)} className={`${a.cls} ${a.z} will-change-transform`}>
          <Image src={`/retro/${a.src}.webp`} alt="" width={a.w} height={a.h} className="h-auto w-full" />
        </div>
      ))}
    </div>
  );
}
