import { HTTP_STATUS } from '../../config/constants.js';
import { create_http_error } from '../http_error.js';
import {
  build_ai_student_quiz_request,
  build_ai_student_reply_request,
  build_notes_request,
  build_quiz_request,
  build_topics_request,
} from './ai_prompts.js';
import { normalize_ai_student_answers } from './ai_student_answers.js';
import { normalize_assistant_step } from './assistant_outputs.js';
import { build_assistant_step_request } from './assistant_prompts.js';
import {
  normalize_explanation,
  normalize_glossary_terms,
  normalize_lesson_steps,
  normalize_path_order,
  normalize_practice,
  normalize_practice_check,
  normalize_reading_guide,
  normalize_reteach,
} from './learning_outputs.js';
import {
  build_explain_request,
  build_glossary_request,
  build_learning_path_request,
  build_lesson_request,
  build_practice_check_request,
  build_practice_request,
  build_reading_guide_request,
  build_reteach_request,
} from './learning_prompts.js';
import { get_study_tip } from './learning_style_hints.js';
import { build_widget_app_request, normalize_widget_app } from './widget_app_prompts.js';
import { normalize_quiz_questions } from './quiz_questions.js';
import { normalize_topic_list } from './topic_list.js';

// Turns any completer into an AI provider with the same shape as the mock one.
// A completer is async complete_json({ system_prompt, user_prompt, json_schema, task_tier })
// -> object; see gemini_completer.js, anthropic_completer.js and openai_completer.js.
// Adding a new AI company means writing one new completer, nothing else.
export function create_llm_ai_provider(provider_name, complete_json) {
  async function generate_notes(notes_request) {
    const ai_output = await complete_json(build_notes_request(notes_request));
    if (typeof ai_output?.notes_markdown !== 'string' || ai_output.notes_markdown.trim() === '') {
      throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI did not return any notes. Please try again.');
    }
    const study_tip = get_study_tip(notes_request.learning_style);
    return { notes_markdown: `${ai_output.notes_markdown.trim()}\n\n## Study tip\n\n${study_tip}` };
  }

  async function generate_quiz(quiz_request) {
    const ai_output = await complete_json(build_quiz_request(quiz_request));
    return { questions: normalize_quiz_questions(ai_output?.questions, quiz_request.question_count) };
  }

  async function generate_topics(topics_request) {
    const ai_output = await complete_json(build_topics_request(topics_request));
    return { topics: normalize_topic_list(ai_output?.topics, topics_request.max_topics) };
  }

  // One step of the assistant's work: tool calls to make, or the answer.
  async function plan_assistant_step(step_request) {
    return normalize_assistant_step(await complete_json(build_assistant_step_request(step_request)), step_request.tool_names);
  }

  async function reply_as_ai_student(reply_request) {
    const ai_output = await complete_json(build_ai_student_reply_request(reply_request));
    if (typeof ai_output?.reply !== 'string' || ai_output.reply.trim() === '') {
      throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI student did not answer. Please try again.');
    }
    return { reply: ai_output.reply.trim() };
  }

  async function take_quiz_as_ai_student(quiz_request) {
    const ai_output = await complete_json(build_ai_student_quiz_request(quiz_request));
    return normalize_ai_student_answers(ai_output, quiz_request.questions);
  }

  // The learning features (see learning_prompts.js and learning_outputs.js).
  async function generate_lesson(lesson_request) {
    const ai_output = await complete_json(build_lesson_request(lesson_request));
    return { steps: normalize_lesson_steps(ai_output?.steps, lesson_request.step_count) };
  }

  async function reteach_lesson_step(reteach_request) {
    return normalize_reteach(await complete_json(build_reteach_request(reteach_request)));
  }

  async function order_learning_path(path_request) {
    const ai_output = await complete_json(build_learning_path_request(path_request));
    return { steps: normalize_path_order(ai_output?.steps, path_request.topics.length) };
  }

  async function generate_practice(practice_request) {
    return normalize_practice(await complete_json(build_practice_request(practice_request)), practice_request.problem_count);
  }

  async function check_practice_answer(check_request) {
    return normalize_practice_check(await complete_json(build_practice_check_request(check_request)));
  }

  async function guide_reading_section(guide_request) {
    return normalize_reading_guide(await complete_json(build_reading_guide_request(guide_request)));
  }

  async function explain_text(explain_request) {
    return normalize_explanation(await complete_json(build_explain_request(explain_request)));
  }

  async function generate_glossary(glossary_request) {
    const ai_output = await complete_json(build_glossary_request(glossary_request));
    return { terms: normalize_glossary_terms(ai_output?.terms, glossary_request.max_terms) };
  }

  // The app builder: an app widget's code from the assistant's brief.
  async function build_widget_app(app_request) {
    const app = normalize_widget_app(await complete_json(build_widget_app_request(app_request)));
    if (!app) throw create_http_error(HTTP_STATUS.bad_gateway, 'The AI did not write the app. Please try again.');
    return app;
  }

  return {
    name: provider_name,
    generate_notes,
    generate_quiz,
    generate_topics,
    plan_assistant_step,
    reply_as_ai_student,
    take_quiz_as_ai_student,
    generate_lesson,
    reteach_lesson_step,
    order_learning_path,
    generate_practice,
    check_practice_answer,
    guide_reading_section,
    explain_text,
    generate_glossary,
    build_widget_app,
  };
}
