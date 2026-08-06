'use client';

/**
 * Drifting starfield behind the retro hero.
 *
 * Deliberately small in scope. The design's period read comes from flat
 * illustration, not from 3D — so this stays a slow parallax backdrop rather
 * than anything that competes with the artwork in front of it. Three layers at
 * different depths and speeds are enough to give the hero life; more reads as a
 * screensaver.
 *
 * Performance rules this obeys, because it renders behind the first thing a
 * visitor sees:
 *   - dpr capped at 1.5 (retina at full dpr triples fragment cost for a field
 *     of 1px points nobody can see the extra resolution on)
 *   - frameloop pauses when the hero scrolls out of view (IntersectionObserver)
 *   - honours prefers-reduced-motion by rendering ONE static frame — the stars
 *     still appear, they just stop moving. Removing them entirely would leave a
 *     flat void where the design expects a night sky.
 *
 * Callers should lazy-load this with `next/dynamic({ ssr: false })`; there is
 * no server-rendered fallback for a WebGL canvas.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const CREAM = new THREE.Color('#F4E9CF');
const GOLD = new THREE.Color('#E1B24A');

function Layer({ count, depth, speed, size, tint }: { count: number; depth: number; speed: number; size: number; tint: THREE.Color }) {
  const ref = useRef<THREE.Points>(null);
  const reduced = usePrefersReducedMotion();

  // Deterministic scatter: a seeded LCG rather than Math.random() so the field
  // is identical between server-adjacent renders and React strict-mode double
  // mounts. A field that reshuffles on remount reads as a flicker.
  const positions = useMemo(() => {
    let seed = count * 9301 + depth * 49297;
    const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (rand() - 0.5) * 24;
      arr[i * 3 + 1] = (rand() - 0.5) * 12;
      arr[i * 3 + 2] = -depth;
    }
    return arr;
  }, [count, depth]);

  useFrame((_, delta) => {
    if (reduced || !ref.current) return;
    // Wrap rather than reset so there is no visible seam when a star recycles.
    ref.current.position.x -= delta * speed;
    if (ref.current.position.x < -12) ref.current.position.x += 12;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={size} color={tint} transparent opacity={0.9} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/**
 * `useSyncExternalStore` rather than useState+useEffect: a media query IS an
 * external store, and reading it into state inside an effect causes the
 * cascading render React now warns about. This also gives the correct SSR
 * value (false) without a flash.
 */
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
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={host} className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        camera={{ position: [0, 0, 6], fov: 60 }}
        // 'demand' renders a single frame and stops — exactly the static field
        // reduced-motion should get, with no rAF loop left running.
        frameloop={reduced ? 'demand' : visible ? 'always' : 'never'}
        gl={{ antialias: false, alpha: true }}
      >
        <Layer count={180} depth={8} speed={0.06} size={0.055} tint={CREAM} />
        <Layer count={110} depth={5} speed={0.13} size={0.075} tint={CREAM} />
        <Layer count={36} depth={3} speed={0.22} size={0.11} tint={GOLD} />
      </Canvas>
    </div>
  );
}
