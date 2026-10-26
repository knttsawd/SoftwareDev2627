import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IN_MEMORY_DATABASE } from '../config/constants.js';
import { open_database } from '../db/database.js';
import { build_notes_request, build_quiz_request, format_study_context, SUBJECT_RULE } from '../services/ai/ai_prompts.js';
import { build_lesson_request } from '../services/ai/learning_prompts.js';
import { create_mock_ai_provider } from '../services/ai/mock_ai_provider.js';
import { explain_another_way } from '../services/explain_service.js';
import { start_guided_lesson } from '../services/guided_lesson_service.js';
import { create_study_notes } from '../services/note_service.js';
import { check_practice_answer, create_practice_set, get_owned_practice_set } from '../services/practice_service.js';
import { create_practice_quiz } from '../services/quiz_service.js';
import { guide_reading_section } from '../services/reading_service.js';
import { add_teaching_message, get_owned_teach_session, start_lesson_quiz, start_teach_session } from '../services/teach_service.js';
import { add_topic, format_topic_path } from '../services/topic_service.js';
import { create_student_with_skill, insert_test_resource } from './helpers/study_fixtures.js';

// A student's AP World History unit with a topic whose name means something else outside
// the subject: what each AI request must make clear.
const SKILL_NAME = 'AP World History Unit 4';
const TOPIC_PATH = 'Maritime empires > Maritime technologies';
const MARITIME_TEXT = [
  'The caravel was a small, fast ship that Portuguese sailors used to explore the coast of Africa.',
  'Its lateen sails let the caravel sail into the wind, which square sails could not do well.',
  'Sailors used the astrolabe to measure the height of the sun and stars and work out their latitude.',
  'The magnetic compass, which came to Europe from China, helped sailors hold a course out of sight of land.',
].join(' ');

let database;
let user_id;
let skill;
let maritime_topic;
let ai_provider;
let resource_id;

beforeEach(async () => {
  database = open_database(IN_MEMORY_DATABASE);
  ({ user_id, skill } = await create_student_with_skill(database, SKILL_NAME));
  const unit = add_topic(database, user_id, skill.id, { topic: 'Maritime empires', parent_topic_id: null });
  maritime_topic = add_topic(database, user_id, skill.id, { topic: 'Maritime technologies', parent_topic_id: unit.id });
  resource_id = insert_test_resource(database, { user_id, skill_id: skill.id, text: MARITIME_TEXT, topic_id: maritime_topic.id });
  ai_provider = create_mock_ai_provider();
});

// The one request the spied provider method received.
function only_request(spied_method) {
  expect(spied_method).toHaveBeenCalledOnce();
  return spied_method.mock.calls[0][0];
}

describe('topic paths', () => {
  it('names a topic with the topics above it, or nothing without a topic', () => {
    expect(format_topic_path(database, maritime_topic.id)).toBe(TOPIC_PATH);
    expect(format_topic_path(database, maritime_topic.parent_node_id)).toBe('Maritime empires');
    expect(format_topic_path(database, null)).toBeNull();
  });

  it('formats the subject and topic lines, leaving out what is missing', () => {
    expect(format_study_context({ skill_name: SKILL_NAME, topic: 'Maritime technologies', topic_path: TOPIC_PATH })).toBe(
      `Subject: ${SKILL_NAME}\nTopic: ${TOPIC_PATH}`,
    );
    expect(format_study_context({ skill_name: SKILL_NAME, topic: 'Ships' }, 'Topic to teach')).toBe(`Subject: ${SKILL_NAME}\nTopic to teach: Ships`);
    expect(format_study_context({ skill_name: SKILL_NAME })).toBe(`Subject: ${SKILL_NAME}`);
  });
});

