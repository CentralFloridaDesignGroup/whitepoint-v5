import type { PageMetadata } from '@whitepoint/utils';

const pages: Record<string, string> = {
  '/login': 'Sign in', '/dashboard': 'Dashboard', '/search': 'Search', '/me': 'My account',
  '/client': 'Clients', '/client/new': 'New client', '/project': 'Projects', '/project/new': 'New project',
  '/timesheets': 'Timesheets', '/timesheets/review': 'Timesheet review', '/timesheets/invoice-pool': 'Invoice pool',
  '/invoices': 'Invoices', '/invoices/payments': 'Payment reconciliation',
  '/settings': 'Application settings', '/settings/users': 'Users', '/settings/users/new': 'New user',
  '/settings/roles': 'Roles and permissions', '/settings/qbo': 'QuickBooks settings', '/settings/rates': 'Billing rates',
};

export function manageMetadata(path: string): PageMetadata {
  const title = pages[path] ?? (path.startsWith('/client/') ? 'Client record' : path.startsWith('/project/') ? 'Project record' : path.startsWith('/invoices/') ? 'Invoice detail' : path.startsWith('/timesheets/') ? 'Timesheet detail' : path.startsWith('/settings/users/') ? 'User detail' : 'Page not found');
  return { title: `${title} | NorthStar`, description: `${title} in White Point Survey's NorthStar management application.`, noindex: true };
}
