import multer from 'multer';
import { HTTP_STATUS, UPLOAD_MAX_BYTES } from '../config/constants.js';
import { create_http_error } from '../services/http_error.js';

const UPLOAD_FIELD_NAME = 'file';
const MEGABYTE = 1024 * 1024;

// Keeps the upload in memory (at most UPLOAD_MAX_BYTES) so its text can be extracted
// before anything is written to disk. defParamCharset keeps non-English file names intact.
const parse_single_file = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
  defParamCharset: 'utf8',
}).single(UPLOAD_FIELD_NAME);

// Turns a multer error into a message the student understands.
export function to_upload_error(multer_error) {
  if (multer_error.code === 'LIMIT_FILE_SIZE') {
    return create_http_error(
      HTTP_STATUS.payload_too_large,
      `That file is larger than ${UPLOAD_MAX_BYTES / MEGABYTE} MB. Try a shorter recording or a smaller file.`,
    );
  }
  return create_http_error(HTTP_STATUS.bad_request, 'The upload could not be read. Please try again.', {}, multer_error);
}

// Middleware for multipart/form-data uploads with one file in the "file" field.
// Afterwards req.file holds { originalname, buffer, size } and req.body any text fields.
export function receive_upload(req, res, next) {
  parse_single_file(req, res, (multer_error) => next(multer_error ? to_upload_error(multer_error) : undefined));
}
