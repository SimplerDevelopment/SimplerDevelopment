'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Mesh } from 'three';

export function FloatingElements() {
  const boxRef = useRef<Mesh>(null);
  const sphereRef = useRef<Mesh>(null);
  const torusRef = useRef<Mesh>(null);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    if (boxRef.current) {
      boxRef.current.rotation.x = time * 0.5;
      boxRef.current.rotation.y = time * 0.3;
      boxRef.current.position.y = Math.sin(time) * 0.5;
    }

    if (sphereRef.current) {
      sphereRef.current.rotation.y = time * 0.4;
      sphereRef.current.position.y = Math.cos(time * 0.8) * 0.5;
    }

    if (torusRef.current) {
      torusRef.current.rotation.x = time * 0.6;
      torusRef.current.rotation.z = time * 0.2;
      torusRef.current.position.y = Math.sin(time * 1.2) * 0.3;
    }
  });

  return (
    <group>
      {/* Box */}
      <mesh ref={boxRef} position={[-2, 0, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#3b82f6" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Sphere */}
      <mesh ref={sphereRef} position={[2, 0, 0]}>
        <sphereGeometry args={[0.7, 32, 32]} />
        <meshStandardMaterial color="#8b5cf6" metalness={0.5} roughness={0.3} />
      </mesh>

      {/* Torus */}
      <mesh ref={torusRef} position={[0, 0, -1]}>
        <torusGeometry args={[0.6, 0.2, 16, 100]} />
        <meshStandardMaterial color="#ec4899" metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}
