'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';

interface AnimatedRingsProps {
  formation?: 'view1' | 'view2' | 'view3' | 'view4' | 'view5';
}

export function AnimatedRings({ formation = 'view1' }: AnimatedRingsProps) {
  const groupRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Mesh[]>([]);
  const [hoveredRing, setHoveredRing] = useState<number | null>(null);
  const [rotatingRings, setRotatingRings] = useState<Set<number>>(new Set());
  const hoverIntensity = useRef<number[]>(ringColors.map(() => 0.5));
  const hoverOpacity = useRef<number[]>(ringColors.map(() => 0.8));
  const currentColors = useRef<THREE.Color[]>(ringColors.map(c => new THREE.Color(c)));
  const targetColors = useRef<THREE.Color[]>(ringColors.map(c => new THREE.Color(c)));

  // Rotate clicked rings and smooth hover transitions
  useFrame(() => {
    // Update target colors based on formation
    const goldColor = new THREE.Color('#fbbf24');
    ringColors.forEach((colorHex, i) => {
      if (formation === 'view5') {
        targetColors.current[i].copy(goldColor);
      } else {
        targetColors.current[i].set(colorHex);
      }
    });

    ringsRef.current.forEach((ring, i) => {
      if (!ring) return;

      // Rotate clicked rings
      if (rotatingRings.has(i)) {
        ring.rotation.z += 0.02;
      }

      // Continuous rotation for view5 (Partnership slide)
      // Even rings rotate on X, odd rings rotate on Y
      if (formation === 'view5') {
        // Each ring rotates at a different rate
        const rotationSpeeds = [0.005, 0.008, 0.012, 0.015, 0.018];
        if (i % 2 === 0) {
          // Even rings: rotate on X axis
          ring.rotation.x += rotationSpeeds[i];
        } else {
          // Odd rings: rotate on Y axis
          ring.rotation.y += rotationSpeeds[i];
        }
      }

      // Smooth color transitions
      currentColors.current[i].lerp(targetColors.current[i], 0.05);

      // Smooth hover effect transitions
      const material = ring.material as THREE.MeshStandardMaterial;
      const targetIntensity = hoveredRing === i ? 1.0 : 0.5;
      const targetOpacity = hoveredRing === i ? 1.0 : 0.8;

      // Lerp (linear interpolation) for smooth transitions
      hoverIntensity.current[i] += (targetIntensity - hoverIntensity.current[i]) * 0.1;
      hoverOpacity.current[i] += (targetOpacity - hoverOpacity.current[i]) * 0.1;

      // Update material colors
      material.color.copy(currentColors.current[i]);
      material.emissive.copy(currentColors.current[i]);
      material.emissiveIntensity = hoverIntensity.current[i];
      material.opacity = hoverOpacity.current[i];
    });
  });

  // Handle ring click to toggle rotation
  const handleRingClick = (index: number) => {
    setRotatingRings((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  // GSAP transitions for formation changes
  useEffect(() => {
    if (!groupRef.current || ringsRef.current.length === 0) return;

    const targetConfig = getFormationConfig(formation);

    ringsRef.current.forEach((ring, i) => {
      if (!ring) return;

      const target = targetConfig.rings[i];
      const geometry = ring.geometry as THREE.TorusGeometry;

      // Kill any existing animations
      gsap.killTweensOf(ring.position);
      gsap.killTweensOf(ring.rotation);
      gsap.killTweensOf(geometry.parameters);

      // Animate position
      gsap.to(ring.position, {
        x: target.position[0],
        y: target.position[1],
        z: target.position[2],
        duration: 2.0,
        ease: 'power2.inOut',
      });

      // Animate rotation
      gsap.to(ring.rotation, {
        x: target.rotation[0],
        y: target.rotation[1],
        z: target.rotation[2],
        duration: 2.0,
        ease: 'power2.inOut',
      });

      // Animate radius by recreating geometry
      const currentRadius = geometry.parameters.radius;
      if (Math.abs(currentRadius - target.radius) > 0.01) {
        const radiusObj = { value: currentRadius };
        gsap.to(radiusObj, {
          value: target.radius,
          duration: 2.0,
          ease: 'power2.inOut',
          onUpdate: () => {
            ring.geometry.dispose();
            ring.geometry = new THREE.TorusGeometry(radiusObj.value, 0.12, 12, 64);
          },
        });
      }
    });

    return () => {
      ringsRef.current.forEach((ring) => {
        if (!ring) return;
        gsap.killTweensOf(ring.position);
        gsap.killTweensOf(ring.rotation);
      });
    };
  }, [formation]);

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      {ringColors.map((colorHex, i) => {
        const color = new THREE.Color(colorHex);
        const initialConfig = getFormationConfig('view1');

        return (
          <mesh
            key={i}
            ref={(el) => {
              if (el) ringsRef.current[i] = el;
            }}
            rotation={initialConfig.rings[i].rotation}
            position={initialConfig.rings[i].position}
            onClick={(e) => {
              e.stopPropagation();
              handleRingClick(i);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredRing(i);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={(e) => {
              e.stopPropagation();
              setHoveredRing(null);
              document.body.style.cursor = 'default';
            }}
            onPointerMove={(e) => {
              e.stopPropagation();
              setHoveredRing(i);
            }}
          >
            <torusGeometry args={[initialConfig.rings[i].radius, 0.12, 12, 64]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.5}
              metalness={0.8}
              roughness={0.2}
              transparent
              opacity={0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
}

const ringColors = [
  '#22c55e', // green-500 - innermost
  '#3b82f6', // blue-500
  '#a855f7', // purple-500
  '#ec4899', // pink-500
  '#f97316', // orange-500 - outermost
];

// Different formations based on view
function getFormationConfig(formation: 'view1' | 'view2' | 'view3' | 'view4' | 'view5') {
  switch (formation) {
    case 'view1':
      // Vertical concentric rings
      return {
        rings: ringColors.map((_, i) => ({
          radius: 2 + i * 0.5,
          rotation: [0, 0, 0] as [number, number, number],
          position: [0, 0, 0] as [number, number, number],
        })),
      };
    case 'view2':
      // Horizontal concentric rings tilted forward
      return {
        rings: ringColors.map((_, i) => ({
          radius: 2 + i * 0.5,
          rotation: [Math.PI / 2 - 0.4, 0, 0] as [number, number, number],
          position: [0, 0, 0] as [number, number, number],
        })),
      };
    case 'view3':
      // Inverted funnel - rings get larger and move down
      return {
        rings: ringColors.map((_, i) => ({
          radius: 1.5 + i * 0.4,
          rotation: [Math.PI / 2, 0, 0] as [number, number, number],
          position: [0, -i * 0.8, 0] as [number, number, number],
        })),
      };
    case 'view4':
      // Funnel shape - rings get smaller and move down
      return {
        rings: ringColors.map((_, i) => ({
          radius: 3.5 - i * 0.4,
          rotation: [Math.PI / 2, 0, 0] as [number, number, number],
          position: [0, -i * 0.8, 0] as [number, number, number],
        })),
      };
    case 'view5':
      // Vertical concentric rings (same as view1) with continuous Y rotation
      return {
        rings: ringColors.map((_, i) => ({
          radius: 2 + i * 0.5,
          rotation: [0, 0, 0] as [number, number, number],
          position: [0, 0, 0] as [number, number, number],
        })),
      };
    default:
      return {
        rings: ringColors.map((_, i) => ({
          radius: 2 + i * 0.5,
          rotation: [Math.PI / 2, 0, 0] as [number, number, number],
          position: [0, 0, 0] as [number, number, number],
        })),
      };
  }
}
