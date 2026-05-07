import DOMPurify from 'isomorphic-dompurify';

/** Strict server-safe sanitization for rendering tenant- or AI-authored HTML
 *  inside the portal/admin or in recipient-facing pages (proposals, contracts,
 *  campaign previews). */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html ?? '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'form', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'srcdoc'],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/** Less-strict variant that keeps inline styles + class — for admin- or
 *  staff-authored content where the author is fully trusted. Still strips
 *  scripts and event-handler attributes. */
export function sanitizeRichHtml(html: string): string {
  return DOMPurify.sanitize(html ?? '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['iframe', 'form', 'object', 'embed'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'srcdoc'],
    ALLOW_DATA_ATTR: true,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
