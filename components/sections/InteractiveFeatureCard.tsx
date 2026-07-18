'use client';

import { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { motion } from 'framer-motion';
import * as THREE from 'three';

interface FloatingObject3DProps {
  type: 'globe' | 'target' | 'lightning';
  mousePosition: { x: number; y: number };
}

function FloatingGlobe({ mousePosition }: { mousePosition: { x: number; y: number } }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const particlesRef = useRef<THREE.Points>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  const [particles] = useState(() => {
    const count = 200;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = 1.2 + Math.random() * 0.5;

      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
    }

    return positions;
  });

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(particles, 3));
    return geo;
  }, [particles]);

  useFrame((state) => {
    if (!meshRef.current || !particlesRef.current) return;

    const time = state.clock.getElapsedTime();

    // Rotate globe with mouse influence
    meshRef.current.rotation.y = time * 0.3 + mousePosition.x * 0.8;
    meshRef.current.rotation.x = Math.sin(time * 0.2) * 0.1 + mousePosition.y * 0.8;

    // Scale based on mouse distance from center
    const mouseDistance = Math.sqrt(mousePosition.x ** 2 + mousePosition.y ** 2);
    const scale = 1 + mouseDistance * 0.2;
    meshRef.current.scale.set(scale, scale, scale);

    // Rotate particles
    particlesRef.current.rotation.y = time * 0.1 - mousePosition.x * 0.3;

    // Glow effect intensity
    if (glowRef.current) {
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = 0.2 + mouseDistance * 0.3;
    }
  });

  return (
    <>
      {/* Glow layer */}
      <mesh ref={glowRef} scale={1.2}>
        <icosahedronGeometry args={[1, 2]} />
        <meshBasicMaterial
          color="#3b82f6"
          transparent
          opacity={0.2}
        />
      </mesh>

      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial
          color="#3b82f6"
          wireframe
          transparent
          opacity={0.6}
        />
      </mesh>
      <points ref={particlesRef} geometry={geometry}>
        <pointsMaterial
          size={0.03}
          color="#06b6d4"
          transparent
          opacity={0.8}
          sizeAttenuation
        />
      </points>
    </>
  );
}

