import { Info } from 'lucide-react';
import { use_api_data } from '../hooks/use_api_data.js';
import { fetch_ai_status } from '../services/study_material_service.js';

const MOCK_PROVIDER_NAME = 'mock';

// Explains practice mode when the server runs the free mock AI or mock transcription,
// so nobody mistakes the simple generated notes for real AI output. One line, with the
// details and how to switch real AI on folded away. Shows nothing when real providers are
// on, or if the status can't be loaded.
function AiModeNotice() {
  const { data: ai_status } = use_api_data(fetch_ai_status, [], { live: false });
  if (!ai_status) return null;

  const is_mock_ai = ai_status.ai_provider === MOCK_PROVIDER_NAME;
  const is_mock_transcription = ai_status.transcription_provider === MOCK_PROVIDER_NAME;
  if (!is_mock_ai && !is_mock_transcription) return null;

  return (
    <aside aria-label="Practice mode" className="rounded-xl border border-border bg-surface px-4 py-3 text-small text-ink">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1">
          <Info aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-700" />
          <span>
            <span className="font-semibold">Practice mode:</span>{' '}
            {is_mock_ai ? 'notes, quizzes and the assistant run without a real AI model.' : 'audio and video are not transcribed.'}
          </span>
          <span className="font-semibold text-brand-700">Details</span>
        </summary>
        <div className="mt-2 flex flex-col gap-1 pl-6">
          {is_mock_ai && <p>Notes and quizzes are built from sentences in your resources, without a real AI model.</p>}
          {is_mock_transcription && <p>Audio and video are saved without being transcribed.</p>}
          <p className="text-ink-muted">To switch on real AI, set the AI settings in server/.env.</p>
        </div>
      </details>
    </aside>
  );
}

export default AiModeNotice;
