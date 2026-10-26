import { Award, Bot, CircleCheck, CircleHelp, CircleX, Quote, User } from 'lucide-react';
import { Link } from 'react-router';
import { AI_STUDENT_NAME, ROUTE_PATHS } from '../../config/constants.js';
import { describe_mastery } from '../../config/mastery.js';
import { describe_choice } from '../quiz/QuizResults.jsx';
import { get_button_classes } from '../button_styles.js';
import ScoreCard from './ScoreCard.jsx';

// How one taker did on one question, as an icon, a word and their answer:
// "Correct", "Incorrect", or (for the AI student) "Didn't know".
export function describe_answer_outcome(choice_index, is_correct) {
  if (choice_index === null) return { label: "Didn't know", icon: CircleHelp, classes: 'text-ink-muted' };
  return is_correct
    ? { label: 'Correct', icon: CircleCheck, classes: 'text-success' }
    : { label: 'Incorrect', icon: CircleX, classes: 'text-danger' };
}

// One taker's answer line in the review.
function AnswerLine({ taker_label, review_item, choice_index, is_correct }) {
  const { label, icon: OutcomeIcon, classes } = describe_answer_outcome(choice_index, is_correct);
  return (
    <p className="flex flex-wrap items-center gap-2 text-small text-ink">
      <span className={`flex items-center gap-1 font-semibold ${classes}`}>
        <OutcomeIcon aria-hidden="true" className="h-4 w-4" />
        {taker_label}: {label}
      </span>
      {choice_index !== null && <span>({describe_choice(review_item, choice_index)})</span>}
    </p>
  );
}

// The graded lesson: the teaching grade with both scores, the AI student's note on the
// lesson, and every question with both answers, the AI student's reasoning, and the right
// answer. topic is the map topic with its new level, if the lesson was on one.
function TeachResults({ teach_session, topic, on_teach_again, on_back }) {
  const { results } = teach_session;
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-heading-2 font-bold text-ink">How the lesson on {teach_session.topic} went</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <ScoreCard
          label="Teaching grade"
          score={results.combined_score}
          detail={`Half your score, half ${AI_STUDENT_NAME}'s.`}
          icon={Award}
          is_highlighted
        />
        <ScoreCard
          label="Your score"
          score={results.student.score}
          detail={`${results.student.correct_count} of ${results.student.total_count} correct.`}
          icon={User}
        />
        <ScoreCard
          label={`${AI_STUDENT_NAME}'s score`}
          score={results.ai_student.score}
          detail={`${results.ai_student.correct_count} of ${results.ai_student.total_count} correct, from your lesson alone.`}
          icon={Bot}
        />
      </div>
      {topic && (
        <p className="text-small text-ink">
          <span className="font-semibold">{topic.topic}</span> on your skill map is now {describe_mastery(topic)}.
        </p>
      )}
      {results.teaching_feedback && (
        <figure className="flex gap-3 rounded-xl border border-border bg-surface p-4">
          <Quote aria-hidden="true" className="h-5 w-5 shrink-0 text-accent-700" />
          <div className="flex flex-col gap-1">
            <blockquote className="text-body text-ink">{results.teaching_feedback}</blockquote>
            <figcaption className="text-caption text-ink-muted">{AI_STUDENT_NAME}, on your lesson</figcaption>
          </div>
        </figure>
      )}

      <section aria-labelledby="teach-review-heading" className="flex flex-col gap-3">
        <h3 id="teach-review-heading" className="text-heading-3 font-semibold text-ink">
          Question by question
        </h3>
        <ol className="flex flex-col gap-3">
          {results.review.map((review_item, question_index) => (
            <li key={question_index} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <p className="font-semibold text-ink">
                {question_index + 1}. {review_item.question}
              </p>
              <AnswerLine
                taker_label="You"
                review_item={review_item}
                choice_index={review_item.student_choice}
                is_correct={review_item.student_is_correct}
              />
              <AnswerLine
                taker_label={AI_STUDENT_NAME}
                review_item={review_item}
                choice_index={review_item.ai_student_choice}
                is_correct={review_item.ai_student_is_correct}
              />
              {review_item.ai_student_reason && (
                <p className="text-small text-ink-muted">
                  {AI_STUDENT_NAME}: "{review_item.ai_student_reason}"
                </p>
              )}
              <p className="text-small text-ink">Right answer: {describe_choice(review_item, review_item.correct_index)}</p>
              {review_item.explanation && <p className="text-small text-ink-muted">{review_item.explanation}</p>}
            </li>
          ))}
        </ol>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={on_teach_again} className={get_button_classes('primary')}>
          Teach this topic again
        </button>
        <button type="button" onClick={on_back} className={get_button_classes('secondary')}>
          All lessons
        </button>
        <Link to={`${ROUTE_PATHS.dashboard}/skill-map?skill=${teach_session.skill_id}`} className={get_button_classes('ghost')}>
          Back to the skill map
        </Link>
      </div>
    </div>
  );
}

export default TeachResults;
