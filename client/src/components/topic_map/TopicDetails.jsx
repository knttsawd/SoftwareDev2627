import { BookOpenCheck, ChevronRight, ClipboardCheck, Crosshair, Dumbbell, GraduationCap, Sparkles } from 'lucide-react';
import { Link } from 'react-router';
import { AI_STUDENT_NAME } from '../../config/constants.js';
import { use_assistant } from '../../context/AssistantContext.jsx';
import { describe_mastery, MASTERY_LEVEL_DETAILS, MASTERY_LEVEL_ORDER } from '../../config/mastery.js';
import { build_learn_path, build_quiz_path, build_teach_path } from '../../utils/study_paths.js';
import { count_branch_levels, list_child_topics, list_topic_path } from '../../utils/topic_tree.js';
import { get_button_classes } from '../button_styles.js';
import ExplainAnotherWay from '../learn/ExplainAnotherWay.jsx';
import TopicKeyTerms from '../learn/TopicKeyTerms.jsx';
import TopicEditor from './TopicEditor.jsx';
import TopicResources from './TopicResources.jsx';
import TopicSubtopics from './TopicSubtopics.jsx';

// "2 strong, 1 needs work" for the topics under one topic, or '' with none.
export function describe_branch_levels(counts) {
  return MASTERY_LEVEL_ORDER.filter((level) => counts[level] > 0)
    .map((level) => `${counts[level]} ${MASTERY_LEVEL_DETAILS[level].label.toLowerCase()}`)
    .join(', ');
}

// Where the topic sits, like a folder path: the skill, then each broader topic (choose one
// to open it), then this topic.
function TopicPath({ skill_name, path_topics, on_select_topic }) {
  return (
    <nav aria-label="Topic path">
      <ol className="flex flex-wrap items-center gap-1 text-small text-ink-muted">
        <li>{skill_name}</li>
        {path_topics.map((path_topic, path_index) => {
          const is_current = path_index === path_topics.length - 1;
          return (
            <li key={path_topic.id} className="flex items-center gap-1">
              <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
              {is_current ? (
                <span aria-current="location" className="font-semibold text-ink">
                  {path_topic.topic}
                </span>
              ) : (
                <button type="button" onClick={() => on_select_topic(path_topic.id)} className="font-semibold text-brand-700 underline">
                  {path_topic.topic}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// Everything about one topic: where it sits, how well it's known (and the topics under
// it), ways to learn and study it, its subtopics, key terms and resources, and editing.
// section_heading is the heading element its sections use ('h3' in the popup, 'h4' in the
// side panel), so headings stay in order wherever it's shown. on_focus_map(topic_id), when
// given, offers to centre the map on this topic (only useful beside a visible map).
function TopicDetails({
  skill,
  topic,
  topics,
  resources,
  section_heading = 'h3',
  on_select_topic,
  on_resource_added,
  on_resource_updated,
  on_topics_changed,
  on_topic_map_changed,
  on_topic_deleted,
  on_focus_map,
}) {
  const assistant = use_assistant();
  const { icon: LevelIcon } = MASTERY_LEVEL_DETAILS[topic.mastery_level];
  const branch_summary = describe_branch_levels(count_branch_levels(topics, topic.id));

  return (
    <div className="flex flex-col gap-5">
      <TopicPath skill_name={skill.name} path_topics={list_topic_path(topics, topic.id)} on_select_topic={on_select_topic} />
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-small font-semibold text-ink">
          <LevelIcon aria-hidden="true" className="h-4 w-4" />
          {describe_mastery(topic)}
        </p>
        {topic.summary && <p className="text-body text-ink-muted">{topic.summary}</p>}
        {branch_summary && <p className="text-small text-ink-muted">Under this topic: {branch_summary}.</p>}
      </div>
      {topic.summary && <ExplainAnotherWay skill_id={skill.id} text={`${topic.topic}: ${topic.summary}`} topic_id={topic.id} />}

      <div className="flex flex-wrap gap-2">
        <Link to={build_learn_path({ skill_id: skill.id, tab: 'lessons', topic_id: topic.id })} className={get_button_classes('primary')}>
          <BookOpenCheck aria-hidden="true" className="h-4 w-4" />
          Learn it step by step
        </Link>
        <Link to={build_learn_path({ skill_id: skill.id, tab: 'practice', topic_id: topic.id })} className={get_button_classes('secondary')}>
          <Dumbbell aria-hidden="true" className="h-4 w-4" />
          Practise it
        </Link>
        <Link to={build_quiz_path({ skill_id: skill.id, topic_id: topic.id })} className={get_button_classes('secondary')}>
          <ClipboardCheck aria-hidden="true" className="h-4 w-4" />
          Quiz me on this topic
        </Link>
        <Link to={build_teach_path({ skill_id: skill.id, topic_id: topic.id })} className={get_button_classes('secondary')}>
          <GraduationCap aria-hidden="true" className="h-4 w-4" />
          Teach it to {AI_STUDENT_NAME}
        </Link>
        {assistant && (
          <button
            type="button"
            onClick={() => assistant.open_assistant(`Help me understand ${topic.topic} in ${skill.name}.`)}
            className={get_button_classes('secondary')}
          >
            <Sparkles aria-hidden="true" className="h-4 w-4" />
            Ask the assistant
          </button>
        )}
        {on_focus_map && list_child_topics(topics, topic.id).length > 0 && (
          <button type="button" onClick={() => on_focus_map(topic.id)} className={get_button_classes('ghost')}>
            <Crosshair aria-hidden="true" className="h-4 w-4" />
            Centre the map here
          </button>
        )}
      </div>

      <TopicSubtopics
        skill_id={skill.id}
        topic={topic}
        topics={topics}
        Heading={section_heading}
        on_select_topic={on_select_topic}
        on_topics_changed={on_topics_changed}
        on_topic_map_changed={on_topic_map_changed}
      />
      <TopicKeyTerms skill_id={skill.id} topic_id={topic.id} Heading={section_heading} />
      <TopicResources
        skill={skill}
        topic={topic}
        topics={topics}
        resources={resources}
        Heading={section_heading}
        on_resource_added={on_resource_added}
        on_resource_updated={on_resource_updated}
      />
      <TopicEditor
        key={`${topic.id}-${topic.topic}-${topic.parent_node_id}`}
        topic={topic}
        topics={topics}
        on_topics_changed={on_topics_changed}
        on_topic_deleted={on_topic_deleted}
      />
    </div>
  );
}

export default TopicDetails;
