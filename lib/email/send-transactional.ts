/**
 * Transactional Email Sender
 *
 * Loads a website's email template for a given event, merges variables,
 * applies branding, and sends via Resend. Falls back to default templates
 * if no custom template exists.
 */

import { db } from '@/lib/db';
import { websiteEmailTemplates, clientWebsites, brandingProfiles } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { resend } from './index';
import { renderBlocksToEmailHtml } from './render-blocks-to-email';
import { replaceVariables, getEventDefinition } from './website-email-events';
import { getDefaultTemplates } from './default-email-templates';
import { applyBrandingToBlocks, brandingProfileToEmailBranding } from './apply-branding-to-blocks';
import type { Block, BlockEditorData } from '@/types/blocks';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'noreply@simplerdevelopment.com';

interface SendTransactionalEmailOptions {
  websiteId: number;
  event: string;
  to: string;
  variables: Record<string, string>;
  /** Override the "from" name (e.g. "Order Confirmation") */
  fromName?: string;
}

/**
 * Resolve storefront URLs for a website. Use this in API routes
 * that need to build email links (order detail, password reset, etc.).
 */
export async function getWebsiteUrls(websiteId: number) {
  return getWebsiteInfo(websiteId);
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Build the full email HTML document from inner content.
 */
function wrapEmailHtml(innerHtml: string, previewText?: string): string {
  const preview = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${previewText}</div>`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  ${preview}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px;">
              ${innerHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                Powered by SimplerDevelopment
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Load the website's branding profile (if any) and return EmailBranding.
 */
async function loadBranding(websiteId: number, brandingProfileId?: number | null) {
  // Use the template's branding profile, or fall back to the site's branding profile
  let profileId = brandingProfileId;
  if (!profileId) {
    const [site] = await db.select({ brandingProfileId: clientWebsites.brandingProfileId, name: clientWebsites.name })
      .from(clientWebsites)
      .where(eq(clientWebsites.id, websiteId))
      .limit(1);
    profileId = site?.brandingProfileId ?? null;
  }

  if (!profileId) return null;

  const [profile] = await db.select()
    .from(brandingProfiles)
    .where(eq(brandingProfiles.id, profileId))
    .limit(1);

  if (!profile) return null;

  return brandingProfileToEmailBranding(profile, profile.name ?? undefined);
}

/**
 * Get the website name and URLs for template variables.
 *
 * The customer storefront lives at /sites/[domain]/ so all email links
 * (order detail, reset password, etc.) must use that path structure.
 */
async function getWebsiteInfo(websiteId: number) {
  const [site] = await db.select({
    name: clientWebsites.name,
    domain: clientWebsites.domain,
    subdomain: clientWebsites.subdomain,
  })
    .from(clientWebsites)
    .where(eq(clientWebsites.id, websiteId))
    .limit(1);

  const baseUrl = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';
  // The domain slug used in /sites/[domain] routes
  const domainSlug = site?.domain || site?.subdomain || '';

  // Public-facing site URL (for "Visit Store" type links)
  const siteUrl = domainSlug
    ? `${baseUrl}/sites/${domainSlug}`
    : baseUrl;

  return {
    siteName: site?.name || 'Our Store',
    siteUrl,
    /** Base URL for storefront account pages: /sites/[domain]/account */
    accountUrl: `${siteUrl}/account`,
    /** Build an order detail URL */
    orderUrl: (orderNumber: string) => `${siteUrl}/account/orders/${orderNumber}`,
    /** Build a password reset URL */
    resetPasswordUrl: (token: string) => `${siteUrl}/account/reset-password?token=${token}`,
    /** Build a booking cancel URL */
    bookingCancelUrl: (token: string) => `${baseUrl}/book/cancel?token=${token}`,
    /** Base URL for raw links */
    baseUrl,
  };
}

/**
 * Send a transactional email for a given event.
 *
 * 1. Looks up the website's custom template for the event
 * 2. Falls back to the default template if none exists or template is disabled
 * 3. Merges variables into subject and HTML
 * 4. Applies branding if available
 * 5. Sends via Resend
 */
export async function sendTransactionalEmail(
  options: SendTransactionalEmailOptions,
): Promise<SendResult> {
  const { websiteId, event, to, variables, fromName } = options;

  try {
    // Get website info for common variables
    const siteInfo = await getWebsiteInfo(websiteId);
    const allVars: Record<string, string> = {
      siteName: siteInfo.siteName,
      siteUrl: siteInfo.siteUrl,
      currentYear: new Date().getFullYear().toString(),
      ...variables,
    };

    // Try to load custom template
    const [customTemplate] = await db.select()
      .from(websiteEmailTemplates)
      .where(and(
        eq(websiteEmailTemplates.websiteId, websiteId),
        eq(websiteEmailTemplates.event, event),
        eq(websiteEmailTemplates.enabled, true),
      ))
      .limit(1);

    let subject: string;
    let htmlContent: string;

    if (customTemplate) {
      // Use custom template
      subject = replaceVariables(customTemplate.subject, allVars);

      if (customTemplate.blockContent) {
        // Render from blocks (visual editor)
        let blocks = (customTemplate.blockContent as BlockEditorData).blocks as Block[];

        // Apply branding
        const branding = await loadBranding(websiteId, customTemplate.brandingProfileId);
        if (branding) {
          blocks = applyBrandingToBlocks(blocks, branding);
        }

        const innerHtml = renderBlocksToEmailHtml(blocks);
        htmlContent = wrapEmailHtml(replaceVariables(innerHtml, allVars));
      } else if (customTemplate.htmlContent) {
        // Raw HTML template
        htmlContent = wrapEmailHtml(replaceVariables(customTemplate.htmlContent, allVars));
      } else {
        // Empty template, fall through to default
        htmlContent = await renderDefaultTemplate(event, allVars, websiteId);
      }
    } else {
      // Use default template
      const eventDef = getEventDefinition(event);
      subject = eventDef
        ? replaceVariables(eventDef.defaultSubject, allVars)
        : `Notification from ${siteInfo.siteName}`;
      htmlContent = await renderDefaultTemplate(event, allVars, websiteId);
    }

    // Send via Resend
    const senderName = fromName || siteInfo.siteName;
    const result = await resend.emails.send({
      from: `${senderName} <${FROM_EMAIL}>`,
      to,
      subject,
      html: htmlContent,
    });

    if (result.error) {
      console.error(`[email] Resend error for ${event} to ${to}:`, JSON.stringify(result.error));
      return { success: false, error: result.error.message || JSON.stringify(result.error) };
    }

    console.log(`[email] Sent ${event} to ${to} (messageId: ${result.data?.id})`);
    return { success: true, messageId: result.data?.id };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[email] Failed to send ${event} to ${to}:`, error);
    return { success: false, error };
  }
}

