import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SPEECH_LANGUAGE } from '../config/constants.js';

// Voice input with the browser's Web Speech API. The browser turns speech into text itself
// (Chrome and Edge use their own online speech services), so there is no API key and
// nothing goes through the StudyApp server. Chrome, Edge and Safari have it; Firefox
// doesn't, so callers hide their microphone button when is_supported is false.

// What to tell the student for the error codes they can do something about.
export const SPEECH_ERROR_MESSAGES = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser settings to speak instead of typing.',
  'service-not-allowed': 'Microphone access is blocked. Allow it in your browser settings to speak instead of typing.',
  'no-speech': "I didn't hear anything. Try again a little closer to the microphone.",
  'audio-capture': 'No microphone was found.',
  network: 'Voice input needs an internet connection in this browser.',
};
export const DEFAULT_SPEECH_ERROR = 'Voice input stopped. Try again, or type instead.';

// The browser's speech recognition class, or null when there isn't one.
export function get_speech_recognition_class(speech_window = window) {
  return speech_window.SpeechRecognition ?? speech_window.webkitSpeechRecognition ?? null;
}

// The message for a speech error code. "aborted" means we stopped it ourselves, so it's ''.
export function describe_speech_error(error_code) {
  if (error_code === 'aborted') return '';
  return SPEECH_ERROR_MESSAGES[error_code] ?? DEFAULT_SPEECH_ERROR;
}

// The words heard, from a recognition "result" event.
export function read_transcript(speech_event) {
  return Array.from(speech_event.results, (speech_result) => speech_result[0].transcript)
    .join(' ')
    .trim();
}

// Listens once (until the student pauses) and passes what was heard to on_transcript(text).
// Returns { is_supported, is_listening, error_message, start, stop }. Leaving the page
// stops listening.
export function use_speech_input(on_transcript, speech_window = window) {
  const RecognitionClass = get_speech_recognition_class(speech_window);
  const recognition_ref = useRef(null);
  const [is_listening, set_is_listening] = useState(false);
  const [error_message, set_error_message] = useState('');

  useEffect(() => () => recognition_ref.current?.abort(), []);

  function start() {
    if (!RecognitionClass || recognition_ref.current) return;
    const recognition = new RecognitionClass();
    recognition.lang = speech_window.navigator?.language || DEFAULT_SPEECH_LANGUAGE;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (speech_event) => {
      const transcript = read_transcript(speech_event);
      if (transcript) on_transcript(transcript);
    };
    recognition.onerror = (speech_event) => set_error_message(describe_speech_error(speech_event.error));
    recognition.onend = () => {
      recognition_ref.current = null;
      set_is_listening(false);
    };
    recognition_ref.current = recognition;
    set_error_message('');
    set_is_listening(true);
    recognition.start();
  }

  function stop() {
    recognition_ref.current?.stop();
  }

  return { is_supported: Boolean(RecognitionClass), is_listening, error_message, start, stop };
}
