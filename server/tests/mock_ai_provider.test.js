import { describe, expect, it } from 'vitest';
import { QUIZ_CHOICE_COUNT } from '../config/constants.js';
import {
  blank_out_word,
  build_blank_question,
  build_key_term_lines,
  build_mock_notes,
  build_mock_quiz,
  build_mock_topics,
  capitalize,
  create_mock_ai_provider,
  pick_answer_word,
  rank_sentences,
  shares_word_stem,
  strip_source_labels,
} from '../services/ai/mock_ai_provider.js';
import { select_source_text } from '../services/ai/source_selection.js';
import { SAMPLE_STUDY_TEXT } from './helpers/study_fixtures.js';

const SOURCE_TEXT = select_source_text([{ title: 'Plants', extracted_text: SAMPLE_STUDY_TEXT }], 'photosynthesis');
const KEYWORDS = ['photosynthesis', 'glucose', 'energy', 'chlorophyll', 'stomata', 'oxygen'];

describe('mock AI helpers', () => {
  it('removes source labels', () => {
    expect(strip_source_labels('[From: Plants]\nPlants grow.')).toBe('Plants grow.');
  });

  it('ranks sentences by topic matches, then reading order', () => {
    const ranked = rank_sentences(SOURCE_TEXT, 'stomata carbon dioxide');

    expect(ranked[0].sentence).toMatch('stomata');
  });

  it('builds key term lines from the first sentence using each term', () => {
    expect(build_key_term_lines(['Plants make glucose here.', 'More glucose later.'], ['glucose', 'unused'])).toEqual([
      '- **glucose**: Plants make glucose here.',
    ]);
  });

  it('picks the longest keyword in a sentence as the answer and blanks it out', () => {
    const sentence = 'Photosynthesis stores energy in glucose.';

    expect(pick_answer_word(sentence, KEYWORDS)).toBe('photosynthesis');
    expect(pick_answer_word('Nothing relevant here at all.', KEYWORDS)).toBeNull();
    expect(blank_out_word(sentence, 'photosynthesis')).toBe('_____ stores energy in glucose.');
  });
});

describe('build_blank_question', () => {
  it('makes a fill-in-the-blank question with the answer at a rotating position', () => {
    const quiz_question = build_blank_question('Photosynthesis stores energy in glucose.', KEYWORDS, 1);

    expect(quiz_question.question).toBe('Fill in the blank: "_____ stores energy in glucose."');
    expect(quiz_question.choices).toHaveLength(QUIZ_CHOICE_COUNT);
    expect(quiz_question.choices[1]).toBe('photosynthesis');
    expect(quiz_question.correct_index).toBe(1);
    expect(new Set(quiz_question.choices).size).toBe(QUIZ_CHOICE_COUNT);
  });

  it('never offers a wrong choice that looks like the answer', () => {
    const quiz_question = build_blank_question('Photosynthesis stores energy in sugar.', ['photosynthesis', 'photosynthetic', 'oxygen', 'stomata', 'chlorophyll'], 0);

    expect(quiz_question.choices).not.toContain('photosynthetic');
    expect(shares_word_stem('photosynthesis', 'photosynthetic')).toBe(true);
    expect(shares_word_stem('photosynthesis', 'oxygen')).toBe(false);
  });

  it('returns null when there are not enough wrong choices', () => {
    expect(build_blank_question('Photosynthesis stores energy in glucose.', ['photosynthesis', 'oxygen'], 0)).toBeNull();
  });
});

describe('build_mock_notes', () => {
  it('makes Markdown notes with key points, key terms and a learning-style tip', () => {
    const { notes_markdown } = build_mock_notes({ topic: 'Photosynthesis', source_text: SOURCE_TEXT, learning_style: 'visual' });

    expect(notes_markdown).toMatch(/^# Photosynthesis/);
    expect(notes_markdown).toMatch('practice mode');
    expect(notes_markdown).toMatch('## Key points\n\n- Photosynthesis is the process');
    expect(notes_markdown).toMatch('## Key terms');
    expect(notes_markdown).toMatch('mind map');
    expect(notes_markdown).not.toMatch('[From:');
  });
});

describe('build_mock_quiz', () => {
  it('makes up to the requested number of valid questions', () => {
    const { questions } = build_mock_quiz({ topic: 'Photosynthesis', source_text: SOURCE_TEXT, question_count: 3 });

    expect(questions).toHaveLength(3);
    for (const quiz_question of questions) {
      expect(quiz_question.choices[quiz_question.correct_index]).toBeTruthy();
      expect(quiz_question.question).toContain('_____');
    }
  });

  it('explains when there is not enough text', () => {
    expect(() => build_mock_quiz({ topic: 'Cells', source_text: 'Too short.', question_count: 3 })).toThrow(
      expect.objectContaining({ status: 422 }),
    );
  });
});

describe('create_mock_ai_provider', () => {
  it('exposes the same async shape as the real providers', async () => {
    const ai_provider = create_mock_ai_provider();

    expect(ai_provider.name).toBe('mock');
    await expect(ai_provider.generate_notes({ topic: 'Plants', source_text: SOURCE_TEXT })).resolves.toHaveProperty(
      'notes_markdown',
    );
    await expect(
      ai_provider.generate_quiz({ topic: 'Plants', source_text: SOURCE_TEXT, question_count: 2 }),
    ).resolves.toHaveProperty('questions');
  });
});

describe('build_mock_topics', () => {
  it('turns the most frequent words into topics with summaries', () => {
    const { topics } = build_mock_topics({ source_text: SOURCE_TEXT, max_topics: 3 });

    expect(topics).toHaveLength(3);
    expect(topics[0].topic).toBe(capitalize(topics[0].topic.toLowerCase()));
    expect(topics[0].summary.toLowerCase()).toContain(topics[0].topic.toLowerCase());
    expect(topics[0].parent_topic).toBe('');
  });

  it('explains when there is not enough text', () => {
    expect(() => build_mock_topics({ source_text: 'Tiny.', max_topics: 3 })).toThrow(expect.objectContaining({ status: 422 }));
  });

  it('capitalizes words', () => {
    expect(capitalize('glucose')).toBe('Glucose');
  });
});
