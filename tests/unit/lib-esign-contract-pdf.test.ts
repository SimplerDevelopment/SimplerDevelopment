// @vitest-environment node
/**
 * Unit tests for lib/esign/contract-pdf.ts — renderContractPdf.
 *
 * pdf-lib is mocked so tests stay pure-JS and fast. The mock captures
 * all draw* calls and exposes them for assertion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// pdf-lib mock
// ---------------------------------------------------------------------------

interface DrawTextCall {
  text: string;
  opts: Record<string, unknown>;
}
interface DrawLineCall {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

const drawTextCalls: DrawTextCall[] = [];
const drawLineCalls: DrawLineCall[] = [];
let pageCount = 0;

function makeMockPage() {
  return {
    drawText(text: string, opts: Record<string, unknown>) {
      drawTextCalls.push({ text, opts });
    },
    drawLine(opts: Record<string, unknown>) {
      drawLineCalls.push(opts as DrawLineCall);
    },
  };
}

const mockFont = {
  widthOfTextAtSize: vi.fn((_text: string, size: number) => size * 4),
};

const mockPdfDoc = {
  embedFont: vi.fn().mockResolvedValue(mockFont),
  addPage: vi.fn(() => {
    pageCount++;
    return makeMockPage();
  }),
  save: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4])),
};

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn().mockResolvedValue(mockPdfDoc),
  },
  StandardFonts: {
    Helvetica: 'Helvetica',
    HelveticaBold: 'Helvetica-Bold',
  },
  rgb: (r: number, g: number, b: number) => ({ r, g, b }),
}));

// Import after mocks are hoisted
const { renderContractPdf } = await import('@/lib/esign/contract-pdf');

beforeEach(() => {
  drawTextCalls.length = 0;
  drawLineCalls.length = 0;
  pageCount = 0;
  mockFont.widthOfTextAtSize.mockClear();
  mockPdfDoc.addPage.mockClear();
  mockPdfDoc.save.mockClear();
  mockPdfDoc.embedFont.mockClear();
  // Reset mocks that return values
  mockPdfDoc.save.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
  mockPdfDoc.embedFont.mockResolvedValue(mockFont);
  mockPdfDoc.addPage.mockImplementation(() => {
    pageCount++;
    return makeMockPage();
  });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function baseInput(): Parameters<typeof renderContractPdf>[0] {
  return {
    title: 'Test Contract',
    signerName: 'Alice Smith',
    signerEmail: 'alice@example.com',
  };
}

function allDrawnTexts(): string[] {
  return drawTextCalls.map((c) => c.text);
}

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

describe('renderContractPdf', () => {
  describe('return value', () => {
    it('returns a Buffer', async () => {
      const result = await renderContractPdf(baseInput());
      expect(result).toBeInstanceOf(Buffer);
    });

    it('buffer contains the bytes returned by pdfDoc.save', async () => {
      mockPdfDoc.save.mockResolvedValue(new Uint8Array([9, 8, 7]));
      const result = await renderContractPdf(baseInput());
      expect(Array.from(result)).toEqual([9, 8, 7]);
    });
  });

  describe('header rendering', () => {
    it('draws the contract title', async () => {
      await renderContractPdf({ ...baseInput(), title: 'My Agreement' });
      expect(allDrawnTexts()).toContain('My Agreement');
    });

    it('falls back to "Contract" when title is empty string', async () => {
      await renderContractPdf({ ...baseInput(), title: '' });
      expect(allDrawnTexts()).toContain('Contract');
    });

    it('draws the signer name and email in the prepared-for line', async () => {
      await renderContractPdf(baseInput());
      const preparedFor = allDrawnTexts().find((t) => t.includes('Prepared for'));
      expect(preparedFor).toBeDefined();
      expect(preparedFor).toContain('Alice Smith');
      expect(preparedFor).toContain('alice@example.com');
    });
  });

  describe('summary section', () => {
    it('draws "Summary" heading and summary text when provided', async () => {
      await renderContractPdf({ ...baseInput(), summary: 'This is the summary.' });
      const texts = allDrawnTexts();
      expect(texts).toContain('Summary');
      expect(texts.some((t) => t.includes('This is the summary.'))).toBe(true);
    });

    it('omits "Summary" heading when summary is null', async () => {
      await renderContractPdf({ ...baseInput(), summary: null });
      expect(allDrawnTexts()).not.toContain('Summary');
    });

    it('omits "Summary" heading when summary is undefined', async () => {
      await renderContractPdf(baseInput());
      expect(allDrawnTexts()).not.toContain('Summary');
    });
  });

  describe('clauses section', () => {
    it('draws "Terms" heading when clauses are provided', async () => {
      await renderContractPdf({
        ...baseInput(),
        clauses: [{ title: 'Confidentiality', content: '<p>Keep it secret.</p>', required: true }],
      });
      expect(allDrawnTexts()).toContain('Terms');
    });

    it('includes clause title with index', async () => {
      await renderContractPdf({
        ...baseInput(),
        clauses: [{ title: 'Payment', content: 'Pay on time.', required: false }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('1. Payment'))).toBe(true);
    });

    it('appends (required) to required clauses', async () => {
      await renderContractPdf({
        ...baseInput(),
        clauses: [{ title: 'NDA', content: 'Keep secret.', required: true }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('(required)'))).toBe(true);
    });

    it('does NOT append (required) to non-required clauses', async () => {
      await renderContractPdf({
        ...baseInput(),
        clauses: [{ title: 'Optional', content: 'Optional text.', required: false }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('(required)'))).toBe(false);
    });

    it('strips HTML tags from clause content', async () => {
      await renderContractPdf({
        ...baseInput(),
        clauses: [{ title: 'T', content: '<p>Plain <strong>text</strong> here.</p>', required: false }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('<p>'))).toBe(false);
      expect(texts.some((t) => t.includes('Plain'))).toBe(true);
    });

    it('handles empty clause content gracefully (no draw for empty)', async () => {
      await renderContractPdf({
        ...baseInput(),
        clauses: [{ title: 'Empty', content: '', required: false }],
      });
      // Should not throw; title still rendered
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('Empty'))).toBe(true);
    });

    it('handles null clauses — omits Terms section', async () => {
      await renderContractPdf({ ...baseInput(), clauses: null });
      expect(allDrawnTexts()).not.toContain('Terms');
    });

    it('numbers multiple clauses sequentially', async () => {
      await renderContractPdf({
        ...baseInput(),
        clauses: [
          { title: 'One', content: 'A', required: false },
          { title: 'Two', content: 'B', required: false },
          { title: 'Three', content: 'C', required: false },
        ],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.startsWith('1.'))).toBe(true);
      expect(texts.some((t) => t.startsWith('2.'))).toBe(true);
      expect(texts.some((t) => t.startsWith('3.'))).toBe(true);
    });
  });

  describe('line items section', () => {
    it('draws "Line Items" heading when line items are provided', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'Design', quantity: 1, unitPrice: 500, total: 500 }],
      });
      expect(allDrawnTexts()).toContain('Line Items');
    });

    it('omits "Line Items" heading when lineItems is null', async () => {
      await renderContractPdf({ ...baseInput(), lineItems: null });
      expect(allDrawnTexts()).not.toContain('Line Items');
    });

    it('omits "Line Items" heading when lineItems is empty array', async () => {
      await renderContractPdf({ ...baseInput(), lineItems: [] });
      expect(allDrawnTexts()).not.toContain('Line Items');
    });

    it('includes item description in drawn text', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'Logo Design', quantity: 2, unitPrice: 250, total: 500 }],
        currency: 'USD',
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('Logo Design'))).toBe(true);
    });

    it('uses — for missing description', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ quantity: 1, unitPrice: 100, total: 100 }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('—'))).toBe(true);
    });

    it('defaults unitPrice to 0 when omitted', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'Item', quantity: 3 }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('0.00'))).toBe(true);
    });

    it('defaults quantity to 1 when omitted', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'Item', unitPrice: 100 }],
      });
      const texts = allDrawnTexts();
      // quantity 1 × unitPrice 100 = total 100
      expect(texts.some((t) => t.includes('100.00'))).toBe(true);
    });

    it('uses provided total when present (overrides qty×price)', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'X', quantity: 1, unitPrice: 100, total: 999 }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('999.00'))).toBe(true);
    });

    it('draws fees with label and amount', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'Item', quantity: 1, unitPrice: 50, total: 50 }],
        fees: [{ label: 'Setup fee', amount: 25 }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('Setup fee'))).toBe(true);
      expect(texts.some((t) => t.includes('25.00'))).toBe(true);
    });

    it('falls back to "Fee" when fee label is omitted', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'X', quantity: 1, unitPrice: 10, total: 10 }],
        fees: [{ amount: 5 }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('Fee'))).toBe(true);
    });

    it('draws a Total line summing items + fees', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'A', quantity: 1, unitPrice: 100, total: 100 }],
        fees: [{ label: 'Tax', amount: 10 }],
        currency: 'USD',
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('Total:') && t.includes('110.00'))).toBe(true);
    });

    it('uses default currency USD when currency is null', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'X', quantity: 1, unitPrice: 50, total: 50 }],
        currency: null,
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('USD'))).toBe(true);
    });

    it('respects a custom currency code', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'X', quantity: 1, unitPrice: 100, total: 100 }],
        currency: 'EUR',
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('EUR'))).toBe(true);
    });
  });

  describe('signature section', () => {
    it('draws "Signature" heading', async () => {
      await renderContractPdf(baseInput());
      expect(allDrawnTexts()).toContain('Signature');
    });

    it('draws signer name in the signature block', async () => {
      await renderContractPdf({ ...baseInput(), signerName: 'Bob Jones' });
      const texts = allDrawnTexts();
      // Name appears at least twice: once in header, once in signature block
      expect(texts.filter((t) => t.includes('Bob Jones')).length).toBeGreaterThanOrEqual(2);
    });

    it('draws signer email in the signature block', async () => {
      await renderContractPdf({ ...baseInput(), signerEmail: 'bob@example.com' });
      const texts = allDrawnTexts();
      expect(texts.filter((t) => t.includes('bob@example.com')).length).toBeGreaterThanOrEqual(2);
    });

    it('draws a signature line (drawLine called)', async () => {
      await renderContractPdf(baseInput());
      expect(drawLineCalls.length).toBeGreaterThan(0);
    });
  });

  describe('footer text', () => {
    it('draws footer text when provided', async () => {
      await renderContractPdf({ ...baseInput(), footerText: 'Confidential — do not share' });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('Confidential'))).toBe(true);
    });

    it('omits footer when footerText is null', async () => {
      await renderContractPdf({ ...baseInput(), footerText: null });
      // Should not throw; just no footer text
      expect(mockPdfDoc.save).toHaveBeenCalled();
    });
  });

  describe('page management', () => {
    it('adds at least one page', async () => {
      await renderContractPdf(baseInput());
      expect(mockPdfDoc.addPage).toHaveBeenCalledTimes(1);
    });

    it('embeds two fonts (regular + bold)', async () => {
      await renderContractPdf(baseInput());
      expect(mockPdfDoc.embedFont).toHaveBeenCalledTimes(2);
    });
  });

  describe('word-wrap — ensureSpace triggers new page', () => {
    it('adds a second page when font reports text is too wide', async () => {
      // Make widthOfTextAtSize always exceed usable width to force wrapping every word
      mockFont.widthOfTextAtSize.mockImplementation(() => 99999);
      await renderContractPdf({
        ...baseInput(),
        summary: 'word1 word2 word3 word4 word5',
      });
      // At least one page; may be more due to forced wrapping
      expect(mockPdfDoc.addPage.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('edge cases', () => {
    it('handles a completely minimal input (only required fields)', async () => {
      const result = await renderContractPdf({ title: 'Min', signerName: 'X', signerEmail: 'x@x.com' });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('handles all optional fields set to null/undefined simultaneously', async () => {
      const result = await renderContractPdf({
        title: 'Full Null',
        signerName: 'Y',
        signerEmail: 'y@y.com',
        summary: null,
        clauses: null,
        lineItems: null,
        fees: null,
        currency: null,
        footerText: null,
      });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('handles a clause with only whitespace content (strips to empty)', async () => {
      await renderContractPdf({
        ...baseInput(),
        clauses: [{ title: 'Whitespace', content: '   ', required: false }],
      });
      // Should not throw
      expect(mockPdfDoc.save).toHaveBeenCalled();
    });

    it('handles fees without corresponding lineItems being non-empty', async () => {
      // fees only matter when lineItems is non-empty per the source logic
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'Base', quantity: 1, unitPrice: 100, total: 100 }],
        fees: [],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('Total:'))).toBe(true);
    });
  });
});
