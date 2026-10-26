import { HTTP_STATUS, READING_HEADING_MAX_LENGTH, READING_SECTION_CHARACTERS } from '../config/constants.js';
import { create_http_error } from './http_error.js';
import { get_learning_style } from './learning_profile_service.js';
import { get_owned_resource } from './resource_service.js';
import { get_owned_skill } from './skill_service.js';
import { format_topic_path } from './topic_service.js';

// Active reading: a resource is read one section at a time. For each section the AI writes
// a plain-language explanation and something to think about (made once, then kept), and the
// student can ask about any passage. The section the student is up to is saved on the
// resource. Sections are worked out from the text each time, which is stable because a
// resource's text never changes.

const SENTENCE_BREAK = /(?<=[.!?])\s+/;
const SECTION_TITLE_MAX_LENGTH = 60;
const ENDS_LIKE_A_SENTENCE = /[.!?,;:]$/;
const MARKDOWN_HEADING_MARK = /^#{1,6}\s+/;

// True for a short line that reads like a heading ("Chapter 2: Cells", "## Respiration"):
// one line, no sentence ending, with at least one letter.
export function is_heading_line(paragraph) {
  return (
    !paragraph.includes('\n') &&
    paragraph.length <= READING_HEADING_MAX_LENGTH &&
    !ENDS_LIKE_A_SENTENCE.test(paragraph) &&
    /[A-Za-z]/.test(paragraph)
  );
}

// Splits a paragraph longer than max_length between sentences; a single sentence longer
// than that is cut into pieces.
export function split_long_paragraph(paragraph, max_length) {
  if (paragraph.length <= max_length) return [paragraph];
  const pieces = [];
  let current_piece = '';
  for (const sentence of paragraph.split(SENTENCE_BREAK)) {
    for (let start = 0; start < sentence.length; start += max_length) {
      const part = sentence.slice(start, start + max_length);
      if (current_piece && current_piece.length + part.length + 1 > max_length) {
        pieces.push(current_piece);
        current_piece = '';
      }
      current_piece = current_piece ? `${current_piece} ${part}` : part;
    }
  }
  if (current_piece) pieces.push(current_piece);
  return pieces;
}

// A title for a section without a heading: its opening words, cut at a word boundary.
export function make_section_title(section_text) {
  const first_line = section_text.split('\n')[0];
  if (first_line.length <= SECTION_TITLE_MAX_LENGTH) return first_line;
  const cut_text = first_line.slice(0, SECTION_TITLE_MAX_LENGTH);
  return `${cut_text.slice(0, cut_text.lastIndexOf(' ')) || cut_text}…`;
}

// The text as sections of about section_length characters: [{ title, text }]. A heading
// line starts a new section and becomes its title; paragraphs are kept whole where they fit.
export function split_into_reading_sections(text, section_length = READING_SECTION_CHARACTERS) {
  const sections = [];
  let current_section = { title: null, paragraphs: [], length: 0 };
  function finish_section() {
    if (current_section.paragraphs.length > 0) {
      const section_text = current_section.paragraphs.join('\n\n');
      sections.push({ title: current_section.title ?? make_section_title(section_text), text: section_text });
    }
    current_section = { title: null, paragraphs: [], length: 0 };
  }

  for (const paragraph of text.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean)) {
    if (is_heading_line(paragraph)) {
      finish_section();
      current_section.title = paragraph.replace(MARKDOWN_HEADING_MARK, '');
      continue;
    }
    for (const piece of split_long_paragraph(paragraph, section_length)) {
      if (current_section.paragraphs.length > 0 && current_section.length + piece.length > section_length) finish_section();
      current_section.paragraphs.push(piece);
      current_section.length += piece.length;
    }
  }
  finish_section();
  return sections;
}

// The resource with its sections. Other students' resources get a 404.
function load_reading(database, user_id, resource_id) {
  const resource = get_owned_resource(database, user_id, resource_id);
  return { resource, sections: split_into_reading_sections(resource.extracted_text ?? '') };
}

// One section by position, or a 404.
function find_section(sections, section_index) {
  if (!Number.isInteger(section_index) || !sections[section_index]) throw create_http_error(HTTP_STATUS.not_found, 'Section not found');
  return sections[section_index];
}

function find_saved_guide(database, resource_id, section_index) {
  return (
    database
      .prepare('SELECT explanation_markdown, think_about FROM reading_guides WHERE resource_id = ? AND section_index = ?')
      .get(resource_id, section_index) ?? null
  );
}

