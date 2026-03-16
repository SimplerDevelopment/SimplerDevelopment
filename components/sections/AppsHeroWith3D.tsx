'use client';

import dynamic from 'next/dynamic';
import { Hero } from './Hero';

const AppsHeroScene = dynamic(
  () => import('@/components/three/AppsHeroScene').then(mod => ({ default: mod.AppsHeroScene })),
  { ssr: false }
);

export function AppsHeroWith3D() {
  return (
    <div className="relative">
      {/* 3D Scene Background */}
      <div className="absolute inset-0 -z-10">
        <AppsHeroScene className="h-full w-full" color="#8b5cf6" />
      </div>

      {/* Hero Content */}
      <Hero
        subtitle="Apps and Products"
        title="Digital Tools Built for Modern Web"
        description="Discover our suite of applications and digital products designed to streamline your workflow, enhance productivity, and deliver exceptional user experiences."
        ctaText="Get Started"
        ctaLink="/contact"
        secondaryCtaText="View Solutions"
        secondaryCtaLink="/solutions"
      />
    </div>
  );
}
