'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface Crystal {
  position: [number, number, number];
  scale: number;
  rotationSpeed: [number, number, number];
  color: THREE.Color;
}

export function FloatingCrystals() {
  const groupRef = useRef<THREE.Group>(null);

  const crystals: Crystal[] = [
    {
      position: [-4, 2, -2],
      scale: 0.8,
      rotationSpeed: [0.01, 0.02, 0.015],
      color: new THREE.Color('#3b82f6'),
    },
    {
      position: [4, -1, -3],
      scale: 1.2,
      rotationSpeed: [0.015, 0.01, 0.02],
      color: new THREE.Color('#8b5cf6'),
    },
    {
      position: [-3, -2, 1],
      scale: 0.6,
      rotationSpeed: [0.02, 0.015, 0.01],
      color: new THREE.Color('#ec4899'),
    },
    {
      position: [3, 3, 0],
      scale: 1,
      rotationSpeed: [0.01, 0.025, 0.02],
      color: new THREE.Color('#06b6d4'),
    },
  ];

  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();

    groupRef.current.children.forEach((child, i) => {
      const mesh = child as THREE.Mesh;
      const crystal = crystals[i];

      // Rotation
      mesh.rotation.x += crystal.rotationSpeed[0];
      mesh.rotation.y += crystal.rotationSpeed[1];
      mesh.rotation.z += crystal.rotationSpeed[2];

      // Floating animation
      mesh.position.y = crystal.position[1] + Math.sin(time + i) * 0.3;

      // Gentle horizontal movement
      mesh.position.x = crystal.position[0] + Math.cos(time * 0.5 + i) * 0.2;

      // Mouse interaction - tilt based on mouse position
      const targetRotationX = state.mouse.y * 0.5;
      const targetRotationY = state.mouse.x * 0.5;
      mesh.rotation.x += (targetRotationX - mesh.rotation.x) * 0.02;
      mesh.rotation.y += (targetRotationY - mesh.rotation.y) * 0.02;
    });
  });

  return (
    <group ref={groupRef}>
      {crystals.map((crystal, i) => (
        <mesh key={i} position={crystal.position} scale={crystal.scale}>
          <octahedronGeometry args={[1, 0]} />
          <meshStandardMaterial
            color={crystal.color}
            emissive={crystal.color}
            emissiveIntensity={0.3}
            metalness={0.9}
            roughness={0.1}
            transparent
            opacity={0.9}
          />
        </mesh>
      ))}
    </group>
  );
}
