'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';

// Pixel art alien shapes for Space Invaders style
function SpaceInvader({ position, delay }: { position: [number, number, number]; delay: number }) {
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.getElapsedTime();

    // Bobbing motion like classic Space Invaders
    meshRef.current.position.y = position[1] + Math.sin(time * 2 + delay) * 0.1;

    // Slow horizontal movement
    meshRef.current.position.x = position[0] + Math.sin(time * 0.5 + delay) * 0.3;

    // Pulsing glow
    meshRef.current.children.forEach((child) => {
      if (child instanceof THREE.Mesh) {
        const material = child.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = 0.3 + Math.sin(time * 3 + delay) * 0.2;
      }
    });
  });

  // Create pixel-art style invader using boxes
  return (
    <group ref={meshRef} position={position}>
      {/* Classic invader shape - top row */}
      <mesh position={[-0.15, 0.15, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.15, 0.15, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>

      {/* Eyes */}
      <mesh position={[-0.1, 0.05, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.1, 0.05, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>

      {/* Body - middle */}
      <mesh position={[-0.15, 0, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[-0.05, 0, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.05, 0, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.15, 0, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>

      {/* Arms */}
      <mesh position={[-0.2, -0.05, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.2, -0.05, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>

      {/* Legs */}
      <mesh position={[-0.1, -0.15, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.1, -0.15, 0]}>
        <boxGeometry args={[0.05, 0.05, 0.05]} />
        <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.3} />
      </mesh>
    </group>
  );
}

function InvaderGrid() {
  const invaders = useMemo(() => {
    const items: { position: [number, number, number]; delay: number }[] = [];
    const rows = 3;
    const cols = 5;
    const spacingX = 1.5;
    const spacingY = 1.2;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * spacingX - (cols * spacingX) / 2;
        const y = row * spacingY - (rows * spacingY) / 2 + 1;
        const z = -5;

        items.push({
          position: [x, y, z],
          delay: (row + col) * 0.3,
        });
      }
    }

    return items;
  }, []);

  return (
    <>
      {invaders.map((invader, i) => (
        <SpaceInvader key={i} position={invader.position} delay={invader.delay} />
      ))}
    </>
  );
}

function Stars() {
  const starsRef = useRef<THREE.Points>(null);

  const starPositions = useMemo(() => {
    const count = 200;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20 - 10;
    }

    return positions;
  }, []);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    return geo;
  }, [starPositions]);

  useFrame((state) => {
    if (!starsRef.current) return;

    const time = state.clock.getElapsedTime();

    // Twinkling effect
    const positions = starsRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const idx = i / 3;
      // Slowly move stars down like Space Invaders background
      positions[i + 1] -= 0.005;

      // Wrap around
      if (positions[i + 1] < -10) {
        positions[i + 1] = 10;
      }
    }
    starsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={starsRef} geometry={geometry}>
      <pointsMaterial
        size={0.05}
        color="#ffffff"
        transparent
        opacity={0.8}
        sizeAttenuation
      />
    </points>
  );
}

function Barriers() {
  const barriers = useMemo(() => {
    return Array.from({ length: 3 }, (_, i) => {
      const x = (i - 1) * 4;
      return { position: [x, -3, -3] as [number, number, number] };
    });
  }, []);

  return (
    <>
      {barriers.map((barrier, i) => (
        <group key={i} position={barrier.position}>
          {/* Pixelated barrier shape */}
          {Array.from({ length: 5 }, (_, j) => (
            <mesh key={j} position={[j * 0.1 - 0.2, 0, 0]}>
              <boxGeometry args={[0.08, 0.3, 0.08]} />
              <meshStandardMaterial
                color="#00ffff"
                emissive="#00ffff"
                emissiveIntensity={0.2}
                transparent
                opacity={0.6}
              />
            </mesh>
          ))}
        </group>
      ))}
    </>
  );
}

function LaserBeams() {
  const laserRef = useRef<THREE.Group>(null);

  const lasers = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => ({
      x: (Math.random() - 0.5) * 15,
      speed: 0.05 + Math.random() * 0.05,
      delay: i * 0.5,
    }));
  }, []);

  useFrame((state) => {
    if (!laserRef.current) return;

    const time = state.clock.getElapsedTime();

    laserRef.current.children.forEach((laser, i) => {
      const laserData = lasers[i];
      laser.position.y = -5 + ((time * laserData.speed + laserData.delay) % 10);
    });
  });

  return (
    <group ref={laserRef}>
      {lasers.map((laser, i) => (
        <mesh key={i} position={[laser.x, -5, -4]}>
          <boxGeometry args={[0.05, 0.3, 0.05]} />
          <meshStandardMaterial
            color="#ff0000"
            emissive="#ff0000"
            emissiveIntensity={0.8}
          />
        </mesh>
      ))}
    </group>
  );
}

export function ServicesBackground() {
  return (
    <div className="absolute inset-0 -z-10 bg-black">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 75 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          {/* Retro arcade lighting */}
          <ambientLight intensity={0.3} />
          <pointLight position={[0, 0, 5]} intensity={0.5} color="#00ff00" />
          <pointLight position={[5, 5, 5]} intensity={0.3} color="#ff0000" />

          {/* Space Invaders elements */}
          <Stars />
          <InvaderGrid />
          <Barriers />
          <LaserBeams />
        </Suspense>
      </Canvas>

      {/* Scanline effect overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 0, 0.1) 2px, rgba(0, 255, 0, 0.1) 4px)',
        }}
      />
    </div>
  );
}
