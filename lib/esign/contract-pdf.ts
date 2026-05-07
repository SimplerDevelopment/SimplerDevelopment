/**
 * Minimal contract PDF generator for DropboxSign uploads.
 *
 * No dedicated contract PDF generator existed when this was built; the
 * waiver renderer at app/api/portal/tools/booking/[id]/waivers/[waiverId]/pdf
 * is the closest reference. This module follows the same pdf-lib pattern
 * but covers the contract content shape (clauses, line items, fees).
 *
 * Follow-up: replace this with a proper themed renderer that mirrors
 * the public /contract/{token} HTML view (logo, accent color, etc).
 * Tracked as a TODO inline.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { ContractClause } from '@/lib/db/schema/crm';

// Mirror the proposal/contract line-item + fee shapes without re-importing
// from crm.ts (avoid pulling drizzle into PDF rendering).
type LineItem = {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  total?: number;
};

type Fee = {
  label?: string;
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
};

const PAGE_SIZE: [number, number] = [612, 792]; // US Letter

export async function renderContractPdf(input: ContractPdfInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage(PAGE_SIZE);
  let y = 750;
  const left = 50;
  const right = 562;
  const usableWidth = right - left;

  const ensureSpace = (needed: number) => {
    if (y - needed < 60) {
      page = pdfDoc.addPage(PAGE_SIZE);
      y = 750;
    }
  };

  const drawText = (text: string, opts?: { bold?: boolean; size?: number; color?: [number, number, number] }) => {
    const size = opts?.size ?? 11;
    const f = opts?.bold ? boldFont : font;
    const color = opts?.color ?? [0, 0, 0];
    // Naive word wrap.
    const words = (text || '').split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      const width = f.widthOfTextAtSize(test, size);
      if (width > usableWidth) {
        ensureSpace(size + 4);
        page.drawText(line, { x: left, y, size, font: f, color: rgb(color[0], color[1], color[2]) });
        y -= size + 4;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) {
      ensureSpace(size + 4);
      page.drawText(line, { x: left, y, size, font: f, color: rgb(color[0], color[1], color[2]) });
      y -= size + 6;
    }
  };

  const hr = () => {
    ensureSpace(12);
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
    y -= 12;
  };

  // Header
  drawText(input.title || 'Contract', { bold: true, size: 20 });
  y -= 6;
  drawText(`Prepared for: ${input.signerName} <${input.signerEmail}>`, { size: 10, color: [0.4, 0.4, 0.4] });
  hr();

  if (input.summary) {
    drawText('Summary', { bold: true, size: 13 });
    drawText(input.summary, { size: 11 });
    y -= 6;
  }

  // Clauses
  const clauses = input.clauses ?? [];
  if (clauses.length > 0) {
    drawText('Terms', { bold: true, size: 13 });
    y -= 4;
    clauses.forEach((c, idx) => {
      drawText(`${idx + 1}. ${c.title}${c.required ? ' (required)' : ''}`, { bold: true, size: 11 });
      // Strip simple HTML tags so the renderer doesn't show <p> etc.
      const plain = (c.content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (plain) drawText(plain, { size: 10 });
      y -= 4;
    });
  }

  // Line items
  const lineItems = input.lineItems ?? [];
  if (lineItems.length > 0) {
    hr();
    drawText('Line Items', { bold: true, size: 13 });
    const currency = input.currency || 'USD';
    let lineTotal = 0;
    for (const li of lineItems) {
      const qty = li.quantity ?? 1;
      const unit = li.unitPrice ?? 0;
      const total = li.total ?? qty * unit;
      lineTotal += total;
      drawText(`• ${li.description ?? '—'}  —  ${qty} × ${unit.toFixed(2)} = ${total.toFixed(2)} ${currency}`, { size: 10 });
    }
    const fees = input.fees ?? [];
    let feeTotal = 0;
    for (const f of fees) {
      const amount = f.amount ?? 0;
      feeTotal += amount;
      drawText(`• ${f.label ?? 'Fee'}: ${amount.toFixed(2)} ${currency}`, { size: 10 });
    }
    y -= 4;
    drawText(`Total: ${(lineTotal + feeTotal).toFixed(2)} ${currency}`, { bold: true, size: 12 });
  }

  // Signature block
  hr();
  drawText('Signature', { bold: true, size: 13 });
  drawText('Sign below using DropboxSign embedded signing.', { size: 10, color: [0.4, 0.4, 0.4] });
  y -= 30;
  // A blank line for the signature widget — DropboxSign overlays the
  // signature field on top of this when no template tags are provided.
  ensureSpace(40);
  page.drawLine({ start: { x: left, y }, end: { x: left + 240, y }, thickness: 0.7, color: rgb(0, 0, 0) });
  y -= 14;
  drawText(`${input.signerName}`, { size: 10 });
  drawText(`${input.signerEmail}`, { size: 9, color: [0.45, 0.45, 0.45] });

  if (input.footerText) {
    y -= 8;
    drawText(input.footerText, { size: 9, color: [0.5, 0.5, 0.5] });
  }

  // TODO: replace this stub with a themed renderer that mirrors the public
  // /contract/{token} view (logo, accent color, full HTML→PDF) — the current
  // output is functional but visually plain.

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
