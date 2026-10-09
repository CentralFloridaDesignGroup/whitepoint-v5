export type DatasetType = "1" | "3";

export const DATASET_TYPE_OPTIONS: { key: string; value: DatasetType }[] = [
  { key: "Point only", value: "1" },
  { key: "Point + Region/Line", value: "3" },
];

export type FiledType = "4" | "7" | "10" | "1" | "8";

export const FILED_TYPE_OPTIONS: { key: string; value: FiledType }[] = [
  { key: "Integer Number", value: "4" },
  { key: "Real Number", value: "7" },
  { key: "Text", value: "10" },
  { key: "Yes/No", value: "1" },
  { key: "Date", value: "8" },
];

export type EnterMethod = "0" | "1" | "2" | "3";

export const ENTER_METHOD_OPTIONS: { key: string; value: EnterMethod }[] = [
  { key: "Enter (free entry)", value: "0" },
  { key: "Menu (strict picklist)", value: "1" },
  { key: "Menu + Enter (editable combo)", value: "2" },
  { key: "Menu + Enter + Record Entry", value: "3" },
];

export interface SymbolOption {
  id: string;
  label: string;
}

// Confirmed built-in SymbolStyleID values from the reference doc (section 5).
export const SYMBOL_OPTIONS: SymbolOption[] = [
  { id: "907938", label: "Filled circle (dot) — default" },
  { id: "907939", label: "Open circle" },
  { id: "907936", label: "Filled triangle" },
  { id: "907937", label: "Open triangle" },
  { id: "907940", label: "Circled X" },
  { id: "907941", label: "Bracket / structure glyph" },
  { id: "907942", label: "Flag" },
  { id: "3110", label: "Iron rod (IR/IRC)" },
  { id: "2360", label: "Concrete monument (CM)" },
  { id: "3282", label: "Other monument (OM)" },
  { id: "3340", label: "Power pole (PP)" },
  { id: "3330", label: "Light pole (LP)" },
  { id: "3210", label: "Sign, landscape (SIGL)" },
  { id: "3261", label: "Sign, pole (SIGP)" },
  { id: "1150", label: "Wire pull box (WPB)" },
  { id: "1181", label: "Delineation post (DP)" },
  { id: "10003", label: "Pavement shot point (APX/CPX)" },
];

export const DEFAULT_SYMBOL_ID = "907938";

export interface FieldEntry {
  id: string;
  fieldName: string;
  filedType: FiledType;
  isRequired: boolean;
  fieldDefaultValue: string;
  enterMethod: EnterMethod;
  values: string[];
}

export interface CodeEntry {
  id: string;
  shortCode: string;
  description: string;
  category: string;
  datasetType: DatasetType;
  symbolStyleId: string;
  symbolColor: string; // #rrggbb, as produced by <input type="color">
  symbolSize: number;
  fields: FieldEntry[];
}

export function newFieldEntry(): FieldEntry {
  return {
    id: crypto.randomUUID(),
    fieldName: "",
    filedType: "10",
    isRequired: false,
    fieldDefaultValue: "",
    enterMethod: "0",
    values: [],
  };
}

export function newCodeEntry(): CodeEntry {
  return {
    id: crypto.randomUUID(),
    shortCode: "",
    description: "",
    category: "",
    datasetType: "1",
    symbolStyleId: DEFAULT_SYMBOL_ID,
    symbolColor: "#000000",
    symbolSize: 2,
    fields: [],
  };
}