// A saved position kept inside the sections (0 when there are none).
export function clamp_position(position, section_count) {
  return Math.max(0, Math.min(position, section_count - 1));
}

function read_position(database, resource_id, section_count) {
  const { reading_section } = database.prepare('SELECT reading_section FROM resources WHERE id = ?').get(resource_id);
  return clamp_position(reading_section, section_count);
}

// What the reader needs first: { resource, sections: [{ index, title, character_count,
// has_guide }], position }. The sections' text comes one at a time (get_reading_section).
export function get_reading_overview(database, user_id, resource_id) {
  const { resource, sections } = load_reading(database, user_id, resource_id);
  const guided_indexes = new Set(
    database
      .prepare('SELECT section_index FROM reading_guides WHERE resource_id = ?')
      .all(resource_id)
      .map((guide_row) => guide_row.section_index),
  );
  return {
    resource: {
      id: resource.id,
      skill_id: resource.skill_id,
      topic_id: resource.topic_id,
      title: resource.title,
      resource_type: resource.resource_type,
    },
    sections: sections.map((section, index) => ({
      index,
      title: section.title,
      character_count: section.text.length,
      has_guide: guided_indexes.has(index),
    })),
    position: read_position(database, resource_id, sections.length),
  };
}

// One section: { index, title, text, guide } where guide is { explanation_markdown,
// think_about } or null until it's made.
export function get_reading_section(database, user_id, resource_id, section_index) {
  const { sections } = load_reading(database, user_id, resource_id);
  const section = find_section(sections, section_index);
  return { index: section_index, title: section.title, text: section.text, guide: find_saved_guide(database, resource_id, section_index) };
}

// The section with its guide, asking the AI for the guide the first time.
export async function guide_reading_section({ database, ai_provider, user_id, resource_id, section_index }) {
  const { resource, sections } = load_reading(database, user_id, resource_id);
  const section = find_section(sections, section_index);
  if (!find_saved_guide(database, resource_id, section_index)) {
    const { explanation_markdown, think_about } = await ai_provider.guide_reading_section({
      skill_name: get_owned_skill(database, user_id, resource.skill_id).name,
      topic_path: format_topic_path(database, resource.topic_id),
      resource_title: resource.title,
      section_title: section.title,
      section_text: section.text,
      learning_style: get_learning_style(database, user_id),
    });
    database
      .prepare('INSERT OR IGNORE INTO reading_guides (resource_id, section_index, explanation_markdown, think_about) VALUES (?, ?, ?, ?)')
      .run(resource_id, section_index, explanation_markdown, think_about);
  }
  return get_reading_section(database, user_id, resource_id, section_index);
}

// Saves the section the student is up to. Returns { position }.
export function save_reading_position(database, user_id, resource_id, section_index) {
  const { sections } = load_reading(database, user_id, resource_id);
  find_section(sections, section_index);
  database.prepare('UPDATE resources SET reading_section = ? WHERE id = ?').run(section_index, resource_id);
  return { position: section_index };
}

// Explains a passage the student picked, with its section as the material to build on.
export async function explain_reading_passage({ database, ai_provider, user_id, resource_id, section_index, passage }) {
  const { resource, sections } = load_reading(database, user_id, resource_id);
  const section = find_section(sections, section_index);
  return ai_provider.explain_text({
    skill_name: get_owned_skill(database, user_id, resource.skill_id).name,
    topic_path: format_topic_path(database, resource.topic_id),
    text: passage,
    style: 'plain',
    context_text: section.text,
    learning_style: get_learning_style(database, user_id),
  });
}

// The skill's readable resources with how far through each the student is:
// [{ resource_id, title, resource_type, topic_id, section_count, position }].
export function list_reading_resources(database, user_id, skill_id) {
  return database
    .prepare(
      `SELECT id, title, resource_type, skill_node_id AS topic_id, extracted_text, reading_section FROM resources
       WHERE user_id = ? AND skill_id = ? AND status = 'ready' ORDER BY created_at, rowid`,
    )
    .all(user_id, skill_id)
    .map((resource_row) => {
      const section_count = split_into_reading_sections(resource_row.extracted_text ?? '').length;
      return {
        resource_id: resource_row.id,
        title: resource_row.title,
        resource_type: resource_row.resource_type,
        topic_id: resource_row.topic_id,
        section_count,
        position: clamp_position(resource_row.reading_section, section_count),
      };
    });
}
