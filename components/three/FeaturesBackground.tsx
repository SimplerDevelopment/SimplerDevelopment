'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';

function WaveMesh({ isInView, mousePos }: { isInView: boolean; mousePos: { x: number; y: number } }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const smoothMouse = useRef({ x: 0, y: 0 });
  const debugCount = useRef(0);

  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(50, 15, 60, 24);
  }, []);

  useFrame(() => {
    if (!meshRef.current || !isInView) return;

    // Debug logging (only log every 60 frames)
    debugCount.current++;
    if (debugCount.current % 60 === 0) {
      console.log('WaveMesh - mouse:', mousePos.x.toFixed(2), mousePos.y.toFixed(2));
    }

    // Smoothly interpolate mouse position for fluid tracking
    smoothMouse.current.x += (mousePos.x - smoothMouse.current.x) * 0.15;
    smoothMouse.current.y += (mousePos.y - smoothMouse.current.y) * 0.15;

    const positions = meshRef.current.geometry.attributes.position;

    // Convert normalized mouse position (-1 to 1) to mesh coordinate space
    // Mesh width is 50, height is 15
    const mouseX = smoothMouse.current.x * 25; // -25 to 25 (mesh width)
    const mouseY = smoothMouse.current.y * 7.5; // -7.5 to 7.5 (mesh height)

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);

      // Calculate distance from mouse position to this vertex
      const distanceToMouse = Math.sqrt(
        Math.pow(x - mouseX, 2) + Math.pow(y - mouseY, 2)
      );

      // Create a sharp spike effect like a sound wave
      // The spike is strongest at the cursor position and falls off with distance
      // Using an exponential falloff for a sharper, more dramatic spike
      const falloff = 4; // Tighter falloff for sharper spike
      const spikeHeight = 5; // Height of the spike
      const spike = Math.exp(-distanceToMouse / falloff) * spikeHeight;

      // Apply the spike to the Z coordinate
      positions.setZ(i, spike);
    }

    positions.needsUpdate = true;
  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      position={[0, -7, 0]}
      rotation={[-Math.PI / 2.3, 0, 0]}
    >
      <meshStandardMaterial
        color="#8b5cf6"
        emissive="#8b5cf6"
        emissiveIntensity={3.0}
        wireframe
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Scene({ isInView, mousePos }: { isInView: boolean; mousePos: { x: number; y: number } }) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[0, -5, 10]} intensity={6.0} color="#8b5cf6" />
      <pointLight position={[15, -5, 5]} intensity={4.0} color="#a855f7" />
      <pointLight position={[-15, -5, 5]} intensity={4.0} color="#ec4899" />

      {/* Wave mesh */}
      <WaveMesh isInView={isInView} mousePos={mousePos} />
    </>
  );
}

export function FeaturesBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(true);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setIsInView(entry.isIntersecting);
        });
      },
      {
        threshold: 0.1,
        rootMargin: '100px',
      }
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Track mouse position relative to the section
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      // Convert to normalized coordinates (-1 to 1)
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      setMousePos({ x, y });
    };

    // Add listener to the parent section (not the canvas)
    const section = containerRef.current?.parentElement;
    if (section) {
      section.addEventListener('mousemove', handleMouseMove);
      return () => {
        section.removeEventListener('mousemove', handleMouseMove);
      };
    }
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 20], fov: 50 }}
        gl={{ alpha: true, antialias: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <Scene isInView={isInView} mousePos={mousePos} />
        </Suspense>
      </Canvas>
    </div>
  );
}
