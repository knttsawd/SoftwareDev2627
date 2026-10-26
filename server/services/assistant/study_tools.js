import { ASSISTANT_SOURCE_CHARACTERS } from '../../config/constants.js';
import { delete_resource, get_owned_resource, list_resources } from '../resource_service.js';
import { validate_link_input, validate_typed_note_input } from '../resource_validators.js';
import { create_skill, delete_skill, list_skills, update_skill } from '../skill_service.js';
import { validate_skill_input } from '../skill_validators.js';
import { validate_resource_topic_input, validate_topic_input, validate_topic_update_input } from '../study_validators.js';
import { generate_subtopics, get_topic_source_text, move_resource_to_topic, resolve_resource_topic_id } from '../topic_resource_service.js';
import { add_topic, delete_topic, generate_skill_topics, get_owned_topic, list_topics, update_topic } from '../topic_service.js';
import { count_words, cut_text, name_skill, pick_sent, require_skill, take_values } from './tool_helpers.js';

// The assistant's tools for skills, topics and resources (see tool_helpers.js for the shape).

// A topic in the few fields the AI needs.
export function to_tool_topic(topic) {
  return {
    id: topic.id,
    topic: topic.topic,
    parent_topic_id: topic.parent_node_id,
    summary: topic.summary,
    mastery_level: topic.mastery_level,
    mastery_score: topic.mastery_score,
    resource_count: topic.resource_count,
  };
}

// '"Mitosis"' for labels, falling back to the id.
export function name_topic(context, topic_id) {
  try {
    return `"${get_owned_topic(context.database, context.user_id, topic_id).topic}"`;
  } catch {
    return String(topic_id);
  }
}

// '"Week 3 notes"' for labels, falling back to the id.
export function name_resource(context, resource_id) {
  try {
    return `"${get_owned_resource(context.database, context.user_id, resource_id).title}"`;
  } catch {
    return String(resource_id);
  }
}

export function skill_map_link(skill_id) {
  return `/dashboard/skill-map?skill=${skill_id}`;
}

// The topic ids a skill had before a change, to count the new ones after.
function list_topic_ids(context, skill_id) {
  return new Set(list_topics(context.database, context.user_id, skill_id).map((topic) => topic.id));
}

// Imports a typed note or a link into a skill (import_name is the importer's method).
async function import_resource(context, args, import_name, values) {
  const skill = require_skill(context, args.skill_id);
  const resource = await context.resource_importer[import_name]({
    ...values,
    user_id: context.user_id,
    skill_id: skill.id,
    topic_id: resolve_resource_topic_id(context.database, context.user_id, skill.id, values.topic_id),
  });
  const cut_note = resource.is_truncated ? ' Only the first part was kept because it was very long.' : '';
  return {
    summary: `Added the resource "${resource.title}" to ${skill.name}.${cut_note}`,
    data: { id: resource.id, title: resource.title, resource_type: resource.resource_type, topic_id: resource.topic_id },
    link: skill_map_link(skill.id),
  };
}

