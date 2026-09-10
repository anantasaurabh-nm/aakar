const { SDUISectionSchema } = require('@erp/shared-contracts');

const section = {
  id: 'all-connections',
  type: 'table',
  label: 'Configured Connections',
  data: { source: 'connectors.connection' },
  toolbar: [
    {
      id: 'create',
      label: 'Add Connection',
      type: 'action',
      action: { type: 'create', target: 'connectors.connection.form' },
    },
    { id: 'search', type: 'search' },
    { id: 'columns', type: 'columns' },
    {
      id: 'refresh',
      label: 'Refresh',
      type: 'action',
      action: { type: 'refresh' },
    },
  ],
  config: {
    columns: [
      {
        key: 'name',
        label: 'Connection Name',
        type: 'text',
        sortable: true,
      },
      {
        key: 'provider',
        label: 'Service / Provider',
        type: 'badge',
        sortable: true,
      },
      {
        key: 'maskedPreview',
        label: 'Configured Credentials',
        type: 'text',
      },
      {
        key: 'status',
        label: 'Status',
        type: 'badge',
        sortable: true,
      },
      {
        key: 'lastTestedStatus',
        label: 'Diagnostic Status',
        type: 'text',
      },
      {
        key: 'updatedAt',
        label: 'Last Modified',
        type: 'datetime',
        sortable: true,
      },
    ],
    rowActions: [
      {
        id: 'view',
        label: 'View / Edit',
        action: { type: 'edit', target: 'connectors.connection.form' },
      },
      {
        id: 'test',
        label: 'Test Connection',
        action: { type: 'action', target: 'connectors.connection.test' },
      },
      {
        id: 'delete',
        label: 'Delete',
        action: { type: 'delete', target: 'connectors.connection.delete' },
      },
    ],
    selectable: true,
    pageSize: 50,
    density: 'comfortable',
    detailView: true,
  },
};

const res = SDUISectionSchema.safeParse(section);
if (!res.success) {
  console.error('Validation failed:', JSON.stringify(res.error.errors, null, 2));
} else {
  console.log('✓ Validation PASSED perfectly!');
}
