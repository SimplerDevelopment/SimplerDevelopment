'use client';

import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

interface Icon3DProps {
  icon: string;
  isHovered: boolean;
}

// Simple icon shapes using Three.js primitives since Material Icons SVG paths are complex
function IconMesh({ icon, isHovered }: { icon: string; isHovered: boolean }) {
  const meshRef = useRef<THREE.Group>(null);
  const targetRotation = useRef(0);
  const currentRotation = useRef(0);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Update target rotation on hover
    if (isHovered) {
      targetRotation.current += delta * 2;
    }

    // Smooth rotation interpolation
    currentRotation.current += (targetRotation.current - currentRotation.current) * delta * 5;
    meshRef.current.rotation.y = currentRotation.current;

    // Gentle floating animation
    meshRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 2) * 0.05;
  });

  const geometry = useMemo(() => {
    const group = new THREE.Group();

    switch (icon) {
      case 'computer': {
        // Monitor screen
        const screen = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.8, 0.1),
          new THREE.MeshStandardMaterial({ color: '#8b5cf6' })
        );
        screen.position.y = 0.2;
        group.add(screen);

        // Monitor base
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.1, 0.3),
          new THREE.MeshStandardMaterial({ color: '#8b5cf6' })
        );
        base.position.y = -0.3;
        group.add(base);

        // Monitor stand
        const stand = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 0.3),
          new THREE.MeshStandardMaterial({ color: '#8b5cf6' })
        );
        stand.position.y = -0.15;
        group.add(stand);
        break;
      }

      case 'smartphone': {
        // Phone body
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 1.2, 0.1),
          new THREE.MeshStandardMaterial({ color: '#8b5cf6' })
        );
        group.add(body);

        // Screen
        const screen = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 1.0, 0.11),
          new THREE.MeshStandardMaterial({ color: '#a855f7' })
        );
        group.add(screen);
        break;
      }

      case 'build': {
        // Wrench handle
        const handle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 1.0),
          new THREE.MeshStandardMaterial({ color: '#8b5cf6' })
        );
        handle.rotation.z = Math.PI / 4;
        group.add(handle);

        // Wrench head
        const head = new THREE.Mesh(
          new THREE.TorusGeometry(0.2, 0.08, 8, 16),
          new THREE.MeshStandardMaterial({ color: '#8b5cf6' })
        );
        head.position.set(0.4, 0.4, 0);
        head.rotation.y = Math.PI / 2;
        group.add(head);
        break;
      }

      case 'palette': {
        // Palette base
        const palette = new THREE.Mesh(
          new THREE.SphereGeometry(0.6, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshStandardMaterial({ color: '#8b5cf6' })
        );
        group.add(palette);

        // Paint dots
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
        colors.forEach((color, i) => {
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 16, 16),
            new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
          );
          const angle = (i / colors.length) * Math.PI * 2;
          dot.position.set(Math.cos(angle) * 0.3, 0.1, Math.sin(angle) * 0.3);
          group.add(dot);
        });
        break;
      }

      case 'precision_manufacturing': {
        // Gear
        const gear = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.5, 0.2, 8),
          new THREE.MeshStandardMaterial({ color: '#8b5cf6' })
        );
        gear.rotation.x = Math.PI / 2;
        group.add(gear);

        // Inner circle
        const inner = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.2, 0.22, 16),
          new THREE.MeshStandardMaterial({ color: '#a855f7' })
        );
        inner.rotation.x = Math.PI / 2;
        group.add(inner);
        break;
      }

      case 'smart_toy': {
        // Robot head
        const head = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.8, 0.6),
          new THREE.MeshStandardMaterial({ color: '#8b5cf6' })
        );
        group.add(head);

        // Eyes
        const leftEye = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 16, 16),
          new THREE.MeshStandardMaterial({ color: '#00ffff', emissive: '#00ffff', emissiveIntensity: 1 })
        );
        leftEye.position.set(-0.2, 0.15, 0.3);
        group.add(leftEye);

        const rightEye = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 16, 16),
          new THREE.MeshStandardMaterial({ color: '#00ffff', emissive: '#00ffff', emissiveIntensity: 1 })
        );
        rightEye.position.set(0.2, 0.15, 0.3);
        group.add(rightEye);

        // Antenna
        const antenna = new THREE.Mesh(
          new THREE.CylinderGeometry(0.03, 0.03, 0.3),
          new THREE.MeshStandardMaterial({ color: '#a855f7' })
        );
        antenna.position.y = 0.55;
        group.add(antenna);

        const antennaTip = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 16, 16),
          new THREE.MeshStandardMaterial({ color: '#ec4899', emissive: '#ec4899', emissiveIntensity: 0.8 })
        );
        antennaTip.position.y = 0.7;
        group.add(antennaTip);
        break;
      }

      default:
        // Default cube
        const cube = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 0.8, 0.8),
          new THREE.MeshStandardMaterial({ color: '#8b5cf6' })
        );
        group.add(cube);
    }

    return group;
  }, [icon]);

  return <primitive ref={meshRef} object={geometry} />;
}

function Scene({ icon, isHovered }: { icon: string; isHovered: boolean }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
      <pointLight position={[-10, -10, 5]} intensity={0.5} color="#8b5cf6" />
      <IconMesh icon={icon} isHovered={isHovered} />
    </>
  );
}

export function Icon3D({ icon, isHovered }: Icon3DProps) {
  return (
    <div className="w-16 h-16">
      <Canvas
        camera={{ position: [0, 0, 3], fov: 50 }}
        gl={{ alpha: true, antialias: true }}
      >
        <Scene icon={icon} isHovered={isHovered} />
      </Canvas>
    </div>
  );
}
