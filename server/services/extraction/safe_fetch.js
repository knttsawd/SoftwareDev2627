import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { FETCH_USER_AGENT, HTTP_STATUS, MAX_REDIRECTS } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';

// Address ranges the server must never fetch on a student's behalf: this machine, the
// local network and cloud metadata services. Without this check, a pasted link like
// http://169.254.169.254/ could make the server read its own private data.
const PRIVATE_NETWORKS = [
  ['0.0.0.0', 8, 'ipv4'],
  ['10.0.0.0', 8, 'ipv4'],
  ['100.64.0.0', 10, 'ipv4'],
  ['127.0.0.0', 8, 'ipv4'],
  ['169.254.0.0', 16, 'ipv4'],
  ['172.16.0.0', 12, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'],
  ['198.18.0.0', 15, 'ipv4'],
  ['224.0.0.0', 4, 'ipv4'],
  ['240.0.0.0', 4, 'ipv4'],
  ['::', 128, 'ipv6'],
  ['::1', 128, 'ipv6'],
  ['fc00::', 7, 'ipv6'],
  ['fe80::', 10, 'ipv6'],
  ['ff00::', 8, 'ipv6'],
];

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const IPV4_MAPPED_PATTERN = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

const PRIVATE_ADDRESS_LIST = new BlockList();
for (const [network, prefix_length, family] of PRIVATE_NETWORKS) {
  PRIVATE_ADDRESS_LIST.addSubnet(network, prefix_length, family);
}

// True when an IP address is on a private or reserved network. IPv4 addresses written in
// IPv6 form (::ffff:127.0.0.1) are checked as IPv4.
export function is_private_address(ip_address) {
  const mapped_match = ip_address.match(IPV4_MAPPED_PATTERN);
  if (mapped_match) return PRIVATE_ADDRESS_LIST.check(mapped_match[1], 'ipv4');
  return PRIVATE_ADDRESS_LIST.check(ip_address, isIP(ip_address) === 6 ? 'ipv6' : 'ipv4');
}

// Parses a pasted link, accepting only http and https.
export function parse_web_url(url_string) {
  let web_url;
  try {
    web_url = new URL(url_string);
  } catch {
    throw create_http_error(HTTP_STATUS.bad_request, 'Enter a full web address starting with https://');
  }
  if (web_url.protocol !== 'http:' && web_url.protocol !== 'https:') {
    throw create_http_error(HTTP_STATUS.bad_request, 'Only http:// and https:// links can be added');
  }
  return web_url;
}

// Looks up every address a host name points to and refuses if any of them is private.
// lookup_address is injectable so tests don't need real DNS.
export async function assert_public_host(hostname, lookup_address = lookup) {
  const bare_hostname = hostname.replace(/^\[|\]$/g, '');
  let resolved_addresses;
  try {
    resolved_addresses = await lookup_address(bare_hostname, { all: true });
  } catch (lookup_error) {
    throw create_http_error(HTTP_STATUS.unprocessable, 'We could not find that website', {}, lookup_error);
  }
  if (resolved_addresses.some(({ address }) => is_private_address(address))) {
    throw create_http_error(HTTP_STATUS.bad_request, 'That link points to a private network, so it cannot be added');
  }
}

// Reads a response body as text, stopping with a 422 once it passes max_bytes.
export async function read_limited_text(response, max_bytes) {
  const body_reader = response.body.getReader();
  const text_decoder = new TextDecoder();
  let received_bytes = 0;
  let body_text = '';
  for (;;) {
    const { done, value } = await body_reader.read();
    if (done) return body_text + text_decoder.decode();
    received_bytes += value.byteLength;
    if (received_bytes > max_bytes) {
      await body_reader.cancel();
      throw create_http_error(HTTP_STATUS.unprocessable, 'That page is too large to import');
    }
    body_text += text_decoder.decode(value, { stream: true });
  }
}

// Downloads a public web page as text. Redirects are followed by hand so every hop is
// checked with assert_public_host. Returns { final_url, content_type, body }.
// lookup_address and fetch_function are injectable for tests.
export async function fetch_public_text(
  url_string,
  { max_bytes, timeout_ms, lookup_address = lookup, fetch_function = fetch },
) {
  let current_url = parse_web_url(url_string);

  for (let redirect_count = 0; redirect_count <= MAX_REDIRECTS; redirect_count += 1) {
    await assert_public_host(current_url.hostname, lookup_address);

    let response;
    try {
      response = await fetch_function(current_url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(timeout_ms),
        headers: { 'user-agent': FETCH_USER_AGENT, accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
      });
    } catch (fetch_error) {
      throw create_http_error(HTTP_STATUS.unprocessable, 'We could not reach that website', {}, fetch_error);
    }

    if (REDIRECT_STATUSES.has(response.status) && response.headers.get('location')) {
      current_url = parse_web_url(new URL(response.headers.get('location'), current_url).href);
      continue;
    }
    if (!response.ok) {
      throw create_http_error(HTTP_STATUS.unprocessable, `That website answered with an error (${response.status})`);
    }
    return {
      final_url: current_url.href,
      content_type: response.headers.get('content-type') ?? '',
      body: await read_limited_text(response, max_bytes),
    };
  }

  throw create_http_error(HTTP_STATUS.unprocessable, 'That link redirects too many times');
}
