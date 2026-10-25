import type { PageMetadata } from '@whitepoint/utils';

const pages: Record<string, string> = {
  '/': 'Home', '/office': 'Office', '/tools/field-data-parser': 'Field Data Parser', '/tools/cxl-editor': 'CXL Code List Editor',
  '/platting': 'Platting', '/reference/alta-tablea': 'ALTA Table A', '/office/alta-standards': 'ALTA Standards 2026',
  '/documents/employee-handbook': 'Employee Handbook', '/tools/survey-notes': 'Surveyor Notes', '/login': 'Sign in',
};

export function docsMetadata(path: string): PageMetadata {
  const title = pages[path] ?? (path.startsWith('/checklists/') ? 'Survey checklist' : 'Page not found');
  return { title: `${title} | The Compass`, description: `${title} on The Compass, White Point Survey's documentation and field tools.`, noindex: path === '/login' || path === '/tools/survey-notes' };
}
