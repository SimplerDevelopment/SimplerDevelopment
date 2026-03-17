'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';

const NODE_COUNT = 80;
const CONNECTION_DISTANCE = 3.5;
const MOUSE_RADIUS = 4;

function ParticleNetwork() {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const smoothMouse = useRef(new THREE.Vector2(0, 0));
  const { viewport } = useThree();

  // Generate initial node positions in a flat spread
  const { positions, velocities, basePositions } = useMemo(() => {
    const pos = new Float32Array(NODE_COUNT * 3);
    const vel = new Float32Array(NODE_COUNT * 3);
    const base = new Float32Array(NODE_COUNT * 3);
    const spreadX = 14;
    const spreadY = 8;

    for (let i = 0; i < NODE_COUNT; i++) {
      const i3 = i * 3;
      const x = (Math.random() - 0.5) * spreadX;
      const y = (Math.random() - 0.5) * spreadY;
      const z = (Math.random() - 0.5) * 4;

      pos[i3] = x;
      pos[i3 + 1] = y;
      pos[i3 + 2] = z;

      base[i3] = x;
      base[i3 + 1] = y;
      base[i3 + 2] = z;

      // Slow drift velocities
      vel[i3] = (Math.random() - 0.5) * 0.005;
      vel[i3 + 1] = (Math.random() - 0.5) * 0.005;
      vel[i3 + 2] = (Math.random() - 0.5) * 0.003;
    }

    return { positions: pos, velocities: vel, basePositions: base };
  }, []);

  // Node colors — warm blue/cyan gradient
  const colors = useMemo(() => {
    const cols = new Float32Array(NODE_COUNT * 3);
    const colorA = new THREE.Color('#3b82f6');
    const colorB = new THREE.Color('#06b6d4');
    const colorC = new THREE.Color('#f59e0b');

    for (let i = 0; i < NODE_COUNT; i++) {
      const i3 = i * 3;
      const t = Math.random();
      let color: THREE.Color;
      if (t < 0.5) {
        color = colorA.clone().lerp(colorB, t * 2);
      } else if (t < 0.9) {
        color = colorB.clone().lerp(colorA, (t - 0.5) * 2.5);
      } else {
        // A few amber accent nodes
        color = colorC.clone();
      }
      cols[i3] = color.r;
      cols[i3 + 1] = color.g;
      cols[i3 + 2] = color.b;
    }
    return cols;
  }, []);

  // Node sizes — varied
  const sizes = useMemo(() => {
    const s = new Float32Array(NODE_COUNT);
    for (let i = 0; i < NODE_COUNT; i++) {
      s[i] = Math.random() * 0.06 + 0.02;
    }
    return s;
  }, []);

  // Pre-allocate line geometry (max possible connections)
  const maxLines = NODE_COUNT * (NODE_COUNT - 1) / 2;
  const linePositions = useMemo(() => new Float32Array(maxLines * 6), [maxLines]);
  const lineColors = useMemo(() => new Float32Array(maxLines * 6), [maxLines]);

  const lineGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3));
    geo.setDrawRange(0, 0);
    return geo;
  }, [linePositions, lineColors]);

  useFrame((state) => {
    if (!pointsRef.current || !linesRef.current) return;

    const time = state.clock.getElapsedTime();
    const pos = pointsRef.current.geometry.attributes.position.array as Float32Array;

    // Smooth mouse tracking — map pointer to world coords
    const targetX = state.pointer.x * viewport.width * 0.5;
    const targetY = state.pointer.y * viewport.height * 0.5;
    smoothMouse.current.x += (targetX - smoothMouse.current.x) * 0.08;
    smoothMouse.current.y += (targetY - smoothMouse.current.y) * 0.08;

    // Update node positions
    for (let i = 0; i < NODE_COUNT; i++) {
      const i3 = i * 3;

      // Gentle drift
      pos[i3] += velocities[i3];
      pos[i3 + 1] += velocities[i3 + 1];
      pos[i3 + 2] += velocities[i3 + 2];

      // Organic float
      pos[i3] += Math.sin(time * 0.3 + i * 0.7) * 0.003;
      pos[i3 + 1] += Math.cos(time * 0.4 + i * 0.5) * 0.003;

      // Soft return to base position
      pos[i3] += (basePositions[i3] - pos[i3]) * 0.002;
      pos[i3 + 1] += (basePositions[i3 + 1] - pos[i3 + 1]) * 0.002;
      pos[i3 + 2] += (basePositions[i3 + 2] - pos[i3 + 2]) * 0.002;

      // Mouse repulsion — push nodes gently away
      const dx = pos[i3] - smoothMouse.current.x;
      const dy = pos[i3 + 1] - smoothMouse.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < MOUSE_RADIUS && dist > 0.01) {
        const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS * 0.04;
        pos[i3] += (dx / dist) * force;
        pos[i3 + 1] += (dy / dist) * force;
      }
    }

    pointsRef.current.geometry.attributes.position.needsUpdate = true;

    // Build connections between nearby nodes
    let lineIndex = 0;
    const lp = linePositions;
    const lc = lineColors;

    for (let i = 0; i < NODE_COUNT; i++) {
      const i3 = i * 3;
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const j3 = j * 3;
        const dx = pos[i3] - pos[j3];
        const dy = pos[i3 + 1] - pos[j3 + 1];
        const dz = pos[i3 + 2] - pos[j3 + 2];
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < CONNECTION_DISTANCE * CONNECTION_DISTANCE) {
          const li = lineIndex * 6;
          lp[li] = pos[i3];
          lp[li + 1] = pos[i3 + 1];
          lp[li + 2] = pos[i3 + 2];
          lp[li + 3] = pos[j3];
          lp[li + 4] = pos[j3 + 1];
          lp[li + 5] = pos[j3 + 2];

          // Fade line based on distance
          const dist = Math.sqrt(distSq);
          const alpha = 1 - dist / CONNECTION_DISTANCE;
          const brightness = 0.3 + alpha * 0.4;

          // Blue-ish line color
          lc[li] = 0.23 * brightness;
          lc[li + 1] = 0.51 * brightness;
          lc[li + 2] = 0.96 * brightness;
          lc[li + 3] = 0.23 * brightness;
          lc[li + 4] = 0.51 * brightness;
          lc[li + 5] = 0.96 * brightness;

          lineIndex++;
        }
      }
    }

    lineGeometry.setDrawRange(0, lineIndex * 2);
    lineGeometry.attributes.position.needsUpdate = true;
    lineGeometry.attributes.color.needsUpdate = true;
  });

  const pointsGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [positions, colors]);

  return (
    <>
      <points ref={pointsRef} geometry={pointsGeometry}>
        <pointsMaterial
          size={0.08}
          vertexColors
          transparent
          opacity={0.9}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      <lineSegments ref={linesRef} geometry={lineGeometry}>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.25}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>
    </>
  );
}

