import { PRACTICE_PROBLEM_COUNT } from '../../config/constants.js';
import { use_api_data } from '../../hooks/use_api_data.js';
import { create_practice_set, delete_practice_set, fetch_practice_sets } from '../../services/learning_service.js';
import LearnTopicForm from './LearnTopicForm.jsx';
import SavedActivityList from './SavedActivityList.jsx';

// "1 of 3 solved".
export function describe_practice_progress(practice_set) {
  return `${practice_set.solved_count} of ${practice_set.problem_count} solved`;
}

// The Practice tab: make a worked example and problems on a topic (on_created(practice_set)
// opens them), and the skill's earlier practice (on_open(practice_id) reopens one).
function PracticePanel({ skill, initial_topic_id, on_created, on_open }) {
  const practice_state = use_api_data(() => fetch_practice_sets(skill.id), [skill.id]);

  async function make_practice(practice_details) {
    on_created(await create_practice_set(skill.id, practice_details));
  }

  return (
    <div className="flex flex-col gap-8">
      <LearnTopicForm
        skill={skill}
        form_id="practice"
        heading="Practise a topic"
        initial_topic_id={initial_topic_id}
        count_field="problem_count"
        count_label="Problems"
        count_limits={PRACTICE_PROBLEM_COUNT}
        submit_label="Make practice problems"
        busy_label="Writing problems…"
        on_submit={make_practice}
      />
      <section aria-labelledby="practice-sets-heading" className="flex flex-col gap-3">
        <h2 id="practice-sets-heading" className="text-heading-3 font-semibold text-ink">
          Your practice
        </h2>
        <SavedActivityList
          items_state={practice_state}
          noun="practice"
          empty_text="No practice in this skill yet."
          describe={describe_practice_progress}
          get_open_label={(practice_set) => (practice_set.solved_count === practice_set.problem_count ? 'Review' : 'Continue')}
          on_open={on_open}
          delete_item={delete_practice_set}
        />
      </section>
    </div>
  );
}

export default PracticePanel;
