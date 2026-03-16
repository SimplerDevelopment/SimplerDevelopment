'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

interface CardProps {
  title: string;
  description: string;
  image?: string;
  icon?: string;
  link?: string;
  className?: string;
}

export function Card({
  title,
  description,
  image,
  icon,
  link,
  className = '',
}: CardProps) {
  const content = (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`group relative h-full rounded-lg border border-green-500/30 bg-black/80 backdrop-blur-sm p-6 shadow-lg shadow-green-500/20 transition-all hover:shadow-xl hover:shadow-green-500/40 hover:border-green-500/60 ${className}`}
    >
      {image && (
        <div className="mb-4 overflow-hidden rounded-md">
          <img
            src={image}
            alt={title}
            className="w-full h-48 object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}

      {icon && (
        <span className="material-icons text-green-400 text-5xl mb-4 block">{icon}</span>
      )}

      <h3 className="font-heading text-xl font-bold mb-2 text-green-400 group-hover:text-green-300 transition-colors">
        {title}
      </h3>

      <p className="text-green-100/70 mb-4">{description}</p>

      {link && (
        <div className="flex items-center text-green-400 font-medium group-hover:gap-2 transition-all">
          Learn more
          <svg
            className="w-4 h-4 ml-1 transition-transform group-hover:translate-x-1"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </motion.div>
  );

  if (link) {
    return <Link href={link}>{content}</Link>;
  }

  return content;
}