// Floating orbs — a few larger glowing spheres for depth
function FloatingOrbs() {
  const groupRef = useRef<THREE.Group>(null);

  const orbs = useMemo(() => {
    return [
      { pos: [5, 2, -2] as [number, number, number], size: 0.4, color: '#3b82f6', speed: 0.3 },
      { pos: [-4, -1, -3] as [number, number, number], size: 0.3, color: '#06b6d4', speed: 0.4 },
      { pos: [2, -3, -1] as [number, number, number], size: 0.25, color: '#f59e0b', speed: 0.5 },
      { pos: [-6, 3, -4] as [number, number, number], size: 0.35, color: '#3b82f6', speed: 0.25 },
      { pos: [7, -2, -2] as [number, number, number], size: 0.2, color: '#10b981', speed: 0.35 },
    ];
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.getElapsedTime();

    groupRef.current.children.forEach((child, i) => {
      const orb = orbs[i];
      const mesh = child as THREE.Mesh;
      mesh.position.x = orb.pos[0] + Math.sin(time * orb.speed + i) * 0.5;
      mesh.position.y = orb.pos[1] + Math.cos(time * orb.speed * 0.7 + i * 2) * 0.4;
      mesh.position.z = orb.pos[2] + Math.sin(time * orb.speed * 0.5 + i * 3) * 0.3;
    });
  });

  return (
    <group ref={groupRef}>
      {orbs.map((orb, i) => (
        <mesh key={i} position={orb.pos}>
          <sphereGeometry args={[orb.size, 16, 16]} />
          <meshStandardMaterial
            color={orb.color}
            emissive={orb.color}
            emissiveIntensity={0.6}
            transparent
            opacity={0.15}
            roughness={0.8}
          />
        </mesh>
      ))}
    </group>
  );
}

export function HeroParticleNetwork({ className = 'h-screen w-full' }: { className?: string }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(window.innerWidth < 768);
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        style={{ width: '100%', height: '100%' }}
        dpr={[1, 1.5]}
        performance={{ min: 0.5 }}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
      >
        <Suspense fallback={null}>
          <ambientLight intensity={0.3} />
          <pointLight position={[10, 5, 10]} intensity={0.8} color="#ffffff" />

          <ParticleNetwork />
          {!isMobile && <FloatingOrbs />}
        </Suspense>
      </Canvas>
    </div>
  );
}
