'use client';

import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useRef, useState } from 'react';
import { Environment, OrbitControls } from '@react-three/drei';
import { AnimatedRings } from './AnimatedRings';
import { AnimatedCamera } from './AnimatedCamera';
import { FloatingCircles } from './FloatingCircles';
import * as THREE from 'three';

interface HeroSceneProps {
  className?: string;
  sceneType?: 'view1' | 'view2' | 'view3' | 'view4' | 'view5';
  color?: string;
}

// Component to log camera position/rotation
function CameraLogger({ sceneType }: { sceneType: string }) {
  const { camera } = useThree();

  useEffect(() => {
    const interval = setInterval(() => {
      console.log(`[${sceneType}] Camera Position:`, {
        x: camera.position.x.toFixed(2),
        y: camera.position.y.toFixed(2),
        z: camera.position.z.toFixed(2),
      });
      console.log(`[${sceneType}] Camera Rotation:`, {
        x: camera.rotation.x.toFixed(2),
        y: camera.rotation.y.toFixed(2),
        z: camera.rotation.z.toFixed(2),
      });
    }, 2000); // Log every 2 seconds

    return () => clearInterval(interval);
  }, [camera, sceneType]);

  return null;
}

// Component for morphing blob
function MorphingBlob({ color = '#8b5cf6' }: { color?: string }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.SphereGeometry>(null);
  const mousePosition = useRef({ x: 0, y: 0 });
  const currentColor = useRef(new THREE.Color(color));
  const targetColor = useRef(new THREE.Color(color));
  const frameCount = useRef(0);

  // Update target color when prop changes
  useEffect(() => {
    targetColor.current.set(color);
  }, [color]);

  useFrame((state) => {
    if (!meshRef.current || !geometryRef.current) return;

    frameCount.current++;
    const time = state.clock.getElapsedTime();

    // Smoothly interpolate mouse position
    mousePosition.current.x += (state.pointer.x - mousePosition.current.x) * 0.05;
    mousePosition.current.y += (state.pointer.y - mousePosition.current.y) * 0.05;

    // Smoothly interpolate color
    currentColor.current.lerp(targetColor.current, 0.05);

    // Update material color
    const material = meshRef.current.material as THREE.MeshStandardMaterial;
    material.color.copy(currentColor.current);
    material.emissive.copy(currentColor.current);

    // Only update geometry every 2 frames for better performance
    if (frameCount.current % 2 === 0) {
      const positions = geometryRef.current.attributes.position;

      // Use mouse to influence morphing parameters
      const mouseInfluenceX = mousePosition.current.x * 2;
      const mouseInfluenceY = mousePosition.current.y * 2;

      // Morph the vertices
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const y = positions.getY(i);
        const z = positions.getZ(i);

        // Calculate original position on sphere
        const length = Math.sqrt(x * x + y * y + z * z);
        const nx = x / length;
        const ny = y / length;
        const nz = z / length;

        // Apply multiple sine waves for organic morphing with mouse influence
        const distortion =
          Math.sin(nx * 3 + time * 0.5 + mouseInfluenceX) * 0.15 +
          Math.sin(ny * 4 + time * 0.7 + mouseInfluenceY) * 0.12 +
          Math.sin(nz * 2 + time * 0.3) * 0.18 +
          Math.sin((nx + ny + nz) * 2 + time * 0.4) * 0.1 +
          Math.sin(nx * mouseInfluenceX * 3 + ny * mouseInfluenceY * 3) * 0.08;

        // Apply the distortion
        const newLength = 0.95 + distortion;
        positions.setXYZ(i, nx * newLength, ny * newLength, nz * newLength);
      }

      positions.needsUpdate = true;
    }

    // Slow rotation with subtle mouse influence
    meshRef.current.rotation.x += 0.005 + mousePosition.current.y * 0.002;
    meshRef.current.rotation.y += 0.005 + mousePosition.current.x * 0.002;
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry ref={geometryRef} args={[0.95, 32, 32]} />
      <meshStandardMaterial
        color={color}
        metalness={0.4}
        roughness={0.5}
        emissive={color}
        emissiveIntensity={0.3}
      />
    </mesh>
  );
}

