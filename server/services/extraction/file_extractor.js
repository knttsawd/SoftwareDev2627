import path from 'node:path';
import { RESOURCE_TYPE_BY_EXTENSION } from '../../config/resource_types.js';
import { extract_pdf_text } from './pdf_extractor.js';

// "Lecture 3.MP3" -> ".mp3"
export function get_file_extension(file_name) {
  return path.extname(file_name).toLowerCase();
}

// The resource type for an uploaded file name, or null when the type isn't supported.
export function get_file_resource_type(file_name) {
  return RESOURCE_TYPE_BY_EXTENSION[get_file_extension(file_name)] ?? null;
}

// Pulls the text out of an uploaded file: PDFs are parsed, text and Markdown files are read
// as UTF-8, and audio or video is sent to transcribe(file_buffer, file_name).
export async function extract_file_text({ resource_type, file_buffer, file_name, transcribe }) {
  if (resource_type === 'pdf') return extract_pdf_text(file_buffer);
  if (resource_type === 'note') return file_buffer.toString('utf8');
  return transcribe(file_buffer, file_name);
}