describe('every AI request about a topic names its subject', () => {
  it('quizzes on a map topic as the subject teaches it', async () => {
    const generate_quiz = vi.spyOn(ai_provider, 'generate_quiz');
    await create_practice_quiz({
      database,
      ai_provider,
      user_id,
      skill,
      quiz_details: { scope: 'topic', topic: null, topic_id: maritime_topic.id, question_count: 3 },
    });

    const quiz_request = only_request(generate_quiz);
    expect(quiz_request).toMatchObject({ skill_name: SKILL_NAME, topic: 'Maritime technologies', topic_path: TOPIC_PATH });
    const prompt = build_quiz_request(quiz_request);
    expect(prompt.user_prompt).toMatch(`Subject: ${SKILL_NAME}\nWrite 3 questions about: ${TOPIC_PATH}`);
    expect(prompt.system_prompt).toContain(SUBJECT_RULE);
  });

  it('names the subject for whole-skill quizzes too, without a topic path', async () => {
    const generate_quiz = vi.spyOn(ai_provider, 'generate_quiz');
    await create_practice_quiz({ database, ai_provider, user_id, skill, quiz_details: { scope: 'skill', question_count: 3 } });

    expect(only_request(generate_quiz)).toMatchObject({ skill_name: SKILL_NAME, topic_path: null });
  });

  it('writes notes on a typed topic that matches a map topic in its place', async () => {
    const generate_notes = vi.spyOn(ai_provider, 'generate_notes');
    await create_study_notes({ database, ai_provider, user_id, skill_id: skill.id, topic: 'maritime technologies' });

    const notes_request = only_request(generate_notes);
    expect(notes_request).toMatchObject({ skill_name: SKILL_NAME, topic_path: TOPIC_PATH });
    expect(build_notes_request(notes_request).user_prompt).toMatch(`Subject: ${SKILL_NAME}\nTopic: ${TOPIC_PATH}`);
  });

  it('teaches, sets practice and checks answers within the subject', async () => {
    const generate_lesson = vi.spyOn(ai_provider, 'generate_lesson');
    await start_guided_lesson({ database, ai_provider, user_id, skill, lesson_details: { topic_id: maritime_topic.id, step_count: 3 } });
    const lesson_request = only_request(generate_lesson);
    expect(lesson_request).toMatchObject({ skill_name: SKILL_NAME, topic_path: TOPIC_PATH });
    expect(build_lesson_request(lesson_request).user_prompt).toMatch(`Topic to teach: ${TOPIC_PATH}`);

    const generate_practice = vi.spyOn(ai_provider, 'generate_practice');
    const practice_set = await create_practice_set({
      database,
      ai_provider,
      user_id,
      skill,
      practice_details: { topic_id: maritime_topic.id, problem_count: 1 },
    });
    expect(only_request(generate_practice)).toMatchObject({ skill_name: SKILL_NAME, topic_path: TOPIC_PATH });

    const check_answer = vi.spyOn(ai_provider, 'check_practice_answer');
    const practice_row = get_owned_practice_set(database, user_id, practice_set.id);
    await check_practice_answer({ database, ai_provider, user_id, practice_row, problem_index: 0, answer: 'The caravel' });
    expect(only_request(check_answer)).toMatchObject({ skill_name: SKILL_NAME, topic_path: TOPIC_PATH });
  });

  it('tells the AI student which subject it is being taught', async () => {
    const reply_as_ai_student = vi.spyOn(ai_provider, 'reply_as_ai_student');
    const take_quiz = vi.spyOn(ai_provider, 'take_quiz_as_ai_student');
    const session = start_teach_session(database, user_id, skill, { topic_id: maritime_topic.id });

    await add_teaching_message({
      database,
      ai_provider,
      user_id,
      session_row: get_owned_teach_session(database, user_id, session.id),
      message: 'The caravel used lateen sails to sail into the wind.',
    });
    expect(only_request(reply_as_ai_student)).toMatchObject({ skill_name: SKILL_NAME, topic_path: TOPIC_PATH });

    await start_lesson_quiz({
      database,
      ai_provider,
      user_id,
      skill,
      session_row: get_owned_teach_session(database, user_id, session.id),
      question_count: 3,
    });
    expect(only_request(take_quiz)).toMatchObject({ skill_name: SKILL_NAME, topic_path: TOPIC_PATH });
  });

  it('guides reading and explains within the topic a resource is filed under', async () => {
    const guide = vi.spyOn(ai_provider, 'guide_reading_section');
    await guide_reading_section({ database, ai_provider, user_id, resource_id, section_index: 0 });
    expect(only_request(guide)).toMatchObject({ skill_name: SKILL_NAME, topic_path: TOPIC_PATH });

    const explain = vi.spyOn(ai_provider, 'explain_text');
    await explain_another_way({
      database,
      ai_provider,
      user_id,
      skill,
      explain_details: { text: 'Lateen sails', style: 'simpler', topic_id: maritime_topic.id },
    });
    expect(only_request(explain)).toMatchObject({ skill_name: SKILL_NAME, topic_path: TOPIC_PATH });
  });
});
