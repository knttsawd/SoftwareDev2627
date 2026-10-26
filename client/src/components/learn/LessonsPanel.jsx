import { LESSON_STEP_COUNT } from '../../config/constants.js';
import { use_api_data } from '../../hooks/use_api_data.js';
import { delete_guided_lesson, fetch_guided_lessons, start_guided_lesson } from '../../services/learning_service.js';
import LearnTopicForm from './LearnTopicForm.jsx';
import SavedActivityList from './SavedActivityList.jsx';

// "Step 2 of 4" for a lesson in progress, "Finished" for a complete one.
export function describe_lesson_progress(lesson) {
  return lesson.is_complete ? 'Finished' : `Step ${lesson.current_step + 1} of ${lesson.step_count}`;
}

// The Guided lessons tab: start a lesson on a topic (on_started(lesson) opens it), and the
// skill's past lessons (on_open(lesson_id) reopens one).
function LessonsPanel({ skill, initial_topic_id, on_started, on_open }) {
  const lessons_state = use_api_data(() => fetch_guided_lessons(skill.id), [skill.id]);

  async function start_lesson(lesson_details) {
    on_started(await start_guided_lesson(skill.id, lesson_details));
  }

  return (
    <div className="flex flex-col gap-8">
      <LearnTopicForm
        skill={skill}
        form_id="lesson"
        heading="Start a guided lesson"
        initial_topic_id={initial_topic_id}
        count_field="step_count"
        count_label="Steps"
        count_limits={LESSON_STEP_COUNT}
        submit_label="Start the lesson"
        busy_label="Writing your lesson (this can take 20 seconds)…"
        on_submit={start_lesson}
      />
      <section aria-labelledby="guided-lessons-heading" className="flex flex-col gap-3">
        <h2 id="guided-lessons-heading" className="text-heading-3 font-semibold text-ink">
          Your lessons
        </h2>
        <SavedActivityList
          items_state={lessons_state}
          noun="lesson"
          empty_text="No guided lessons in this skill yet."
          describe={describe_lesson_progress}
          get_open_label={(lesson) => (lesson.is_complete ? 'Review' : 'Continue')}
          on_open={on_open}
          delete_item={delete_guided_lesson}
        />
      </section>
    </div>
  );
}

export default LessonsPanel;
