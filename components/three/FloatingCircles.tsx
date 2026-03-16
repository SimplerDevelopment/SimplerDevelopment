'use client';

import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface FloatingCirclesProps {
  color?: string;
}

export function FloatingCircles({ color }: FloatingCirclesProps = {}) {
  const groupRef = useRef<THREE.Group>(null);
  const [isDark, setIsDark] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const currentColors = useRef<THREE.Color[]>([]);
  const targetColors = useRef<THREE.Color[]>([]);

  // Detect theme changes
  useEffect(() => {
    const checkTheme = () => {
      const htmlElement = document.documentElement;
      setIsDark(htmlElement.classList.contains('dark'));
    };

    // Initial check
    checkTheme();

    // Watch for theme changes
    const observer = new MutationObserver(checkTheme);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Detect screen size
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Update target colors when color prop or theme changes
  useEffect(() => {
    const lightModeColors = [
      '#000000', // black
      '#1a1a1a', // very dark gray
      '#333333', // dark gray
      '#4d4d4d', // medium gray
      '#666666', // gray
    ];

    const darkModeColors = [
      '#d4d4d4', // light gray
      '#c0c0c0', // lighter gray
      '#afafaf', // light gray
      '#9a9a9a', // medium light gray
      '#808080', // medium gray
    ];

    // On mobile with a color prop, use the color; otherwise use theme colors
    let circleColors;
    if (isMobile && color) {
      // Create variations of the provided color
      const baseColor = new THREE.Color(color);
      circleColors = [
        color,
        '#' + baseColor.clone().multiplyScalar(0.8).getHexString(),
        '#' + baseColor.clone().multiplyScalar(0.6).getHexString(),
        '#' + baseColor.clone().multiplyScalar(1.2).getHexString(),
        '#' + baseColor.clone().multiplyScalar(0.9).getHexString(),
      ];
    } else {
      circleColors = isDark ? darkModeColors : lightModeColors;
    }

    // Update target colors for each circle
    circles.forEach((circle, i) => {
      const colorIndex = i % circleColors.length;
      if (!targetColors.current[i]) {
        targetColors.current[i] = new THREE.Color(circleColors[colorIndex]);
      } else {
        targetColors.current[i].set(circleColors[colorIndex]);
      }
    });
  }, [isDark, color, isMobile]);

  // Create random circles with various sizes and positions (created once)
  const circles = useMemo(() => {
    // More circles on mobile (where cluster is hidden), fewer on desktop
    const count = isMobile ? 24 : 14;
    const circleData = [];

    for (let i = 0; i < count; i++) {
      // Initialize colors on first render
      if (!currentColors.current[i]) {
        currentColors.current[i] = new THREE.Color('#666666');
      }
      if (!targetColors.current[i]) {
        targetColors.current[i] = new THREE.Color('#666666');
      }

      circleData.push({
        size: Math.random() * 0.4 + 0.15, // 0.15 to 0.55
        position: [
          Math.random() * 50 - 25, // x: -25 to 25 (spread across screen)
          (Math.random() - 0.5) * 20, // y: -10 to 10
          -Math.random() * 15 - 5, // z: -20 to -5 (behind the cluster)
        ] as [number, number, number],
        speed: Math.random() * 0.3 + 0.3, // 0.3 to 0.6 (consistent speed range)
        floatAmplitude: Math.random() * 0.3 + 0.15, // 0.15 to 0.45
        floatSpeed: Math.random() * 0.3 + 0.3, // Different float speeds
        opacity: Math.random() * 0.3 + 0.25, // 0.25 to 0.55
      });
    }

    return circleData;
  }, [isMobile]); // Recreate when screen size changes

  // Animate circles with continuous right-to-left motion
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();

    groupRef.current.children.forEach((child, i) => {
      const circle = circles[i];
      const mesh = child as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial;

      // Smoothly interpolate colors
      if (currentColors.current[i] && targetColors.current[i]) {
        currentColors.current[i].lerp(targetColors.current[i], 0.05);
        material.color.copy(currentColors.current[i]);
        material.emissive.copy(currentColors.current[i]);
      }

      // Continuous right-to-left motion
      mesh.position.x -= circle.speed * delta;

      // Wrap around when circle exits left side
      if (mesh.position.x < -30) {
        mesh.position.x = 30;
      }

      // Floating motion: gentle up and down
      const floatOffset = time * circle.floatSpeed;
      const yPos = circle.position[1] + Math.sin(floatOffset) * circle.floatAmplitude;
      mesh.position.y = yPos;

      // Keep Z position constant (behind the cluster)
      mesh.position.z = circle.position[2];

      // Gentle rotation
      mesh.rotation.x += 0.002;
      mesh.rotation.y += 0.003;
    });
  });

  return (
    <group ref={groupRef}>
      {circles.map((circle, i) => (
        <mesh key={i} position={circle.position}>
          <sphereGeometry args={[circle.size, 8, 8]} />
          <meshStandardMaterial
            color={currentColors.current[i] || '#666666'}
            emissive={currentColors.current[i] || '#666666'}
            emissiveIntensity={0.1}
            transparent
            opacity={circle.opacity}
            metalness={0.3}
            roughness={0.7}
          />
        </mesh>
      ))}
    </group>
  );
}
