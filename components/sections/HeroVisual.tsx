'use client';

import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';

// Gentle infinite float
const float = (delay: number, duration: number, y: number) => ({
  y: [0, -y, 0],
  transition: {
    duration,
    repeat: Infinity,
    ease: 'easeInOut' as const,
    delay,
  },
});

// Typing animation for code lines
function TypedCode() {
  const lines = [
    { indent: 0, parts: [{ text: 'const ', cls: 'text-blue-400' }, { text: 'app', cls: 'text-amber-400' }, { text: ' = ', cls: '' }, { text: 'await', cls: 'text-blue-400' }] },
    { indent: 1, parts: [{ text: 'buildProject', cls: 'text-emerald-400' }, { text: '({', cls: '' }] },
    { indent: 2, parts: [{ text: 'design', cls: 'text-sky-300' }, { text: ': ', cls: '' }, { text: 'true', cls: 'text-amber-300' }, { text: ',', cls: '' }] },
    { indent: 2, parts: [{ text: 'deploy', cls: 'text-sky-300' }, { text: ': ', cls: '' }, { text: 'true', cls: 'text-amber-300' }, { text: ',', cls: '' }] },
    { indent: 2, parts: [{ text: 'scale', cls: 'text-sky-300' }, { text: ': ', cls: '' }, { text: "'auto'", cls: 'text-emerald-300' }] },
    { indent: 1, parts: [{ text: '});', cls: '' }] },
  ];

  const [visibleLines, setVisibleLines] = useState(0);
  const [cursorLine, setCursorLine] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        setVisibleLines(prev => {
          if (prev >= lines.length) {
            // Reset after a pause
            setTimeout(() => {
              setVisibleLines(0);
              setCursorLine(0);
            }, 3000);
            clearInterval(interval);
            return prev;
          }
          setCursorLine(prev);
          return prev + 1;
        });
      }, 400);
      return () => clearInterval(interval);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {lines.map((line, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: i < visibleLines ? 1 : 0 }}
          transition={{ duration: 0.15 }}
          style={{ paddingLeft: `${line.indent * 8}px` }}
        >
          {line.parts.map((part, j) => (
            <span key={j} className={part.cls}>{part.text}</span>
          ))}
          {i === cursorLine && i < visibleLines && (
            <motion.span
              className="inline-block w-[6px] h-[12px] bg-blue-400 ml-0.5"
              animate={{ opacity: [1, 0] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            />
          )}
        </motion.div>
      ))}
      {visibleLines <= 0 && (
        <motion.span
          className="inline-block w-[6px] h-[12px] bg-blue-400"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.6, repeat: Infinity }}
        />
      )}
    </>
  );
}

// Notification that pops in, stays, fades, and repeats
function LoopingNotifications() {
  const notifications = [
    { icon: 'check', color: 'bg-emerald-500/20 text-emerald-500', title: 'Deployed to production', time: '2 seconds ago' },
    { icon: 'star', color: 'bg-amber-500/20 text-amber-500', title: 'New 5-star review', time: 'just now' },
    { icon: 'trending_up', color: 'bg-blue-500/20 text-blue-500', title: 'Traffic up 42%', time: '1 minute ago' },
    { icon: 'shopping_cart', color: 'bg-purple-500/20 text-purple-500', title: '12 new orders', time: '3 minutes ago' },
  ];

  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        setCurrent(prev => (prev + 1) % notifications.length);
      }, 3500);
      return () => clearInterval(interval);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const notif = notifications[current];

  return (
    <motion.div
      key={current}
      initial={{ opacity: 0, x: -30, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="rounded-lg border border-border bg-background shadow-xl px-4 py-3 flex items-center gap-3"
    >
      <div className={`w-8 h-8 rounded-full ${notif.color.split(' ')[0]} flex items-center justify-center`}>
        <span className={`material-icons ${notif.color.split(' ')[1]}`} style={{ fontSize: '18px' }}>{notif.icon}</span>
      </div>
      <div>
        <div className="text-xs font-semibold">{notif.title}</div>
        <div className="text-[10px] text-muted-foreground">{notif.time}</div>
      </div>
    </motion.div>
  );
}

// Mouse parallax hook
function useMouseParallax(strength: number = 20) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 50, damping: 20 });
  const springY = useSpring(y, { stiffness: 50, damping: 20 });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const cx = (e.clientX / window.innerWidth - 0.5) * strength;
      const cy = (e.clientY / window.innerHeight - 0.5) * strength;
      x.set(cx);
      y.set(cy);
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [strength, x, y]);

  return { x: springX, y: springY };
}

