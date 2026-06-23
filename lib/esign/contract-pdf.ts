/**
 * Branded contract PDF generator for DropboxSign uploads.
 *
 * Renders a clean, styled document with:
 *   - Optional logo + brand header bar (accentColor / logoUrl / brandName)
 *   - Proper dollar formatting — amounts are stored as CENTS in the DB,
 *     divided by 100 here before display
 *   - Clauses, line items, fees, and a signature block
 *   - Styled page footer on every page
 *
 * No dedicated HTML-to-PDF pipeline is available, so this uses pdf-lib
 * (same as the waiver renderer). The public /contract/{token} HTML view
 * remains the canonical branded experience for signers; this PDF is the
 * DropboxSign upload artifact.
 */

import { PDFDocument, StandardFonts, rgb, type PDFPage } from 'pdf-lib';
import type { ContractClause } from '@/lib/db/schema/crm';

// Mirror the proposal/contract line-item + fee shapes without re-importing
// from crm.ts (avoid pulling drizzle into PDF rendering).
type LineItem = {
  description?: string;
  quantity?: number;
  /** Stored as cents in the DB — divided by 100 before display. */
  unitPrice?: number;
  /** Stored as cents in the DB — divided by 100 before display. */
  total?: number;
};

type Fee = {
  label?: string;
  /** Stored as cents in the DB — divided by 100 before display. */
  amount?: number;
};

export type ContractPdfInput = {
  title: string;
  summary?: string | null;
  clauses?: ContractClause[] | null;
  lineItems?: LineItem[] | null;
  fees?: Fee[] | null;
  currency?: string | null;
  signerName: string;
  signerEmail: string;
  footerText?: string | null;
  /** Accent / primary brand color (CSS hex, e.g. '#2563eb'). */
  accentColor?: string | null;
  /** Logo image URL — fetched and embedded if reachable. */
  logoUrl?: string | null;
  /** Company / brand name shown in header when no logo image is available. */
  brandName?: string | null;
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_L = 50;
const MARGIN_R = 562;
const USABLE_W = MARGIN_R - MARGIN_L;
const FOOTER_H = 36;

/** Parse a CSS hex color string like '#2563eb' to an rgb() triple (0–1 range). */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  if ([r, g, b].some(isNaN)) return [0.145, 0.388, 0.922]; // fallback blue
  return [r, g, b];
}

/** Format a cent-denominated integer as a currency string. */
function formatCents(cents: number, currency: string): string {
  const dollars = cents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2,
    }).format(dollars);
  } catch {
    return `${(dollars).toFixed(2)} ${currency}`;
  }
}

