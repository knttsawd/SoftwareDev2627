import { ASSISTANT_SOURCE_CHARACTERS } from '../../config/constants.js';
import { add_glossary_term, generate_glossary_terms, list_glossary_terms } from '../glossary_service.js';
import { list_guided_lessons, start_guided_lesson } from '../guided_lesson_service.js';
import { build_learning_path, get_learning_path } from '../learning_path_service.js';
import { validate_glossary_term_input, validate_lesson_input, validate_practice_input } from '../learning_validators.js';
import { create_study_notes, get_owned_note, list_notes } from '../note_service.js';
import { create_practice_set, list_practice_sets } from '../practice_service.js';
import { get_progress } from '../progress_service.js';
import { create_practice_quiz, list_quizzes, list_recent_results } from '../quiz_service.js';
import { validate_notes_input, validate_quiz_input, validate_teach_session_input } from '../study_validators.js';
import { start_teach_session } from '../teach_service.js';
import { count_words, cut_text, name_skill, require_skill, take_values } from './tool_helpers.js';

// The assistant's tools for notes, quizzes, progress and the learning features (see
// tool_helpers.js for the shape). Things it makes come back with a link to open them.

const NOTE_PREVIEW_CHARACTERS = 160;

function learn_link(query) {
  return `/dashboard/learn?${new URLSearchParams(query)}`;
}

// "on "Cells"" for a lesson or practice label: the typed topic, or the map topic's id.
function describe_topic_choice(args) {
  return args.topic ? `on "${args.topic}"` : 'on the chosen topic';
}

