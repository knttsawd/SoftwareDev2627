// A short two-note chime made with the Web Audio API, so the timer needs no sound file.
const CHIME_NOTES_HZ = [660, 880];
const NOTE_SECONDS = 0.25;
const CHIME_VOLUME = 0.2;

// Plays the chime. Browsers may block sound until the page has been clicked, and some
// have no Web Audio at all; the chime is a nice extra, so either case is silently skipped.
export function play_chime(create_audio_context = () => new window.AudioContext()) {
  try {
    const audio_context = create_audio_context();
    CHIME_NOTES_HZ.forEach((frequency_hz, note_index) => {
      const oscillator = audio_context.createOscillator();
      const gain = audio_context.createGain();
      const note_start = audio_context.currentTime + note_index * NOTE_SECONDS;
      oscillator.frequency.value = frequency_hz;
      gain.gain.setValueAtTime(CHIME_VOLUME, note_start);
      gain.gain.exponentialRampToValueAtTime(0.001, note_start + NOTE_SECONDS);
      oscillator.connect(gain).connect(audio_context.destination);
      oscillator.start(note_start);
      oscillator.stop(note_start + NOTE_SECONDS);
    });
  } catch {
    // No sound available; the on-screen and screen reader messages still show the change.
  }
}
