// How the student's learning style (from the learning style quiz) shapes AI output.
// Keys match the learning_style options in config/learning_quiz.js.

// Added to the end of study notes, by every provider.
export const STUDY_TIPS = {
  visual: 'Turn these notes into a mind map: put the topic in the middle and draw a branch for each key point.',
  auditory: 'Read these notes out loud, then explain each key point to someone else without looking.',
  reading_writing:
    'Rewrite each key point in your own words, then cover the notes and write down everything you remember.',
  hands_on: 'Make a practice problem or real-life example for each key point, then try to solve or explain it.',
};

export const DEFAULT_STUDY_TIP = 'Cover these notes and try to recall each key point, then check what you missed.';

// Sent to real AI models so the notes themselves suit the student.
export const NOTE_STYLE_INSTRUCTIONS = {
  visual: 'The student learns best visually: use tables where they help, and describe simple diagrams they could sketch.',
  auditory: 'The student learns best by listening: write in a clear, conversational way that reads well out loud.',
  reading_writing: 'The student learns best by reading and writing: use clear headings, definitions and summaries.',
  hands_on: 'The student learns best by doing: include worked examples and short practice tasks.',
};

export function get_study_tip(learning_style) {
  return STUDY_TIPS[learning_style] ?? DEFAULT_STUDY_TIP;
}

export function get_note_style_instruction(learning_style) {
  return NOTE_STYLE_INSTRUCTIONS[learning_style] ?? '';
}