export async function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const accentRgb = input.accentColor ? hexToRgb(input.accentColor) : [0.145, 0.388, 0.922] as [number, number, number];
  const currency = input.currency || 'USD';

  // Try to fetch and embed the logo image.
  let logoImageEmbed: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null;
  if (input.logoUrl) {
    try {
      const res = await fetch(input.logoUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('png') || input.logoUrl.toLowerCase().endsWith('.png')) {
          logoImageEmbed = await pdfDoc.embedPng(buf);
        } else {
          logoImageEmbed = await pdfDoc.embedJpg(buf);
        }
      }
    } catch {
      // Logo fetch failed — proceed without it.
    }
  }

  // Definite-assignment: addPage() (called before any draw) assigns this; the
  // closure assignment is invisible to TS's control-flow analysis.
  let currentPage!: PDFPage;
  let y = 0;

  const addPage = () => {
    currentPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 20; // start just below top
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < FOOTER_H + 20) {
      drawFooter();
      addPage();
      y = PAGE_H - 60; // leave room for content
    }
  };

  const drawFooter = () => {
    const pg = currentPage;
    // Accent rule
    pg.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE_W,
      height: FOOTER_H,
      color: rgb(accentRgb[0], accentRgb[1], accentRgb[2]),
      opacity: 0.08,
    });
    pg.drawLine({
      start: { x: MARGIN_L, y: FOOTER_H },
      end: { x: MARGIN_R, y: FOOTER_H },
      thickness: 0.5,
      color: rgb(accentRgb[0], accentRgb[1], accentRgb[2]),
      opacity: 0.5,
    });
    const footerLabel = input.footerText || input.brandName || 'Confidential';
    pg.drawText(footerLabel, {
      x: MARGIN_L,
      y: 12,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    const pageNum = `Page ${pdfDoc.getPageCount()}`;
    const pnW = font.widthOfTextAtSize(pageNum, 8);
    pg.drawText(pageNum, {
      x: MARGIN_R - pnW,
      y: 12,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  };

  const drawText = (
    text: string,
    opts?: {
      bold?: boolean;
      size?: number;
      color?: [number, number, number];
      indent?: number;
    }
  ) => {
    const size = opts?.size ?? 11;
    const f = opts?.bold ? boldFont : font;
    const color = opts?.color ?? [0.07, 0.07, 0.07];
    const xStart = MARGIN_L + (opts?.indent ?? 0);
    const maxW = USABLE_W - (opts?.indent ?? 0);
    // Naive word wrap.
    const words = (text || '').split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (f.widthOfTextAtSize(test, size) > maxW) {
        ensureSpace(size + 4);
        currentPage.drawText(line, { x: xStart, y, size, font: f, color: rgb(...color) });
        y -= size + 4;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      ensureSpace(size + 4);
      currentPage.drawText(line, { x: xStart, y, size, font: f, color: rgb(...color) });
      y -= size + 6;
    }
  };

  const hr = (opacity = 1) => {
    ensureSpace(12);
    currentPage.drawLine({
      start: { x: MARGIN_L, y },
      end: { x: MARGIN_R, y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
      opacity,
    });
    y -= 12;
  };

  const sectionHeading = (label: string) => {
    ensureSpace(24);
    y -= 6;
    // Subtle accent background on heading row
    currentPage.drawRectangle({
      x: MARGIN_L - 4,
      y: y - 4,
      width: USABLE_W + 8,
      height: 18,
      color: rgb(accentRgb[0], accentRgb[1], accentRgb[2]),
      opacity: 0.08,
    });
    currentPage.drawText(label, {
      x: MARGIN_L,
      y,
      size: 12,
      font: boldFont,
      color: rgb(accentRgb[0], accentRgb[1], accentRgb[2]),
    });
    y -= 20;
  };

  // ── First page header ──────────────────────────────────────────────────────

  addPage();

  // Brand bar across the top
  currentPage.drawRectangle({
    x: 0,
    y: PAGE_H - 56,
    width: PAGE_W,
    height: 56,
    color: rgb(accentRgb[0], accentRgb[1], accentRgb[2]),
  });

  if (logoImageEmbed) {
    const dims = logoImageEmbed.scaleToFit(120, 36);
    currentPage.drawImage(logoImageEmbed, {
      x: MARGIN_L,
      y: PAGE_H - 48,
      width: dims.width,
      height: dims.height,
    });
  } else if (input.brandName) {
    currentPage.drawText(input.brandName, {
      x: MARGIN_L,
      y: PAGE_H - 38,
      size: 16,
      font: boldFont,
      color: rgb(1, 1, 1),
    });
  }

  // "CONTRACT" label right-aligned in bar
  const contractLabel = 'CONTRACT';
  const clW = boldFont.widthOfTextAtSize(contractLabel, 11);
  currentPage.drawText(contractLabel, {
    x: MARGIN_R - clW,
    y: PAGE_H - 36,
    size: 11,
    font: boldFont,
    color: rgb(1, 1, 1),
    opacity: 0.85,
  });

  y = PAGE_H - 76;

  // Document title
  drawText(input.title || 'Contract', { bold: true, size: 20 });
  y -= 4;
  drawText(
    `Prepared for: ${input.signerName} (${input.signerEmail})`,
    { size: 10, color: [0.4, 0.4, 0.4] }
  );

  hr();

  // ── Summary ────────────────────────────────────────────────────────────────

  if (input.summary) {
    sectionHeading('Summary');
    drawText(input.summary, { size: 11 });
    y -= 4;
  }

  // ── Clauses ────────────────────────────────────────────────────────────────

  const clauses = input.clauses ?? [];
  if (clauses.length > 0) {
    sectionHeading('Terms & Conditions');
    clauses.forEach((c, idx) => {
      const label = `${idx + 1}. ${c.title}${c.required ? ' *' : ''}`;
      drawText(label, { bold: true, size: 11 });
      const plain = (c.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (plain) drawText(plain, { size: 10, color: [0.25, 0.25, 0.25], indent: 12 });
      y -= 4;
    });
  }

  // ── Line items & fees ──────────────────────────────────────────────────────

  const lineItems = input.lineItems ?? [];
  const fees = input.fees ?? [];
  if (lineItems.length > 0 || fees.length > 0) {
    sectionHeading('Pricing');

    // Column headers
    ensureSpace(16);
    const col1 = MARGIN_L;
    const col2 = MARGIN_R - 180;
    const col3 = MARGIN_R - 100;
    const col4 = MARGIN_R - 40;

    currentPage.drawText('Description', { x: col1, y, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.4) });
    currentPage.drawText('Qty', { x: col2, y, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.4) });
    currentPage.drawText('Unit Price', { x: col3 - 30, y, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.4) });
    currentPage.drawText('Total', { x: col4, y, size: 9, font: boldFont, color: rgb(0.4, 0.4, 0.4) });
    y -= 14;
    hr(0.5);

    // Amounts are stored as CENTS — divide by 100 for display.
    let lineTotal = 0;
    for (const li of lineItems) {
      const qty = li.quantity ?? 1;
      const unitCents = li.unitPrice ?? 0;
      const totalCents = li.total ?? qty * unitCents;
      lineTotal += totalCents;

      ensureSpace(14);
      const desc = li.description ?? '—';
      // Truncate long descriptions to fit column width
      const maxDescW = col2 - col1 - 8;
      let descLine = desc;
      while (font.widthOfTextAtSize(descLine, 10) > maxDescW && descLine.length > 4) {
        descLine = descLine.slice(0, -4) + '...';
      }
      currentPage.drawText(descLine, { x: col1, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      currentPage.drawText(String(qty), { x: col2, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      const upStr = formatCents(unitCents, currency);
      const upW = font.widthOfTextAtSize(upStr, 10);
      currentPage.drawText(upStr, { x: col4 - 50 - upW + 40, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      const totStr = formatCents(totalCents, currency);
      const totW = font.widthOfTextAtSize(totStr, 10);
      currentPage.drawText(totStr, { x: MARGIN_R - totW, y, size: 10, font, color: rgb(0.1, 0.1, 0.1) });
      y -= 16;
    }

    let feeTotal = 0;
    for (const f of fees) {
      const amtCents = f.amount ?? 0;
      feeTotal += amtCents;
      ensureSpace(14);
      const label = f.label ?? 'Fee';
      currentPage.drawText(label, { x: col1, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
      const feeStr = formatCents(amtCents, currency);
      const feeW = font.widthOfTextAtSize(feeStr, 10);
      currentPage.drawText(feeStr, { x: MARGIN_R - feeW, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
      y -= 16;
    }

    hr(0.5);
    ensureSpace(18);
    const grandCents = lineTotal + feeTotal;
    const grandStr = formatCents(grandCents, currency);
    const grandW = boldFont.widthOfTextAtSize(grandStr, 12);
    currentPage.drawText('Total:', { x: MARGIN_L, y, size: 12, font: boldFont, color: rgb(0.07, 0.07, 0.07) });
    currentPage.drawText(grandStr, {
      x: MARGIN_R - grandW,
      y,
      size: 12,
      font: boldFont,
      color: rgb(accentRgb[0], accentRgb[1], accentRgb[2]),
    });
    y -= 20;
  }

  // ── Signature block ────────────────────────────────────────────────────────

  sectionHeading('Signature');
  drawText(
    'By signing below, you agree to the terms and conditions set out in this contract.',
    { size: 10, color: [0.35, 0.35, 0.35] }
  );
  y -= 16;

  ensureSpace(70);
  // Signature line
  currentPage.drawLine({
    start: { x: MARGIN_L, y },
    end: { x: MARGIN_L + 260, y },
    thickness: 1,
    color: rgb(0.1, 0.1, 0.1),
  });
  // Date line
  currentPage.drawLine({
    start: { x: MARGIN_L + 300, y },
    end: { x: MARGIN_R, y },
    thickness: 1,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 14;
  currentPage.drawText('Signature', { x: MARGIN_L, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  currentPage.drawText('Date', { x: MARGIN_L + 300, y, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
  y -= 14;
  currentPage.drawText(input.signerName, { x: MARGIN_L, y, size: 10, font: boldFont, color: rgb(0.1, 0.1, 0.1) });
  y -= 12;
  currentPage.drawText(input.signerEmail, { x: MARGIN_L, y, size: 9, font, color: rgb(0.45, 0.45, 0.45) });

  // Footer on last page
  drawFooter();

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
