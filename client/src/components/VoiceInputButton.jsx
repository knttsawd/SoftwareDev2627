import { Mic, Square } from 'lucide-react';
import { use_speech_input } from '../hooks/use_speech_input.js';
import { get_button_classes } from './button_styles.js';

// A microphone button that types what the student says. on_transcript(text) receives the
// words once they stop talking. Shows nothing in browsers without speech recognition, so
// typing always works. speech_window is injectable for tests.
function VoiceInputButton({ on_transcript, idle_label = 'Speak instead of typing', speech_window }) {
  const { is_supported, is_listening, error_message, start, stop } = use_speech_input(on_transcript, speech_window);
  if (!is_supported) return null;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={is_listening ? stop : start}
        className={get_button_classes(is_listening ? 'primary' : 'secondary', 'px-3')}
      >
        {is_listening ? <Square aria-hidden="true" className="h-4 w-4" /> : <Mic aria-hidden="true" className="h-4 w-4" />}
        {is_listening ? 'Stop listening' : idle_label}
      </button>
      <p role="status" className={`text-caption ${error_message ? 'font-semibold text-danger' : 'text-ink-muted'}`}>
        {is_listening ? 'Listening…' : error_message}
      </p>
    </div>
  );
}

export default VoiceInputButton;
