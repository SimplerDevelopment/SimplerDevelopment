'use client';

import dynamic from 'next/dynamic';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { Button } from '@/components/ui/Button';
import { use3DScene } from '@/hooks/use3DScene';
import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { getAllBlogPosts, getAllCategories } from '@/lib/data/blog';
import Link from 'next/link';
import {
  SiNextdotjs,
  SiReact,
  SiVuedotjs,
  SiWordpress,
  SiShopify,
  SiBigcommerce,
  SiSanity,
  SiFigma,
  SiAmazon,
  SiRailway,
  SiN8N,
  SiVercel,
  SiApple,
  SiAndroid,
  SiTypescript,
  SiNodedotjs,
  SiStripe,
  SiPostgresql,
  SiGoogle,
  SiGmail,
  SiLinkedin,
  SiHubspot,
  SiApollographql,
} from 'react-icons/si';
import { HiCube } from 'react-icons/hi';

// Lazy load heavy 3D components
const HeroScene = dynamic(() => import('@/components/three/HeroScene').then(mod => ({ default: mod.HeroScene })), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20 animate-pulse" />
});

const FeaturesBackground = dynamic(() => import('@/components/three/FeaturesBackground').then(mod => ({ default: mod.FeaturesBackground })), {
  ssr: false,
  loading: () => null
});

// Platform logos for Cross-Platform Excellence section
const platforms = [
  { name: 'Next.js', icon: SiNextdotjs },
  { name: 'React', icon: SiReact },
  { name: 'Vue.js', icon: SiVuedotjs },
  { name: 'Builder.io', icon: HiCube }, // Placeholder
  { name: 'WordPress', icon: SiWordpress },
  { name: 'Shopify', icon: SiShopify },
  { name: 'BigCommerce', icon: SiBigcommerce },
  { name: 'Sanity.io', icon: SiSanity },
  { name: 'Figma', icon: SiFigma },
  { name: 'AWS', icon: SiAmazon },
  { name: 'Railway', icon: SiRailway },
  { name: 'n8n', icon: SiN8N },
  { name: 'Vercel', icon: SiVercel },
  { name: 'iOS', icon: SiApple },
  { name: 'Android', icon: SiAndroid },
  { name: 'TypeScript', icon: SiTypescript },
  { name: 'Node.js', icon: SiNodedotjs },
  { name: 'Stripe', icon: SiStripe },
  { name: 'PostgreSQL', icon: SiPostgresql },
  { name: 'Google', icon: SiGoogle },
  { name: 'Gmail', icon: SiGmail },
  { name: 'LinkedIn', icon: SiLinkedin },
  { name: 'HubSpot', icon: SiHubspot },
  { name: 'Bullhorn', icon: HiCube }, // Placeholder
  { name: 'Apollo.io', icon: SiApollographql },
];

const heroSlides = [
  {
    badge: 'Design',
    slug: 'design',
    title: 'Beautiful, User-Centered Design',
    description: 'Transform your vision into stunning visual experiences. From brand identity to UI/UX design, we craft interfaces that captivate users and drive engagement.',
    sceneType: 'view1' as const,
    color: '#22c55e', // green - matches first ring
  },
  {
    badge: 'Development',
    slug: 'development',
    title: 'Build Better Apps & Websites',
    description: 'Full-stack development for web, Android, and iOS. We create scalable applications with modern technology, beautiful design, and seamless user experiences.',
    sceneType: 'view2' as const,
    color: '#3b82f6', // blue - matches second ring
  },
  {
    badge: 'Growth & Marketing',
    slug: 'growth-marketing',
    title: 'Scale Your Digital Presence',
    description: 'Strategic digital marketing and growth solutions. SEO, content strategy, analytics, and conversion optimization to accelerate your business growth.',
    sceneType: 'view4' as const,
    color: '#ec4899', // pink - matches fourth ring
  },
  {
    badge: 'AI & Automation',
    slug: 'ai-automation',
    title: 'Intelligent Automation & AI',
    description: 'Harness the power of artificial intelligence to transform your business. Custom AI integrations, intelligent automation, and machine learning solutions that drive results.',
    sceneType: 'view3' as const,
    color: '#a855f7', // purple - matches third ring
  },
  {
    badge: 'Partnership',
    slug: 'partnership',
    title: 'Long-Term Strategic Partnership',
    description: 'More than just a vendor, we become your trusted technology partner. Ongoing support, strategic guidance, and collaborative growth for lasting success.',
    sceneType: 'view5' as const,
    color: '#fbbf24', // gold
  },
];

