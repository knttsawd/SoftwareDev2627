import { Link } from 'react-router';
import { get_button_classes } from '../components/button_styles.js';
import PageTitle from '../components/PageTitle.jsx';
import { ROUTE_PATHS } from '../config/constants.js';

// Shown for any address that doesn't match a page.
function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-20">
      <PageTitle page_name="Page not found" />
      <h1 className="text-heading-1 font-bold text-ink">Page not found</h1>
      <p className="text-lead text-ink-muted">We couldn't find that page. It may have moved, or the link may be wrong.</p>
      <Link to={ROUTE_PATHS.home} className={get_button_classes('primary')}>
        Back to the homepage
      </Link>
    </div>
  );
}

export default NotFoundPage;
