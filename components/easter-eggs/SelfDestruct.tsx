'use client';

import { useEffect, useState, useLayoutEffect, useRef, useCallback } from 'react';
import 'animate.css';

// ─── KONAMI CODE ────────────────────────────────────────────────────────────

const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'KeyB', 'KeyA',
];

function useKonamiCode(onActivate: () => void) {
  const indexRef = useRef(0);
  const callbackRef = useRef(onActivate);
  useLayoutEffect(() => {
    callbackRef.current = onActivate;
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === KONAMI[indexRef.current]) {
        indexRef.current++;
        if (indexRef.current === KONAMI.length) {
          indexRef.current = 0;
          callbackRef.current();
        }
      } else {
        indexRef.current = e.code === KONAMI[0] ? 1 : 0;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}

// ─── GET TOP-LEVEL PAGE ELEMENTS ────────────────────────────────────────────

function getPageElements(): HTMLElement[] {
  const main = document.querySelector('main');
  const nav = document.querySelector('nav');
  const footer = document.querySelector('footer');

  const elements: HTMLElement[] = [];

  if (nav) elements.push(nav as HTMLElement);
  if (main) {
    elements.push(...Array.from(main.children) as HTMLElement[]);
  }
  if (footer) elements.push(footer as HTMLElement);

  return elements;
}

// ─── SHAKE PAGE ELEMENTS (during countdown) ─────────────────────────────────

function shakePageElements() {
  const elements = getPageElements();
  elements.forEach((el) => {
    el.classList.add('animate__animated', 'animate__shakeY', 'animate__infinite');
  });
}

function stopShakePageElements() {
  const elements = getPageElements();
  elements.forEach((el) => {
    el.classList.remove('animate__animated', 'animate__shakeY', 'animate__infinite');
    el.style.animationDelay = '';
  });
}

// ─── HINGE PAGE ELEMENTS (after countdown) ──────────────────────────────────

function hingePageElements() {
  const elements = getPageElements();

  // Stagger the hinge with random delays for a chaotic "falling apart" feel
  elements.forEach((el) => {
    const delay = Math.random() * 0.8;
    el.style.transformOrigin = Math.random() > 0.5 ? 'top left' : 'top right';
    el.style.animationDelay = `${delay}s`;
    el.classList.add('animate__animated', 'animate__hinge');
  });
}

// ─── COUNTDOWN OVERLAY ──────────────────────────────────────────────────────

function CountdownOverlay({ onComplete }: { onComplete: () => void }) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (count <= 0) {
      onComplete();
      return;
    }
    const timer = setTimeout(() => setCount(count - 1), 1000);
    return () => clearTimeout(timer);
  }, [count, onComplete]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99998,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        fontFamily: 'monospace',
      }}
    >
      {/* Scan lines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(transparent, transparent 2px, rgba(255,0,0,0.03) 2px, rgba(255,0,0,0.03) 4px)',
          pointerEvents: 'none',
        }}
      />

      {/* Warning klaxon bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: '#ff0000',
          animation: 'sd-scanline 0.5s linear infinite',
        }}
      />

      {/* Warning text */}
      <div
        style={{
          color: '#ff0000',
          fontSize: '14px',
          letterSpacing: '6px',
          textTransform: 'uppercase',
          marginBottom: '40px',
          animation: 'sd-blink 0.5s infinite',
        }}
      >
        WARNING: SELF-DESTRUCT SEQUENCE INITIATED
      </div>

      {/* Countdown number */}
      {count > 0 && (
        <div
          key={count}
          style={{
            color: '#ff2222',
            fontSize: '200px',
            fontWeight: 'bold',
            textShadow:
              '0 0 60px rgba(255,0,0,0.8), 0 0 120px rgba(255,0,0,0.4)',
            animation: 'sd-pulse 1s ease-out',
            lineHeight: 1,
          }}
        >
          {count}
        </div>
      )}

      <style>{`
        @keyframes sd-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes sd-pulse {
          0% { transform: scale(2); opacity: 0; }
          30% { transform: scale(1); opacity: 1; }
          100% { transform: scale(0.8); opacity: 0.5; }
        }
        @keyframes sd-scanline {
          from { transform: translateY(0); }
          to { transform: translateY(100vh); }
        }
      `}</style>
    </div>
  );
}

// ─── AFTERMATH SCREEN ───────────────────────────────────────────────────────

function AftermathScreen() {
  const [showCursor, setShowCursor] = useState(true);
  const [text, setText] = useState('');
  const [showButton, setShowButton] = useState(false);
  const fullText = 'SYSTEM DESTROYED';

  useEffect(() => {
    let i = 0;
    const typeTimer = setInterval(() => {
      if (i <= fullText.length) {
        setText(fullText.slice(0, i));
        i++;
      } else {
        clearInterval(typeTimer);
        setTimeout(() => setShowButton(true), 500);
      }
    }, 100);

    const cursorTimer = setInterval(() => setShowCursor((p) => !p), 500);

    return () => {
      clearInterval(typeTimer);
      clearInterval(cursorTimer);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        animation: 'sd-fadeIn 1s ease-in',
      }}
    >
      {/* CRT scan lines overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'repeating-linear-gradient(transparent, transparent 1px, rgba(0,0,0,0.15) 1px, rgba(0,0,0,0.15) 3px)',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      <div
        style={{
          color: '#ff0000',
          fontSize: 'clamp(24px, 5vw, 48px)',
          fontWeight: 'bold',
          textShadow:
            '0 0 30px rgba(255,0,0,0.5), 0 0 60px rgba(255,0,0,0.2)',
          letterSpacing: '8px',
          zIndex: 2,
        }}
      >
        {text}
        <span style={{ opacity: showCursor ? 1 : 0 }}>_</span>
      </div>

      {showButton && (
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '60px',
            padding: '12px 32px',
            background: 'transparent',
            border: '1px solid #333',
            color: '#666',
            fontFamily: 'monospace',
            fontSize: '14px',
            cursor: 'pointer',
            letterSpacing: '4px',
            textTransform: 'uppercase',
            transition: 'all 0.3s',
            zIndex: 2,
            animation: 'sd-fadeIn 0.5s ease-in',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#ff0000';
            e.currentTarget.style.color = '#ff0000';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(255,0,0,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#333';
            e.currentTarget.style.color = '#666';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          Reboot System
        </button>
      )}

      <style>{`
        @keyframes sd-fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

type Phase = 'idle' | 'countdown' | 'hinge' | 'aftermath';

export default function SelfDestruct() {
  const [phase, setPhase] = useState<Phase>('idle');

  const handleActivate = useCallback(() => {
    if (phase !== 'idle') return;
    setPhase('countdown');
    // Start shaking all page elements behind the countdown overlay
    shakePageElements();
  }, [phase]);

  useKonamiCode(handleActivate);

  const handleCountdownComplete = useCallback(() => {
    // Stop the shake, then apply hinge
    stopShakePageElements();
    hingePageElements();
    setPhase('hinge');

    // Wait for hinge animation (2s) + random delays (0.8s max) + 2s beat of silence
    setTimeout(() => {
      setPhase('aftermath');
    }, 4800);
  }, []);

  if (phase === 'idle') return null;

  return (
    <>
      {phase === 'countdown' && (
        <CountdownOverlay onComplete={handleCountdownComplete} />
      )}

      {phase === 'aftermath' && <AftermathScreen />}
    </>
  );
}