export function HomeClient() {
  const { supportsWebGL } = use3DScene();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  // Get recent blog posts (limit to 3)
  const recentPosts = getAllBlogPosts().slice(0, 3);
  const categories = getAllCategories();

  const goToSlide = (index: number) => {
    if (index === currentSlide) return;

    // Fade out current content before changing slide
    if (contentRef.current) {
      gsap.to(contentRef.current, {
        opacity: 0,
        duration: 0.3,
        ease: 'power2.inOut',
        onComplete: () => {
          setCurrentSlide(index);
        },
      });
    } else {
      setCurrentSlide(index);
    }
  };

  // Auto-advance carousel
  useEffect(() => {
    if (!isPlaying) return;

    // Slide 5 (Partnership) stays visible 2x longer
    const duration = currentSlide === 4 ? 16000 : 8000;

    const interval = setInterval(() => {
      const nextSlide = (currentSlide + 1) % heroSlides.length;
      goToSlide(nextSlide);
    }, duration);

    return () => clearInterval(interval);
  }, [currentSlide, isPlaying]);

  // GSAP animation for content transitions
  useEffect(() => {
    if (!contentRef.current) return;

    const ctx = gsap.context(() => {
      // Animate the main content container - fade in with delay
      gsap.fromTo(
        contentRef.current,
        {
          opacity: 0,
        },
        {
          opacity: 1,
          duration: 0.6,
          delay: 0.5,
          ease: 'power2.inOut',
        }
      );
    }, contentRef);

    return () => ctx.revert();
  }, [currentSlide]);

  const currentSlideData = heroSlides[currentSlide];


  return (
    <>
      {/* Immersive 3D Hero Section */}
      <section className="relative h-[85vh] md:min-h-screen w-full overflow-hidden flex items-center py-6 md:py-20">
        {/* 3D Background */}
        <div className="absolute inset-0 z-0">
          <HeroScene sceneType={currentSlideData.sceneType} color={currentSlideData.color} />
        </div>

        {/* WebGL Not Supported Fallback */}
        {!supportsWebGL && (
          <div className="absolute inset-0 z-0 bg-gradient-to-br from-primary/20 via-purple-500/20 to-pink-500/20" />
        )}

        {/* Gradient Overlay for readability - transitions smoothly to next section */}
        <div className="absolute inset-0 z-10 bg-gradient-to-b from-background/60 via-background/40 to-transparent pointer-events-none" />

        {/* Hero Content */}
        <div className="relative z-20 w-full h-full flex flex-col pointer-events-none">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 flex-1 flex flex-col">
            {/* Carousel Navigation - At the top */}
            <div className="flex items-center gap-2 sm:gap-3 md:gap-5 flex-wrap mb-6 md:mb-8 justify-center pointer-events-auto">
              {/* Play/Pause Button */}
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm rounded-full backdrop-blur-md border border-primary/20 bg-background/20 text-muted-foreground hover:bg-primary/10 hover:border-primary/40 transition-all duration-300 flex items-center gap-1.5 sm:gap-2"
                aria-label={isPlaying ? 'Pause slideshow' : 'Play slideshow'}
              >
                {isPlaying ? (
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {heroSlides.map((slide, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm rounded-full backdrop-blur-md border transition-all duration-300 flex items-center gap-1.5 sm:gap-2 ${
                    index === currentSlide
                      ? 'shadow-lg'
                      : 'bg-background/20 border-primary/20 text-muted-foreground hover:bg-primary/10 hover:border-primary/40'
                  }`}
                  style={index === currentSlide ? {
                    borderColor: currentSlideData.color,
                    color: currentSlideData.color,
                    backgroundColor: `${currentSlideData.color}30`,
                  } : undefined}
                  aria-label={`Go to ${slide.badge}`}
                >
                  <span
                    className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: slide.color }}
                  />
                  <span className="hidden sm:inline">{slide.badge}</span>
                </button>
              ))}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 lg:gap-12 items-center max-w-7xl mx-auto flex-1">
              {/* Left Column - Text Content */}
              <div className="text-left pointer-events-auto order-1 flex flex-col justify-center">
                <div ref={contentRef}>
                  <div
                    className="inline-block mb-3 md:mb-4 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full backdrop-blur-sm border"
                    style={{
                      backgroundColor: `${currentSlideData.color}10`,
                      borderColor: `${currentSlideData.color}33`,
                    }}
                  >
                    <span className="font-semibold text-xs sm:text-sm" style={{ color: currentSlideData.color }}>
                      {currentSlideData.badge}
                    </span>
                  </div>

                  <h1
                    className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 md:mb-4 lg:mb-6 leading-tight tracking-wide"
                    style={{ color: currentSlideData.color }}
                  >
                    {currentSlideData.title}
                  </h1>

                  <p className="text-base md:text-lg lg:text-xl text-muted-foreground mb-4 md:mb-6 lg:mb-8 max-w-2xl backdrop-blur-sm bg-background/70 md:bg-transparent p-3 md:p-0 rounded-lg md:rounded-none leading-relaxed">
                    {currentSlideData.description}
                  </p>

                  {/* CTA Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                    <Button
                      href="/contact"
                      size="lg"
                      className="backdrop-blur-sm transition-colors duration-300 w-full sm:w-auto justify-center"
                      style={{ backgroundColor: currentSlideData.color, color: '#ffffff' }}
                    >
                      <span className="hidden sm:inline">Start Your Project</span>
                      <span className="sm:hidden">Get Started</span>
                      <svg
                        className="w-5 h-5 ml-2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Button>
                    <Button
                      href="/solutions"
                      variant="outline"
                      size="lg"
                      className="bg-background transition-colors duration-300 w-full sm:w-auto justify-center"
                      style={{ borderColor: currentSlideData.color }}
                    >
                      Explore Solutions
                    </Button>
                  </div>
                </div>
              </div>

              {/* Right Column - 3D Graphic Showcase */}
              <div className="relative h-[200px] sm:h-[280px] md:h-[350px] lg:h-[450px] xl:h-[500px] flex items-center justify-center pointer-events-none order-2">
                {/* Glow effect behind the 3D scene */}
                <div className="absolute inset-0 blur-3xl bg-gradient-to-r from-primary/15 via-purple-500/15 to-pink-500/15 opacity-30 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>

      </section>

      {/* Intro Section */}
      <section className="relative pt-16 pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto">
            <FadeIn>
              <div className="text-center mb-12">
                <span className="inline-block px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-6">
                  Your Business Is Unique
                </span>
                <h2 className="font-display text-3xl md:text-5xl font-bold mb-8 leading-tight">
                  If Your Business Was Like Every Other,{' '}
                  <span className="text-primary">It Wouldn't Be Yours</span>
                </h2>
              </div>
            </FadeIn>

            <FadeIn delay={0.2}>
              <div className="prose prose-lg dark:prose-invert mx-auto text-center">
                <p className="text-xl md:text-2xl text-muted-foreground leading-relaxed mb-8">
                  Your business is a living, breathing organism—constantly evolving, adapting,
                  and growing in ways that are entirely your own.
                </p>
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8">
                  When the right tools, processes, and people come together, your business doesn't
                  just survive—it <span className="text-foreground font-semibold">thrives</span>.
                  It becomes more efficient, more innovative, and more capable of achieving
                  the vision only you can see.
                </p>
              </div>
            </FadeIn>

            <FadeIn delay={0.4}>
              <div className="mt-12 p-8 rounded-2xl bg-gradient-to-br from-primary/10 via-purple-500/5 to-pink-500/10 border border-primary/20 backdrop-blur-sm">
                <p className="text-lg md:text-xl text-center leading-relaxed">
                  <span className="font-semibold text-primary">Simpler Development</span> exists
                  to help you cultivate that environment. We bring clarity to complexity, build
                  systems that scale with your ambitions, and empower your team with technology
                  that works as hard as you do.
                </p>
                <div className="mt-8 flex justify-center">
                  <Button href="/about" size="lg" variant="outline">
                    Learn About Our Approach
                  </Button>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Features Highlight */}
      <section className="relative pt-16 pb-60  overflow-hidden -mt-40">
        {/* 3D Background */}
        <FeaturesBackground />

        {/* Smooth gradient transition from hero section - darker, less colorful */}
        <div className="absolute inset-0  pointer-events-none" />

        {/* Subtle vignette effect */}
        <div className="absolute inset-0  pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <FadeIn>
              <div className="text-center mb-16">
                <h2 className="font-heading text-4xl md:text-6xl font-bold mt-6 mb-6">
                  Cross-Platform Excellence
                </h2>
                <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto">
                  From responsive websites to native mobile apps, we build solutions
                  that work seamlessly across all devices and platforms.
                </p>
              </div>
            </FadeIn>

            {/* Platform Logos Marquee */}
            <div className="relative overflow-hidden">
              {/* Fade edges */}
              <div className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent z-10 pointer-events-none" />
              <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent z-10 pointer-events-none" />

              {/* Marquee container */}
              <div className="flex gap-12 py-0 animate-marquee">
                {platforms.map((platform, i) => {
                  const Icon = platform.icon;
                  return (
                    <div
                      key={`platform-1-${i}`}
                      className="flex flex-col items-center justify-center px-8 py-6 rounded-lg bg-background/40 backdrop-blur-sm transition-colors min-w-[160px]"
                    >
                      <Icon className="text-7xl mb-3" />
                      <span className="text-lg font-semibold whitespace-nowrap">{platform.name}</span>
                    </div>
                  );
                })}
                {/* Duplicate for seamless loop */}
                {platforms.map((platform, i) => {
                  const Icon = platform.icon;
                  return (
                    <div
                      key={`platform-2-${i}`}
                      className="flex flex-col items-center justify-center px-8 py-6 rounded-lg bg-background/40 backdrop-blur-sm transition-colors min-w-[160px]"
                    >
                      <Icon className="text-7xl mb-3" />
                      <span className="text-lg font-semibold whitespace-nowrap">{platform.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Case Study */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-7xl mx-auto">
            <FadeIn>
              <div className="text-center mb-16">
                <span className="inline-block px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-6">
                  Featured Case Study
                </span>
                <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">
                  Real Results for Real Businesses
                </h2>
                <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
                  See how we helped transform a growing business with custom technology solutions
                </p>
              </div>
            </FadeIn>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              {/* Left: Visual */}
              <FadeIn delay={0.2}>
                <div className="relative rounded-2xl overflow-hidden border border-primary/20 bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/10 aspect-[4/3]">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center p-8">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/20 mb-4">
                        <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-2xl font-bold mb-2">E-Commerce Platform</h3>
                      <p className="text-muted-foreground">Custom solution for rapid growth</p>
                    </div>
                  </div>
                </div>
              </FadeIn>

              {/* Right: Content */}
              <div className="space-y-8">
                <FadeIn delay={0.3}>
                  <div>
                    <h3 className="text-2xl md:text-3xl font-bold mb-4">
                      From Concept to 50,000 Users in 6 Months
                    </h3>
                    <p className="text-lg text-muted-foreground mb-6">
                      We partnered with a growing retail brand to build a scalable e-commerce platform
                      that could handle their ambitious growth plans. Using modern technologies and
                      best practices, we delivered a solution that exceeded expectations.
                    </p>
                  </div>
                </FadeIn>

                {/* Metrics */}
                <FadeIn delay={0.4}>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 rounded-lg bg-background/40 backdrop-blur-sm border border-primary/20">
                      <div className="text-3xl font-bold text-primary mb-1">300%</div>
                      <div className="text-sm text-muted-foreground">Revenue Growth</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-background/40 backdrop-blur-sm border border-primary/20">
                      <div className="text-3xl font-bold text-primary mb-1">50K+</div>
                      <div className="text-sm text-muted-foreground">Active Users</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-background/40 backdrop-blur-sm border border-primary/20">
                      <div className="text-3xl font-bold text-primary mb-1">99.9%</div>
                      <div className="text-sm text-muted-foreground">Uptime</div>
                    </div>
                  </div>
                </FadeIn>

                {/* Testimonial */}
                <FadeIn delay={0.5}>
                  <div className="p-6 rounded-xl bg-gradient-to-br from-primary/10 via-purple-500/5 to-pink-500/10 border border-primary/20">
                    <p className="text-lg italic mb-4">
                      "Simpler Development didn't just build us a website—they built us a
                      platform that scales with our vision. The attention to detail and
                      technical expertise is unmatched."
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="text-primary font-semibold text-lg">JD</span>
                      </div>
                      <div>
                        <div className="font-semibold">Jane Doe</div>
                        <div className="text-sm text-muted-foreground">CEO, Retail Brand</div>
                      </div>
                    </div>
                  </div>
                </FadeIn>

                {/* CTA */}
                <FadeIn delay={0.6}>
                  <div className="flex gap-4">
                    <Button href="/blog/category/case-studies" variant="outline">
                      View More Case Studies
                    </Button>
                  </div>
                </FadeIn>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Blog Posts */}
      <section className="relative py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-background to-background" />

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-7xl mx-auto">
            <FadeIn>
              <div className="text-center mb-16">
                <span className="inline-block px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-6">
                  Latest Insights
                </span>
                <h2 className="font-display text-3xl md:text-5xl font-bold mb-4">
                  Recent from Our Blog
                </h2>
                <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto">
                  Tips, tutorials, and insights on web development, design, and digital strategy
                </p>
              </div>
            </FadeIn>

            {/* Blog Posts Grid */}
            {recentPosts && recentPosts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
                {recentPosts.map((post, index) => {
                  const category = categories.find(c => c.slug === post.category);

                  return (
                    <SlideIn key={post.id} direction="up" delay={index * 0.1}>
                      <Link href={`/blog/${post.slug}`}>
                        <article className="group h-full rounded-lg border bg-card overflow-hidden transition-all hover:shadow-lg hover:border-primary/40">
                          {post.coverImage && (
                            <div className="aspect-video overflow-hidden bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/10">
                              <img
                                src={post.coverImage}
                                alt={post.title}
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              />
                            </div>
                          )}
                          {!post.coverImage && (
                            <div className="aspect-video overflow-hidden bg-gradient-to-br from-primary/20 via-purple-500/10 to-pink-500/10 flex items-center justify-center">
                              <svg className="w-16 h-16 text-primary/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                              </svg>
                            </div>
                          )}

                          <div className="p-6">
                            {category && (
                              <div
                                className="text-sm font-medium mb-2"
                                style={{ color: category.color }}
                              >
                                {category.name}
                              </div>
                            )}

                            <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors line-clamp-2">
                              {post.title}
                            </h3>

                            {post.excerpt && (
                              <p className="text-muted-foreground mb-4 line-clamp-3">
                                {post.excerpt}
                              </p>
                            )}

                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                              <div className="flex items-center gap-3">
                                {post.readTime && (
                                  <span>{post.readTime} min read</span>
                                )}
                              </div>
                              {post.publishedAt && (
                                <time dateTime={post.publishedAt}>
                                  {new Date(post.publishedAt).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                                </time>
                              )}
                            </div>
                          </div>
                        </article>
                      </Link>
                    </SlideIn>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-lg text-muted-foreground">
                  Blog posts coming soon!
                </p>
              </div>
            )}

            {/* View All Blog Posts CTA */}
            <FadeIn delay={0.3}>
              <div className="text-center">
                <Button href="/blog" variant="outline" size="lg">
                  View All Posts
                  <svg
                    className="w-5 h-5 ml-2"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Button>
              </div>
            </FadeIn>
          </div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-purple-500/20 to-pink-500/20 opacity-50" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,black_100%)]" />

        <div className="container mx-auto px-4 text-center relative z-10">
          <FadeIn>
            <h2 className="font-display text-4xl md:text-6xl font-bold mb-6 tracking-wide">
              Ready to Build Your Next App?
            </h2>
            <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto">
              Let&apos;s bring your ideas to life with modern web and mobile applications
              that scale with your business.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button href="/contact" size="lg">
                Start Your Project
                <svg
                  className="w-5 h-5 ml-2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Button>
              <Button href="/solutions" variant="outline" size="lg">
                View Our Work
              </Button>
            </div>
          </FadeIn>
        </div>
      </section>
    </>
  );
}
