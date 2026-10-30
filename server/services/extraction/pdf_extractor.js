import { PDFParse } from 'pdf-parse';
import { HTTP_STATUS } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';

// pdf-parse marks each page break with a line like "-- 2 of 10 --".
const PAGE_MARKER_PATTERN = /^-- \d+ of \d+ --$/gm;

export function remove_page_markers(pdf_text) {
  return pdf_text.replace(PAGE_MARKER_PATTERN, '');
}

// Returns all the text in a PDF. pdf-parse wants a plain Uint8Array, not a Node Buffer.
// A damaged or password-protected PDF becomes a 422 the student can understand.
export async function extract_pdf_text(pdf_buffer) {
  const pdf_parser = new PDFParse({ data: new Uint8Array(pdf_buffer) });
  try {
    const { text } = await pdf_parser.getText();
    return remove_page_markers(text);
  } catch (parse_error) {
    throw create_http_error(
      HTTP_STATUS.unprocessable,
      'We could not read that PDF. It may be damaged or password-protected.',
      {},
      parse_error,
    );
  } finally {
    await pdf_parser.destroy();
  }
}
