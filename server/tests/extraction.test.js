import { describe, expect, it, vi } from 'vitest';
import { YoutubeTranscriptNotAvailableLanguageError } from 'youtube-transcript';
import { MAX_EXTRACTED_CHARACTERS } from '../config/constants.js';
import { extract_article, fetch_article, remove_citation_markers } from '../services/extraction/article_extractor.js';
import {
  extract_file_text,
  get_file_extension,
  get_file_resource_type,
} from '../services/extraction/file_extractor.js';
import { extract_pdf_text, remove_page_markers } from '../services/extraction/pdf_extractor.js';
import {
  assert_enough_text,
  limit_text_length,
  normalize_extracted_text,
} from '../services/extraction/text_cleanup.js';
import {
  decode_caption_text,
  fetch_youtube_title,
  fetch_youtube_transcript,
  get_youtube_video_id,
  join_transcript_parts,
} from '../services/extraction/youtube_extractor.js';
import { build_test_pdf } from './helpers/build_test_pdf.js';

const PUBLIC_LOOKUP = async () => [{ address: '93.184.216.34', family: 4 }];

// A fetch stand-in that answers every request with the given body and content type.
function create_fetch_stub(body, content_type) {
  return vi.fn(async () => new Response(body, { status: 200, headers: { 'content-type': content_type } }));
}

describe('text cleanup', () => {
  it('normalizes line endings, spaces and blank lines', () => {
    expect(normalize_extracted_text('  Line one\r\n\r\n\r\n\r\nLine\t\ttwo   here  ')).toBe('Line one\n\nLine two here');
  });

  it('cuts text past the maximum and says so', () => {
    expect(limit_text_length('short')).toEqual({ text: 'short', is_truncated: false });

    const long_result = limit_text_length('x'.repeat(MAX_EXTRACTED_CHARACTERS + 5));
    expect(long_result.text).toHaveLength(MAX_EXTRACTED_CHARACTERS);
    expect(long_result.is_truncated).toBe(true);
  });

  it('refuses text that is too short to study from', () => {
    expect(() => assert_enough_text('tiny', 'That file is empty.')).toThrow(
      expect.objectContaining({ status: 422, message: 'That file is empty.' }),
    );
    expect(() => assert_enough_text('This sentence is long enough to keep.', 'x')).not.toThrow();
  });
});

describe('PDF extraction', () => {
  it('reads the text of a PDF without page markers', async () => {
    const pdf_text = await extract_pdf_text(build_test_pdf('Plants make glucose from sunlight'));

    expect(pdf_text).toContain('Plants make glucose from sunlight');
    expect(pdf_text).not.toMatch(/-- 1 of 1 --/);
  });

  it('removes page markers', () => {
    expect(remove_page_markers('Page one\n-- 1 of 2 --\nPage two')).toBe('Page one\n\nPage two');
  });

  it('turns an unreadable PDF into a 422', async () => {
    await expect(extract_pdf_text(Buffer.from('not a pdf'))).rejects.toMatchObject({ status: 422 });
  });
});

describe('file extraction', () => {
  it('maps file extensions to resource types', () => {
    expect(get_file_extension('Lecture 3.MP3')).toBe('.mp3');
    expect(get_file_resource_type('notes.PDF')).toBe('pdf');
    expect(get_file_resource_type('notes.md')).toBe('note');
    expect(get_file_resource_type('talk.m4a')).toBe('audio');
    expect(get_file_resource_type('class.mp4')).toBe('video');
    expect(get_file_resource_type('slides.pptx')).toBeNull();
  });

  it('reads text files and sends recordings to the transcriber', async () => {
    const transcribe = vi.fn().mockResolvedValue('spoken words');

    await expect(
      extract_file_text({ resource_type: 'note', file_buffer: Buffer.from('My notes'), file_name: 'a.txt', transcribe }),
    ).resolves.toBe('My notes');
    await expect(
      extract_file_text({ resource_type: 'audio', file_buffer: Buffer.from('mp3'), file_name: 'a.mp3', transcribe }),
    ).resolves.toBe('spoken words');
    expect(transcribe).toHaveBeenCalledWith(Buffer.from('mp3'), 'a.mp3');
  });

  it('parses PDFs', async () => {
    const pdf_text = await extract_file_text({
      resource_type: 'pdf',
      file_buffer: build_test_pdf('Cells divide by mitosis'),
      file_name: 'cells.pdf',
      transcribe: vi.fn(),
    });

    expect(pdf_text).toContain('Cells divide by mitosis');
  });
});