export const LEARNING_TOOLS = [
  {
    name: 'list_notes',
    description: "A skill's saved AI study notes, newest first, with a short preview of each.",
    parameters: { skill_id: 'string, required' },
    effect: 'read',
    label: (args, context) => `Look at the notes in ${name_skill(context, args.skill_id)}`,
    run: (context, args) => {
      const notes = list_notes(context.database, context.user_id, require_skill(context, args.skill_id).id).map((note) => ({
        id: note.id,
        topic: note.topic,
        created_at: note.created_at,
        preview: cut_text(note.content, NOTE_PREVIEW_CHARACTERS),
      }));
      return { summary: count_words(notes.length, 'set of notes', 'sets of notes'), data: notes };
    },
  },
  {
    name: 'read_note',
    description: 'Read one set of saved study notes.',
    parameters: { note_id: 'string, required' },
    effect: 'read',
    label: () => 'Read your notes',
    run: (context, args) => {
      const note = get_owned_note(context.database, context.user_id, args.note_id);
      return { summary: `Read the notes on "${note.topic}".`, data: { topic: note.topic, content: cut_text(note.content, ASSISTANT_SOURCE_CHARACTERS) } };
    },
  },
  {
    name: 'make_notes',
    description: "Write and save AI study notes on a topic of a skill, from its resources plus general knowledge. They show on the skill map.",
    parameters: { skill_id: 'string, required', topic: 'string, required' },
    effect: 'write',
    label: (args) => `Write notes on "${args.topic}"`,
    run: async (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const { topic } = take_values(validate_notes_input(args));
      const note = await create_study_notes({ ...context, skill_id: skill.id, topic });
      return { summary: `Wrote notes on "${note.topic}".`, data: { id: note.id, topic: note.topic }, link: `/dashboard/skill-map?skill=${skill.id}` };
    },
  },
  {
    name: 'make_quiz',
    description:
      'Make a multiple-choice quiz. scope "topic" (a map topic by topic_id, or a typed topic), "resource" (resource_id) or "skill" (the whole skill). Open it with the returned link.',
    parameters: {
      skill_id: 'string, required',
      scope: 'string, optional: "topic" (default), "resource" or "skill"',
      topic_id: 'string, optional',
      topic: 'string, optional: a typed topic when there is no topic_id',
      resource_id: 'string, optional: for scope "resource"',
      question_count: 'integer, optional: 3 to 15, default 5',
    },
    effect: 'write',
    label: (args) => `Make a quiz ${args.scope === 'skill' ? 'on the whole skill' : args.topic ? `on "${args.topic}"` : 'on your choice'}`,
    run: async (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const quiz = await create_practice_quiz({ ...context, skill, quiz_details: take_values(validate_quiz_input(args)) });
      return {
        summary: `Made a ${quiz.questions.length}-question quiz on "${quiz.topic}".`,
        data: { quiz_id: quiz.id, topic: quiz.topic, question_count: quiz.questions.length },
        link: `/dashboard/quiz?quiz=${quiz.id}`,
      };
    },
  },
  {
    name: 'list_quizzes',
    description: "A skill's quizzes and the student's recent quiz results.",
    parameters: { skill_id: 'string, required' },
    effect: 'read',
    label: (args, context) => `Look at the quizzes in ${name_skill(context, args.skill_id)}`,
    run: (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const quizzes = list_quizzes(context.database, context.user_id, skill.id);
      return {
        summary: count_words(quizzes.length, 'quiz', 'quizzes'),
        data: { quizzes, recent_results: list_recent_results(context.database, context.user_id, skill.id) },
      };
    },
  },
  {
    name: 'get_progress',
    description: "The student's progress: each skill's bars, quiz scores and focus time against the period before, most improved and slipping topics.",
    parameters: {},
    effect: 'read',
    label: () => 'Look at your progress',
    run: (context) => {
      const { recent_work_blocks, ...progress } = get_progress(context.database, context.user_id, context.now);
      return { summary: 'Checked your progress.', data: progress, link: '/dashboard/progress' };
    },
  },
  {
    name: 'get_learning_path',
    description: "A skill's learning path: its topics in learning order, each done, next or to do.",
    parameters: { skill_id: 'string, required' },
    effect: 'read',
    label: (args, context) => `Look at the learning path for ${name_skill(context, args.skill_id)}`,
    run: (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const path = get_learning_path(context.database, context.user_id, skill);
      return { summary: path.has_path ? `${count_words(path.steps.length, 'step')} on the path.` : 'There is no path yet.', data: path, link: learn_link({ skill: skill.id, tab: 'path' }) };
    },
  },
  {
    name: 'build_learning_path',
    description: "Use AI to put a skill's topics in learning order (finding topics first if it has none). Replaces any earlier path.",
    parameters: { skill_id: 'string, required' },
    effect: 'write',
    label: (args, context) => `Plan a learning path for ${name_skill(context, args.skill_id)}`,
    run: async (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const path = await build_learning_path({ ...context, skill });
      return { summary: `Planned a ${count_words(path.steps.length, 'step')} learning path for ${skill.name}.`, data: path, link: learn_link({ skill: skill.id, tab: 'path' }) };
    },
  },
  {
    name: 'start_guided_lesson',
    description: 'Write a guided lesson that teaches a topic step by step with check questions. Give topic_id for a map topic or topic for a typed one.',
    parameters: { skill_id: 'string, required', topic_id: 'string, optional', topic: 'string, optional', step_count: 'integer, optional: 3 to 6, default 4' },
    effect: 'write',
    label: (args) => `Write a guided lesson ${describe_topic_choice(args)}`,
    run: async (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const lesson = await start_guided_lesson({ ...context, skill, lesson_details: take_values(validate_lesson_input(args)) });
      return {
        summary: `Wrote a ${lesson.step_count}-step lesson on "${lesson.topic}".`,
        data: { lesson_id: lesson.id, topic: lesson.topic },
        link: learn_link({ skill: skill.id, tab: 'lessons', lesson: lesson.id }),
      };
    },
  },
  {
    name: 'list_guided_lessons',
    description: "A skill's guided lessons and how far each got.",
    parameters: { skill_id: 'string, required' },
    effect: 'read',
    label: (args, context) => `Look at the lessons in ${name_skill(context, args.skill_id)}`,
    run: (context, args) => {
      const lessons = list_guided_lessons(context.database, context.user_id, require_skill(context, args.skill_id).id);
      return { summary: count_words(lessons.length, 'lesson'), data: lessons };
    },
  },
  {
    name: 'make_practice',
    description: 'Make a worked example and practice problems with hints on a topic. Give topic_id for a map topic or topic for a typed one.',
    parameters: { skill_id: 'string, required', topic_id: 'string, optional', topic: 'string, optional', problem_count: 'integer, optional: 1 to 5, default 3' },
    effect: 'write',
    label: (args) => `Make practice problems ${describe_topic_choice(args)}`,
    run: async (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const practice_set = await create_practice_set({ ...context, skill, practice_details: take_values(validate_practice_input(args)) });
      return {
        summary: `Made ${count_words(practice_set.problems.length, 'practice problem')} on "${practice_set.topic}".`,
        data: { practice_id: practice_set.id, topic: practice_set.topic },
        link: learn_link({ skill: skill.id, tab: 'practice', practice: practice_set.id }),
      };
    },
  },
  {
    name: 'list_practice_sets',
    description: "A skill's practice sets and how many problems are solved.",
    parameters: { skill_id: 'string, required' },
    effect: 'read',
    label: (args, context) => `Look at the practice in ${name_skill(context, args.skill_id)}`,
    run: (context, args) => {
      const practice_sets = list_practice_sets(context.database, context.user_id, require_skill(context, args.skill_id).id);
      return { summary: count_words(practice_sets.length, 'practice set'), data: practice_sets };
    },
  },
  {
    name: 'list_key_terms',
    description: "A skill's key terms (glossary) with definitions.",
    parameters: { skill_id: 'string, required' },
    effect: 'read',
    label: (args, context) => `Look at the key terms in ${name_skill(context, args.skill_id)}`,
    run: (context, args) => {
      const terms = list_glossary_terms(context.database, context.user_id, require_skill(context, args.skill_id).id);
      return { summary: count_words(terms.length, 'key term'), data: terms };
    },
  },
  {
    name: 'find_key_terms',
    description: "Use AI to pick out a skill's key terms from its resources and add the new ones.",
    parameters: { skill_id: 'string, required' },
    effect: 'write',
    label: (args, context) => `Find key terms for ${name_skill(context, args.skill_id)}`,
    run: async (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const { added_count } = await generate_glossary_terms({ ...context, skill });
      return { summary: `Added ${count_words(added_count, 'key term')} to ${skill.name}.`, link: learn_link({ skill: skill.id, tab: 'terms' }) };
    },
  },
  {
    name: 'add_key_term',
    description: 'Add one key term and its definition to a skill.',
    parameters: { skill_id: 'string, required', term: 'string, required', definition: 'string, required', topic_id: 'string, optional' },
    effect: 'write',
    label: (args) => `Add the key term "${args.term}"`,
    run: (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const glossary_term = add_glossary_term(context.database, context.user_id, skill.id, take_values(validate_glossary_term_input(args)));
      return { summary: `Added the key term "${glossary_term.term}".`, data: glossary_term, link: learn_link({ skill: skill.id, tab: 'terms' }) };
    },
  },
  {
    name: 'start_teaching_lesson',
    description: 'Set up a "teach the AI student" lesson, where the student explains a topic to Pip. Give topic_id or topic.',
    parameters: { skill_id: 'string, required', topic_id: 'string, optional', topic: 'string, optional' },
    effect: 'write',
    label: (args) => `Set up a lesson to teach Pip ${describe_topic_choice(args)}`,
    run: (context, args) => {
      const skill = require_skill(context, args.skill_id);
      const teach_session = start_teach_session(context.database, context.user_id, skill, take_values(validate_teach_session_input(args)));
      return {
        summary: `Set up a lesson to teach "${teach_session.topic}" to Pip.`,
        data: { session_id: teach_session.id },
        link: `/dashboard/teach?session=${teach_session.id}`,
      };
    },
  },
];
