'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function InteractiveParticles() {
  const particlesRef = useRef<THREE.Points>(null);
  const mousePosition = useRef({ x: 0, y: 0 });

  // Create particle positions
  const particles = useMemo(() => {
    const count = 200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;

      // Random positions in a sphere - smaller radius to surround the cluster
      const radius = 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i3 + 2] = radius * Math.cos(phi);

      // Rainbow colors
      const hue = Math.random();
      const color = new THREE.Color().setHSL(hue, 0.8, 0.6);
      colors[i3] = color.r;
      colors[i3 + 1] = color.g;
      colors[i3 + 2] = color.b;
    }

    return { positions, colors };
  }, []);

  useFrame((state) => {
    if (!particlesRef.current) return;

    const time = state.clock.getElapsedTime();
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;

    // Update mouse position smoothly
    mousePosition.current.x += (state.mouse.x * 5 - mousePosition.current.x) * 0.05;
    mousePosition.current.y += (state.mouse.y * 5 - mousePosition.current.y) * 0.05;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      // Distance from mouse (in 2D)
      const dx = x - mousePosition.current.x;
      const dy = y - mousePosition.current.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Push particles away from mouse
      if (dist < 3) {
        const force = (3 - dist) / 3;
        positions[i] += dx * force * 0.1;
        positions[i + 1] += dy * force * 0.1;
      }

      // Gentle wave motion
      positions[i + 1] += Math.sin(time + x * 0.3) * 0.002;
      positions[i + 2] += Math.cos(time + y * 0.3) * 0.002;

      // Slowly return to original position
      const originalRadius = 8;
      const currentRadius = Math.sqrt(x * x + y * y + z * z);
      if (currentRadius > originalRadius * 1.2 || currentRadius < originalRadius * 0.8) {
        positions[i] *= 0.99;
        positions[i + 1] *= 0.99;
        positions[i + 2] *= 0.99;
      }
    }

    particlesRef.current.geometry.attributes.position.needsUpdate = true;

    // Rotate the whole system
    particlesRef.current.rotation.y = time * 0.05;
  });

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(particles.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(particles.colors, 3));
    return geo;
  }, [particles]);

  return (
    <points ref={particlesRef} geometry={geometry}>
      <pointsMaterial
        size={0.15}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
