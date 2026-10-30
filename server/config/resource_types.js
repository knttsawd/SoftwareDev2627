// Which uploaded files StudyApp accepts, and what kind of resource each becomes.
// Audio and video formats are the ones the Whisper API can transcribe.
export const RESOURCE_TYPE_BY_EXTENSION = {
  '.pdf': 'pdf',
  '.txt': 'note',
  '.md': 'note',
  '.mp3': 'audio',
  '.mpga': 'audio',
  '.m4a': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.oga': 'audio',
  '.flac': 'audio',
  '.mp4': 'video',
  '.mpeg': 'video',
  '.webm': 'video',
};

export const SUPPORTED_EXTENSIONS = Object.keys(RESOURCE_TYPE_BY_EXTENSION);

// Shown when a file was read but held (almost) no text.
export const NO_TEXT_MESSAGES = {
  pdf: 'That PDF has no text we can read. It may be a scan or photos of pages.',
  note: 'That file is empty.',
  audio: 'We could not hear any speech in that recording.',
  video: 'We could not hear any speech in that video.',
  article: 'We could not find any article text on that page.',
  youtube: 'That video has no captions to read.',
};
