'use client';

import { PalizziNavBlock } from '@/types/blocks';
import { useState, useEffect } from 'react';
import Image from 'next/image';

interface PalizziNavBlockRenderProps {
  block: PalizziNavBlock;
}

export function PalizziNavBlockRender({ block }: PalizziNavBlockRenderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'backdrop-blur-md border-b'
          : 'bg-transparent'
      }`}
      style={{
        backgroundColor: scrolled ? 'rgba(13,13,13,0.95)' : 'transparent',
        borderColor: scrolled ? 'rgba(201,169,110,0.2)' : 'transparent',
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <a href="#" className="flex items-center gap-3">
          <Image
            src={block.logoUrl}
            alt={block.brandName}
            width={36}
            height={36}
            style={{ opacity: 0.8 }}
          />
          <span
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              fontSize: '1.25rem',
              letterSpacing: '0.1em',
              color: '#c9a96e',
              textTransform: 'uppercase',
            }}
          >
            {block.brandName}
          </span>
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {block.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              style={{
                fontSize: '0.875rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(245,230,211,0.7)',
                transition: 'color 0.3s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#c9a96e')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(245,230,211,0.7)')}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden flex flex-col gap-1.5 p-2"
          aria-label="Toggle menu"
        >
          <span
            className="block w-6 h-px transition-all duration-300"
            style={{
              backgroundColor: '#f5e6d3',
              transform: menuOpen ? 'rotate(45deg) translateY(4px)' : 'none',
            }}
          />
          <span
            className="block w-6 h-px transition-all duration-300"
            style={{
              backgroundColor: '#f5e6d3',
              opacity: menuOpen ? 0 : 1,
            }}
          />
          <span
            className="block w-6 h-px transition-all duration-300"
            style={{
              backgroundColor: '#f5e6d3',
              transform: menuOpen ? 'rotate(-45deg) translateY(-4px)' : 'none',
            }}
          />
        </button>
      </div>

      {/* Mobile menu */}
      <div
        className="md:hidden overflow-hidden transition-all duration-500"
        style={{
          maxHeight: menuOpen ? '16rem' : '0',
          borderBottom: menuOpen ? '1px solid rgba(201,169,110,0.2)' : 'none',
        }}
      >
        <div
          className="backdrop-blur-md px-6 py-4 flex flex-col gap-4"
          style={{ backgroundColor: 'rgba(13,13,13,0.95)' }}
        >
          {block.links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontSize: '0.875rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(245,230,211,0.7)',
                transition: 'color 0.3s',
              }}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </nav>
  );
}
