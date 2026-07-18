'use client';

import { motion } from 'framer-motion';

interface AnimatedTextProps {
  text: string;
  className?: string;
  isHovered?: boolean;
}

export function AnimatedText({ text, className = '', isHovered = false }: AnimatedTextProps) {
  const letters = text.split('');

  return (
    <span className={className}>
      {letters.map((letter, index) => (
        <motion.span
          key={index}
          className="inline-block"
          animate={
            isHovered
              ? {
                  y: [0, -8, 0],
                  transition: {
                    duration: 0.4,
                    delay: index * 0.03,
                    ease: 'easeInOut',
                  },
                }
              : { y: 0 }
          }
        >
          {letter === ' ' ? '\u00A0' : letter}
        </motion.span>
      ))}
    </span>
  );
}
