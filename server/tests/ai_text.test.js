import { describe, expect, it } from 'vitest';
import {
  get_note_style_instruction,
  get_study_tip,
  DEFAULT_STUDY_TIP,
} from '../services/ai/learning_style_hints.js';
import {
  SOURCE_LABEL_PREFIX,
  select_overview_text,
  select_source_text,
  split_into_chunks,
} from '../services/ai/source_selection.js';
import {
  count_topic_matches,
  find_keywords,
  get_topic_words,
  split_into_sentences,
  split_into_words,
} from '../services/ai/text_analysis.js';

describe('text analysis', () => {
  it('splits text into lowercase words', () => {
    expect(split_into_words("Plants don't eat; they MAKE food.")).toEqual(['plants', "don't", 'eat', 'they', 'make', 'food']);
  });

  it('keeps only the meaningful words of a topic', () => {
    expect(get_topic_words('The water cycle and the WATER table')).toEqual(['water', 'cycle', 'table']);
  });

  it('splits sentences, skipping fragments and run-ons', () => {
    const text = `Short. This sentence is long enough to count as a sentence. ${'x'.repeat(301)}.\nAnother sentence that is long enough here.`;

    expect(split_into_sentences(text)).toEqual([
      'This sentence is long enough to count as a sentence.',
      'Another sentence that is long enough here.',
    ]);
  });

  it('counts topic word matches', () => {
    expect(count_topic_matches('Water falls as rain and water evaporates', ['water', 'rain'])).toBe(3);
  });

  it('finds the most frequent meaningful words', () => {
    expect(find_keywords('glucose energy glucose plants energy glucose about about 12345', 2)).toEqual(['glucose', 'energy']);
  });
});

describe('source selection', () => {
  it('packs paragraphs into chunks and cuts very long paragraphs', () => {
    expect(split_into_chunks('aaaa\n\nbbbb\n\ncccc', 10)).toEqual(['aaaa\n\nbbbb', 'cccc']);
    expect(split_into_chunks('x'.repeat(25), 10)).toEqual(['x'.repeat(10), 'x'.repeat(10), 'x'.repeat(5)]);
  });

  it('chooses the chunks that mention the topic, labels them and keeps reading order', () => {
    const sources = [
      { title: 'Plants', extracted_text: 'Photosynthesis makes glucose.\n\nRoots absorb water.' },
      { title: 'Cells', extracted_text: 'Mitochondria release energy from glucose.' },
    ];

    const chosen_text = select_source_text(sources, 'glucose', { max_characters: 80, chunk_size: 45 });

    expect(chosen_text).toContain(`${SOURCE_LABEL_PREFIX}Plants]\nPhotosynthesis makes glucose.`);
    expect(chosen_text).toContain(`${SOURCE_LABEL_PREFIX}Cells]\nMitochondria release energy from glucose.`);
    expect(chosen_text).not.toContain('Roots');
    expect(chosen_text.indexOf('Plants')).toBeLessThan(chosen_text.indexOf('Cells'));
  });

  it('uses the earliest chunks when nothing matches the topic', () => {
    const sources = [{ title: 'Notes', extracted_text: 'First part.\n\nSecond part.' }];

    expect(select_source_text(sources, 'Overview', { max_characters: 15, chunk_size: 12 })).toBe(
      `${SOURCE_LABEL_PREFIX}Notes]\nFirst part.`,
    );
  });
});

describe('learning style hints', () => {
  it('gives a tip and a note instruction per learning style, with defaults', () => {
    expect(get_study_tip('visual')).toMatch('mind map');
    expect(get_study_tip(null)).toBe(DEFAULT_STUDY_TIP);
    expect(get_note_style_instruction('hands_on')).toMatch('worked examples');
    expect(get_note_style_instruction(undefined)).toBe('');
  });
});

describe('select_overview_text', () => {
  it('takes chunks from every resource in turn and returns them in reading order', () => {
    const sources = [
      { title: 'Long', extracted_text: 'First long part.\n\nSecond long part.\n\nThird long part.' },
      { title: 'Short', extracted_text: 'Only short part.' },
    ];

    const overview_text = select_overview_text(sources, { max_characters: 60, chunk_size: 20 });

    expect(overview_text).toBe(
      `${SOURCE_LABEL_PREFIX}Long]\nFirst long part.\n\n${SOURCE_LABEL_PREFIX}Long]\nSecond long part.\n\n${SOURCE_LABEL_PREFIX}Short]\nOnly short part.`,
    );
  });
});
