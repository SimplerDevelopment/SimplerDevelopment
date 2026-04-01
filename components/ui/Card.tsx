'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

interface CardProps {
  title: string;
  description: string;
  image?: string;
  icon?: string;
  iconSize?: string;
  link?: string;
  className?: string;
  cardStyle?: React.CSSProperties;
  titleStyle?: React.CSSProperties;
  descriptionStyle?: React.CSSProperties;
}

export function Card({
  title,
  description,
  image,
  icon,
  iconSize,
  link,
  className = '',
  cardStyle,
  titleStyle,
  descriptionStyle,
}: CardProps) {
  const content = (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`group relative h-full rounded-xl border border-border bg-background/80 backdrop-blur-sm p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/40 ${className}`}
      style={cardStyle}
    >
      {image && (
        <div className="mb-4 overflow-hidden rounded-lg">
          <img
            src={image}
            alt={title}
            className="w-full h-48 object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}

      {icon && (
        <span className="material-icons text-primary mb-4 block" style={{ fontSize: iconSize ? `${iconSize}px` : '3rem' }}>{icon}</span>
      )}

      <h3 className="font-heading text-xl font-bold mb-2 text-foreground group-hover:text-primary transition-colors" style={titleStyle}>
        {title}
      </h3>

      <p className="text-muted-foreground mb-4" style={descriptionStyle}>{description}</p>

      {link && (
        <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all">
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