/**
 * Render a default template with variables and branding applied.
 */
async function renderDefaultTemplate(
  event: string,
  variables: Record<string, string>,
  websiteId: number,
): Promise<string> {
  const defaults = getDefaultTemplates();
  const template = defaults.find(t => t.event === event);

  if (!template || template.blocks.length === 0) {
    // Fallback: simple text email
    return wrapEmailHtml(
      `<p style="font-size:16px;line-height:1.6;color:#333;">You have a new notification from ${variables.siteName || 'our store'}.</p>`,
    );
  }

  // Apply branding to default blocks
  let blocks = [...template.blocks];
  const branding = await loadBranding(websiteId);
  if (branding) {
    blocks = applyBrandingToBlocks(blocks, branding);
  }

  const innerHtml = renderBlocksToEmailHtml(blocks);
  return wrapEmailHtml(replaceVariables(innerHtml, variables));
}

// ─── CONVENIENCE HELPERS ─────────────────────────────────────────────────────

/** Format cents to dollars (e.g. 14999 -> "$149.99") */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Format an address object to a single-line string */
export function formatAddress(addr: {
  line1: string; line2?: string; city: string; state: string; postalCode: string; country: string;
} | null): string {
  if (!addr) return 'N/A';
  const parts = [addr.line1];
  if (addr.line2) parts.push(addr.line2);
  parts.push(`${addr.city}, ${addr.state} ${addr.postalCode}`);
  if (addr.country && addr.country !== 'US') parts.push(addr.country);
  return parts.join(', ');
}

/** Format a date for display in emails */
export function formatEmailDate(date: Date | string | null): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(d);
}

/** Build HTML table of order line items */
export function buildItemsHtml(items: Array<{
  productName: string;
  variantName?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}>): string {
  const rows = items.map(item => {
    const name = item.variantName ? `${item.productName} — ${item.variantName}` : item.productName;
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;">${name}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:center;">${item.quantity}</td>
      <td style="padding:8px 0;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333;text-align:right;">${formatCents(item.total)}</td>
    </tr>`;
  }).join('\n');

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0">
    <tr>
      <th style="padding:8px 0;border-bottom:2px solid #e5e7eb;font-size:12px;color:#666;text-align:left;text-transform:uppercase;">Item</th>
      <th style="padding:8px 0;border-bottom:2px solid #e5e7eb;font-size:12px;color:#666;text-align:center;text-transform:uppercase;">Qty</th>
      <th style="padding:8px 0;border-bottom:2px solid #e5e7eb;font-size:12px;color:#666;text-align:right;text-transform:uppercase;">Total</th>
    </tr>
    ${rows}
  </table>`;
}
