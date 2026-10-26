import { useState } from 'react';
import { useNavigate } from 'react-router';
import { WIDE_LAYOUT_QUERY } from '../../config/constants.js';
import { use_media_query } from '../../hooks/use_media_query.js';
import { build_quiz_path } from '../../utils/study_paths.js';
import AlertMessage from '../AlertMessage.jsx';
import SkillOverview from './SkillOverview.jsx';
import StudyNextPanel from './StudyNextPanel.jsx';
import TopicDialog from './TopicDialog.jsx';
import TopicManager from './TopicManager.jsx';
import TopicMap from './TopicMap.jsx';
import TopicPanel from './TopicPanel.jsx';

// The skill map for one skill: an overview of how well it's known, the map (or outline)
// beside the chosen topic's details, suggestions, and the topic tools. On narrower
// screens a chosen topic opens in a popup instead. "Quiz me" on a suggestion goes
// straight to the quiz.
// The parent loads the topic map (topic_map_state from use_api_data) and the skill's
// resources: on_resource_added / on_resource_updated report resource changes, and
// on_resources_moved() asks for the resource list again (removing a topic moves its
// resources up a level). media_window is injectable for tests.
function TopicMapSection({
  skill,
  topic_map_state,
  resources,
  on_resource_added,
  on_resource_updated,
  on_resources_moved,
  media_window,
}) {
  const navigate = useNavigate();
  const is_wide = use_media_query(WIDE_LAYOUT_QUERY, media_window);
  const [open_topic_id, set_open_topic_id] = useState(null);
  const [focus_topic_id, set_focus_topic_id] = useState(null);
  const topics = topic_map_state.data?.topics ?? [];
  const suggestions = topic_map_state.data?.suggestions ?? [];
  const open_topic = topics.find((topic) => topic.id === open_topic_id) ?? null;

  function open_topic_quiz(topic) {
    navigate(build_quiz_path({ skill_id: skill.id, topic_id: topic.id }));
  }

  // Adding, moving or deleting a topic changes the suggestions too, so the map is reloaded.
  function handle_topic_list_changed() {
    topic_map_state.reload();
  }

  // After a removal, its parent (if any) is shown, since that's where its contents went.
  function handle_topic_deleted(deleted_topic) {
    set_open_topic_id(deleted_topic.parent_node_id);
    if (deleted_topic.id === focus_topic_id) set_focus_topic_id(deleted_topic.parent_node_id);
    topic_map_state.reload();
    on_resources_moved();
  }

  const detail_props = {
    skill,
    topic: open_topic,
    topics,
    resources,
    on_close: () => set_open_topic_id(null),
    on_select_topic: set_open_topic_id,
    on_resource_added,
    on_resource_updated,
    on_topics_changed: handle_topic_list_changed,
    on_topic_map_changed: topic_map_state.set_data,
    on_topic_deleted: handle_topic_deleted,
  };

  return (
    <section aria-labelledby="topic-map-heading" className="flex flex-col gap-5">
      <h2 id="topic-map-heading" className="text-heading-2 font-bold text-ink">
        Topic map
      </h2>
      {topic_map_state.error && <AlertMessage>{topic_map_state.error}</AlertMessage>}
      {topic_map_state.is_loading && !topic_map_state.data && <p className="text-small text-ink-muted">Loading topics…</p>}

      {topics.length === 0 && !topic_map_state.is_loading && (
        <p className="rounded-lg border border-dashed border-border bg-surface p-4 text-body text-ink-muted">
          No topics yet. Let the AI find them, or add your own. Topics nest like folders: a broad unit can hold smaller
          topics, which can hold smaller ones again.
        </p>
      )}
      {topics.length > 0 && <SkillOverview topics={topics} resource_count={resources.length} />}
      {topics.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <TopicMap
            skill={skill}
            topics={topics}
            suggestions={suggestions}
            selected_topic_id={open_topic_id}
            focus_topic_id={focus_topic_id}
            on_focus_change={set_focus_topic_id}
            on_open_topic={(topic) => set_open_topic_id(topic.id)}
          />
          {is_wide && (
            <TopicPanel {...detail_props} on_focus_map={open_topic_id === focus_topic_id ? undefined : set_focus_topic_id} />
          )}
        </div>
      )}
      <StudyNextPanel suggestions={suggestions} has_topics={topics.length > 0} on_open_topic={open_topic_quiz} />
      <TopicManager
        skill={skill}
        topics={topics}
        on_topic_map_changed={topic_map_state.set_data}
        on_topic_added={handle_topic_list_changed}
      />
      {!is_wide && <TopicDialog {...detail_props} />}
    </section>
  );
}

export default TopicMapSection;
