import { useState } from "react";
import { Button, Checkbox, Textbox } from "@whitepoint/ui/input";
import { Plus, Trash2, X } from "lucide-react";
import { DATASET_TYPE_OPTIONS, ENTER_METHOD_OPTIONS, FILED_TYPE_OPTIONS, SYMBOL_OPTIONS, newFieldEntry, type FieldEntry } from "./types";
import type { CxlLayer } from "./layeredModel";
import type { LayeredCode } from "./layeredCxlBuilder";

const selectClass = "block w-full bg-gray-50/20 py-1 pl-2 text-gray-900 border-b border-gray-300 focus:border-primary focus:outline-none   ";
export function LayeredCodeForm({ initialCode, layers, onSave, onCancel }: { initialCode: LayeredCode; layers: CxlLayer[]; onSave: (code: LayeredCode) => void; onCancel: () => void }) {
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState("");
  const updateField = (id: string, patch: Partial<FieldEntry>) => setCode((current) => ({ ...current, fields: current.fields.map((field) => field.id === id ? { ...field, ...patch } : field) }));
  const save = () => {
    if (!code.shortCode.trim() || !code.description.trim() || !code.layerId) { setError("Point code, description, and layer are required."); return; }
    if (code.fields.some((field) => !field.fieldName.trim())) { setError("Every attribute field needs a name."); return; }
    onSave(code);
  };
  return <div className="space-y-6">
    <div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-gray-900 ">{initialCode.shortCode ? `Edit ${initialCode.shortCode}` : "Add Point Code"}</h2><button type="button" onClick={onCancel} aria-label="Close editor"><X className="h-5 w-5" /></button></div>
    {error && <p className="text-sm text-red-600 ">{error}</p>}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Textbox name="shortCode" label="Point Code" required value={code.shortCode} onChange={(event) => setCode((current) => ({ ...current, shortCode: event.target.value }))} />
      <Textbox name="description" label="Description" required value={code.description} onChange={(event) => setCode((current) => ({ ...current, description: event.target.value }))} />
      <div><label className="mb-2 block text-sm font-medium">Layer</label><select className={selectClass} value={code.layerId} onChange={(event) => setCode((current) => ({ ...current, layerId: event.target.value }))}>{layers.map((layer) => <option key={layer.id} value={layer.id}>{layer.name}</option>)}</select></div>
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <div><label className="mb-2 block text-sm font-medium">Feature Type</label><select className={selectClass} value={code.datasetType} onChange={(e) => setCode((c) => ({ ...c, datasetType: e.target.value as LayeredCode["datasetType"] }))}>{DATASET_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.key}</option>)}</select></div>
      <div><label className="mb-2 block text-sm font-medium">Symbol</label><select className={selectClass} value={code.symbolStyleId} onChange={(e) => setCode((c) => ({ ...c, symbolStyleId: e.target.value }))}>{SYMBOL_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
      <div><label className="mb-2 block text-sm font-medium">Color</label><input className="h-9 w-full" type="color" value={code.symbolColor} onChange={(e) => setCode((c) => ({ ...c, symbolColor: e.target.value }))} /></div>
      <Textbox name="symbolSize" label="Size" type="number" value={String(code.symbolSize)} onChange={(event) => setCode((c) => ({ ...c, symbolSize: Number(event.target.value) || 1 }))} />
    </div>
    <div><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Attribute Fields</h3><Button icon={Plus} variant="secondary" size="small" onClick={() => setCode((c) => ({ ...c, fields: [...c.fields, newFieldEntry()] }))} >Add Field</Button></div>
      <div className="space-y-4">{code.fields.map((field) => <div key={field.id} className="space-y-3 rounded border border-gray-200 p-4 ">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4"><Textbox name={`field-${field.id}`} label="Field Name" required value={field.fieldName} onChange={(event) => updateField(field.id, { fieldName: event.target.value })} /><div><label className="mb-2 block text-sm font-medium">Type</label><select className={selectClass} value={field.filedType} onChange={(e) => updateField(field.id, { filedType: e.target.value as FieldEntry["filedType"] })}>{FILED_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.key}</option>)}</select></div><div><label className="mb-2 block text-sm font-medium">Entry Method</label><select className={selectClass} value={field.enterMethod} onChange={(e) => updateField(field.id, { enterMethod: e.target.value as FieldEntry["enterMethod"] })}>{ENTER_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.key}</option>)}</select></div><Textbox name={`default-${field.id}`} label="Default Value" value={field.fieldDefaultValue} onChange={(event) => updateField(field.id, { fieldDefaultValue: event.target.value })} /></div>
        <div className="flex items-center justify-between"><Checkbox label="Required" checked={field.isRequired} onChange={(e) => updateField(field.id, { isRequired: e.target.checked })} /><button type="button" onClick={() => setCode((c) => ({ ...c, fields: c.fields.filter((item) => item.id !== field.id) }))} aria-label="Remove field"><Trash2 className="h-4 w-4 text-red-600" /></button></div>
        {field.enterMethod !== "0" && <Textbox name={`values-${field.id}`} label="Menu Options (comma separated)" value={field.values.join(", ")} onChange={(event) => updateField(field.id, { values: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />}
      </div>)}</div>
    </div>
    <div className="flex justify-end gap-3"><Button variant="secondary" size="medium" onClick={onCancel} >Cancel</Button><Button variant="primary" size="medium" onClick={save} >Save Code</Button></div>
  </div>;
}
