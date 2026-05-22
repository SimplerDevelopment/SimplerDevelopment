// @vitest-environment node
/**
 * Unit tests for the four fetch-driven DropboxSign client functions in
 * lib/esign/dropbox-sign. Sister to dropbox-sign-verify.test.ts, which
 * already covers verifyWebhookSignature.
 *
 * The functions read DROPBOX_SIGN_API_KEY (and optionally
 * DROPBOX_SIGN_CLIENT_ID + NODE_ENV) at *call* time, not at module load,
 * so a single import + per-test env mutation is enough — no module
 * cache busting needed.
 *
 * fetch is mocked via vi.spyOn(globalThis, 'fetch'). Each test
 * mockResolvedValueOnce()s a Response — the spy is restored in
 * afterEach so order-dependence is contained.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createSignatureRequest,
  getEmbeddedSignUrl,
  cancelSignatureRequest,
  getSignedFileUrl,
} from '@/lib/esign/dropbox-sign';

const ORIGINAL_API_KEY = process.env.DROPBOX_SIGN_API_KEY;
const ORIGINAL_CLIENT_ID = process.env.DROPBOX_SIGN_CLIENT_ID;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

let fetchSpy: ReturnType<typeof vi.spyOn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(text: string, status = 500): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/plain' } });
}

beforeEach(() => {
  process.env.DROPBOX_SIGN_API_KEY = 'sk-test-aaa';
  process.env.DROPBOX_SIGN_CLIENT_ID = 'client-bbb';
  process.env.NODE_ENV = 'test';
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
  if (ORIGINAL_API_KEY === undefined) delete process.env.DROPBOX_SIGN_API_KEY;
  else process.env.DROPBOX_SIGN_API_KEY = ORIGINAL_API_KEY;
  if (ORIGINAL_CLIENT_ID === undefined) delete process.env.DROPBOX_SIGN_CLIENT_ID;
  else process.env.DROPBOX_SIGN_CLIENT_ID = ORIGINAL_CLIENT_ID;
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
});

// Helper for building the createSignatureRequest happy-path opts.
function makeCreateOpts(overrides: Partial<Parameters<typeof createSignatureRequest>[0]> = {}) {
  return {
    fileBuffer: Buffer.from('pdf-bytes'),
    fileName: 'contract.pdf',
    signerEmail: 'a@b.test',
    signerName: 'Alice Bob',
    title: 'T',
    subject: 'S',
    message: 'M',
    ...overrides,
  };
}

describe('createSignatureRequest', () => {
  it('returns signatureRequestId + signatureId on the happy path', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        signature_request: {
          signature_request_id: 'req-1',
          signatures: [{ signature_id: 'sig-1' }],
        },
      }),
    );

    const out = await createSignatureRequest(makeCreateOpts());
    expect(out).toEqual({ signatureRequestId: 'req-1', signatureId: 'sig-1' });
  });

  it('POSTs to the create_embedded endpoint with Basic auth', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        signature_request: {
          signature_request_id: 'req-1',
          signatures: [{ signature_id: 'sig-1' }],
        },
      }),
    );

    await createSignatureRequest(makeCreateOpts());
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.hellosign.com/v3/signature_request/create_embedded');
    expect(init.method).toBe('POST');
    // Basic <base64(apikey:)>
    expect(init.headers).toMatchObject({
      Authorization: 'Basic ' + Buffer.from('sk-test-aaa:').toString('base64'),
    });
  });

  it('defaults testMode to 1 when NODE_ENV !== "production"', async () => {
    process.env.NODE_ENV = 'development';
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        signature_request: {
          signature_request_id: 'r',
          signatures: [{ signature_id: 's' }],
        },
      }),
    );

    await createSignatureRequest(makeCreateOpts());
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const form = init.body as FormData;
    expect(form.get('test_mode')).toBe('1');
  });

  it('defaults testMode to 0 when NODE_ENV === "production"', async () => {
    process.env.NODE_ENV = 'production';
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        signature_request: {
          signature_request_id: 'r',
          signatures: [{ signature_id: 's' }],
        },
      }),
    );

    await createSignatureRequest(makeCreateOpts());
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const form = init.body as FormData;
    expect(form.get('test_mode')).toBe('0');
  });

  it('honors explicit testMode override (true overrides NODE_ENV)', async () => {
    process.env.NODE_ENV = 'production';
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        signature_request: {
          signature_request_id: 'r',
          signatures: [{ signature_id: 's' }],
        },
      }),
    );

    await createSignatureRequest(makeCreateOpts({ testMode: true }));
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const form = init.body as FormData;
    expect(form.get('test_mode')).toBe('1');
  });

  it('honors explicit testMode override (false overrides NODE_ENV)', async () => {
    process.env.NODE_ENV = 'development';
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        signature_request: {
          signature_request_id: 'r',
          signatures: [{ signature_id: 's' }],
        },
      }),
    );

    await createSignatureRequest(makeCreateOpts({ testMode: false }));
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    const form = init.body as FormData;
    expect(form.get('test_mode')).toBe('0');
  });

  it('populates the form with title/subject/message + signer fields + client_id', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        signature_request: {
          signature_request_id: 'r',
          signatures: [{ signature_id: 's' }],
        },
      }),
    );

    await createSignatureRequest(
      makeCreateOpts({
        title: 'My T',
        subject: 'My S',
        message: 'Hi',
        signerEmail: 'x@y.test',
        signerName: 'Xy',
      }),
    );
    const form = (fetchSpy.mock.calls[0]![1] as RequestInit).body as FormData;
    expect(form.get('title')).toBe('My T');
    expect(form.get('subject')).toBe('My S');
    expect(form.get('message')).toBe('Hi');
    expect(form.get('signers[0][email_address]')).toBe('x@y.test');
    expect(form.get('signers[0][name]')).toBe('Xy');
    expect(form.get('signers[0][order]')).toBe('0');
    expect(form.get('client_id')).toBe('client-bbb');
  });

  it('falls back to empty client_id when DROPBOX_SIGN_CLIENT_ID is unset', async () => {
    delete process.env.DROPBOX_SIGN_CLIENT_ID;
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        signature_request: {
          signature_request_id: 'r',
          signatures: [{ signature_id: 's' }],
        },
      }),
    );
    await createSignatureRequest(makeCreateOpts());
    const form = (fetchSpy.mock.calls[0]![1] as RequestInit).body as FormData;
    expect(form.get('client_id')).toBe('');
  });

  it('attaches the PDF as file[0] with the supplied filename', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        signature_request: {
          signature_request_id: 'r',
          signatures: [{ signature_id: 's' }],
        },
      }),
    );
    await createSignatureRequest(makeCreateOpts({ fileName: 'doc.pdf' }));
    const form = (fetchSpy.mock.calls[0]![1] as RequestInit).body as FormData;
    const file = form.get('file[0]');
    expect(file).toBeInstanceOf(Blob);
    if (file instanceof File) {
      expect(file.name).toBe('doc.pdf');
    }
  });

  it('throws with status + body when the API returns a non-2xx response', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('bad request body', 400));
    await expect(createSignatureRequest(makeCreateOpts())).rejects.toThrow(
      /create_embedded failed \(400\): bad request body/,
    );
  });

  it('throws a generic message when the error response body is unreadable', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('boom')),
      json: () => Promise.reject(new Error('boom')),
    } as unknown as Response);
    await expect(createSignatureRequest(makeCreateOpts())).rejects.toThrow(
      /create_embedded failed \(500\)/,
    );
  });

  it('throws "unexpected response shape" when signature_request_id is missing', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ signature_request: { signatures: [{ signature_id: 's' }] } }),
    );
    await expect(createSignatureRequest(makeCreateOpts())).rejects.toThrow(
      /unexpected response shape/,
    );
  });

  it('throws "unexpected response shape" when signature_id is missing', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        signature_request: { signature_request_id: 'r', signatures: [] },
      }),
    );
    await expect(createSignatureRequest(makeCreateOpts())).rejects.toThrow(
      /unexpected response shape/,
    );
  });

  it('throws when DROPBOX_SIGN_API_KEY is missing — no fetch call', async () => {
    delete process.env.DROPBOX_SIGN_API_KEY;
    await expect(createSignatureRequest(makeCreateOpts())).rejects.toThrow(
      /DropboxSign is not configured/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getEmbeddedSignUrl', () => {
  it('returns signUrl + expiresAt from a happy-path response', async () => {
    const expiresSec = Math.floor(Date.now() / 1000) + 300;
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ embedded: { sign_url: 'https://x.test/embed', expires_at: expiresSec } }),
    );

    const out = await getEmbeddedSignUrl('sig-1');
    expect(out.signUrl).toBe('https://x.test/embed');
    expect(out.expiresAt).toEqual(new Date(expiresSec * 1000));
  });

  it('defaults expiresAt to ~now+5min when the response omits expires_at', async () => {
    const before = Date.now();
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ embedded: { sign_url: 'https://x.test/embed' } }),
    );

    const out = await getEmbeddedSignUrl('sig-1');
    const expectedMin = before + 5 * 60 * 1000 - 100;
    const expectedMax = before + 5 * 60 * 1000 + 5000;
    expect(out.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(out.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it('rejects an empty signatureId with a clear error — no fetch call', async () => {
    await expect(getEmbeddedSignUrl('')).rejects.toThrow(/signatureId is required/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('url-encodes the signatureId path segment', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ embedded: { sign_url: 'https://x.test/e' } }),
    );
    await getEmbeddedSignUrl('a b/c?d');
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`https://api.hellosign.com/v3/embedded/sign_url/${encodeURIComponent('a b/c?d')}`);
  });

  it('uses GET with Basic auth header', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ embedded: { sign_url: 'https://x.test/e' } }),
    );
    await getEmbeddedSignUrl('s');
    const init = fetchSpy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('GET');
    expect(init.headers).toMatchObject({
      Authorization: 'Basic ' + Buffer.from('sk-test-aaa:').toString('base64'),
    });
  });

  it('throws with status + body on a non-2xx response', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('forbidden', 403));
    await expect(getEmbeddedSignUrl('sig-1')).rejects.toThrow(/sign_url failed \(403\): forbidden/);
  });

  it('throws when sign_url is missing from the response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ embedded: {} }));
    await expect(getEmbeddedSignUrl('sig-1')).rejects.toThrow(/no sign_url/);
  });

  it('throws when DROPBOX_SIGN_API_KEY is missing — no fetch call', async () => {
    delete process.env.DROPBOX_SIGN_API_KEY;
    await expect(getEmbeddedSignUrl('sig-1')).rejects.toThrow(/DropboxSign is not configured/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('cancelSignatureRequest', () => {
  it('POSTs to the cancel endpoint with Basic auth', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await cancelSignatureRequest('req-1');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.hellosign.com/v3/signature_request/cancel/${encodeURIComponent('req-1')}`,
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Basic ' + Buffer.from('sk-test-aaa:').toString('base64'),
    });
  });

  it('returns immediately without fetching when signatureRequestId is empty', async () => {
    await cancelSignatureRequest('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('swallows a 404 (already cancelled / not found)', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('not found', 404));
    await expect(cancelSignatureRequest('req-1')).resolves.toBeUndefined();
  });

  it('swallows a 410 (gone)', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('gone', 410));
    await expect(cancelSignatureRequest('req-1')).resolves.toBeUndefined();
  });

  it('throws on other non-2xx responses (e.g. 500)', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('boom', 500));
    await expect(cancelSignatureRequest('req-1')).rejects.toThrow(/cancel failed \(500\): boom/);
  });

  it('throws when DROPBOX_SIGN_API_KEY is missing — no fetch call', async () => {
    delete process.env.DROPBOX_SIGN_API_KEY;
    await expect(cancelSignatureRequest('req-1')).rejects.toThrow(/DropboxSign is not configured/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('url-encodes the signatureRequestId path segment', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    await cancelSignatureRequest('a b/c?d');
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.hellosign.com/v3/signature_request/cancel/${encodeURIComponent('a b/c?d')}`,
    );
  });
});

describe('getSignedFileUrl', () => {
  it('returns the file_url on the happy path', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ file_url: 'https://x.test/signed.pdf' }));
    const url = await getSignedFileUrl('req-1');
    expect(url).toBe('https://x.test/signed.pdf');
  });

  it('returns null when signatureRequestId is empty — no fetch call', async () => {
    expect(await getSignedFileUrl('')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null on a non-2xx response (e.g. 404 pre-signing)', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('not ready', 404));
    expect(await getSignedFileUrl('req-1')).toBeNull();
  });

  it('returns null when file_url is missing from the response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    expect(await getSignedFileUrl('req-1')).toBeNull();
  });

  it('queries with file_type=pdf and get_url=1', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ file_url: 'x' }));
    await getSignedFileUrl('req-1');
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('file_type=pdf');
    expect(url).toContain('get_url=1');
    expect(init.method).toBe('GET');
  });

  it('throws when DROPBOX_SIGN_API_KEY is missing — happens before fetch via authHeader', async () => {
    delete process.env.DROPBOX_SIGN_API_KEY;
    await expect(getSignedFileUrl('req-1')).rejects.toThrow(/DropboxSign is not configured/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('url-encodes the signatureRequestId path segment', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ file_url: 'x' }));
    await getSignedFileUrl('a b/c?d');
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/files/${encodeURIComponent('a b/c?d')}`);
  });
});
