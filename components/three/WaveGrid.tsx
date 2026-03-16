'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function WaveGrid() {
  const meshRef = useRef<THREE.Mesh>(null);

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(20, 20, 50, 50);
    return geo;
  }, []);

  useFrame((state) => {
    if (!meshRef.current) return;

    const time = state.clock.getElapsedTime();
    const positions = meshRef.current.geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);

      // Create wave pattern
      const wave1 = Math.sin(x * 0.5 + time) * 0.3;
      const wave2 = Math.sin(y * 0.5 + time * 1.5) * 0.3;
      const wave3 = Math.sin((x + y) * 0.3 + time * 0.5) * 0.2;

      // Mouse interaction
      const dx = x - state.mouse.x * 10;
      const dy = y - state.mouse.y * 10;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const mouseWave = dist < 5 ? Math.sin(dist * 2 - time * 3) * (5 - dist) * 0.2 : 0;

      const z = wave1 + wave2 + wave3 + mouseWave;
      positions.setZ(i, z);
    }

    positions.needsUpdate = true;

    // Rotate the grid
    meshRef.current.rotation.z = time * 0.05;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      rotation={[-Math.PI / 3, 0, 0]}
      position={[0, -3, -5]}
    >
      <meshStandardMaterial
        color="#3b82f6"
        wireframe
        transparent
        opacity={0.4}
        emissive="#3b82f6"
        emissiveIntensity={0.2}
      />
    </mesh>
  );
}
