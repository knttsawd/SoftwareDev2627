import * as cheerio from 'cheerio';
import { ARTICLE_FETCH_TIMEOUT_MS, ARTICLE_MAX_BYTES, HTTP_STATUS } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';
import { fetch_public_text } from './safe_fetch.js';

// Page parts that are never the article itself.
const NON_CONTENT_SELECTORS = 'script, style, noscript, template, nav, header, footer, aside, form, iframe, svg, button';
// Where the article usually lives, best guess first.
const CONTENT_ROOT_SELECTORS = ['article', 'main', '[role="main"]', 'body'];
// Elements that hold one paragraph-like piece of text each.
const TEXT_BLOCK_SELECTORS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre, td, dd, dt, figcaption';
// Footnote markers such as [5], [note 1] or [citation needed], common on encyclopedia pages.
const CITATION_MARKER_PATTERN = /\[(?:\d+|[a-z]|note \d+|citation needed)\]/gi;

export function remove_citation_markers(text) {
  return text.replace(CITATION_MARKER_PATTERN, '');
}

// Pulls the readable title and text out of an article's HTML. Each paragraph-like block
// becomes its own paragraph; blocks nested inside other blocks are skipped so text isn't
// repeated, and footnote markers are removed.
export function extract_article(html) {
  const $ = cheerio.load(html);
  const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || '').trim();
  $(NON_CONTENT_SELECTORS).remove();

  const content_root = CONTENT_ROOT_SELECTORS.map((selector) => $(selector).first()).find(
    (candidate) => candidate.length > 0 && candidate.text().trim() !== '',
  );
  if (!content_root) return { title, text: '' };

  const text_blocks = content_root
    .find(TEXT_BLOCK_SELECTORS)
    .filter((block_index, block_element) => $(block_element).find(TEXT_BLOCK_SELECTORS).length === 0)
    .map((block_index, block_element) => $(block_element).text().trim())
    .get()
    .filter(Boolean);

  const article_text = text_blocks.length > 0 ? text_blocks.join('\n\n') : content_root.text();
  return { title, text: remove_citation_markers(article_text) };
}

// Downloads an article link and returns { title, text }. Plain-text pages are used as-is;
// anything that isn't a web page (a PDF link, an image) is refused with advice.
export async function fetch_article(url_string, fetch_options = {}) {
  const { final_url, content_type, body } = await fetch_public_text(url_string, {
    max_bytes: ARTICLE_MAX_BYTES,
    timeout_ms: ARTICLE_FETCH_TIMEOUT_MS,
    ...fetch_options,
  });
  if (content_type.includes('text/plain')) return { title: final_url, text: body };
  if (!content_type.includes('html')) {
    throw create_http_error(
      HTTP_STATUS.unprocessable,
      'That link is not a web page. To add a PDF, download it and upload the file instead.',
    );
  }
  return extract_article(body);
}
