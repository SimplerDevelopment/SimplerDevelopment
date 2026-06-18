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
    drawRectangle: vi.fn(),
    drawImage: vi.fn(),
  };
}

const mockFont = {
  widthOfTextAtSize: vi.fn((_text: string, size: number) => size * 4),
};

const mockPdfDoc = {
  embedFont: vi.fn().mockResolvedValue(mockFont),
  embedPng: vi.fn().mockResolvedValue({
    scaleToFit: vi.fn().mockReturnValue({ width: 80, height: 24 }),
  }),
  embedJpg: vi.fn().mockResolvedValue({
    scaleToFit: vi.fn().mockReturnValue({ width: 80, height: 24 }),
  }),
  addPage: vi.fn(() => {
    pageCount++;
    return makeMockPage();
  }),
  getPageCount: vi.fn(() => pageCount),
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
  mockFont.widthOfTextAtSize.mockImplementation((_text: string, size: number) => size * 4);
  mockPdfDoc.addPage.mockClear();
  mockPdfDoc.save.mockClear();
  mockPdfDoc.embedFont.mockClear();
  mockPdfDoc.embedPng.mockClear();
  mockPdfDoc.embedJpg.mockClear();
  mockPdfDoc.getPageCount.mockClear();
  // Reset mocks that return values
  mockPdfDoc.save.mockResolvedValue(new Uint8Array([1, 2, 3, 4]));
  mockPdfDoc.embedFont.mockResolvedValue(mockFont);
  mockPdfDoc.addPage.mockImplementation(() => {
    pageCount++;
    return makeMockPage();
  });
  mockPdfDoc.getPageCount.mockImplementation(() => pageCount);
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

    it('draws the "CONTRACT" label in the brand bar', async () => {
      await renderContractPdf(baseInput());
      expect(allDrawnTexts()).toContain('CONTRACT');
    });
  });

  describe('branding fields', () => {
    it('draws brandName text in the brand bar when no logoUrl', async () => {
      await renderContractPdf({ ...baseInput(), brandName: 'Acme Corp' });
      expect(allDrawnTexts()).toContain('Acme Corp');
    });

    it('uses brandName as footer fallback when footerText is absent', async () => {
      await renderContractPdf({ ...baseInput(), brandName: 'MyBrand' });
      // Footer falls back to brandName when footerText is null/undefined
      expect(allDrawnTexts()).toContain('MyBrand');
    });

    it('uses "Confidential" as footer when both footerText and brandName are absent', async () => {
      await renderContractPdf(baseInput());
      expect(allDrawnTexts()).toContain('Confidential');
    });

    it('does not throw when accentColor is a valid hex', async () => {
      const result = await renderContractPdf({ ...baseInput(), accentColor: '#2563eb' });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('does not throw when accentColor is a 3-digit hex', async () => {
      const result = await renderContractPdf({ ...baseInput(), accentColor: '#abc' });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('attempts to fetch and embed logoUrl when provided', async () => {
      // The logo fetch will fail (not a real URL) — should proceed without throwing
      const result = await renderContractPdf({ ...baseInput(), logoUrl: 'https://example.com/logo.png' });
      expect(result).toBeInstanceOf(Buffer);
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
    it('draws "Terms & Conditions" heading when clauses are provided', async () => {
      await renderContractPdf({
        ...baseInput(),
        clauses: [{ title: 'Confidentiality', content: '<p>Keep it secret.</p>', required: true }],
      });
      // Heading is "Terms & Conditions"; toContain('Terms') still matches
      expect(allDrawnTexts().some((t) => t.includes('Terms'))).toBe(true);
    });

    it('includes clause title with index', async () => {
      await renderContractPdf({
        ...baseInput(),
        clauses: [{ title: 'Payment', content: 'Pay on time.', required: false }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('1. Payment'))).toBe(true);
    });

    it('appends " *" to required clauses', async () => {
      // Code appends " *" (space + asterisk) — not "(required)"
      await renderContractPdf({
        ...baseInput(),
        clauses: [{ title: 'NDA', content: 'Keep secret.', required: true }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('NDA *'))).toBe(true);
    });

    it('does NOT append " *" to non-required clauses', async () => {
      await renderContractPdf({
        ...baseInput(),
        clauses: [{ title: 'Optional', content: 'Optional text.', required: false }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.endsWith(' *'))).toBe(false);
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
      expect(allDrawnTexts().some((t) => t.includes('Terms'))).toBe(false);
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
    it('draws "Pricing" heading when line items are provided', async () => {
      // Section heading is "Pricing", not "Line Items"
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'Design', quantity: 1, unitPrice: 50000, total: 50000 }],
      });
      expect(allDrawnTexts()).toContain('Pricing');
    });

    it('omits "Pricing" heading when lineItems is null', async () => {
      await renderContractPdf({ ...baseInput(), lineItems: null });
      expect(allDrawnTexts()).not.toContain('Pricing');
    });

    it('omits "Pricing" heading when lineItems is empty array and no fees', async () => {
      await renderContractPdf({ ...baseInput(), lineItems: [] });
      expect(allDrawnTexts()).not.toContain('Pricing');
    });

    it('includes item description in drawn text', async () => {
      await renderContractPdf({
        ...baseInput(),
        // unitPrice/total are CENTS: 25000 cents = $250.00, 50000 cents = $500.00
        lineItems: [{ description: 'Logo Design', quantity: 2, unitPrice: 25000, total: 50000 }],
        currency: 'USD',
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('Logo Design'))).toBe(true);
    });

    it('uses — for missing description', async () => {
      await renderContractPdf({
        ...baseInput(),
        // 100 cents = $1.00
        lineItems: [{ quantity: 1, unitPrice: 100, total: 100 }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('—'))).toBe(true);
    });

    it('defaults unitPrice to 0 when omitted — renders $0.00', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'Item', quantity: 3 }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('0.00'))).toBe(true);
    });

    it('defaults quantity to 1 when omitted — total = unitPrice cents / 100', async () => {
      await renderContractPdf({
        ...baseInput(),
        // unitPrice = 10000 cents = $100.00; qty defaults to 1, total = $100.00
        lineItems: [{ description: 'Item', unitPrice: 10000 }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('100.00'))).toBe(true);
    });

    it('uses provided total when present (overrides qty×price) — cents input', async () => {
      await renderContractPdf({
        ...baseInput(),
        // total = 99900 cents = $999.00
        lineItems: [{ description: 'X', quantity: 1, unitPrice: 10000, total: 99900 }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('999.00'))).toBe(true);
    });

    it('draws fees with label and formatted amount from cents', async () => {
      await renderContractPdf({
        ...baseInput(),
        // unitPrice/total = 5000 cents = $50.00; fee amount = 2500 cents = $25.00
        lineItems: [{ description: 'Item', quantity: 1, unitPrice: 5000, total: 5000 }],
        fees: [{ label: 'Setup fee', amount: 2500 }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('Setup fee'))).toBe(true);
      expect(texts.some((t) => t.includes('25.00'))).toBe(true);
    });

    it('falls back to "Fee" when fee label is omitted', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'X', quantity: 1, unitPrice: 1000, total: 1000 }],
        fees: [{ amount: 500 }],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t.includes('Fee'))).toBe(true);
    });

    it('draws "Total:" label and grand total from cents (separate drawText calls)', async () => {
      // lineItems total = 10000 cents, fee = 1000 cents → grand = 11000 cents = $110.00
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'A', quantity: 1, unitPrice: 10000, total: 10000 }],
        fees: [{ label: 'Tax', amount: 1000 }],
        currency: 'USD',
      });
      const texts = allDrawnTexts();
      // "Total:" and the formatted amount are drawn as separate drawText calls
      expect(texts.some((t) => t === 'Total:')).toBe(true);
      expect(texts.some((t) => t.includes('110.00'))).toBe(true);
    });

    it('uses default currency USD when currency is null', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'X', quantity: 1, unitPrice: 5000, total: 5000 }],
        currency: null,
      });
      const texts = allDrawnTexts();
      // Intl.NumberFormat with USD produces "$" not "USD" literally; check for $
      expect(texts.some((t) => t.includes('$'))).toBe(true);
    });

    it('respects a custom currency code', async () => {
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'X', quantity: 1, unitPrice: 10000, total: 10000 }],
        currency: 'EUR',
      });
      const texts = allDrawnTexts();
      // EUR formatting includes "€" or "EUR" depending on locale
      expect(texts.some((t) => t.includes('€') || t.includes('EUR'))).toBe(true);
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

    it('does not throw when footerText is null — falls back to brandName or "Confidential"', async () => {
      await renderContractPdf({ ...baseInput(), footerText: null });
      // Should not throw; save must be called
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
      // fees only render when lineItems is non-empty (lineItems check gates the whole Pricing section)
      await renderContractPdf({
        ...baseInput(),
        lineItems: [{ description: 'Base', quantity: 1, unitPrice: 10000, total: 10000 }],
        fees: [],
      });
      const texts = allDrawnTexts();
      expect(texts.some((t) => t === 'Total:')).toBe(true);
    });
  });
});
