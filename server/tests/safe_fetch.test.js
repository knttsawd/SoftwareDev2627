import { describe, expect, it, vi } from 'vitest';
import {
  assert_public_host,
  fetch_public_text,
  is_private_address,
  parse_web_url,
  read_limited_text,
} from '../services/extraction/safe_fetch.js';

const FETCH_LIMITS = { max_bytes: 1000, timeout_ms: 1000 };
const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34', family: 4 }];

describe('is_private_address', () => {
  it('flags this machine, local networks and cloud metadata addresses', () => {
    for (const private_address of ['127.0.0.1', '10.1.2.3', '172.16.5.5', '192.168.1.10', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(is_private_address(private_address)).toBe(true);
    }
  });

  it('allows public addresses', () => {
    expect(is_private_address('93.184.216.34')).toBe(false);
    expect(is_private_address('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });
});

describe('parse_web_url', () => {
  it('accepts http and https links only', () => {
    expect(parse_web_url('https://example.com/a').hostname).toBe('example.com');
    expect(() => parse_web_url('example.com')).toThrow('Enter a full web address');
    expect(() => parse_web_url('file:///etc/passwd')).toThrow('Only http:// and https:// links');
  });
});

describe('assert_public_host', () => {
  it('refuses a host that resolves to a private address', async () => {
    await expect(assert_public_host('sneaky.example', async () => [{ address: '10.0.0.5' }])).rejects.toMatchObject({
      status: 400,
    });
    await expect(assert_public_host('example.com', PUBLIC_LOOKUP)).resolves.toBeUndefined();
  });

  it('checks IPv6 hosts without their brackets', async () => {
    const lookup_address = vi.fn(async () => [{ address: '::1' }]);

    await expect(assert_public_host('[::1]', lookup_address)).rejects.toMatchObject({ status: 400 });
    expect(lookup_address).toHaveBeenCalledWith('::1', { all: true });
  });

  it('explains when the website does not exist', async () => {
    await expect(
      assert_public_host('no-such-site.example', async () => {
        throw new Error('ENOTFOUND');
      }),
    ).rejects.toThrow('We could not find that website');
  });
});

describe('read_limited_text', () => {
  it('reads a body under the limit and refuses one over it', async () => {
    await expect(read_limited_text(new Response('hello'), 10)).resolves.toBe('hello');
    await expect(read_limited_text(new Response('x'.repeat(20)), 10)).rejects.toThrow('too large');
  });
});

describe('fetch_public_text', () => {
  it('returns the body, content type and final address', async () => {
    const fetch_function = vi.fn(async () => new Response('<p>Hi</p>', { headers: { 'content-type': 'text/html' } }));

    const fetched_page = await fetch_public_text('https://example.com', {
      ...FETCH_LIMITS,
      lookup_address: PUBLIC_LOOKUP,
      fetch_function,
    });

    expect(fetched_page).toEqual({ final_url: 'https://example.com/', content_type: 'text/html', body: '<p>Hi</p>' });
    expect(fetch_function.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('checks every redirect hop, blocking one that leads to a private address', async () => {
    const fetch_function = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://internal.example/' } }));
    const lookup_address = vi.fn(async (hostname) =>
      hostname === 'internal.example' ? [{ address: '127.0.0.1' }] : [{ address: '93.184.216.34' }],
    );

    await expect(
      fetch_public_text('https://example.com', { ...FETCH_LIMITS, lookup_address, fetch_function }),
    ).rejects.toMatchObject({ status: 400 });
    expect(lookup_address).toHaveBeenCalledWith('internal.example', { all: true });
  });

  it('follows safe redirects', async () => {
    const fetch_function = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/moved' } }))
      .mockResolvedValueOnce(new Response('moved here', { headers: { 'content-type': 'text/plain' } }));

    const fetched_page = await fetch_public_text('https://example.com/old', {
      ...FETCH_LIMITS,
      lookup_address: PUBLIC_LOOKUP,
      fetch_function,
    });

    expect(fetched_page.final_url).toBe('https://example.com/moved');
    expect(fetched_page.body).toBe('moved here');
  });

  it('gives up after too many redirects', async () => {
    const fetch_function = vi.fn(async () => new Response(null, { status: 302, headers: { location: '/again' } }));

    await expect(
      fetch_public_text('https://example.com', { ...FETCH_LIMITS, lookup_address: PUBLIC_LOOKUP, fetch_function }),
    ).rejects.toThrow('redirects too many times');
  });

  it('explains error responses and unreachable sites', async () => {
    const error_fetch = vi.fn(async () => new Response('missing', { status: 404 }));
    const offline_fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    await expect(
      fetch_public_text('https://example.com', { ...FETCH_LIMITS, lookup_address: PUBLIC_LOOKUP, fetch_function: error_fetch }),
    ).rejects.toThrow('answered with an error (404)');
    await expect(
      fetch_public_text('https://example.com', { ...FETCH_LIMITS, lookup_address: PUBLIC_LOOKUP, fetch_function: offline_fetch }),
    ).rejects.toThrow('We could not reach that website');
  });
});