export const STUDY_TOOLS = [
  {
    name: 'list_skills',
    description: "List the student's skills with their topic and resource counts.",
    parameters: {},
    effect: 'read',
    label: () => 'Look at your skills',
    run: (context) => {
      const skills = list_skills(context.database, context.user_id);
      return { summary: count_words(skills.length, 'skill'), data: skills };
    },
  },
  {
    name: 'create_skill',
    description: 'Create a new skill (a subject the student is learning). It also becomes a subject on the schedule.',
    parameters: { name: 'string, required: the skill name', color: 'string, optional: a hex color like #0EA5E9' },
    effect: 'write',
    label: (args) => `Create the skill "${args.name}"`,
    run: (context, args) => {
      const skill = create_skill(context.database, context.user_id, take_values(validate_skill_input(args)));
      return { summary: `Created the skill "${skill.name}".`, data: skill, link: skill_map_link(skill.id) };
    },
  },
  {
    name: 'update_skill',
    description: "Rename a skill or change its color.",
    parameters: { skill_id: 'string, required', name: 'string, optional', color: 'string, optional: hex color' },
    effect: 'write',
    label: (args, context) => `Change the skill ${name_skill(context, args.skill_id)}`,
    run: (context, args) => {
      const values = take_values(validate_skill_input(pick_sent(args, ['name', 'color']), { is_partial: true }));
      const skill = update_skill(context.database, context.user_id, require_skill(context, args.skill_id).id, values);
      return { summary: `Updated the skill "${skill.name}".`, data: skill, link: skill_map_link(skill.id) };
    },
  },
  {
    name: 'delete_skill',
    description: 'Delete a skill with all its topics, resources, notes, quizzes, lessons and key terms. The student must confirm.',
    parameters: { skill_id: 'string, required' },
    effect: 'write',
    needs_confirmation: true,
    label: (args, context) => `Delete the skill ${name_skill(context, args.skill_id)} and everything in it`,
    run: async (context, args) => {
      const skill = require_skill(context, args.skill_id);
      await delete_skill(context.database, context.uploads_path, context.user_id, skill.id);
      return { summary: `Deleted the skill "${skill.name}".` };
    },
  },
  {
    name: 'get_topic_map',
    description: "A skill's topics (they nest like folders through parent_topic_id) with how well each is known.",
    parameters: { skill_id: 'string, required' },
    effect: 'read',
    label: (args, context) => `Look at the topics in ${name_skill(context, args.skill_id)}`,
    run: (context, args) => {
      const topics = list_topics(context.database, context.user_id, require_skill(context, args.skill_id).id).map(to_tool_topic);
      return { summary: count_words(topics.length, 'topic'), data: topics };
    },
  },
  {
    name: 'add_topic',
    description: 'Add a topic to a skill, optionally under a broader topic.',
    parameters: { skill_id: 'string, required', topic: 'string, required: short name', parent_topic_id: 'string, optional' },
    effect: 'write',
    label: (args) => `Add the topic "${args.topic}"`,
    run: (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const topic = add_topic(context.database, context.user_id, skill.id, take_values(validate_topic_input(args)));
      return { summary: `Added the topic "${topic.topic}" to ${skill.name}.`, data: to_tool_topic(topic), link: skill_map_link(skill.id) };
    },
  },
  {
    name: 'update_topic',
    description: 'Rename a topic, or move it under another topic (parent_topic_id null moves it to the top level).',
    parameters: { topic_id: 'string, required', topic: 'string, optional: new name', parent_topic_id: 'string or null, optional' },
    effect: 'write',
    label: (args, context) => `Change the topic ${name_topic(context, args.topic_id)}`,
    run: (context, args) => {
      const values = take_values(validate_topic_update_input(pick_sent(args, ['topic', 'parent_topic_id'])));
      const topic = update_topic(context.database, context.user_id, args.topic_id, values);
      return { summary: `Updated the topic "${topic.topic}".`, data: to_tool_topic(topic), link: skill_map_link(topic.skill_id) };
    },
  },
  {
    name: 'delete_topic',
    description: "Delete a topic. Its subtopics and resources move up to its parent. The student must confirm.",
    parameters: { topic_id: 'string, required' },
    effect: 'write',
    needs_confirmation: true,
    label: (args, context) => `Delete the topic ${name_topic(context, args.topic_id)}`,
    run: (context, args) => {
      const topic = get_owned_topic(context.database, context.user_id, args.topic_id);
      delete_topic(context.database, context.user_id, topic.id);
      return { summary: `Deleted the topic "${topic.topic}".`, link: skill_map_link(topic.skill_id) };
    },
  },
  {
    name: 'find_topics',
    description: "Use AI to find a skill's topics from its resources (or what a course usually covers) and add the new ones.",
    parameters: { skill_id: 'string, required' },
    effect: 'write',
    label: (args, context) => `Find topics for ${name_skill(context, args.skill_id)}`,
    run: async (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const before_ids = list_topic_ids(context, skill.id);
      const { topics } = await generate_skill_topics({ ...context, skill });
      const new_topics = topics.filter((topic) => !before_ids.has(topic.id));
      return { summary: `Added ${count_words(new_topics.length, 'topic')} to ${skill.name}.`, data: new_topics.map(to_tool_topic), link: skill_map_link(skill.id) };
    },
  },
  {
    name: 'break_down_topic',
    description: 'Use AI to split a topic into subtopics (one level more detail) and add them under it.',
    parameters: { topic_id: 'string, required' },
    effect: 'write',
    label: (args, context) => `Break ${name_topic(context, args.topic_id)} into subtopics`,
    run: async (context, args) => {
      const parent_topic = get_owned_topic(context.database, context.user_id, args.topic_id);
      const before_ids = list_topic_ids(context, parent_topic.skill_id);
      const { topics } = await generate_subtopics({ ...context, topic_id: parent_topic.id });
      const new_topics = topics.filter((topic) => !before_ids.has(topic.id));
      return {
        summary: `Added ${count_words(new_topics.length, 'subtopic')} under "${parent_topic.topic}".`,
        data: new_topics.map(to_tool_topic),
        link: skill_map_link(parent_topic.skill_id),
      };
    },
  },
  {
    name: 'list_resources',
    description: "A skill's resources (uploads, links and typed notes), each with its topic and length.",
    parameters: { skill_id: 'string, required' },
    effect: 'read',
    label: (args, context) => `Look at the resources in ${name_skill(context, args.skill_id)}`,
    run: (context, args) => {
      const resources = list_resources(context.database, context.user_id, require_skill(context, args.skill_id).id);
      return { summary: count_words(resources.length, 'resource'), data: resources };
    },
  },
  {
    name: 'search_resources',
    description:
      "Find the parts of a skill's resources that best match a question or topic. Use it before answering questions about the subject, then answer from it plus accurate general knowledge.",
    parameters: { skill_id: 'string, required', query: 'string, required: the question or topic' },
    effect: 'read',
    label: (args, context) => `Search the resources in ${name_skill(context, args.skill_id)}`,
    run: (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const excerpts = get_topic_source_text(context.database, context.user_id, skill.id, {
        search_text: String(args.query ?? ''),
        max_characters: ASSISTANT_SOURCE_CHARACTERS,
      });
      return {
        summary: excerpts ? `Found matching parts of the resources in ${skill.name}.` : `${skill.name} has no resources yet.`,
        data: { excerpts },
      };
    },
  },
  {
    name: 'read_resource',
    description: 'Read the text of one resource, a part at a time. Pass start (a character position) to read on.',
    parameters: { resource_id: 'string, required', start: 'integer, optional: where to start, default 0' },
    effect: 'read',
    label: (args, context) => `Read ${name_resource(context, args.resource_id)}`,
    run: (context, args) => {
      const resource = get_owned_resource(context.database, context.user_id, args.resource_id);
      const text = resource.extracted_text ?? '';
      const start = Number.isInteger(args.start) && args.start > 0 ? args.start : 0;
      const end = Math.min(text.length, start + ASSISTANT_SOURCE_CHARACTERS);
      return {
        summary: `Read "${resource.title}".`,
        data: { title: resource.title, text: text.slice(start, end), total_characters: text.length, next_start: end < text.length ? end : null },
      };
    },
  },
  {
    name: 'add_note_resource',
    description: 'Add typed or pasted text to a skill as a resource (for example notes the student dictates or the assistant writes).',
    parameters: { skill_id: 'string, required', title: 'string, required', text: 'string, required', topic_id: 'string, optional' },
    effect: 'write',
    label: (args) => `Add the note "${args.title}" as a resource`,
    run: (context, args) => import_resource(context, args, 'import_typed_note', take_values(validate_typed_note_input(args))),
  },
  {
    name: 'add_link_resource',
    description: 'Add a web article or YouTube video (by its captions) to a skill as a resource.',
    parameters: { skill_id: 'string, required', url: 'string, required', title: 'string, optional', topic_id: 'string, optional' },
    effect: 'write',
    label: (args) => `Add the link ${cut_text(String(args.url ?? ''), 60)} as a resource`,
    run: (context, args) => import_resource(context, args, 'import_link', take_values(validate_link_input(args))),
  },
  {
    name: 'file_resource',
    description: 'Put a resource under a topic in its skill, or take it out of its topic with topic_id null.',
    parameters: { resource_id: 'string, required', topic_id: 'string or null, required' },
    effect: 'write',
    label: (args, context) => `File ${name_resource(context, args.resource_id)} under a topic`,
    run: (context, args) => {
      const { topic_id } = take_values(validate_resource_topic_input(args));
      const resource = move_resource_to_topic(context.database, context.user_id, args.resource_id, topic_id);
      return { summary: topic_id ? `Filed "${resource.title}" under the topic.` : `Took "${resource.title}" out of its topic.`, link: skill_map_link(resource.skill_id) };
    },
  },
  {
    name: 'delete_resource',
    description: 'Delete a resource and its uploaded file. The student must confirm.',
    parameters: { resource_id: 'string, required' },
    effect: 'write',
    needs_confirmation: true,
    label: (args, context) => `Delete the resource ${name_resource(context, args.resource_id)}`,
    run: async (context, args) => {
      const resource = get_owned_resource(context.database, context.user_id, args.resource_id);
      await delete_resource(context.database, context.uploads_path, context.user_id, resource.id);
      return { summary: `Deleted the resource "${resource.title}".`, link: skill_map_link(resource.skill_id) };
    },
  },
];
