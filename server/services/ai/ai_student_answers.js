import { AI_STUDENT_REASON_MAX_LENGTH } from '../../config/constants.js';

export const DEFAULT_AI_STUDENT_REASON = "I wasn't sure, so I didn't answer.";
export const DEFAULT_TEACHING_FEEDBACK = 'Thanks for the lesson!';

// Turns the AI's choice_number (1 to the number of choices, or 0 for "don't know") into a
// choice index, or null for "don't know" and anything out of range.
export function to_choice_index(choice_number, choice_count) {
  return Number.isInteger(choice_number) && choice_number >= 1 && choice_number <= choice_count ? choice_number - 1 : null;
}

// Cleans up the AI student's quiz answers so there is exactly one per question:
// { answers: [choice index or null], reasons: [text], feedback }. Missing answers count as
// "don't know", so a short or broken reply can never break grading.
export function normalize_ai_student_answers(raw_output, questions) {
  const raw_answers = Array.isArray(raw_output?.answers) ? raw_output.answers : [];
  const answers = questions.map((quiz_question, question_index) =>
    to_choice_index(raw_answers[question_index]?.choice_number, quiz_question.choices.length),
  );
  const reasons = questions.map((quiz_question, question_index) => {
    const reason = raw_answers[question_index]?.reason;
    return typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, AI_STUDENT_REASON_MAX_LENGTH) : DEFAULT_AI_STUDENT_REASON;
  });
  const feedback = typeof raw_output?.feedback === 'string' && raw_output.feedback.trim() ? raw_output.feedback.trim() : DEFAULT_TEACHING_FEEDBACK;
  return { answers, reasons, feedback };
}
