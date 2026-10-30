// Shared sample data for client tests.

export const SAMPLE_QUESTIONS = [
  {
    id: 'learning_style',
    type: 'single',
    prompt: 'How do you learn best?',
    options: [
      { value: 'visual', label: 'Seeing it' },
      { value: 'auditory', label: 'Hearing it' },
    ],
  },
  {
    id: 'study_times',
    type: 'multiple',
    prompt: 'When do you prefer to study?',
    min_choices: 1,
    max_choices: 2,
    options: [
      { value: 'morning', label: 'Morning' },
      { value: 'evening', label: 'Evening' },
    ],
  },
  {
    id: 'goal_details',
    type: 'text',
    prompt: 'Anything specific you want to achieve?',
    placeholder: 'e.g. Pass biology',
    required: false,
    max_length: 300,
  },
];

// A student who has finished both sign-up steps.
export const TEST_ACCOUNT = {
  id: 'user-1',
  email: 'sam@example.com',
  username: 'study_sam',
  first_name: 'Sam',
  last_name: 'Lee',
  learning_profile: { learning_style: 'visual', study_times: ['morning'], goal_details: '' },
  work_minutes: 25,
  break_minutes: 5,
};

// A student who created an account but skipped the learning style quiz.
export const NEW_ACCOUNT = { ...TEST_ACCOUNT, learning_profile: {} };
