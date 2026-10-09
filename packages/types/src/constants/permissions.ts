import catalog from './permissions.json';

/** The JSON catalog is the single source of truth for permission keys and labels. */
export const PERMISSION_CATALOG: PermissionGroup[] = catalog;
export const PERMISSION_KEYS = PERMISSION_CATALOG.flatMap(group => group.permissions.map(permission => permission.key));
export type Permission = string;
export type PermissionEntry = { key: string; displayName: string; description: string };
export type PermissionGroup = { key: string; displayName: string; description: string; permissions: PermissionEntry[] };
