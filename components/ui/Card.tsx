'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { useBranding } from '@/contexts/BrandingContext';
import { Icon } from '@/components/ui/Icon';

interface CardProps {
  title: string;
  description: string;
  /** Optional secondary line between title and description (e.g. team-member role). */
  subtitle?: string;
  image?: string;
  icon?: string;
  iconSize?: string;
  link?: string;
  className?: string;
  cardStyle?: React.CSSProperties;
  titleStyle?: React.CSSProperties;
  subtitleStyle?: React.CSSProperties;
  descriptionStyle?: React.CSSProperties;
  iconStyle?: React.CSSProperties;
  linkStyle?: React.CSSProperties;
  imageStyle?: React.CSSProperties;
}

export function Card({
  title,
  description,
  subtitle,
  image,
  icon,
  iconSize,
  link,
  className = '',
  cardStyle,
  titleStyle,
  subtitleStyle,
  descriptionStyle,
  iconStyle,
  linkStyle,
  imageStyle,
}: CardProps) {
  const branding = useBranding();
  const brandCardStyle: React.CSSProperties = { ...cardStyle };
  if (branding?.borderRadius) brandCardStyle.borderRadius = branding.borderRadius;

  const content = (
    <motion.div
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`group relative h-full border border-border bg-background/80 backdrop-blur-sm p-6 shadow-sm transition-all hover:shadow-md hover:border-primary/40 ${!branding?.borderRadius ? 'rounded-xl' : ''} ${className}`}
      style={brandCardStyle}
    >
      {image && (
        <div className="mb-4 overflow-hidden rounded-lg">
          <img
            src={image}
            alt={title}
            className="w-full h-48 object-cover transition-transform group-hover:scale-105"
            style={imageStyle}
          />
        </div>
      )}

      {icon && (
        <Icon
          name={icon}
          className="text-primary mb-4 block"
          size={iconSize ? parseInt(iconSize, 10) : 48}
          style={iconStyle}
        />
      )}

      <h3 className="font-heading text-xl font-bold mb-2 text-foreground group-hover:text-primary transition-colors" style={titleStyle} dangerouslySetInnerHTML={{ __html: title }} />

      {subtitle && (
        <p className="text-sm font-medium text-primary/80 mb-2 tracking-wide" style={subtitleStyle} dangerouslySetInnerHTML={{ __html: subtitle }} />
      )}

      {description && (
        <p className="text-muted-foreground mb-4" style={descriptionStyle} dangerouslySetInnerHTML={{ __html: description }} />
      )}

      {link && (
        <div className="flex items-center text-primary font-medium group-hover:gap-2 transition-all" style={linkStyle}>
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
