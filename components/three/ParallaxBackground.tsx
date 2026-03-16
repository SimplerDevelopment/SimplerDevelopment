'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh } from 'three';

export function ParallaxBackground() {
  const groupRef = useRef<any>(null);

  useFrame((state) => {
    if (groupRef.current) {
      // Subtle rotation based on mouse position
      groupRef.current.rotation.x = state.mouse.y * 0.1;
      groupRef.current.rotation.y = state.mouse.x * 0.1;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Background particles/shapes */}
      {Array.from({ length: 50 }).map((_, i) => {
        const x = (Math.random() - 0.5) * 20;
        const y = (Math.random() - 0.5) * 20;
        const z = (Math.random() - 0.5) * 20 - 10;
        const size = Math.random() * 0.3 + 0.1;

        return (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[size, 8, 8]} />
            <meshStandardMaterial
              color={i % 3 === 0 ? '#3b82f6' : i % 3 === 1 ? '#8b5cf6' : '#ec4899'}
              metalness={0.5}
              roughness={0.5}
              transparent
              opacity={0.6}
            />
          </mesh>
        );
      })}
    </group>
  );
}
