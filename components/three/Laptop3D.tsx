'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

interface Laptop3DProps {
  scale?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  floatSpeed?: number;
  floatAmplitude?: number;
}

export function Laptop3D({
  scale = 1,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  floatSpeed = 2,
  floatAmplitude = 0.3,
}: Laptop3DProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF('/3d/laptop.glb') as any;
  const [clonedScene, setClonedScene] = useState<THREE.Object3D | null>(null);
  const initialRotation = useRef(rotation);

  // Clone the scene to make it reusable
  useEffect(() => {
    if (scene) {
      const cloned = scene.clone();
      setClonedScene(cloned);
    }
  }, [scene]);

  // Floating animation (no rotation)
  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();

    // Floating motion (up and down)
    groupRef.current.position.y = position[1] + Math.sin(time * floatSpeed) * floatAmplitude;

    // Keep initial rotation, no spinning
    groupRef.current.rotation.x = initialRotation.current[0];
    groupRef.current.rotation.y = initialRotation.current[1];
    groupRef.current.rotation.z = initialRotation.current[2];
  });

  if (!clonedScene) {
    return null;
  }

  return (
    <group ref={groupRef} position={position} scale={scale}>
      <primitive object={clonedScene} />
    </group>
  );
}

useGLTF.preload('/3d/laptop.glb');
