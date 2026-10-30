// Small text helpers shared by source selection and the mock AI. No AI involved: just
// splitting text up and counting words.

// Common words that say nothing about what a text is about.
export const STOP_WORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been before being below ' +
    'between both but by can could did do does doing down during each few for from further had has have having ' +
    'he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor ' +
    'not now of off on once only or other our ours ourselves out over own same she should so some such than that ' +
    'the their theirs them themselves then there these they this those through to too under until up very was we ' +
    'were what when where which while who whom why will with would you your yours yourself yourselves one two ' +
    'many much may might must shall like used using use make makes made often well within without'
  ).split(' '),
);

const MIN_SENTENCE_LENGTH = 30;
const MAX_SENTENCE_LENGTH = 300;
const MIN_KEYWORD_LENGTH = 5;
const SENTENCE_BOUNDARY = /(?<=[.!?])\s+|\n+/;
const WORD_PATTERN = /[a-z0-9]+(?:'[a-z]+)?/g;

// Lowercase words in reading order.
export function split_into_words(text) {
  return text.toLowerCase().match(WORD_PATTERN) ?? [];
}

// The meaningful words in a topic, e.g. "The water cycle" -> ["water", "cycle"].
export function get_topic_words(topic) {
  return [...new Set(split_into_words(topic).filter((word) => !STOP_WORDS.has(word)))];
}

// Sentences of a sensible length to quote, in reading order. Very short fragments
// (headings, labels) and very long run-ons are skipped.
export function split_into_sentences(text) {
  return text
    .split(SENTENCE_BOUNDARY)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= MIN_SENTENCE_LENGTH && sentence.length <= MAX_SENTENCE_LENGTH);
}

// How many times any of topic_words appears in text.
export function count_topic_matches(text, topic_words) {
  const topic_word_set = new Set(topic_words);
  return split_into_words(text).filter((word) => topic_word_set.has(word)).length;
}

// The most frequent meaningful words (at least five letters) in text, most frequent first.
// Ties keep the order the words first appear in.
export function find_keywords(text, keyword_limit) {
  const word_counts = new Map();
  for (const word of split_into_words(text)) {
    if (word.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(word) && !/^\d+$/.test(word)) {
      word_counts.set(word, (word_counts.get(word) ?? 0) + 1);
    }
  }
  return [...word_counts.entries()]
    .sort((first_entry, second_entry) => second_entry[1] - first_entry[1])
    .slice(0, keyword_limit)
    .map(([word]) => word);
}
