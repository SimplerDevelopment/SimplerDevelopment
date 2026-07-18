'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { Environment, PerspectiveCamera } from '@react-three/drei';
import { Laptop3D } from '@/components/three/Laptop3D';
import * as THREE from 'three';

interface CMSFeature {
  id: string;
  title: string;
  description: string;
  image: string;
}

interface CMSCarouselSectionProps {
  title: string;
  features?: CMSFeature[];
}

const defaultFeatures: CMSFeature[] = [
  {
    id: '1',
    title: 'Content Management',
    description: 'Manage your content with an intuitive interface',
    image: 'https://images.unsplash.com/photo-1460925895917-adf4e9d6e2df?w=800&h=600&fit=crop',
  },
  {
    id: '2',
    title: 'Multi-channel Publishing',
    description: 'Publish to multiple channels simultaneously',
    image: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&h=600&fit=crop',
  },
  {
    id: '3',
    title: 'Real-time Collaboration',
    description: 'Collaborate with your team in real-time',
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=600&fit=crop',
  },
  {
    id: '4',
    title: 'Advanced Analytics',
    description: 'Track performance with detailed analytics',
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop',
  },
];

function CarouselSlide({
  feature,
  index,
  activeIndex,
}: {
  feature: CMSFeature;
  index: number;
  activeIndex: number;
}) {
  // Calculate position offset relative to active slide
  const positionOffset = ((index - activeIndex + defaultFeatures.length) % defaultFeatures.length) - 1;

  // Show 3 slides at a time
  const isVisible = Math.abs(positionOffset) <= 1;

  // Calculate scale and opacity based on position
  let scale = 0.85;
  let opacity = 0.5;
  let zIndex = 0;

  if (positionOffset === -1) {
    // Left slide
    scale = 0.85;
    opacity = 0.5;
    zIndex = 1;
  } else if (positionOffset === 0) {
    // Center slide (active)
    scale = 1;
    opacity = 1;
    zIndex = 10;
  } else if (positionOffset === 1) {
    // Right slide
    scale = 0.85;
    opacity = 0.5;
    zIndex = 1;
  } else {
    // Out of view
    opacity = 0;
    scale = 0;
  }

  return (
    <motion.div
      key={feature.id}
      className="absolute inset-0 w-full h-full"
      initial={false}
      animate={{
        scale,
        opacity,
        zIndex,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 30,
      }}
      style={{
        perspective: '1000px',
      }}
    >
      <div className="relative w-full h-full rounded-xl overflow-hidden">
        {/* Image with z-depth effect */}
        <motion.img
          src={feature.image}
          alt={feature.title}
          className="w-full h-full object-cover"
          animate={{
            scale: activeIndex === index ? 1.05 : 1,
          }}
          transition={{
            duration: 0.8,
          }}
        />

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Content */}
        {activeIndex === index && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.2 }}
            className="absolute bottom-0 left-0 right-0 p-8 text-white"
          >
            <h3 className="text-2xl md:text-3xl font-bold mb-2">{feature.title}</h3>
            <p className="text-lg opacity-90">{feature.description}</p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

function LaptopCanvas() {
  return (
    <Canvas
      style={{ width: '100%', height: '100%' }}
      dpr={[1, 1.5]}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      }}
    >
      <PerspectiveCamera makeDefault position={[0, 7, 35]} fov={45} />
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={1.5} />
      <pointLight position={[-10, -10, -10]} intensity={0.8} />
      <Environment preset="city" />

      <Laptop3D
        scale={1.05}
        position={[0, -0.5, 0]}
        rotation={[0, -0.6, 0]}
        floatSpeed={2}
        floatAmplitude={0.3}
      />
    </Canvas>
  );
}

