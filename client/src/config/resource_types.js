import { AudioLines, FileText, MonitorPlay, Newspaper, NotebookPen, Video } from 'lucide-react';

// How each kind of resource is shown. Every type has an icon and a text label, so the
// type never depends on the icon alone.
export const RESOURCE_TYPE_DETAILS = {
  pdf: { label: 'PDF', icon: FileText },
  note: { label: 'Notes', icon: NotebookPen },
  audio: { label: 'Audio', icon: AudioLines },
  video: { label: 'Video', icon: Video },
  article: { label: 'Article', icon: Newspaper },
  youtube: { label: 'YouTube', icon: MonitorPlay },
};

// File types the server accepts (server/config/resource_types.js); keep the two in sync.
export const ACCEPTED_FILE_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.md',
  '.mp3',
  '.mpga',
  '.m4a',
  '.wav',
  '.ogg',
  '.oga',
  '.flac',
  '.mp4',
  '.mpeg',
  '.webm',
];

// Same limit as the server (the Whisper API's), checked first so large files fail fast.
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const UPLOAD_MAX_LABEL = '25 MB';

export const DEFAULT_SKILL_COLOR = '#4F46E5';
export const QUIZ_QUESTION_COUNT = { min: 3, max: 15, default: 5 };
