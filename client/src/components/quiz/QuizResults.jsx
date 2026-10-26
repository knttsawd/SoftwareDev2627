import { CircleCheck, CircleMinus, CircleX } from 'lucide-react';
import { Link } from 'react-router';
import { ROUTE_PATHS } from '../../config/constants.js';
import { describe_mastery, MASTERY_LEVEL_DETAILS } from '../../config/mastery.js';
import { get_choice_letter } from '../../utils/format.js';
import { get_button_classes } from '../button_styles.js';

const OUTCOME_DETAILS = {
  correct: { label: 'Correct', icon: CircleCheck, classes: 'text-success' },
  incorrect: { label: 'Incorrect', icon: CircleX, classes: 'text-danger' },
  skipped: { label: 'Skipped', icon: CircleMinus, classes: 'text-ink-muted' },
};

// "correct", "incorrect" or "skipped" for one graded question.
export function get_question_outcome(question_result) {
  if (question_result.chosen_index === null) return 'skipped';
  return question_result.is_correct ? 'correct' : 'incorrect';
}

// "A. Glucose", or "No answer" for a skipped question.
export function describe_choice(question_result, choice_index) {
  if (choice_index === null) return 'No answer';
  return `${get_choice_letter(choice_index)}. ${question_result.choices[choice_index]}`;
}

// The graded quiz: the score, the topic's new level on the skill map, and a review of each
// question with the student's answer, the right answer and why. on_retake starts a new
// quiz on the same topic.
function QuizResults({ quiz, graded, on_retake }) {
  const { result, question_results, topic } = graded;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-5">
        <h2 className="text-heading-2 font-bold text-ink">You scored {result.score}%</h2>
        <p className="text-body text-ink-muted">
          {result.correct_count} of {result.total_count} correct on {quiz.topic}.
        </p>
        <progress
          value={result.score}
          max={100}
          aria-label={`Score: ${result.score}%`}
          className="h-3 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-brand-600 [&::-webkit-progress-bar]:bg-brand-100 [&::-webkit-progress-value]:bg-brand-600"
        />
        {topic && <TopicUpdate topic={topic} />}
      </div>

      <section aria-labelledby="quiz-review-heading" className="flex flex-col gap-3">
        <h3 id="quiz-review-heading" className="text-heading-3 font-semibold text-ink">
          Review your answers
        </h3>
        <ol className="flex flex-col gap-3">
          {question_results.map((question_result, question_index) => {
            const { label, icon: OutcomeIcon, classes } = OUTCOME_DETAILS[get_question_outcome(question_result)];
            return (
              <li key={question_index} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
                <p className={`flex items-center gap-2 text-small font-semibold ${classes}`}>
                  <OutcomeIcon aria-hidden="true" className="h-4 w-4" />
                  Question {question_index + 1}: {label}
                </p>
                <p className="font-semibold text-ink">{question_result.question}</p>
                <p className="text-small text-ink">
                  Your answer: {describe_choice(question_result, question_result.chosen_index)}
                </p>
                {!question_result.is_correct && (
                  <p className="text-small text-ink">
                    Right answer: {describe_choice(question_result, question_result.correct_index)}
                  </p>
                )}
                {question_result.explanation && <p className="text-small text-ink-muted">{question_result.explanation}</p>}
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={on_retake} className={get_button_classes('primary')}>
          New quiz on this topic
        </button>
        <Link to={`${ROUTE_PATHS.dashboard}/skill-map?skill=${quiz.skill_id}`} className={get_button_classes('secondary')}>
          Back to the skill map
        </Link>
      </div>
    </div>
  );
}

// "Photosynthesis on your skill map: Developing · 67%"
function TopicUpdate({ topic }) {
  const { icon: LevelIcon } = MASTERY_LEVEL_DETAILS[topic.mastery_level];
  return (
    <p className="flex items-center gap-2 text-small text-ink">
      <LevelIcon aria-hidden="true" className="h-4 w-4" />
      <span>
        <span className="font-semibold">{topic.topic}</span> on your skill map is now {describe_mastery(topic)}.
      </span>
    </p>
  );
}

export default QuizResults;