export function HeroVisual() {
  const mouse = useMouseParallax(15);
  const mouseDeep = useMouseParallax(25);
  const mouseShallow = useMouseParallax(8);

  return (
    <div className="relative w-full h-full min-h-[340px] md:min-h-[460px]">
      {/* Browser window — back layer, gentle float + parallax */}
      <motion.div
        initial={{ opacity: 0, y: 40, rotate: 2 }}
        animate={{ opacity: 1, y: 0, rotate: 2 }}
        transition={{ duration: 1, delay: 0.5, ease: 'easeOut' }}
        style={{ x: mouseShallow.x, y: mouseShallow.y }}
        className="absolute top-4 left-0 right-4 md:right-8"
      >
        <motion.div animate={float(0, 6, 8)}>
          <div className="rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/50">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-background rounded-md px-3 py-1 text-xs text-muted-foreground font-mono border border-border max-w-[200px]">
                  yourapp.com
                </div>
              </div>
            </div>
            {/* Browser content */}
            <div className="p-4 md:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <motion.div
                    className="w-6 h-6 rounded bg-primary/20"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <div className="w-20 h-3 rounded bg-foreground/10" />
                </div>
                <div className="flex gap-3">
                  <div className="w-12 h-3 rounded bg-foreground/8" />
                  <div className="w-12 h-3 rounded bg-foreground/8" />
                  <div className="w-16 h-6 rounded-md bg-primary/20" />
                </div>
              </div>
              <div className="pt-2">
                <motion.div
                  className="w-3/4 h-5 rounded bg-foreground/10 mb-2"
                  animate={{ width: ['75%', '65%', '75%'] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div className="w-1/2 h-5 rounded bg-primary/15 mb-4" />
                <div className="w-2/3 h-3 rounded bg-foreground/6 mb-1.5" />
                <div className="w-1/2 h-3 rounded bg-foreground/6" />
              </div>
              {/* Animated cards */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                {[
                  { color: 'bg-blue-500/15', accent: 'bg-blue-500/30', delay: 0 },
                  { color: 'bg-emerald-500/15', accent: 'bg-emerald-500/30', delay: 0.3 },
                  { color: 'bg-amber-500/15', accent: 'bg-amber-500/30', delay: 0.6 },
                ].map((card, i) => (
                  <motion.div
                    key={i}
                    className={`rounded-lg p-3 ${card.color}`}
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: card.delay }}
                  >
                    <motion.div
                      className={`w-8 h-8 rounded-md ${card.accent} mb-2`}
                      animate={{ scale: [1, 1.08, 1] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: card.delay }}
                    />
                    <div className="w-full h-2 rounded bg-foreground/8 mb-1.5" />
                    <div className="w-2/3 h-2 rounded bg-foreground/6" />
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Mobile frame — floats independently + deeper parallax */}
      <motion.div
        initial={{ opacity: 0, y: 50, x: 20 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ duration: 1, delay: 0.8, ease: 'easeOut' }}
        style={{ x: mouseDeep.x, y: mouseDeep.y }}
        className="absolute bottom-0 right-0 w-[140px] md:w-[170px] z-10"
      >
        <motion.div animate={float(1, 5, 10)}>
          <div className="rounded-2xl border-2 border-border bg-background shadow-2xl overflow-hidden">
            <div className="flex justify-center py-2 bg-muted/50 border-b border-border">
              <div className="w-16 h-3 rounded-full bg-foreground/10" />
            </div>
            <div className="p-3 space-y-3">
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-8 h-8 rounded-full bg-primary/20"
                  animate={{ scale: [1, 1.15, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                />
                <div>
                  <div className="w-16 h-2 rounded bg-foreground/10 mb-1" />
                  <div className="w-10 h-1.5 rounded bg-foreground/6" />
                </div>
              </div>
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/50"
                  animate={{ x: [0, 2, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.4 }}
                >
                  <div className="w-6 h-6 rounded bg-primary/15 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="w-full h-2 rounded bg-foreground/8 mb-1" />
                    <div className="w-2/3 h-1.5 rounded bg-foreground/5" />
                  </div>
                </motion.div>
              ))}
              <div className="flex justify-around pt-2 border-t border-border">
                {[0, 1, 2, 3].map(i => (
                  <motion.div
                    key={i}
                    className={`w-5 h-5 rounded ${i === 0 ? 'bg-primary/20' : 'bg-foreground/8'}`}
                    whileHover={{ scale: 1.3 }}
                    animate={i === 0 ? { scale: [1, 1.15, 1] } : {}}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Code snippet — types in, resets, parallax */}
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, delay: 1.1, ease: 'easeOut' }}
        style={{ x: mouse.x, y: mouse.y }}
        className="absolute -top-2 right-0 md:right-4 w-[180px] md:w-[210px] z-20 hidden md:block"
      >
        <motion.div animate={float(0.5, 7, 6)}>
          <div className="rounded-lg border border-border bg-foreground text-background shadow-xl p-3 font-mono text-[10px] leading-relaxed">
            <div className="flex items-center gap-1.5 mb-2 text-[9px] opacity-50">
              <span className="material-icons" style={{ fontSize: '12px' }}>code</span>
              app.tsx
            </div>
            <TypedCode />
          </div>
        </motion.div>
      </motion.div>

      {/* Looping notifications — bottom-left */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.8 }}
        style={{ x: mouseShallow.x, y: mouseShallow.y }}
        className="absolute bottom-16 left-0 md:left-4 z-20 hidden md:block"
      >
        <motion.div animate={float(2, 5.5, 5)}>
          <LoopingNotifications />
        </motion.div>
      </motion.div>
    </div>
  );
}
