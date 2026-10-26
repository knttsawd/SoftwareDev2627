import { APP_NAME } from '../config/constants.js';

// "Log in" -> "Log in · StudyApp", the text shown in the browser tab.
export function format_page_title(page_name) {
  return `${page_name} · ${APP_NAME}`;
}

// Sets the browser tab title. React moves <title> into the document <head>.
function PageTitle({ page_name }) {
  return <title>{format_page_title(page_name)}</title>;
}

export default PageTitle;
