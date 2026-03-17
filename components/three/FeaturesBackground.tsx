'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';

function WaveMesh({ isInView, mousePos, isHovered }: { isInView: boolean; mousePos: { x: number; y: number }; isHovered: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const smoothMouse = useRef({ x: 0, y: 0 });
  const hoverBlend = useRef(0); // 0 = idle, 1 = fully hovering

  const geometry = useMemo(() => {
    return new THREE.PlaneGeometry(50, 15, 60, 24);
  }, []);

  useFrame((state) => {
    if (!meshRef.current || !isInView) return;

    const time = state.clock.getElapsedTime();

    // Smooth transition between idle and hover states
    const targetBlend = isHovered ? 1 : 0;
    hoverBlend.current += (targetBlend - hoverBlend.current) * 0.08;

    // Smoothly interpolate mouse position for fluid tracking
    smoothMouse.current.x += (mousePos.x - smoothMouse.current.x) * 0.15;
    smoothMouse.current.y += (mousePos.y - smoothMouse.current.y) * 0.15;

    const positions = meshRef.current.geometry.attributes.position;

    // Convert normalized mouse position (-1 to 1) to mesh coordinate space
    const mouseX = smoothMouse.current.x * 25;
    const mouseY = smoothMouse.current.y * 7.5;

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);

      // === Hover spike effect ===
      const distanceToMouse = Math.sqrt(
        Math.pow(x - mouseX, 2) + Math.pow(y - mouseY, 2)
      );
      const falloff = 4;
      const spikeHeight = 5;
      const spike = Math.exp(-distanceToMouse / falloff) * spikeHeight;

      // === Idle wave animation ===
      // Gentle rolling waves
      const wave1 = Math.sin(x * 0.12 + time * 0.4) * 0.5;
      const wave2 = Math.sin(y * 0.2 + time * 0.3) * 0.25;
      const wave3 = Math.sin((x + y) * 0.08 + time * 0.5) * 0.3;
      const idleZ = wave1 + wave2 + wave3;

      // Blend between idle and hover
      const blend = hoverBlend.current;
      const z = idleZ * (1 - blend) + spike * blend;

      positions.setZ(i, z);
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
        color="#2563eb"
        emissive="#2563eb"
        emissiveIntensity={3.0}
        wireframe
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Scene({ isInView, mousePos, isHovered }: { isInView: boolean; mousePos: { x: number; y: number }; isHovered: boolean }) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <pointLight position={[0, -5, 10]} intensity={6.0} color="#2563eb" />
      <pointLight position={[15, -5, 5]} intensity={4.0} color="#06b6d4" />
      <pointLight position={[-15, -5, 5]} intensity={4.0} color="#f59e0b" />

      {/* Wave mesh */}
      <WaveMesh isInView={isInView} mousePos={mousePos} isHovered={isHovered} />
    </>
  );
}

export function FeaturesBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(true);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

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

  // Track mouse position and hover state relative to the section
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      // Convert to normalized coordinates (-1 to 1)
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      setMousePos({ x, y });
    };

    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => setIsHovered(false);

    // Add listener to the parent section (not the canvas)
    const section = containerRef.current?.parentElement;
    if (section) {
      section.addEventListener('mousemove', handleMouseMove);
      section.addEventListener('mouseenter', handleMouseEnter);
      section.addEventListener('mouseleave', handleMouseLeave);
      return () => {
        section.removeEventListener('mousemove', handleMouseMove);
        section.removeEventListener('mouseenter', handleMouseEnter);
        section.removeEventListener('mouseleave', handleMouseLeave);
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
          <Scene isInView={isInView} mousePos={mousePos} isHovered={isHovered} />
        </Suspense>
      </Canvas>
    </div>
  );
}
