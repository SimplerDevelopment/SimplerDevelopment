'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import { Environment } from '@react-three/drei';
import { FloatingCircles } from './FloatingCircles';

interface AppsHeroSceneProps {
  className?: string;
  color?: string;
}

export function AppsHeroScene({ className = 'h-screen w-full', color = '#8b5cf6' }: AppsHeroSceneProps) {
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 0, 8], fov: 75 }}
        style={{ width: '100%', height: '100%' }}
        dpr={[1, 1.5]}
        performance={{ min: 0.5 }}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true
        }}
      >
        <Suspense fallback={null}>
          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <pointLight position={[10, 10, 10]} intensity={1.5} color="#ffffff" />
          <pointLight position={[-10, -10, -10]} intensity={0.8} color="#3b82f6" />
          <pointLight position={[0, 0, 5]} intensity={1} color="#8b5cf6" />
          <spotLight
            position={[0, 10, 0]}
            angle={0.3}
            penumbra={1}
            intensity={1}
            color="#ec4899"
          />

          {/* Environment for reflections */}
          <Environment preset="city" />

          {/* Floating circles in the background */}
          <FloatingCircles color={color} />
        </Suspense>
      </Canvas>
    </div>
  );
}
