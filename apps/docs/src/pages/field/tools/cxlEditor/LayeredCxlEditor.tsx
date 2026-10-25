import { useMemo, useState } from "react";
import { downloadBlob } from "@whitepoint/utils/browser-files";
import { Button, Textbox } from "@whitepoint/ui/input";
import { AlertTriangle, Copy, Download, Layers, Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { GisDisclaimer } from "@whitepoint/ui/layout";
import { newCodeEntry } from "./types";
import { buildFilename, buildLayeredCxlXml, validateLayeredCodes, type LayeredCode } from "./layeredCxlBuilder";
import { newCategory, newLayer, type CxlCategory, type CxlLayer } from "./layeredModel";
import { LayeredCodeForm } from "./LayeredCodeForm";

function makeCode(layerId: string): LayeredCode { return { ...newCodeEntry(), layerId }; }
export function LayeredCxlEditor() {
  const first = useMemo(() => newCategory("Uncategorized"), []);
  const [categories, setCategories] = useState<CxlCategory[]>([first]);
  const [layers, setLayers] = useState<CxlLayer[]>([]);
  const [codes, setCodes] = useState<LayeredCode[]>([]);
  const [categoryId, setCategoryId] = useState(first.id);
  const [layerId, setLayerId] = useState("");
  const [editing, setEditing] = useState<LayeredCode | null>(null);
  const [autoLayerId, setAutoLayerId] = useState("");
  const [listName, setListName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const shownLayers = layers.filter((layer) => layer.categoryId === categoryId);
  const shownCodes = codes.filter((code) => !layerId || code.layerId === layerId).filter((code) => layers.find((layer) => layer.id === code.layerId)?.categoryId === categoryId);
  const addLayer = (forPoint = false) => { const item = newLayer(categoryId, forPoint ? "New point layer" : "New Layer"); setLayers((all) => [...all, item]); setLayerId(item.id); if (forPoint) { setAutoLayerId(item.id); setEditing(makeCode(item.id)); } };
  const saveCode = (code: LayeredCode) => { setCodes((all) => all.some((item) => item.id === code.id) ? all.map((item) => item.id === code.id ? code : item) : [...all, code]); if (autoLayerId === code.layerId) setLayers((all) => all.map((layer) => layer.id === autoLayerId ? { ...layer, name: code.shortCode.trim() } : layer)); setAutoLayerId(""); setEditing(null); setLayerId(code.layerId); };
  const download = () => { const found = validateLayeredCodes(codes, layers, categories); setErrors(found); if (found.length) return; const blob = new Blob([buildLayeredCxlXml(listName, description, codes, layers, categories)], { type: "application/xml" }); downloadBlob(blob, buildFilename(listName)); };
  return <div className="mx-auto max-w-[1600px] px-4 py-8">
    <GisDisclaimer markdownFile="/documents/field/cxl-editor-disclaimer.md" cookieName="cxl-editor-disclaimer-acknowledged" title="CXL Code List Editor - Disclaimer" />
    <header className="mb-6 flex justify-between gap-4"><div><h1 className="text-3xl font-bold ">CXL Code List Editor</h1><p className="mt-2 text-gray-600 ">Organize point codes by category and shared or point-specific layers.</p></div><Button icon={Mail} variant="secondary" size="small" onClick={() => { window.location.href = "mailto:support@cfdgsoftware.com?subject=CXL%20Editor%20Issue"; }} >Report an Issue</Button></header>
    <div className="mb-6 grid gap-4 rounded-lg bg-white p-4 shadow  md:grid-cols-2"><Textbox name="listName" label="List Name" value={listName} onChange={(event) => setListName(event.target.value)} /><Textbox name="description" label="Description" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
    <div className="grid min-h-[600px] overflow-hidden rounded-lg bg-white shadow  lg:grid-cols-[220px_240px_minmax(0,1fr)]">
      <aside className="border-b p-4  lg:border-b-0 lg:border-r"><div className="mb-3 flex justify-between"><h2 className="font-semibold">Categories</h2><button onClick={() => { const item = newCategory(); setCategories((all) => [...all, item]); setCategoryId(item.id); setLayerId(""); }}><Plus className="h-4 w-4" /></button></div>{categories.map((category) => <div key={category.id} className={`mb-2 rounded p-2 ${categoryId === category.id ? "bg-primary/10" : ""}`}><button className="w-full text-left text-sm" onClick={() => { setCategoryId(category.id); setLayerId(""); }}>{category.name || "Unnamed"}</button>{categoryId === category.id && <input className="mt-2 w-full border-b bg-transparent text-sm" value={category.name} onChange={(e) => setCategories((all) => all.map((item) => item.id === category.id ? { ...item, name: e.target.value } : item))} />}</div>)}</aside>
      <aside className="border-b p-4  lg:border-b-0 lg:border-r"><div className="mb-3 flex justify-between"><h2 className="font-semibold">Layers</h2><button onClick={() => addLayer()}><Plus className="h-4 w-4" /></button></div><button className={`mb-2 w-full rounded p-2 text-left text-sm ${!layerId ? "bg-primary/10" : ""}`} onClick={() => setLayerId("")}>All category codes</button>{shownLayers.map((layer) => <div key={layer.id} className={`mb-2 rounded p-2 ${layerId === layer.id ? "bg-primary/10" : ""}`}><button className="flex w-full gap-2 text-left text-sm" onClick={() => setLayerId(layer.id)}><Layers className="h-4 w-4" />{layer.name || "Unnamed"}</button>{layerId === layer.id && <input className="mt-2 w-full border-b bg-transparent text-sm" value={layer.name} onChange={(e) => setLayers((all) => all.map((item) => item.id === layer.id ? { ...item, name: e.target.value } : item))} />}</div>)}</aside>
      <main className="p-5">{editing ? <LayeredCodeForm initialCode={editing} layers={layers} onSave={saveCode} onCancel={() => { if (autoLayerId) setLayers((all) => all.filter((item) => item.id !== autoLayerId)); setAutoLayerId(""); setEditing(null); }} /> : <><div className="mb-4 flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">Point Codes</h2><div className="flex gap-2"><Button icon={Layers} variant="secondary" size="small" onClick={() => addLayer(true)} >Add with Point Layer</Button><Button icon={Plus} variant="primary" size="small" onClick={() => layerId && setEditing(makeCode(layerId))} >Add to Selected Layer</Button></div></div>{!layerId && <p className="mb-4 text-sm text-amber-700">Select a layer to add a code, or create a point-specific layer.</p>}<div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left text-gray-500"><th className="py-2">Code</th><th>Description</th><th>Layer</th><th>Fields</th><th /></tr></thead><tbody>{shownCodes.map((code) => <tr key={code.id} className="border-b "><td className="py-3 font-medium">{code.shortCode}</td><td>{code.description}</td><td>{layers.find((item) => item.id === code.layerId)?.name}</td><td>{code.fields.length}</td><td><div className="flex justify-end gap-3"><button onClick={() => setEditing(structuredClone(code))}><Pencil className="h-4 w-4" /></button><button onClick={() => setCodes((all) => [...all, { ...structuredClone(code), id: crypto.randomUUID(), shortCode: `${code.shortCode} copy` }])}><Copy className="h-4 w-4" /></button><button onClick={() => setCodes((all) => all.filter((item) => item.id !== code.id))}><Trash2 className="h-4 w-4 text-red-600" /></button></div></td></tr>)}</tbody></table></div></>}</main>
    </div>
    {errors.length > 0 && <div className="mt-6 rounded border border-red-200 bg-red-50 p-4 text-red-700"><div className="mb-2 flex gap-2 font-medium"><AlertTriangle className="h-5 w-5" />Fix these items:</div><ul className="list-disc pl-6">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
    <div className="mt-6 flex justify-end"><Button icon={Download} variant="primary" size="medium" onClick={download} >Download .cxl File</Button></div>
  </div>;
}