// Responsive cluster positioning component
function ResponsiveCluster({ sceneType, color }: { sceneType: 'view1' | 'view2' | 'view3' | 'view4' | 'view5'; color: string }) {
  const [clusterX, setClusterX] = useState(7);
  const [showCluster, setShowCluster] = useState(true);

  useEffect(() => {
    const updatePosition = () => {
      // Hide cluster on mobile (< 768px), show on larger screens
      if (window.innerWidth < 768) {
        setShowCluster(false);
      } else {
        setShowCluster(true);
        if (window.innerWidth < 1024) {
          setClusterX(4); // Slightly centered for tablets
        } else {
          setClusterX(7); // Original position for desktop
        }
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, []);

  if (!showCluster) return null;

  return (
    <group position={[clusterX, -1, 0]}>
      {/* Morphing blob */}
      <MorphingBlob color={color} />
      <AnimatedRings formation={sceneType} />
    </group>
  );
}

export function HeroScene({ className = 'h-screen w-full', sceneType = 'view1', color = '#8b5cf6' }: HeroSceneProps) {
  // All slides focus on the circle cluster, but from different angles and distances
  const clusterPosition = [10, 0, 0] as [number, number, number];

  const cameraPositions = {
    view1: {
      // Front-right view - cluster on left
      position: [0, -1, 10] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      // lookAt: clusterPosition
    },
    view2: {
      // Back-right view - cluster on left from behind
      position: [0, -1, 10] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      // lookAt: clusterPosition
    },
    view3: {
      // Below-right view - cluster on left from below
      position: [0, -1, 10] as [number, number, number],

      rotation: [0, 0, 0] as [number, number, number],
      // lookAt: clusterPosition
    },
    view4: {
      // Above-right view - cluster on left from above
      position: [0, -1, 10] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    },
    view5: {
      // Same as view1 but with rotating rings
      position: [0, -1, 10] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
    },
  };

  const cameraConfig = cameraPositions[sceneType];

  return (
    <div className={className}>
      <Canvas
        camera={{ position: [-7, 2, 6], fov: 75 }}
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
        <Suspense fallback={
          <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="hotpink" />
          </mesh>
        }>
          {/* Camera controls for manual positioning - DISABLED for smooth transitions */}
          {/* <OrbitControls
            enableDamping={true}
            dampingFactor={0.05}
            target={clusterPosition}
          />
          <CameraLogger sceneType={sceneType} /> */}

          {/* AnimatedCamera for smooth transitions */}
          <AnimatedCamera
            position={cameraConfig.position}
            rotation={cameraConfig.rotation}
          />

          {/* Lighting - Global lights */}
          <ambientLight intensity={0.3} />
          <pointLight position={[10, 10, 10]} intensity={1.5} color="#ffffff" />
          <pointLight position={[-10, -10, -10]} intensity={0.8} color="#3b82f6" />
          <pointLight position={[0, 0, 5]} intensity={1} color="#06b6d4" />
          <spotLight
            position={[0, 10, 0]}
            angle={0.3}
            penumbra={1}
            intensity={1}
            color="#f59e0b"
          />

          {/* Additional area-specific lighting */}
          <pointLight position={[-15, 5, 10]} intensity={2} color="#2563eb" />
          <pointLight position={[15, -5, 10]} intensity={2} color="#f59e0b" />

          {/* Environment for reflections */}
          <Environment preset="city" />

          {/* All 3D Elements in one unified scene */}

          {/* Floating circles in the background - colored on mobile */}
          <FloatingCircles color={color} />

          {/* Circle cluster with morphing blob - hidden on mobile */}
          <ResponsiveCluster sceneType={sceneType} color={color} />

        </Suspense>
      </Canvas>
    </div>
  );
}
