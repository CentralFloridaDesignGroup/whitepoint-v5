export interface CxlCategory { id: string; name: string }
export interface CxlLayer { id: string; name: string; categoryId: string }
export function newCategory(name = "New Category"): CxlCategory { return { id: crypto.randomUUID(), name }; }
export function newLayer(categoryId: string, name = "New Layer"): CxlLayer { return { id: crypto.randomUUID(), name, categoryId }; }