function FloatingTarget({ mousePosition }: { mousePosition: { x: number; y: number } }) {
  const groupRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Group>(null);
  const centerRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (!groupRef.current || !ringsRef.current || !centerRef.current) return;

    const time = state.clock.getElapsedTime();
    const mouseDistance = Math.sqrt(mousePosition.x ** 2 + mousePosition.y ** 2);

    // Follow mouse with tilt and scale
    groupRef.current.rotation.x = mousePosition.y * 0.8;
    groupRef.current.rotation.y = mousePosition.x * 0.8;
    groupRef.current.rotation.z = Math.sin(time) * 0.1;

    // Scale group based on mouse distance
    const groupScale = 1 + mouseDistance * 0.3;
    groupRef.current.scale.set(groupScale, groupScale, groupScale);

    // Pulse center sphere
    const centerScale = 1 + Math.sin(time * 3) * 0.2 + mouseDistance * 0.1;
    centerRef.current.scale.set(centerScale, centerScale, centerScale);

    // Pulse and rotate rings
    ringsRef.current.children.forEach((ring, i) => {
      const scale = 1 + Math.sin(time * 2 + i * 0.5) * 0.1;
      ring.scale.set(scale, scale, 1);
      ring.rotation.z = time * (0.5 + i * 0.1) + mousePosition.x * 0.5;
    });
  });

  return (
    <group ref={groupRef}>
      {/* Center sphere */}
      <mesh ref={centerRef}>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial
          color="#ec4899"
          emissive="#ec4899"
          emissiveIntensity={0.5}
        />
      </mesh>

      {/* Concentric rings */}
      <group ref={ringsRef}>
        {[0.6, 0.9, 1.2].map((radius, i) => (
          <mesh key={i} rotation={[0, 0, 0]}>
            <torusGeometry args={[radius, 0.02, 16, 32]} />
            <meshStandardMaterial
              color="#ec4899"
              transparent
              opacity={0.6 - i * 0.15}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function FloatingLightning({ mousePosition }: { mousePosition: { x: number; y: number } }) {
  const groupRef = useRef<THREE.Group>(null);
  const boltsRef = useRef<THREE.Group>(null);
  const coreRef = useRef<THREE.Mesh>(null);

  const [bolts] = useState(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      const points = [];

      for (let j = 0; j < 8; j++) {
        const jitter = (Math.random() - 0.5) * 0.2;
        points.push(
          new THREE.Vector3(
            Math.cos(angle) * (j * 0.15) + jitter,
            j * 0.15 - 0.5 + jitter,
            Math.sin(angle) * (j * 0.15) + jitter
          )
        );
      }

      return new THREE.BufferGeometry().setFromPoints(points);
    });
  });

  useFrame((state) => {
    if (!groupRef.current || !boltsRef.current || !coreRef.current) return;

    const time = state.clock.getElapsedTime();
    const mouseDistance = Math.sqrt(mousePosition.x ** 2 + mousePosition.y ** 2);

    // Follow mouse with more intensity
    groupRef.current.rotation.x = mousePosition.y * 0.5 + Math.sin(time) * 0.1;
    groupRef.current.rotation.y = mousePosition.x * 0.5 + Math.cos(time) * 0.1;

    // Scale based on mouse distance for energy effect
    const groupScale = 1 + mouseDistance * 0.4;
    groupRef.current.scale.set(groupScale, groupScale, groupScale);

    // Pulsing core with mouse influence
    const coreScale = 1 + Math.sin(time * 5) * 0.3 + mouseDistance * 0.2;
    coreRef.current.scale.set(coreScale, coreScale, coreScale);

    // Animate bolts with varying intensity
    boltsRef.current.children.forEach((bolt, i) => {
      if (bolt instanceof THREE.Line) {
        const material = bolt.material as THREE.LineBasicMaterial;
        material.opacity = 0.4 + Math.sin(time * 4 + i) * 0.4 + mouseDistance * 0.2;
      }
    });

    // Faster rotation with mouse
    groupRef.current.rotation.z = time * (0.5 + mouseDistance * 0.5);
  });

  return (
    <group ref={groupRef}>
      {/* Center energy ball */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial
          color="#fbbf24"
          emissive="#fbbf24"
          emissiveIntensity={1}
        />
      </mesh>

      {/* Lightning bolts */}
      <group ref={boltsRef}>
        {bolts.map((geometry, i) => {
          const lineMaterial = new THREE.LineBasicMaterial({
            color: '#fbbf24',
            transparent: true,
            opacity: 0.7,
          });
          const lineObj = new THREE.Line(geometry, lineMaterial);
          return <primitive key={i} object={lineObj} />;
        })}
      </group>
    </group>
  );
}

function FloatingObjects3D({ type, mousePosition }: FloatingObject3DProps) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[5, 5, 5]} intensity={1} />
      <pointLight position={[-5, -5, -5]} intensity={0.5} />

      {type === 'globe' && <FloatingGlobe mousePosition={mousePosition} />}
      {type === 'target' && <FloatingTarget mousePosition={mousePosition} />}
      {type === 'lightning' && <FloatingLightning mousePosition={mousePosition} />}
    </>
  );
}

interface InteractiveFeatureCardProps {
  icon: string;
  title: string;
  description: string;
  type: 'globe' | 'target' | 'lightning';
  delay?: number;
}

