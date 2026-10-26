import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import AlertMessage from '../../components/AlertMessage.jsx';
import { get_button_classes } from '../../components/button_styles.js';
import GlossaryPanel from '../../components/learn/GlossaryPanel.jsx';
import GuidedLessonView from '../../components/learn/GuidedLessonView.jsx';
import LearningPathPanel from '../../components/learn/LearningPathPanel.jsx';
import LearnTabs, { find_learn_tab, LEARN_TABS } from '../../components/learn/LearnTabs.jsx';
import LessonsPanel from '../../components/learn/LessonsPanel.jsx';
import PracticePanel from '../../components/learn/PracticePanel.jsx';
import PracticeView from '../../components/learn/PracticeView.jsx';
import ReadingList from '../../components/learn/ReadingList.jsx';
import ReadingView from '../../components/learn/ReadingView.jsx';
import PageTitle from '../../components/PageTitle.jsx';
import SkillPicker from '../../components/SkillPicker.jsx';
import { ROUTE_PATHS } from '../../config/constants.js';
import { use_api_data } from '../../hooks/use_api_data.js';
import { use_remembered_skill } from '../../hooks/use_remembered_skill.js';
import { fetch_guided_lesson, fetch_practice_set } from '../../services/learning_service.js';
import { fetch_skills } from '../../services/skill_service.js';
import { find_selected_skill } from '../../utils/skill_selection.js';
import { build_learn_path, LEARN_PARAMS } from '../../utils/study_paths.js';

// Loads one saved lesson or practice set by id, unless the page already has it (just
// started), and shows it with render_item(item, set_item).
function SavedActivity({ item_id, known_item, load_item, loading_text, render_item }) {
  const item_state = use_api_data(() => (known_item?.id === item_id ? Promise.resolve(known_item) : load_item(item_id)), [item_id], {
    live: false,
  });
  if (item_state.error) return <AlertMessage>{item_state.error}</AlertMessage>;
  if (!item_state.data) return <p className="text-small text-ink-muted">{loading_text}</p>;
  return render_item(item_state.data, item_state.set_data);
}

// The Learn page: learning new things rather than reviewing them. The address chooses
// what to show:
//   ?skill=<id>&tab=<tab>         one of LEARN_TABS for the skill (?topic=<id> picks a
//                                 topic for a lesson or practice)
//   ?lesson=<id>                  a guided lesson
//   ?practice=<id>                a practice set
//   ?read=<resource id>           a resource, read a section at a time
// Opening one keeps ?skill and ?tab, so "Back" returns to the same tab.
function LearnPage() {
  const navigate = useNavigate();
  const [search_params] = useSearchParams();
  const skills_state = use_api_data(fetch_skills, []);
  const [known_item, set_known_item] = useState(null);

  const skills = skills_state.data ?? [];
  const selected_skill = find_selected_skill(skills, search_params.get(LEARN_PARAMS.skill));
  use_remembered_skill(selected_skill?.id);
  const tab = find_learn_tab(search_params.get(LEARN_PARAMS.tab));
  const lesson_id = search_params.get(LEARN_PARAMS.lesson);
  const practice_id = search_params.get(LEARN_PARAMS.practice);
  const resource_id = search_params.get(LEARN_PARAMS.read);
  const is_in_activity = Boolean(lesson_id || practice_id || resource_id);
  const tab_label = LEARN_TABS.find((learn_tab) => learn_tab.id === tab).label;

  // Opens a lesson, practice set or resource ({ lesson_id } and so on). item is the lesson
  // or practice set when the page already has it, so it isn't loaded again.
  function open_activity(activity_ids, item = null) {
    set_known_item(item);
    navigate(build_learn_path({ skill_id: selected_skill?.id, tab, ...activity_ids }));
  }

  function select_skill(skill_id) {
    navigate(build_learn_path({ skill_id, tab }), { replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageTitle page_name="Learn" />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-heading-1 font-bold text-ink">Learn</h1>
          <p className="max-w-prose text-body text-ink-muted">
            Learn something new, step by step: follow your learning path, take guided lessons, practise with hints, read
            your resources with a guide, and build up your key terms.
          </p>
        </div>
        {!is_in_activity && <SkillPicker skills={skills} selected_skill_id={selected_skill?.id} on_select={select_skill} />}
      </div>

      {skills_state.error && <AlertMessage>{skills_state.error}</AlertMessage>}
      {skills_state.is_loading && <p className="text-small text-ink-muted">Loading your skills…</p>}
      {!skills_state.is_loading && skills.length === 0 && !skills_state.error && (
        <p className="text-body text-ink">
          Add a skill on the{' '}
          <Link to={`${ROUTE_PATHS.dashboard}/skill-map`} className="font-semibold text-brand-700 underline">
            skill map
          </Link>{' '}
          to start learning it.
        </p>
      )}

      {is_in_activity && (
        <>
          <Link to={build_learn_path({ skill_id: selected_skill?.id, tab })} className={get_button_classes('ghost', 'self-start px-2')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to {tab_label.toLowerCase()}
          </Link>
          {lesson_id && (
            <SavedActivity
              item_id={lesson_id}
              known_item={known_item}
              load_item={fetch_guided_lesson}
              loading_text="Loading your lesson…"
              render_item={(lesson, set_lesson) => <GuidedLessonView lesson={lesson} on_lesson_changed={set_lesson} />}
            />
          )}
          {practice_id && (
            <SavedActivity
              item_id={practice_id}
              known_item={known_item}
              load_item={fetch_practice_set}
              loading_text="Loading your practice…"
              render_item={(practice_set, set_practice_set) => <PracticeView practice_set={practice_set} on_changed={set_practice_set} />}
            />
          )}
          {resource_id && <ReadingView resource_id={resource_id} />}
        </>
      )}

      {!is_in_activity && selected_skill && (
        <>
          <LearnTabs skill_id={selected_skill.id} current_tab={tab} />
          <div key={`${selected_skill.id}-${tab}`}>
            {tab === 'path' && (
              <LearningPathPanel
                skill={selected_skill}
                on_lesson_started={(lesson) => open_activity({ lesson_id: lesson.id }, lesson)}
                on_open_lesson={(opened_id) => open_activity({ lesson_id: opened_id })}
              />
            )}
            {tab === 'lessons' && (
              <LessonsPanel
                skill={selected_skill}
                initial_topic_id={search_params.get(LEARN_PARAMS.topic)}
                on_started={(lesson) => open_activity({ lesson_id: lesson.id }, lesson)}
                on_open={(opened_id) => open_activity({ lesson_id: opened_id })}
              />
            )}
            {tab === 'practice' && (
              <PracticePanel
                skill={selected_skill}
                initial_topic_id={search_params.get(LEARN_PARAMS.topic)}
                on_created={(practice_set) => open_activity({ practice_id: practice_set.id }, practice_set)}
                on_open={(opened_id) => open_activity({ practice_id: opened_id })}
              />
            )}
            {tab === 'reading' && <ReadingList skill={selected_skill} on_open={(opened_id) => open_activity({ resource_id: opened_id })} />}
            {tab === 'terms' && <GlossaryPanel skill={selected_skill} />}
          </div>
        </>
      )}
    </div>
  );
}

export default LearnPage;
