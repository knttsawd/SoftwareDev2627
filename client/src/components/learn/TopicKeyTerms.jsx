import { Link } from 'react-router';
import { use_api_data } from '../../hooks/use_api_data.js';
import { fetch_glossary } from '../../services/learning_service.js';
import { build_learn_path } from '../../utils/study_paths.js';
import AlertMessage from '../AlertMessage.jsx';

// The key terms that belong to one topic, shown in its details on the skill map, with a
// link to the skill's full list. Heading is the heading element ('h3' or 'h4').
function TopicKeyTerms({ skill_id, topic_id, Heading }) {
  const terms_state = use_api_data(() => fetch_glossary(skill_id), [skill_id]);
  const topic_terms = (terms_state.data ?? []).filter((glossary_term) => glossary_term.topic_id === topic_id);
  const terms_path = build_learn_path({ skill_id, tab: 'terms' });

  return (
    <section aria-label="Key terms" className="flex flex-col gap-2">
      <Heading className="text-lead font-semibold text-ink">Key terms</Heading>
      {terms_state.error && <AlertMessage>{terms_state.error}</AlertMessage>}
      {terms_state.data && topic_terms.length === 0 && (
        <p className="text-small text-ink-muted">
          No key terms for this topic yet.{' '}
          <Link to={terms_path} className="font-semibold text-brand-700 underline">
            Find key terms
          </Link>
        </p>
      )}
      {topic_terms.length > 0 && (
        <>
          <dl className="flex flex-col gap-2">
            {topic_terms.map((glossary_term) => (
              <div key={glossary_term.id} className="rounded-lg border border-border bg-surface px-3 py-2">
                <dt className="text-small font-semibold text-ink">{glossary_term.term}</dt>
                <dd className="text-small text-ink">{glossary_term.definition}</dd>
              </div>
            ))}
          </dl>
          <Link to={terms_path} className="self-start text-small font-semibold text-brand-700 underline">
            All key terms
          </Link>
        </>
      )}
    </section>
  );
}

export default TopicKeyTerms;
