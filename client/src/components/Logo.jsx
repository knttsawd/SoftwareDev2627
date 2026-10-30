import { Link } from 'react-router';
import { APP_NAME } from '../config/constants.js';

// The StudyApp mark and name, linking to to_path. The image is decorative because the
// visible name already labels the link.
function Logo({ to_path }) {
  return (
    <Link to={to_path} className="inline-flex items-center gap-2 rounded-lg font-display text-heading-3 font-bold text-ink">
      <img src="/icons/logo.svg" alt="" className="h-9 w-9" />
      <span>{APP_NAME}</span>
    </Link>
  );
}

export default Logo;