export function InteractiveFeatureCard({
  icon,
  title,
  description,
  type,
  delay = 0,
}: InteractiveFeatureCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [cardMousePosition, setCardMousePosition] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // For 3D objects
    setMousePosition({ x, y });

    // For card effects (pixel position)
    setCardMousePosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setCardMousePosition({ x: 0, y: 0 });
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.6, delay }}
      animate={{
        rotateX: isHovered ? mousePosition.y * 5 : 0,
        rotateY: isHovered ? mousePosition.x * 5 : 0,
        scale: isHovered ? 1.05 : 1,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      className="relative p-8 rounded-lg bg-card/80 border border-primary/20 backdrop-blur-md shadow-xl overflow-hidden group"
      style={{
        transformStyle: 'preserve-3d',
        perspective: '1000px',
      }}
    >
      {/* 3D Canvas Background */}
      <div className="absolute inset-0 opacity-40 group-hover:opacity-70 transition-opacity duration-500">
        <Canvas camera={{ position: [0, 0, 4], fov: 50 }}>
          <FloatingObjects3D type={type} mousePosition={mousePosition} />
        </Canvas>
      </div>

      {/* Gradient overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-br from-background/60 via-background/40 to-background/60 pointer-events-none" />

      {/* Mouse spotlight effect */}
      {isHovered && (
        <motion.div
          className="absolute w-96 h-96 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.3) 0%, transparent 70%)',
            left: cardMousePosition.x - 192,
            top: cardMousePosition.y - 192,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        />
      )}

      {/* Animated border glow */}
      <motion.div
        className="absolute inset-0 rounded-lg pointer-events-none"
        style={{
          background: `radial-gradient(600px circle at ${cardMousePosition.x}px ${cardMousePosition.y}px, rgba(59, 130, 246, 0.4), transparent 40%)`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />

      {/* Edge highlight that follows mouse */}
      {isHovered && (
        <div
          className="absolute inset-0 rounded-lg pointer-events-none"
          style={{
            boxShadow: `${cardMousePosition.x / 2}px ${cardMousePosition.y / 2}px 40px rgba(59, 130, 246, 0.5)`,
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10" style={{ transform: 'translateZ(20px)' }}>
        <motion.div
          className="text-5xl mb-4 inline-block"
          animate={{
            scale: isHovered ? 1.3 : 1,
            rotate: isHovered ? 360 : 0,
            x: isHovered ? mousePosition.x * 10 : 0,
            y: isHovered ? -mousePosition.y * 10 : 0,
          }}
          transition={{
            duration: 0.5,
            type: "spring",
            stiffness: 200,
            damping: 15
          }}
        >
          {icon}
        </motion.div>

        <motion.h3
          className="font-heading text-2xl font-bold mb-3 group-hover:text-primary transition-colors"
          animate={{
            x: isHovered ? mousePosition.x * 3 : 0,
            y: isHovered ? -mousePosition.y * 3 : 0,
          }}
          transition={{ type: "spring", stiffness: 150, damping: 20 }}
        >
          {title}
        </motion.h3>

        <motion.p
          className="text-muted-foreground"
          animate={{
            x: isHovered ? mousePosition.x * 2 : 0,
            y: isHovered ? -mousePosition.y * 2 : 0,
          }}
          transition={{ type: "spring", stiffness: 100, damping: 20 }}
        >
          {description}
        </motion.p>
      </div>

      {/* Glow effect on hover */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/10 to-primary/0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />

      {/* Particle trails on mouse movement */}
      {isHovered && (
        <>
          <motion.div
            className="absolute w-1 h-1 bg-primary rounded-full pointer-events-none"
            style={{
              left: cardMousePosition.x,
              top: cardMousePosition.y,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1.5, 0],
              opacity: [0, 1, 0]
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              repeatDelay: 0.1
            }}
          />
          <motion.div
            className="absolute w-2 h-2 border border-primary rounded-full pointer-events-none"
            style={{
              left: cardMousePosition.x - 4,
              top: cardMousePosition.y - 4,
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 2, 0],
              opacity: [0, 0.5, 0]
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              repeatDelay: 0.15
            }}
          />

          {/* Ripple effect */}
          <motion.div
            className="absolute w-4 h-4 border-2 border-primary rounded-full pointer-events-none"
            style={{
              left: cardMousePosition.x - 8,
              top: cardMousePosition.y - 8,
            }}
            initial={{ scale: 0, opacity: 1 }}
            animate={{
              scale: [0, 8],
              opacity: [0.8, 0]
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeOut"
            }}
          />

          {/* Secondary ripple */}
          <motion.div
            className="absolute w-4 h-4 border border-primary/50 rounded-full pointer-events-none"
            style={{
              left: cardMousePosition.x - 8,
              top: cardMousePosition.y - 8,
            }}
            initial={{ scale: 0, opacity: 1 }}
            animate={{
              scale: [0, 12],
              opacity: [0.5, 0]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut",
              delay: 0.3
            }}
          />
        </>
      )}
    </motion.div>
  );
}
