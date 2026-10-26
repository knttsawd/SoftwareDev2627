import { Brain, CalendarDays, ClipboardCheck, GraduationCap, Network, Settings, Timer, TrendingUp } from 'lucide-react';

// Every dashboard page, in sidebar order. The router builds one route per entry (using
// DASHBOARD_PAGE_COMPONENTS in routes/app_routes.jsx), so adding a page here adds both
// its sidebar link and its route.
export const DASHBOARD_PAGES = [
  {
    path: 'skill-map',
    label: 'Skill map',
    icon: Network,
  },
  {
    path: 'learn',
    label: 'Learn',
    icon: Brain,
  },
  {
    path: 'teach',
    label: 'Teach the AI student',
    icon: GraduationCap,
  },
  {
    path: 'quiz',
    label: 'Quiz',
    icon: ClipboardCheck,
  },
  {
    path: 'work-block',
    label: 'Work block',
    icon: Timer,
  },
  {
    path: 'schedule',
    label: 'Schedule',
    icon: CalendarDays,
  },
  {
    path: 'progress',
    label: 'Progress',
    icon: TrendingUp,
  },
  {
    path: 'settings',
    label: 'Settings',
    icon: Settings,
  },
];
