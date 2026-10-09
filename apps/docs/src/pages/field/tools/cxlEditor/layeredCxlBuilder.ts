import { buildCxlXml, buildFilename, generateId, validateCodes } from "./cxlBuilder";
import type { CodeEntry } from "./types";
import type { CxlCategory, CxlLayer } from "./layeredModel";
export interface LayeredCode extends Omit<CodeEntry, "category"> { layerId: string }
function categoryFor(code: LayeredCode, layers: CxlLayer[], categories: CxlCategory[]): string {
  const layer = layers.find((item) => item.id === code.layerId);
  return categories.find((item) => item.id === layer?.categoryId)?.name.trim() || "__no_category__";
}
function legacyCodes(codes: LayeredCode[], layers: CxlLayer[], categories: CxlCategory[]): CodeEntry[] {
  return codes.map((code) => ({ ...code, category: categoryFor(code, layers, categories) }));
}
export function validateLayeredCodes(codes: LayeredCode[], layers: CxlLayer[], categories: CxlCategory[]): string[] {
  const errors = validateCodes(legacyCodes(codes, layers, categories));
  if (categories.some((item) => !item.name.trim())) errors.push("Every category needs a name.");
  if (layers.some((item) => !item.name.trim())) errors.push("Every layer needs a name.");
  layers.forEach((layer) => { if (!categories.some((item) => item.id === layer.categoryId)) errors.push(`Layer "${layer.name}" needs a category.`); });
  codes.forEach((code) => { if (!layers.some((item) => item.id === code.layerId)) errors.push(`${code.shortCode || "Code"}: select a layer.`); });
  return [...new Set(errors)];
}
export function buildLayeredCxlXml(listName: string, description: string, codes: LayeredCode[], layers: CxlLayer[], categories: CxlCategory[]): string {
  const xml = buildCxlXml(listName, description, legacyCodes(codes, layers, categories));
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const ns = "http://www.huacenav.com";
  const infos = Array.from(doc.getElementsByTagNameNS(ns, "LayerInfo"));
  const cad = Array.from(doc.getElementsByTagNameNS(ns, "CadLayer")).filter((item) => item.getElementsByTagNameNS(ns, "LayerName")[0]?.textContent !== "0");
  const ids = new Map(layers.map((layer) => [layer.id, generateId()]));
  codes.forEach((code, index) => { const target = infos[index]?.getElementsByTagNameNS(ns, "LayerName")[0]; if (target) target.textContent = ids.get(code.layerId) || generateId(); });
  cad.forEach((item, index) => {
    const code = codes[index];
    const layer = layers.find((entry) => entry.id === code?.layerId);
    if (!code || !layer || codes.findIndex((entry) => entry.layerId === code.layerId) !== index) { item.remove(); return; }
    const name = item.getElementsByTagNameNS(ns, "LayerName")[0];
    const alias = item.getElementsByTagNameNS(ns, "LayerAlias")[0];
    if (name) name.textContent = ids.get(layer.id) || generateId();
    if (alias) alias.textContent = layer.name.trim();
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(doc.documentElement)}`;
}
export { buildFilename };