export function CMSCarouselSection({
  title,
  features = defaultFeatures,
}: CMSCarouselSectionProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);

  // Auto-play carousel
  useEffect(() => {
    if (!autoPlay) return;

    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % features.length);
    }, 5000); // Change slide every 5 seconds

    return () => clearInterval(interval);
  }, [autoPlay, features.length]);

  const goToSlide = useCallback((index: number) => {
    setActiveIndex(index);
    setAutoPlay(false);
  }, []);

  const goToNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % features.length);
    setAutoPlay(false);
  }, [features.length]);

  const goToPrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + features.length) % features.length);
    setAutoPlay(false);
  }, [features.length]);

  return (
    <section className="py-24 bg-gradient-to-b from-background to-primary/5">
      <div className="container mx-auto px-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="font-display text-3xl md:text-5xl font-bold mb-4 tracking-tight">
            {title}
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Discover a modern content management system built for today&apos;s digital needs
          </p>
        </motion.div>

        {/* Carousel Container */}
        <div className="relative max-w-5xl mx-auto">
          {/* Image Carousel */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            {/* Carousel Container - 3 slides visible */}
            <div className="relative h-80 md:h-96 rounded-xl overflow-hidden bg-card border border-border">
              <div className="absolute inset-0 flex items-center justify-center gap-4 px-4">
                {/* Left Slide */}
                <motion.div
                  className="w-1/3 h-full flex-shrink-0 rounded-lg overflow-hidden"
                  animate={{
                    scale: Math.abs((activeIndex - 1 + defaultFeatures.length) % defaultFeatures.length - activeIndex) <= 1 ? 0.85 : 0,
                    opacity: Math.abs((activeIndex - 1 + defaultFeatures.length) % defaultFeatures.length - activeIndex) <= 1 ? 0.5 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  {(() => {
                    const leftIndex = (activeIndex - 1 + defaultFeatures.length) % defaultFeatures.length;
                    const feature = features[leftIndex];
                    return (
                      <div className="w-full h-full relative">
                        <img src={feature.image} alt={feature.title} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      </div>
                    );
                  })()}
                </motion.div>

                {/* Center Slide (Active) */}
                <motion.div
                  className="w-1/3 h-full flex-shrink-0 rounded-lg overflow-hidden"
                  animate={{
                    scale: 1,
                    opacity: 1,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  <div className="w-full h-full relative">
                    <img src={features[activeIndex].image} alt={features[activeIndex].title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="absolute bottom-0 left-0 right-0 p-4 text-white"
                    >
                      <h3 className="text-lg md:text-xl font-bold mb-1">{features[activeIndex].title}</h3>
                      <p className="text-sm opacity-90">{features[activeIndex].description}</p>
                    </motion.div>
                  </div>
                </motion.div>

                {/* Right Slide */}
                <motion.div
                  className="w-1/3 h-full flex-shrink-0 rounded-lg overflow-hidden"
                  animate={{
                    scale: Math.abs((activeIndex + 1) % defaultFeatures.length - activeIndex) <= 1 ? 0.85 : 0,
                    opacity: Math.abs((activeIndex + 1) % defaultFeatures.length - activeIndex) <= 1 ? 0.5 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                >
                  {(() => {
                    const rightIndex = (activeIndex + 1) % defaultFeatures.length;
                    const feature = features[rightIndex];
                    return (
                      <div className="w-full h-full relative">
                        <img src={feature.image} alt={feature.title} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      </div>
                    );
                  })()}
                </motion.div>
              </div>

              {/* Navigation Buttons */}
              <div className="absolute inset-0 flex items-center justify-between px-2 opacity-0 hover:opacity-100 transition-opacity z-20 pointer-events-none">
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={goToPrev}
                  className="bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full p-2 transition-colors pointer-events-auto"
                  aria-label="Previous slide"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={goToNext}
                  className="bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full p-2 transition-colors pointer-events-auto"
                  aria-label="Next slide"
                >
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </motion.button>
              </div>
            </div>

            {/* Indicators */}
            <div className="flex justify-center gap-2 mt-6">
              {features.map((_, index) => (
                <motion.button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`h-2 rounded-full transition-all ${
                    index === activeIndex
                      ? 'bg-primary w-8'
                      : 'bg-primary/30 w-2 hover:bg-primary/50'
                  }`}
                  whileHover={{ scale: 1.2 }}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </motion.div>

          {/* 3D Laptop - Bottom Right */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="absolute bottom-0 right-0 w-80 h-80 md:w-96 md:h-96 lg:w-full lg:h-80 hidden md:block pointer-events-none"
            style={{ maxWidth: '800px', maxHeight: '800px',
              right: -300,
              bottom: -140
             }}
          >
            <LaptopCanvas />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
