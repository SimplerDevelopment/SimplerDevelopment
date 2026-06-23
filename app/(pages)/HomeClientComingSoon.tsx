'use client';

import dynamic from 'next/dynamic';
import { use3DScene } from '@/hooks/use3DScene';
import { motion } from 'framer-motion';
import { BlobColorProvider } from '@/contexts/BlobColorContext';

// Lazy load the HeroScene component
const HeroScene = dynamic(() => import('@/components/three/HeroScene').then(mod => ({ default: mod.HeroScene })), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20 animate-pulse" />
});

export function HomeClientComingSoon() {
  const { supportsWebGL } = use3DScene();

  return (
    <section className="relative h-screen w-full overflow-hidden flex items-center justify-center">
      {/* 3D Background */}
      <div className="absolute inset-0 z-0">
        <HeroScene sceneType="view1" color="#22c55e" />
      </div>

      {/* WebGL Not Supported Fallback */}
      {!supportsWebGL && (
        <div className="absolute inset-0 z-0 bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20" />
      )}

      {/* Gradient Overlay for readability */}
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-background/80 via-background/50 to-background/80 pointer-events-none" />

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="relative z-20 text-center px-4"
      >
        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="font-display text-5xl md:text-7xl font-bold mb-6 tracking-tight"
        >
          Coming Soon
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto"
        >
          Something amazing is on the way. Stay tuned.
        </motion.p>
      </motion.div>
    </section>
  );
}
