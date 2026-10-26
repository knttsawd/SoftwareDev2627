import { fetchTranscript, YoutubeTranscriptNotAvailableLanguageError } from 'youtube-transcript';
import {
  ARTICLE_FETCH_TIMEOUT_MS,
  ARTICLE_MAX_BYTES,
  HTTP_STATUS,
  PREFERRED_CAPTION_LANGUAGE,
  YOUTUBE_OEMBED_URL,
} from '../../config/constants.js';
import { create_http_error } from '../http_error.js';
import { fetch_public_text } from './safe_fetch.js';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
]);
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const VIDEO_PATH_PATTERN = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/;
const NAMED_ENTITIES = { '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };

// Finds the 11-character video id in any common YouTube link (watch, youtu.be, shorts,
// embed, live). Returns null for anything that isn't a YouTube video link.
export function get_youtube_video_id(url_string) {
  let video_url;
  try {
    video_url = new URL(url_string);
  } catch {
    return null;
  }
  const hostname = video_url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(hostname)) return null;

  let candidate_id;
  if (hostname === 'youtu.be') {
    candidate_id = video_url.pathname.slice(1).split('/')[0];
  } else if (video_url.pathname === '/watch') {
    candidate_id = video_url.searchParams.get('v');
  } else {
    candidate_id = video_url.pathname.match(VIDEO_PATH_PATTERN)?.[1];
  }
  return VIDEO_ID_PATTERN.test(candidate_id ?? '') ? candidate_id : null;
}

// Caption text arrives with HTML entities still encoded, sometimes more than once
// ("&amp;#39;" for an apostrophe, "&amp;amp;" for &), so &amp; is unwrapped first until
// none are left.
export function decode_caption_text(caption_text) {
  let unwrapped_text = caption_text;
  while (unwrapped_text.includes('&amp;')) unwrapped_text = unwrapped_text.replace(/&amp;/g, '&');
  return unwrapped_text
    .replace(/&#(\d+);/g, (entity, code_point) => String.fromCodePoint(Number(code_point)))
    .replace(/&(?:quot|#39|apos|lt|gt|nbsp);/g, (entity) => NAMED_ENTITIES[entity]);
}

// Joins caption snippets ([{ text, offset, duration }]) into one block of text.
export function join_transcript_parts(transcript_parts) {
  return transcript_parts.map((transcript_part) => decode_caption_text(transcript_part.text)).join(' ');
}

// Downloads a video's captions as text, in the preferred language when the video has it
// (otherwise YouTube lists captions in any order, so the first track could be a
// translation). Falls back to the video's first caption track. fetch_transcript is
// injectable for tests.
export async function fetch_youtube_transcript(video_id, fetch_transcript = fetchTranscript) {
  try {
    const transcript_parts = await fetch_transcript(video_id, { lang: PREFERRED_CAPTION_LANGUAGE }).catch(
      (language_error) => {
        if (!(language_error instanceof YoutubeTranscriptNotAvailableLanguageError)) throw language_error;
        return fetch_transcript(video_id);
      },
    );
    return join_transcript_parts(transcript_parts);
  } catch (transcript_error) {
    throw create_http_error(
      HTTP_STATUS.unprocessable,
      'We could not get captions for that video. It may have captions turned off.',
      {},
      transcript_error,
    );
  }
}

// Looks up a video's title through YouTube's public oEmbed endpoint. A title is nice to
// have, not essential, so any failure falls back to a generic one.
export async function fetch_youtube_title(video_id, fetch_options = {}) {
  const oembed_url = `${YOUTUBE_OEMBED_URL}?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${video_id}`)}`;
  try {
    const { body } = await fetch_public_text(oembed_url, {
      max_bytes: ARTICLE_MAX_BYTES,
      timeout_ms: ARTICLE_FETCH_TIMEOUT_MS,
      ...fetch_options,
    });
    return JSON.parse(body).title || `YouTube video ${video_id}`;
  } catch {
    return `YouTube video ${video_id}`;
  }
}
