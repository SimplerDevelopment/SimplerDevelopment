'use client';

import { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface CircleData {
  size: number;
  position: [number, number, number];
  speed: number;
  floatAmplitude: number;
  floatSpeed: number;
  opacity: number;
}

function generateCircleData(count: number): CircleData[] {
  const circleData: CircleData[] = [];
  for (let i = 0; i < count; i++) {
    circleData.push({
      size: Math.random() * 0.4 + 0.15, // 0.15 to 0.55
      position: [
        Math.random() * 50 - 25, // x: -25 to 25
        (Math.random() - 0.5) * 20, // y: -10 to 10
        -Math.random() * 15 - 5, // z: -20 to -5
      ],
      speed: Math.random() * 0.3 + 0.3,
      floatAmplitude: Math.random() * 0.3 + 0.15,
      floatSpeed: Math.random() * 0.3 + 0.3,
      opacity: Math.random() * 0.3 + 0.25,
    });
  }
  return circleData;
}

interface FloatingCirclesProps {
  color?: string;
}

const FALLBACK_COLOR = '#666666';

export function FloatingCircles({ color }: FloatingCirclesProps = {}) {
  const groupRef = useRef<THREE.Group>(null);
  const [isDark, setIsDark] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const currentColors = useRef<THREE.Color[]>([]);
  const targetColors = useRef<THREE.Color[]>([]);
  // Lazy init: start with desktop count; effect regenerates when isMobile known
  const [circles, setCircles] = useState<CircleData[]>(() => generateCircleData(14));

  // Detect theme changes
  useEffect(() => {
    const checkTheme = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkTheme();
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

  // Regenerate circle data when screen size changes
  useEffect(() => {
    void Promise.resolve().then(() => setCircles(generateCircleData(isMobile ? 24 : 14)));
  }, [isMobile]);

  // Update target colors when color prop, theme, or circles change
  useEffect(() => {
    const lightModeColors = [
      '#000000', '#1a1a1a', '#333333', '#4d4d4d', '#666666',
    ];
    const darkModeColors = [
      '#d4d4d4', '#c0c0c0', '#afafaf', '#9a9a9a', '#808080',
    ];

    let circleColors: string[];
    if (isMobile && color) {
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

    circles.forEach((_circle, i) => {
      const colorIndex = i % circleColors.length;
      if (!currentColors.current[i]) {
        currentColors.current[i] = new THREE.Color(circleColors[colorIndex]);
      }
      if (!targetColors.current[i]) {
        targetColors.current[i] = new THREE.Color(circleColors[colorIndex]);
      } else {
        targetColors.current[i].set(circleColors[colorIndex]);
      }
    });
  }, [isDark, color, isMobile, circles]);

  // Animate circles with continuous right-to-left motion
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();

    groupRef.current.children.forEach((child, i) => {
      const circle = circles[i];
      if (!circle) return;
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
      if (mesh.position.x < -30) {
        mesh.position.x = 30;
      }

      // Floating motion
      mesh.position.y = circle.position[1] + Math.sin(time * circle.floatSpeed) * circle.floatAmplitude;
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
            color={FALLBACK_COLOR}
            emissive={FALLBACK_COLOR}
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
