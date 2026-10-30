// The learning style and goals quiz, asked at sign-up and retakeable in Settings.
// This is the only copy: the client fetches it from GET /api/learning-quiz and the server
// validates answers against it, so editing a question here updates both.
//
// Question types:
//   single   one option value (radio buttons)
//   multiple an array of option values (checkboxes), between min_choices and max_choices
//   text     free text up to max_length characters; optional when required is false
//
// session_length options also carry work_minutes and break_minutes, which set the
// student's work block timer when the quiz is saved.

export const LEARNING_QUIZ_QUESTIONS = [
  {
    id: 'learning_style',
    type: 'single',
    prompt: 'How do you learn best?',
    options: [
      { value: 'visual', label: 'Seeing it: diagrams, charts and videos' },
      { value: 'auditory', label: 'Hearing it: lectures, podcasts and talking it through' },
      { value: 'reading_writing', label: 'Reading and writing: notes, articles and summaries' },
      { value: 'hands_on', label: 'Doing it: practice problems and real examples' },
    ],
  },
  {
    id: 'main_goal',
    type: 'single',
    prompt: 'What is your main goal right now?',
    options: [
      { value: 'pass_exam', label: 'Pass an upcoming test or exam' },
      { value: 'understand_deeply', label: 'Really understand a subject' },
      { value: 'new_skill', label: 'Learn a new skill for myself' },
      { value: 'career', label: 'Build skills for a job or career' },
    ],
  },
  {
    id: 'goal_details',
    type: 'text',
    prompt: 'Anything specific you want to achieve? (optional)',
    placeholder: 'e.g. Get a B or higher in my biology final on June 12',
    required: false,
    max_length: 300,
  },
  {
    id: 'weekly_hours',
    type: 'single',
    prompt: 'How many hours a week can you usually study?',
    options: [
      { value: 'under_2', label: 'Less than 2 hours' },
      { value: '2_to_5', label: '2 to 5 hours' },
      { value: '5_to_10', label: '5 to 10 hours' },
      { value: 'over_10', label: 'More than 10 hours' },
    ],
  },
  {
    id: 'study_times',
    type: 'multiple',
    prompt: 'When do you prefer to study? Pick all that apply.',
    min_choices: 1,
    max_choices: 4,
    options: [
      { value: 'morning', label: 'Morning' },
      { value: 'afternoon', label: 'Afternoon' },
      { value: 'evening', label: 'Evening' },
      { value: 'late_night', label: 'Late night' },
    ],
  },
  {
    id: 'session_length',
    type: 'single',
    prompt: 'How long can you focus before you need a break?',
    options: [
      { value: 'short', label: 'About 25 minutes', work_minutes: 25, break_minutes: 5 },
      { value: 'medium', label: 'About 40 minutes', work_minutes: 40, break_minutes: 8 },
      { value: 'long', label: 'About an hour', work_minutes: 55, break_minutes: 10 },
    ],
  },
  {
    id: 'strengths',
    type: 'multiple',
    prompt: 'What are you already good at? Pick up to 3.',
    min_choices: 1,
    max_choices: 3,
    options: [
      { value: 'memorizing', label: 'Memorizing facts' },
      { value: 'concepts', label: 'Understanding big ideas' },
      { value: 'problem_solving', label: 'Solving problems' },
      { value: 'explaining', label: 'Explaining things to others' },
      { value: 'focus', label: 'Staying focused' },
      { value: 'planning', label: 'Planning my time' },
    ],
  },
  {
    id: 'weaknesses',
    type: 'multiple',
    prompt: 'What would you like to get better at? Pick up to 3.',
    min_choices: 1,
    max_choices: 3,
    options: [
      { value: 'memorizing', label: 'Memorizing facts' },
      { value: 'concepts', label: 'Understanding big ideas' },
      { value: 'problem_solving', label: 'Solving problems' },
      { value: 'explaining', label: 'Explaining things to others' },
      { value: 'focus', label: 'Staying focused' },
      { value: 'planning', label: 'Planning my time' },
    ],
  },
  {
    id: 'feedback_timing',
    type: 'single',
    prompt: 'When you take a quiz, when do you want to see the answers?',
    options: [
      { value: 'after_each', label: 'Right after each question' },
      { value: 'at_end', label: 'All together at the end' },
    ],
  },
];
