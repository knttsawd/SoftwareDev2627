import { screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AUTH_STATUS } from '../src/context/AuthContext.jsx';
import { DASHBOARD_PAGES } from '../src/config/dashboard_pages.js';
import { app_routes, create_app_router, DASHBOARD_PAGE_COMPONENTS, get_dashboard_page_element } from '../src/routes/app_routes.jsx';
import { create_auth_value, render_with_routes } from './helpers/render_helpers.jsx';
import { NEW_ACCOUNT, TEST_ACCOUNT } from './helpers/test_data.js';

vi.mock('../src/services/skill_service.js', () => ({ fetch_skills: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/services/topic_service.js', () => ({
  fetch_topic_map: vi.fn().mockResolvedValue({ topics: [], suggestions: [] }),
}));
vi.mock('../src/services/progress_service.js', () => ({ fetch_progress: vi.fn(() => new Promise(() => {})) }));
vi.mock('../src/services/study_material_service.js', () => ({
  fetch_ai_status: vi.fn().mockResolvedValue({ ai_provider: 'mock', transcription_provider: 'mock' }),
}));

const PAGE_LOAD_TIMEOUT_MS = 5000;
const PRELOAD_TIMEOUT_MS = 30_000;

// The pages are lazily loaded, and compiling them the first time can take several seconds
// when many test files run at once. Loading them once up front keeps each test's timing
// about rendering, not compiling.
beforeAll(async () => {
  await Promise.all([
    import('../src/pages/HomePage.jsx'),
    import('../src/pages/SignUpPage.jsx'),
    import('../src/pages/LoginPage.jsx'),
    import('../src/pages/NotFoundPage.jsx'),
    import('../src/pages/dashboard/ProgressPage.jsx'),
    import('../src/pages/dashboard/SkillMapPage.jsx'),
    import('../src/pages/dashboard/QuizPage.jsx'),
  ]);
}, PRELOAD_TIMEOUT_MS);

const SIGNED_IN = create_auth_value({ status: AUTH_STATUS.signed_in, account: TEST_ACCOUNT });

// Renders the real site map at a path and waits for the lazily loaded page to appear.
async function open_page(initial_path, auth_value) {
  const rendered = render_with_routes(app_routes, { initial_path, auth_value });
  await screen.findByRole('heading', { level: 1 }, { timeout: PAGE_LOAD_TIMEOUT_MS });
  return rendered;
}

describe('app_routes', () => {
  it('shows the homepage at /', async () => {
    await open_page('/');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Study smarter');
  });

  it('shows sign up and login to visitors', async () => {
    await open_page('/signup');
    expect(screen.getByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument();
  });

  it('sends visitors from the dashboard to login', async () => {
    const { router } = await open_page('/dashboard/schedule');

    expect(router.state.location.pathname).toBe('/login');
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
  });

  it('opens the first dashboard page, the built Skill map page, at /dashboard', async () => {
    const { router } = await open_page('/dashboard', SIGNED_IN);

    expect(router.state.location.pathname).toBe('/dashboard/skill-map');
    expect(screen.getByRole('heading', { level: 1, name: 'Skill map' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Add your first skill' })).toBeInTheDocument();
  });

  it('builds a route for every dashboard page', async () => {
    await open_page('/dashboard/progress', SIGNED_IN);

    expect(screen.getByRole('heading', { level: 1, name: 'Progress' })).toBeInTheDocument();
  });

  it('lets a student who skipped the quiz into the dashboard, with a reminder', async () => {
    await open_page('/dashboard/progress', create_auth_value({ status: AUTH_STATUS.signed_in, account: NEW_ACCOUNT }));

    expect(screen.getByRole('heading', { level: 1, name: 'Progress' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Learning style quiz reminder' })).toBeInTheDocument();
  });

  it('shows the not found page for unknown addresses', async () => {
    await open_page('/no-such-page');

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('get_dashboard_page_element', () => {
  it('has a page component for every dashboard page', () => {
    for (const page of DASHBOARD_PAGES) {
      expect(get_dashboard_page_element(page).type).toBe(DASHBOARD_PAGE_COMPONENTS[page.path]);
    }
    expect(Object.keys(DASHBOARD_PAGE_COMPONENTS)).toHaveLength(DASHBOARD_PAGES.length);
  });
});

describe('create_app_router', () => {
  it('creates a browser router for the site map', () => {
    const app_router = create_app_router();

    expect(app_router.routes[0].path).toBe('/');
    app_router.dispose();
  });
});
