'use client';

interface BlockTypeIconProps {
  type: string;
  className?: string;
}

export function BlockTypeIcon({ type, className = 'w-10 h-10' }: BlockTypeIconProps) {
  const baseClass = `${className} text-muted-foreground`;

  switch (type) {
    case 'heading':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="8" width="32" height="6" rx="1.5" fill="currentColor" opacity="0.8" />
          <rect x="4" y="18" width="24" height="3" rx="1" fill="currentColor" opacity="0.3" />
          <rect x="4" y="24" width="28" height="3" rx="1" fill="currentColor" opacity="0.3" />
        </svg>
      );
    case 'text':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="8" width="32" height="3" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="4" y="14" width="28" height="3" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="4" y="20" width="32" height="3" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="4" y="26" width="20" height="3" rx="1" fill="currentColor" opacity="0.5" />
        </svg>
      );
    case 'image':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="6" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <circle cx="14" cy="16" r="3" fill="currentColor" opacity="0.4" />
          <path d="M4 28l8-10 6 7 4-4 14 7" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        </svg>
      );
    case 'button':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="6" y="13" width="28" height="14" rx="4" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <rect x="12" y="18.5" width="16" height="3" rx="1" fill="currentColor" opacity="0.6" />
        </svg>
      );
    case 'quote':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="8" y="6" width="2" height="28" rx="1" fill="currentColor" opacity="0.4" />
          <rect x="14" y="10" width="22" height="3" rx="1" fill="currentColor" opacity="0.4" />
          <rect x="14" y="16" width="18" height="3" rx="1" fill="currentColor" opacity="0.4" />
          <rect x="14" y="22" width="20" height="3" rx="1" fill="currentColor" opacity="0.4" />
          <rect x="14" y="30" width="12" height="2" rx="1" fill="currentColor" opacity="0.25" />
        </svg>
      );
    case 'code':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="6" width="32" height="28" rx="3" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
          <path d="M14 16l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
          <path d="M26 16l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
          <line x1="22" y1="13" x2="18" y2="27" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
        </svg>
      );
    case 'video':
    case 'youtube':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="8" width="32" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <path d="M16 14v12l10-6-10-6z" fill="currentColor" opacity="0.5" />
        </svg>
      );
    case 'spacer':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <path d="M20 8v6m0 12v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
          <path d="M17 11l3-3 3 3M17 29l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
          <rect x="6" y="17" width="28" height="6" rx="1" fill="currentColor" opacity="0.08" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" opacity="0.25" />
        </svg>
      );
    case 'divider':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="10" width="32" height="3" rx="1" fill="currentColor" opacity="0.2" />
          <line x1="4" y1="20" x2="36" y2="20" stroke="currentColor" strokeWidth="2" opacity="0.5" />
          <rect x="4" y="27" width="32" height="3" rx="1" fill="currentColor" opacity="0.2" />
        </svg>
      );
    case 'columns':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="6" width="14" height="28" rx="2" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <rect x="22" y="6" width="14" height="28" rx="2" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1.5" opacity="0.4" />
          <rect x="7" y="10" width="8" height="2" rx="0.5" fill="currentColor" opacity="0.3" />
          <rect x="7" y="14" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.3" />
          <rect x="25" y="10" width="8" height="2" rx="0.5" fill="currentColor" opacity="0.3" />
          <rect x="25" y="14" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.3" />
        </svg>
      );
    case 'section':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="3" y="4" width="34" height="32" rx="3" fill="currentColor" opacity="0.06" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 2" opacity="0.4" />
          <rect x="7" y="9" width="26" height="4" rx="1" fill="currentColor" opacity="0.25" />
          <rect x="7" y="16" width="26" height="3" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="7" y="22" width="26" height="3" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="7" y="28" width="16" height="3" rx="1" fill="currentColor" opacity="0.15" />
        </svg>
      );
    case 'accordion':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="6" width="32" height="8" rx="2" fill="currentColor" opacity="0.12" stroke="currentColor" strokeWidth="1" opacity="0.35" />
          <rect x="8" y="9" width="16" height="2" rx="0.5" fill="currentColor" opacity="0.4" />
          <path d="M32 9l-2 2-2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
          <rect x="4" y="17" width="32" height="8" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.25" />
          <rect x="8" y="20" width="14" height="2" rx="0.5" fill="currentColor" opacity="0.3" />
          <rect x="4" y="28" width="32" height="8" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.25" />
          <rect x="8" y="31" width="18" height="2" rx="0.5" fill="currentColor" opacity="0.3" />
        </svg>
      );
    case 'tabs':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="12" width="32" height="24" rx="0 0 2 2" stroke="currentColor" strokeWidth="1" opacity="0.35" />
          <rect x="4" y="6" width="12" height="7" rx="2 2 0 0" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" opacity="0.4" />
          <rect x="17" y="6" width="10" height="7" rx="2 2 0 0" stroke="currentColor" strokeWidth="1" opacity="0.2" />
          <rect x="8" y="17" width="24" height="2" rx="0.5" fill="currentColor" opacity="0.25" />
          <rect x="8" y="22" width="20" height="2" rx="0.5" fill="currentColor" opacity="0.2" />
          <rect x="8" y="27" width="22" height="2" rx="0.5" fill="currentColor" opacity="0.2" />
        </svg>
      );
    case 'hero':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="2" y="4" width="36" height="32" rx="2" fill="currentColor" opacity="0.06" />
          <rect x="8" y="10" width="24" height="4" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="10" y="17" width="20" height="2" rx="0.5" fill="currentColor" opacity="0.25" />
          <rect x="12" y="22" width="16" height="2" rx="0.5" fill="currentColor" opacity="0.2" />
          <rect x="13" y="28" width="14" height="5" rx="2" fill="currentColor" opacity="0.3" />
        </svg>
      );
    case 'cta':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="2" y="6" width="36" height="28" rx="3" fill="currentColor" opacity="0.1" />
          <rect x="8" y="11" width="24" height="3" rx="1" fill="currentColor" opacity="0.45" />
          <rect x="10" y="17" width="20" height="2" rx="0.5" fill="currentColor" opacity="0.2" />
          <rect x="8" y="24" width="12" height="5" rx="2" fill="currentColor" opacity="0.35" />
          <rect x="22" y="24" width="10" height="5" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        </svg>
      );
    case 'services-grid':
    case 'card-grid':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="3" y="4" width="10" height="14" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="15" y="4" width="10" height="14" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="27" y="4" width="10" height="14" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="3" y="22" width="10" height="14" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="15" y="22" width="10" height="14" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="27" y="22" width="10" height="14" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        </svg>
      );
    case 'stats':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="5" y="22" width="6" height="12" rx="1" fill="currentColor" opacity="0.3" />
          <rect x="13" y="14" width="6" height="20" rx="1" fill="currentColor" opacity="0.4" />
          <rect x="21" y="8" width="6" height="26" rx="1" fill="currentColor" opacity="0.5" />
          <rect x="29" y="18" width="6" height="16" rx="1" fill="currentColor" opacity="0.35" />
        </svg>
      );
    case 'testimonial':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <path d="M8 8h6c0 4-2 7-6 8V8zm10 0h6c0 4-2 7-6 8V8z" fill="currentColor" opacity="0.2" />
          <rect x="4" y="20" width="32" height="2" rx="0.5" fill="currentColor" opacity="0.3" />
          <rect x="6" y="25" width="28" height="2" rx="0.5" fill="currentColor" opacity="0.25" />
          <circle cx="12" cy="34" r="3" fill="currentColor" opacity="0.2" />
          <rect x="18" y="32" width="12" height="2" rx="0.5" fill="currentColor" opacity="0.25" />
        </svg>
      );
    case 'featured-content':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="6" width="16" height="28" rx="2" fill="currentColor" opacity="0.1" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="24" y="10" width="12" height="3" rx="1" fill="currentColor" opacity="0.4" />
          <rect x="24" y="16" width="12" height="2" rx="0.5" fill="currentColor" opacity="0.25" />
          <rect x="24" y="20" width="10" height="2" rx="0.5" fill="currentColor" opacity="0.2" />
          <rect x="24" y="27" width="10" height="4" rx="1.5" fill="currentColor" opacity="0.3" />
        </svg>
      );
    case 'blog-posts':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="3" y="4" width="10" height="18" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="15" y="4" width="10" height="18" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="27" y="4" width="10" height="18" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="5" y="6" width="6" height="6" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="17" y="6" width="6" height="6" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="29" y="6" width="6" height="6" rx="1" fill="currentColor" opacity="0.15" />
          <rect x="5" y="15" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.25" />
          <rect x="17" y="15" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.25" />
          <rect x="29" y="15" width="6" height="2" rx="0.5" fill="currentColor" opacity="0.25" />
        </svg>
      );
    case 'gallery':
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="3" y="4" width="10" height="10" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="15" y="4" width="10" height="10" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="27" y="4" width="10" height="10" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="3" y="16" width="10" height="14" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="15" y="16" width="10" height="8" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="27" y="16" width="10" height="12" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" opacity="0.3" />
          <rect x="15" y="26" width="10" height="8" rx="2" fill="currentColor" opacity="0.15" stroke="currentColor" strokeWidth="1" opacity="0.3" />
        </svg>
      );
    default:
      return (
        <svg className={baseClass} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="4" width="32" height="32" rx="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.3" />
          <rect x="12" y="16" width="16" height="8" rx="2" fill="currentColor" opacity="0.15" />
        </svg>
      );
  }
}
