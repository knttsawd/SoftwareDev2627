import Markdown from 'react-markdown';
import { Link } from 'react-router';

// Styles for each Markdown element, using the theme tokens. react-markdown never renders
// raw HTML from the text, so AI output can't inject scripts or markup into the page.
const MARKDOWN_COMPONENTS = {
  h1: ({ children }) => <h3 className="text-heading-3 font-bold text-ink">{children}</h3>,
  h2: ({ children }) => <h4 className="mt-2 text-lead font-semibold text-ink">{children}</h4>,
  h3: ({ children }) => <h5 className="text-body font-semibold text-ink">{children}</h5>,
  p: ({ children }) => <p className="text-body text-ink">{children}</p>,
  ul: ({ children }) => <ul className="ml-5 list-disc space-y-1 text-body text-ink">{children}</ul>,
  ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1 text-body text-ink">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-brand-200 pl-3 text-small text-ink-muted">{children}</blockquote>
  ),
  // Links to the app's own pages (the assistant links to what it made) open in place;
  // anything else opens in a new tab.
  a: ({ href, children }) =>
    href?.startsWith('/') ? (
      <Link to={href} className="font-semibold text-brand-700 underline">
        {children}
      </Link>
    ) : (
      <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline">
        {children}
      </a>
    ),
};

// Shows AI-written Markdown notes. Headings are shifted down a level (# becomes h3) so
// they fit under the page's own h1 and h2 headings.
function MarkdownContent({ markdown_text }) {
  return (
    <div className="flex flex-col gap-3">
      <Markdown components={MARKDOWN_COMPONENTS}>{markdown_text}</Markdown>
    </div>
  );
}

export default MarkdownContent;
