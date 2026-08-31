import { isInvalidSection, type SDUISectionOrInvalid } from '@erp/shared-contracts';
import { Dashboard } from './Dashboard';
import { DataTable } from './DataTable';
import { DynamicForm } from './DynamicForm';
import { AppsGrid } from './AppsGrid';
import { SettingsView } from './SettingsView';

/**
 * Controlled section-type -> component registry (SDUI PRD §2, stack.md §3.2).
 * The server sends `type: "table"`; only this map decides that means DataTable.
 */
export function SDUISectionRenderer({ section }: { section: SDUISectionOrInvalid }) {
  if (isInvalidSection(section)) {
    return (
      <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
        <strong style={{ color: 'var(--text-primary)' }}>{section.label}</strong>
        <p style={{ marginTop: 6 }}>This section isn't available right now.</p>
      </div>
    );
  }

  switch (section.type) {
    case 'dashboard':
      return <Dashboard section={section} />;
    case 'table':
      return section.config.presentation === 'grid' ? <AppsGrid /> : <DataTable section={section} />;
    case 'form':
      return (
        <div style={{ padding: 20 }}>
          <DynamicForm config={section.config} onCancel={() => {}} onSuccess={() => {}} />
        </div>
      );
    case 'settings':
      return <SettingsView section={section} />;
    default:
      // Unknown section types fail safely instead of crashing the page.
      return (
        <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 14 }}>
          Unsupported section type.
        </div>
      );
  }
}
