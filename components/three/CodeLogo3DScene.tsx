'use client';

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 3D recreation of `public/iconLogo.png`: the `</>` code glyph + sparkles are
 * authored as a flat SVG (mirrored in `public/iconLogo3d.svg`), then extruded
 * into a solid with depth and floated as a Three.js object.
 *
 * The whole thing renders in a single colour passed down from the theme —
 * white in dark mode, black in light mode. The SVG markup is inlined and parsed
 * synchronously (no network fetch / Suspense), so the geometry is ready on the
 * first render.
 */

// Keep in sync with public/iconLogo3d.svg (generated together).
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 100">
  <path d="M53.53,29.53 L33.05,50.00 L53.53,70.47 L58.47,65.53 L42.95,50.00 L58.47,34.47 Z" fill="#000000"/>
  <path d="M56.30,71.16 L70.30,31.16 L63.70,28.84 L49.70,68.84 Z" fill="#000000"/>
  <path d="M61.53,34.47 L77.05,50.00 L61.53,65.53 L66.47,70.47 L86.95,50.00 L66.47,29.53 Z" fill="#000000"/>
  <path d="M101.00,7.00 L103.12,16.88 L113.00,19.00 L103.12,21.12 L101.00,31.00 L98.88,21.12 L89.00,19.00 L98.88,16.88 Z" fill="#000000"/>
  <path d="M88.00,27.00 L88.71,30.29 L92.00,31.00 L88.71,31.71 L88.00,35.00 L87.29,31.71 L84.00,31.00 L87.29,30.29 Z" fill="#000000"/>
  <path d="M21.00,12.50 L22.20,17.80 L27.50,19.00 L22.20,20.20 L21.00,25.50 L19.80,20.20 L14.50,19.00 L19.80,17.80 Z" fill="#000000"/>
  <path d="M97.00,70.50 L97.85,74.15 L101.50,75.00 L97.85,75.85 L97.00,79.50 L96.15,75.85 L92.50,75.00 L96.15,74.15 Z" fill="#000000"/>
</svg>`;

const EXTRUDE = {
  depth: 9,
  bevelEnabled: true,
  bevelThickness: 1.4,
  bevelSize: 0.9,
  bevelSegments: 2,
};

function useLogoGeometry() {
  return useMemo(() => {
    const { paths } = new SVGLoader().parse(LOGO_SVG);
    const geometries: THREE.ExtrudeGeometry[] = [];
    for (const path of paths) {
      for (const shape of SVGLoader.createShapes(path)) {
        geometries.push(new THREE.ExtrudeGeometry(shape, EXTRUDE));
      }
    }

    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());

    // SVG space is y-down; flip into Three's y-up, then centre on the origin.
    merged.scale(1, -1, 1);
    merged.computeBoundingBox();
    merged.center();

    // Normalise so the glyph is a consistent on-screen size.
    const size = new THREE.Vector3();
    merged.boundingBox!.getSize(size);
    const target = 5; // world units across the widest axis
    merged.scale(target / size.x, target / size.x, target / size.x);

    return merged;
  }, []);
}

function ExtrudedLogo({ color }: { color: string }) {
  const groupRef = useRef<THREE.Group>(null);
  const geometry = useLogoGeometry();

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    // Idle drift + gentle mouse parallax.
    const targetY = state.mouse.x * 0.35 + Math.sin(t * 0.4) * 0.12;
    const targetX = -state.mouse.y * 0.25 + Math.sin(t * 0.5) * 0.06;
    groupRef.current.rotation.y += (targetY - groupRef.current.rotation.y) * 0.05;
    groupRef.current.rotation.x += (targetX - groupRef.current.rotation.x) * 0.05;
  });

  return (
    <Float speed={1.6} rotationIntensity={0.25} floatIntensity={0.6}>
      <group ref={groupRef}>
        <mesh geometry={geometry}>
          <meshStandardMaterial color={color} metalness={0.25} roughness={0.45} />
        </mesh>
      </group>
    </Float>
  );
}

export function CodeLogo3DScene({ className, color }: { className?: string; color: string }) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 7], fov: 45 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 6, 8]} intensity={1.5} color="#ffffff" />
        <directionalLight position={[-6, -3, 4]} intensity={0.6} color="#ffffff" />
        <pointLight position={[6, 3, -4]} intensity={0.5} color="#ffffff" />
        <ExtrudedLogo color={color} />
      </Canvas>
    </div>
  );
}
