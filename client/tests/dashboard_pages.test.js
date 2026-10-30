import { describe, expect, it } from 'vitest';
import { DASHBOARD_PAGES } from '../src/config/dashboard_pages.js';

const REQUIRED_PAGE_LABELS = [
  'Skill map',
  'Learn',
  'Teach the AI student',
  'Quiz',
  'Work block',
  'Schedule',
  'Progress',
  'Settings',
];

describe('DASHBOARD_PAGES', () => {
  it('lists every dashboard page from the spec, in sidebar order', () => {
    expect(DASHBOARD_PAGES.map((page) => page.label)).toEqual(REQUIRED_PAGE_LABELS);
  });

  it('gives each page a unique path and an icon', () => {
    const page_paths = DASHBOARD_PAGES.map((page) => page.path);
    expect(new Set(page_paths).size).toBe(page_paths.length);

    for (const page of DASHBOARD_PAGES) {
      expect(page.icon).toBeTruthy();
    }
  });
});
