import { describe, expect, it } from 'vitest';
import { validateSDUIResponse } from './page';

function validRawPage() {
  return {
    schema: '1.0',
    brand: { name: 'Todo', icon: 'todo' },
    navigation: { items: [] },
    page: {
      id: 'todo',
      title: 'Todo',
      sections: [
        {
          id: 'todo-insights',
          label: 'Insights',
          type: 'dashboard',
          toolbar: [],
          config: { cards: [], charts: [] },
        },
        {
          id: 'todo-tasks',
          label: 'Tasks',
          type: 'table',
          toolbar: [],
          config: { columns: [], selectable: false, pageSize: 10, density: 'comfortable' },
        },
      ],
    },
  };
}

describe('validateSDUIResponse', () => {
  it('accepts a well-formed page and validates each section', () => {
    const result = validateSDUIResponse(validRawPage());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.page.page.sections).toHaveLength(2);
      expect(result.page.brand.name).toBe('Todo');
    }
  });

  it('rejects an unsupported schema version', () => {
    const raw = { ...validRawPage(), schema: '2.0' };
    const result = validateSDUIResponse(raw);
    expect(result.ok).toBe(false);
  });

  it('isolates an invalid section instead of failing the whole page', () => {
    const raw = validRawPage();
    // @ts-expect-error intentionally invalid: table config missing required shape
    raw.page.sections.push({ id: 'broken', label: 'Broken', type: 'table' });
    const result = validateSDUIResponse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const sections = result.page.page.sections;
      expect(sections).toHaveLength(3);
      const broken = sections.find((s) => s.id === 'broken');
      expect(broken && 'invalid' in broken && broken.invalid).toBe(true);
      // valid sections still render
      expect(sections.find((s) => s.id === 'todo-tasks' && !('invalid' in s))).toBeTruthy();
    }
  });

  it('rejects an unknown section type as invalid rather than crashing', () => {
    const raw = validRawPage();
    raw.page.sections.push({ id: 'weird', label: 'Weird', type: 'kanban', toolbar: [], config: {} } as never);
    const result = validateSDUIResponse(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const weird = result.page.page.sections.find((s) => s.id === 'weird');
      expect(weird && 'invalid' in weird && weird.invalid).toBe(true);
    }
  });
});
