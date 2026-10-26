import { MAX_SOURCE_CHARACTERS, SOURCE_CHUNK_CHARACTERS } from '../../config/constants.js';
import { count_topic_matches, get_topic_words } from './text_analysis.js';

// Each chunk sent to the AI starts with a line naming the resource it came from.
export const SOURCE_LABEL_PREFIX = '[From: ';

// "[From: Week 1]\n<chunk text>"
export function label_chunk(title, chunk_text) {
  return `${SOURCE_LABEL_PREFIX}${title}]\n${chunk_text}`;
}

// Splits text into chunks of at most chunk_size characters, breaking between paragraphs
// where possible. A single paragraph longer than chunk_size is cut into pieces.
export function split_into_chunks(text, chunk_size = SOURCE_CHUNK_CHARACTERS) {
  const chunks = [];
  let current_chunk = '';
  for (const paragraph of text.split(/\n{2,}/)) {
    for (let start = 0; start < paragraph.length; start += chunk_size) {
      const piece = paragraph.slice(start, start + chunk_size);
      if (current_chunk && current_chunk.length + piece.length + 2 > chunk_size) {
        chunks.push(current_chunk);
        current_chunk = '';
      }
      current_chunk = current_chunk ? `${current_chunk}\n\n${piece}` : piece;
    }
  }
  if (current_chunk) chunks.push(current_chunk);
  return chunks;
}

// Every position from 0 to chunk_count - 1, ordered so that any first few spread evenly
// across the text: the start, then the middle, then the quarters, the eighths and so on.
// Taking chunks in this order samples a whole long book, not just its opening pages.
export function order_for_even_coverage(chunk_count) {
  const ordered_positions = [];
  const used_positions = new Set();
  for (let split_count = 1; ordered_positions.length < chunk_count; split_count *= 2) {
    for (let part = 0; part < split_count; part += 1) {
      const position = Math.floor((part * chunk_count) / split_count);
      if (!used_positions.has(position)) {
        used_positions.add(position);
        ordered_positions.push(position);
      }
    }
  }
  return ordered_positions;
}

// A sample of whole resources for overview tasks, like finding a skill's topics or quizzing
// on one resource. Chunks are taken from each resource in turn, in even-coverage order, so
// one long resource can't crowd out the rest and a long resource is sampled from start to
// end. The chosen chunks are returned in reading order, each labelled with its resource.
export function select_overview_text(
  sources,
  { max_characters = MAX_SOURCE_CHARACTERS, chunk_size = SOURCE_CHUNK_CHARACTERS } = {},
) {
  const chunks_by_source = sources.map((source) => split_into_chunks(source.extracted_text, chunk_size));
  const orders_by_source = chunks_by_source.map((source_chunks) => order_for_even_coverage(source_chunks.length));
  const longest_source_length = Math.max(0, ...chunks_by_source.map((source_chunks) => source_chunks.length));
  const chosen_chunks = [];
  let used_characters = 0;

  for (let round = 0; round < longest_source_length; round += 1) {
    sources.forEach((source, source_index) => {
      const chunk_index = orders_by_source[source_index][round];
      const chunk_text = chunks_by_source[source_index][chunk_index];
      if (!chunk_text || used_characters + chunk_text.length > max_characters) return;
      chosen_chunks.push({ title: source.title, chunk_text, source_index, chunk_index });
      used_characters += chunk_text.length;
    });
  }

  return chosen_chunks
    .sort((first_chunk, second_chunk) => first_chunk.source_index - second_chunk.source_index || first_chunk.chunk_index - second_chunk.chunk_index)
    .map((chunk) => label_chunk(chunk.title, chunk.chunk_text))
    .join('\n\n');
}

// Picks the parts of some resources that best match a topic, up to max_characters, so the
// AI gets relevant material without being sent every resource in full.
// sources is [{ title, extracted_text }]. Chunks are ranked by how often the topic's words
// appear; when nothing matches (a broad topic like "Overview") the earliest chunks are
// used, unless only_matching is set, in which case non-matching chunks are left out.
// The chosen chunks go back into their original reading order, each labelled with its
// resource title.
export function select_source_text(
  sources,
  topic,
  { max_characters = MAX_SOURCE_CHARACTERS, chunk_size = SOURCE_CHUNK_CHARACTERS, only_matching = false } = {},
) {
  const topic_words = get_topic_words(topic);
  const ranked_chunks = sources
    .flatMap((source, source_index) =>
      split_into_chunks(source.extracted_text, chunk_size).map((chunk_text, chunk_index) => ({
        title: source.title,
        chunk_text,
        reading_order: source_index * 1_000_000 + chunk_index,
        score: count_topic_matches(chunk_text, topic_words),
      })),
    )
    .filter((chunk) => !only_matching || chunk.score > 0)
    .sort((first_chunk, second_chunk) => second_chunk.score - first_chunk.score || first_chunk.reading_order - second_chunk.reading_order);

  const chosen_chunks = [];
  let used_characters = 0;
  for (const chunk of ranked_chunks) {
    if (used_characters + chunk.chunk_text.length > max_characters) continue;
    chosen_chunks.push(chunk);
    used_characters += chunk.chunk_text.length;
  }

  return chosen_chunks
    .sort((first_chunk, second_chunk) => first_chunk.reading_order - second_chunk.reading_order)
    .map((chunk) => label_chunk(chunk.title, chunk.chunk_text))
    .join('\n\n');
}

// Material for a topic (unit) that has resources of its own. Those resources are about the
// topic by definition, so they come first as an even sample; whatever room is left goes to
// the parts of the skill's other resources that mention the topic.
export function select_focused_source_text(
  focus_sources,
  other_sources,
  topic,
  { max_characters = MAX_SOURCE_CHARACTERS, chunk_size = SOURCE_CHUNK_CHARACTERS } = {},
) {
  const focus_text = select_overview_text(focus_sources, { max_characters, chunk_size });
  const other_text = select_source_text(other_sources, topic, {
    max_characters: max_characters - focus_text.length,
    chunk_size,
    only_matching: true,
  });
  return [focus_text, other_text].filter(Boolean).join('\n\n');
}
