import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import AiModeNotice from '../../components/AiModeNotice.jsx';
import AlertMessage from '../../components/AlertMessage.jsx';
import { get_button_classes } from '../../components/button_styles.js';
import CreateSkillDialog from '../../components/CreateSkillDialog.jsx';
import NotesPanel from '../../components/NotesPanel.jsx';
import PageTitle from '../../components/PageTitle.jsx';
import QuizzesPanel from '../../components/QuizzesPanel.jsx';
import ResourcesPanel from '../../components/ResourcesPanel.jsx';
import SkillPicker from '../../components/SkillPicker.jsx';
import TopicMapSection from '../../components/topic_map/TopicMapSection.jsx';
import { use_confirm } from '../../context/ConfirmContext.jsx';
import { use_api_data } from '../../hooks/use_api_data.js';
import { use_remembered_skill } from '../../hooks/use_remembered_skill.js';
import { fetch_resources } from '../../services/resource_service.js';
import { delete_skill, fetch_skills } from '../../services/skill_service.js';
import { fetch_topic_map } from '../../services/topic_service.js';
import { find_selected_skill, SELECTED_SKILL_PARAM } from '../../utils/skill_selection.js';

// Adds delta to one skill's resource_count, leaving the others untouched.
export function change_resource_count(skills, skill_id, delta) {
  return skills.map((skill) => (skill.id === skill_id ? { ...skill, resource_count: skill.resource_count + delta } : skill));
}

// Puts an updated resource in place of the old copy in a list.
export function replace_resource(resources, updated_resource) {
  return resources.map((resource) => (resource.id === updated_resource.id ? updated_resource : resource));
}

// Everything shown for the chosen skill. The topic map and the resource list are loaded
// here because both the map's topic popup and the Resources section show and change them.
// on_resource_count_change(+1 or -1) keeps the skill's resource count in step.
function SkillSections({ skill, on_resource_count_change }) {
  const topic_map_state = use_api_data(() => fetch_topic_map(skill.id), [skill.id]);
  const resources_state = use_api_data(() => fetch_resources(skill.id), [skill.id]);
  const topics = topic_map_state.data?.topics ?? [];
  const resources = resources_state.data ?? [];

  function handle_resource_added(resource) {
    resources_state.set_data((current_resources) => [...(current_resources ?? []), resource]);
    on_resource_count_change(1);
  }

  function handle_resource_updated(resource) {
    resources_state.set_data((current_resources) => replace_resource(current_resources ?? [], resource));
  }

  function handle_resource_deleted(resource_id) {
    resources_state.set_data((current_resources) => current_resources.filter((resource) => resource.id !== resource_id));
    on_resource_count_change(-1);
  }

  return (
    <>
      <TopicMapSection
        skill={skill}
        topic_map_state={topic_map_state}
        resources={resources}
        on_resource_added={handle_resource_added}
        on_resource_updated={handle_resource_updated}
        on_resources_moved={resources_state.reload}
      />
      <ResourcesPanel
        skill={skill}
        resources_state={resources_state}
        topics={topics}
        on_resource_added={handle_resource_added}
        on_resource_deleted={handle_resource_deleted}
      />
      <NotesPanel skill={skill} />
      <QuizzesPanel skill={skill} />
    </>
  );
}

// The Skill map page, the home for each skill: choose or add a skill, see its topic map
// (colored by how well each topic is known, with what to study next), add resources, and
// make notes and quizzes. The chosen skill is kept in the address so a refresh or shared
// link keeps it.
function SkillMapPage() {
  const [search_params, set_search_params] = useSearchParams();
  const skills_state = use_api_data(fetch_skills, []);
  const [is_create_open, set_is_create_open] = useState(false);
  const [action_error, set_action_error] = useState('');

  const skills = skills_state.data ?? [];
  const selected_skill = find_selected_skill(skills, search_params.get(SELECTED_SKILL_PARAM));
  use_remembered_skill(selected_skill?.id);

  function select_skill(skill_id) {
    set_search_params({ [SELECTED_SKILL_PARAM]: skill_id }, { replace: true });
  }

  function handle_skill_created(new_skill) {
    skills_state.set_data((current_skills) => [...(current_skills ?? []), new_skill]);
    select_skill(new_skill.id);
    set_is_create_open(false);
  }

  const confirm = use_confirm();

  async function handle_delete_skill() {
    const message = "All of its resources, topics, notes and quizzes are deleted too. This can't be undone.";
    if (!(await confirm({ title: `Delete ${selected_skill.name}?`, message, confirm_label: 'Delete skill' }))) return;
    set_action_error('');
    try {
      await delete_skill(selected_skill.id);
      skills_state.set_data((current_skills) => current_skills.filter((skill) => skill.id !== selected_skill.id));
      set_search_params({}, { replace: true });
    } catch (delete_error) {
      set_action_error(delete_error.message);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageTitle page_name="Skill map" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-heading-1 font-bold text-ink">Skill map</h1>
          <p className="text-body text-ink-muted">Add what you're studying from, then turn it into notes and quizzes.</p>
        </div>
        <SkillPicker
          skills={skills}
          selected_skill_id={selected_skill?.id}
          on_select={select_skill}
          on_add_click={() => set_is_create_open(true)}
        />
      </div>

      <AiModeNotice />
      {skills_state.error && <AlertMessage>{skills_state.error}</AlertMessage>}
      {action_error && <AlertMessage>{action_error}</AlertMessage>}
      {skills_state.is_loading && <p className="text-small text-ink-muted">Loading your skills…</p>}

      {!skills_state.is_loading && skills.length === 0 && !skills_state.error && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border bg-surface p-6">
          <h2 className="text-heading-3 font-semibold text-ink">Start with a skill</h2>
          <p className="text-body text-ink-muted">
            A skill is anything you're learning, like Biology, Spanish or Guitar. Add one to start collecting resources.
          </p>
          <button type="button" onClick={() => set_is_create_open(true)} className={get_button_classes('primary')}>
            Add your first skill
          </button>
        </div>
      )}

      {selected_skill && (
        <div key={selected_skill.id} className="flex flex-col gap-10">
          <SkillSections
            skill={selected_skill}
            on_resource_count_change={(delta) =>
              skills_state.set_data((current_skills) => change_resource_count(current_skills, selected_skill.id, delta))
            }
          />
          <button type="button" onClick={handle_delete_skill} className={get_button_classes('ghost', 'self-start text-danger')}>
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            Delete {selected_skill.name}
          </button>
        </div>
      )}

      <CreateSkillDialog
        is_open={is_create_open}
        on_close={() => set_is_create_open(false)}
        on_created={handle_skill_created}
      />
    </div>
  );
}

export default SkillMapPage;
