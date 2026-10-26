import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { RequireAuth, RequireGuest } from '../components/RouteGuards.jsx';
import { ROUTE_PATHS } from '../config/constants.js';
import { DASHBOARD_PAGES } from '../config/dashboard_pages.js';
import DashboardLayout from '../layouts/DashboardLayout.jsx';
import PublicLayout from '../layouts/PublicLayout.jsx';
import RootLayout from '../layouts/RootLayout.jsx';

// Pages load on demand, so the first visit only downloads the page being opened.
// Layouts and guards load up front because every page needs them.
const HomePage = lazy(() => import('../pages/HomePage.jsx'));
const SignUpPage = lazy(() => import('../pages/SignUpPage.jsx'));
const LoginPage = lazy(() => import('../pages/LoginPage.jsx'));
const LearningQuizPage = lazy(() => import('../pages/LearningQuizPage.jsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));
const SkillMapPage = lazy(() => import('../pages/dashboard/SkillMapPage.jsx'));
const LearnPage = lazy(() => import('../pages/dashboard/LearnPage.jsx'));
const QuizPage = lazy(() => import('../pages/dashboard/QuizPage.jsx'));
const SchedulePage = lazy(() => import('../pages/dashboard/SchedulePage.jsx'));
const WorkBlockPage = lazy(() => import('../pages/dashboard/WorkBlockPage.jsx'));
const TeachPage = lazy(() => import('../pages/dashboard/TeachPage.jsx'));
const ProgressPage = lazy(() => import('../pages/dashboard/ProgressPage.jsx'));
const SettingsPage = lazy(() => import('../pages/dashboard/SettingsPage.jsx'));

// The page component for each entry in DASHBOARD_PAGES, by path. A new dashboard page
// needs an entry in both.
export const DASHBOARD_PAGE_COMPONENTS = {
  'skill-map': SkillMapPage,
  learn: LearnPage,
  teach: TeachPage,
  quiz: QuizPage,
  'work-block': WorkBlockPage,
  schedule: SchedulePage,
  progress: ProgressPage,
  settings: SettingsPage,
};

// The page element for a dashboard entry.
export function get_dashboard_page_element(page) {
  const DashboardPage = DASHBOARD_PAGE_COMPONENTS[page.path];
  return <DashboardPage />;
}

// The whole site map. Guards are layout routes: each one either renders its child
// pages or redirects. Dashboard pages come from DASHBOARD_PAGES.
export const app_routes = [
  {
    path: ROUTE_PATHS.home,
    element: <RootLayout />,
    children: [
      {
        element: <PublicLayout />,
        children: [
          { index: true, element: <HomePage /> },
          {
            element: <RequireGuest offer_learning_quiz />,
            children: [{ path: ROUTE_PATHS.sign_up, element: <SignUpPage /> }],
          },
          {
            element: <RequireGuest />,
            children: [{ path: ROUTE_PATHS.log_in, element: <LoginPage /> }],
          },
          {
            element: <RequireAuth />,
            children: [{ path: ROUTE_PATHS.learning_quiz, element: <LearningQuizPage /> }],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      {
        path: ROUTE_PATHS.dashboard,
        element: <RequireAuth />,
        children: [
          {
            element: <DashboardLayout />,
            children: [
              { index: true, element: <Navigate to={DASHBOARD_PAGES[0].path} replace /> },
              ...DASHBOARD_PAGES.map((page) => ({ path: page.path, element: get_dashboard_page_element(page) })),
            ],
          },
        ],
      },
    ],
  },
];

export function create_app_router() {
  return createBrowserRouter(app_routes);
}