describe('article extraction', () => {
  it('keeps the article paragraphs and drops navigation, scripts and nested repeats', () => {
    const article = extract_article(`
      <html><head><title>Tab title</title><meta property="og:title" content="The Water Cycle"></head>
      <body>
        <nav><p>Home | About</p></nav>
        <article>
          <h1>The Water Cycle</h1>
          <p>Water evaporates from oceans.</p>
          <ul><li><p>Clouds form from vapor.</p></li></ul>
          <script>tracking()</script>
        </article>
        <footer><p>Copyright</p></footer>
      </body></html>`);

    expect(article.title).toBe('The Water Cycle');
    expect(article.text).toBe('The Water Cycle\n\nWater evaporates from oceans.\n\nClouds form from vapor.');
  });

  it('removes footnote markers', () => {
    expect(remove_citation_markers('Plants[5] make sugar[note 1].[citation needed][a]')).toBe('Plants make sugar.');
    expect(extract_article('<body><p>Leaves[12] are green.</p></body>').text).toBe('Leaves are green.');
  });

  it('falls back to the page title and body text', () => {
    const article = extract_article('<html><head><title>Plain page</title></head><body>Just some text.</body></html>');

    expect(article).toEqual({ title: 'Plain page', text: 'Just some text.' });
  });

  it('fetches a web page and extracts it', async () => {
    const fetch_function = create_fetch_stub('<html><body><p>Some article text here.</p></body></html>', 'text/html');

    const article = await fetch_article('https://example.com/post', { lookup_address: PUBLIC_LOOKUP, fetch_function });

    expect(article.text).toBe('Some article text here.');
  });

  it('uses plain-text pages as they are', async () => {
    const fetch_function = create_fetch_stub('Plain text notes.', 'text/plain; charset=utf-8');

    const article = await fetch_article('https://example.com/notes.txt', { lookup_address: PUBLIC_LOOKUP, fetch_function });

    expect(article).toEqual({ title: 'https://example.com/notes.txt', text: 'Plain text notes.' });
  });

  it('refuses links that are not web pages', async () => {
    const fetch_function = create_fetch_stub('%PDF', 'application/pdf');

    await expect(
      fetch_article('https://example.com/paper.pdf', { lookup_address: PUBLIC_LOOKUP, fetch_function }),
    ).rejects.toThrow('That link is not a web page');
  });
});

describe('YouTube extraction', () => {
  it('finds the video id in every common link style', () => {
    expect(get_youtube_video_id('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30')).toBe('dQw4w9WgXcQ');
    expect(get_youtube_video_id('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ');
    expect(get_youtube_video_id('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(get_youtube_video_id('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for other links', () => {
    expect(get_youtube_video_id('https://example.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(get_youtube_video_id('https://www.youtube.com/channel/abc')).toBeNull();
    expect(get_youtube_video_id('not a url')).toBeNull();
  });

  it('decodes HTML entities in captions, including double-encoded ones', () => {
    expect(decode_caption_text('it&amp;#39;s &quot;fine&quot; &amp;amp; ok')).toBe('it\'s "fine" & ok');
  });

  it('joins caption snippets into one text', () => {
    expect(join_transcript_parts([{ text: 'Hello' }, { text: 'world' }])).toBe('Hello world');
  });

  it('asks for English captions first, then falls back to any language', async () => {
    const fetch_transcript = vi
      .fn()
      .mockRejectedValueOnce(new YoutubeTranscriptNotAvailableLanguageError('en', ['es'], 'dQw4w9WgXcQ'))
      .mockResolvedValueOnce([{ text: 'Hola' }]);

    await expect(fetch_youtube_transcript('dQw4w9WgXcQ', fetch_transcript)).resolves.toBe('Hola');
    expect(fetch_transcript).toHaveBeenNthCalledWith(1, 'dQw4w9WgXcQ', { lang: 'en' });
    expect(fetch_transcript).toHaveBeenNthCalledWith(2, 'dQw4w9WgXcQ');
  });

  it('fetches a transcript, or explains why it could not', async () => {
    await expect(fetch_youtube_transcript('dQw4w9WgXcQ', async () => [{ text: 'Plants need light' }])).resolves.toBe(
      'Plants need light',
    );
    await expect(
      fetch_youtube_transcript('dQw4w9WgXcQ', async () => {
        throw new Error('Transcript is disabled');
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('looks up the video title, falling back to a generic one', async () => {
    const fetch_function = create_fetch_stub('{"title":"Photosynthesis in 5 minutes"}', 'application/json');
    const failing_fetch = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(fetch_youtube_title('dQw4w9WgXcQ', { lookup_address: PUBLIC_LOOKUP, fetch_function })).resolves.toBe(
      'Photosynthesis in 5 minutes',
    );
    await expect(
      fetch_youtube_title('dQw4w9WgXcQ', { lookup_address: PUBLIC_LOOKUP, fetch_function: failing_fetch }),
    ).resolves.toBe('YouTube video dQw4w9WgXcQ');
  });
});
