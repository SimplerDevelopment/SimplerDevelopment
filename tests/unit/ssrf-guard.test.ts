// @vitest-environment node
/**
 * Unit tests for lib/ssrf-guard.
 * Locks in the IPv6 `[::1]` bracket-strip fix and the full private-range matrix.
 *
 * assertSafeUrl() (which performs DNS lookup) is not exercised here — that's
 * the integration layer's job. These tests cover the purely static URL
 * validation path.
 */
import { describe, it, expect } from 'vitest';
import { validateWebhookUrl } from '@/lib/ssrf-guard';

describe('validateWebhookUrl — accepts', () => {
  it.each([
    ['https://example.com/hook', 'example.com'],
    ['https://api.stripe.com/v1/events', 'api.stripe.com'],
    ['http://example.com:80/hook', 'example.com'],
    ['https://example.com:443/hook', 'example.com'],
    ['https://example.com/path?q=1#frag', 'example.com'],
    ['https://sub.domain.example.co.uk/x', 'sub.domain.example.co.uk'],
    ['https://8.8.8.8/x', '8.8.8.8'],              // public IPv4 literal
    ['https://[2001:4860:4860::8888]/x', '2001:4860:4860::8888'], // public IPv6 literal
  ])('accepts %s', (url, expectedHost) => {
    const r = validateWebhookUrl(url);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hostname).toBe(expectedHost);
  });
});

describe('validateWebhookUrl — rejects by scheme', () => {
  it.each([
    ['file:///etc/passwd',        'Only http and https URLs are allowed.'],
    ['ftp://example.com/hook',    'Only http and https URLs are allowed.'],
    ['gopher://example.com/',     'Only http and https URLs are allowed.'],
    ['ws://example.com/',         'Only http and https URLs are allowed.'],
    ['javascript:alert(1)',       'Only http and https URLs are allowed.'],
    ['data:text/plain,hello',     'Only http and https URLs are allowed.'],
    ['',                          'Not a valid URL.'],
    ['not-a-url',                 'Not a valid URL.'],
  ])('rejects %s', (url, reason) => {
    const r = validateWebhookUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });
});

describe('validateWebhookUrl — rejects by port', () => {
  it.each([
    'http://example.com:22/',
    'http://example.com:3306/',
    'http://example.com:6379/',
    'http://example.com:8080/',
    'https://example.com:9200/',
    'https://example.com:25565/',
  ])('rejects non-80/443 port: %s', url => {
    const r = validateWebhookUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('Only ports 80 and 443 are allowed.');
  });
});

describe('validateWebhookUrl — rejects by userinfo', () => {
  it.each([
    'https://user@example.com/x',
    'https://user:pass@example.com/x',
    'http://:pass@example.com/x',
  ])('rejects URL with credentials: %s', url => {
    const r = validateWebhookUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('URLs with credentials are not allowed.');
  });
});

describe('validateWebhookUrl — rejects blocked hostnames', () => {
  it.each([
    'http://localhost/x',
    'http://LOCALHOST/x',                    // case insensitive
    'http://api.localhost/x',                // subdomains
    'http://metadata/x',                     // k8s / ec2
    'http://metadata.google.internal/x',     // gcp
  ])('rejects blocked hostname: %s', url => {
    const r = validateWebhookUrl(url);
    expect(r.ok).toBe(false);
  });
});

describe('validateWebhookUrl — rejects private IPv4 ranges', () => {
  it.each([
    // Loopback
    'http://127.0.0.1/x',
    'http://127.255.255.254/x',
    // 0.0.0.0/8
    'http://0.0.0.0/x',
    'http://0.1.2.3/x',
    // Link-local + cloud metadata
    'http://169.254.169.254/latest/meta-data/',  // AWS/GCP metadata
    'http://169.254.1.1/x',
    // Private RFC1918
    'http://10.0.0.1/x',
    'http://10.255.255.255/x',
    'http://172.16.0.1/x',
    'http://172.20.0.1/x',
    'http://172.31.255.255/x',
    'http://192.168.0.1/x',
    'http://192.168.255.255/x',
    // Reserved / TEST-NET / benchmarking
    'http://192.0.0.0/x',
    'http://192.0.2.1/x',
    'http://198.18.0.1/x',
    'http://198.19.0.1/x',
    'http://198.51.100.1/x',
    'http://203.0.113.1/x',
    // Multicast / class E
    'http://224.0.0.1/x',
    'http://239.255.255.255/x',
    'http://255.255.255.255/x',
  ])('rejects private IPv4: %s', url => {
    const r = validateWebhookUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('Private / loopback IPs are not allowed.');
  });
});

describe('validateWebhookUrl — rejects private IPv6 ranges', () => {
  it.each([
    // Loopback — THE bracket-strip regression
    'http://[::1]/x',
    'https://[::1]:443/x',
    // Unspecified
    'http://[::]/x',
    // Link-local
    'http://[fe80::1]/x',
    'http://[fe80::dead:beef]/x',
    // Unique-local
    'http://[fc00::1]/x',
    'http://[fd12:3456:789a::1]/x',
    // Multicast
    'http://[ff02::1]/x',
    // IPv4-mapped to a private range
    'http://[::ffff:127.0.0.1]/x',
    'http://[::ffff:10.0.0.1]/x',
    'http://[::ffff:192.168.1.1]/x',
  ])('rejects private IPv6: %s', url => {
    const r = validateWebhookUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('Private / loopback IPs are not allowed.');
  });
});

describe('validateWebhookUrl — returns normalised hostname', () => {
  it('strips IPv6 brackets from hostname in success result', () => {
    const r = validateWebhookUrl('https://[2001:4860:4860::8888]/x');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hostname).toBe('2001:4860:4860::8888');
  });

  it('returns original hostname when not bracketed', () => {
    const r = validateWebhookUrl('https://example.com/x');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hostname).toBe('example.com');
  });
});
