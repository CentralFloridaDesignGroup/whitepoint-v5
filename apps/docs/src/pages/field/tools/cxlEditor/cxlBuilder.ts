import type { CodeEntry } from "./types";

const NO_CATEGORY = "__no_category__";

export function generateId(): string {
  return "a" + crypto.randomUUID().replace(/-/g, "");
}

export function lineFieldId(): string {
  return "Line" + generateId();
}

/**
 * Converts a #rrggbb color string to the signed 32-bit ARGB decimal LandStar expects.
 * JS bitwise ops already operate on signed int32, so no manual overflow handling is needed.
 */
export function argbFromHex(hex: string, a = 255): number {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) || 0;
  const g = parseInt(clean.slice(2, 4), 16) || 0;
  const b = parseInt(clean.slice(4, 6), 16) || 0;
  return (a << 24) | (r << 16) | (g << 8) | b;
}

export function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function el(tag: string, content: string): string {
  return `<${tag}>${escapeXml(content)}</${tag}>`;
}

export function validateCodes(codes: CodeEntry[]): string[] {
  const errors: string[] = [];

  if (codes.length === 0) {
    errors.push("Add at least one code before generating a file.");
    return errors;
  }

  const seenCodes = new Map<string, number>();

  codes.forEach((code, index) => {
    const label = code.shortCode.trim() || `Code #${index + 1}`;

    if (!code.shortCode.trim()) {
      errors.push(`${label}: short code is required.`);
    } else {
      const key = code.shortCode.trim();
      const count = (seenCodes.get(key) || 0) + 1;
      seenCodes.set(key, count);
    }

    if (!code.description.trim()) {
      errors.push(`${label}: description is required.`);
    }

    if (!Number.isFinite(code.symbolSize) || code.symbolSize <= 0) {
      errors.push(`${label}: symbol size must be a positive number.`);
    }

    const seenFieldNames = new Map<string, number>();
    code.fields.forEach((field, fieldIndex) => {
      const fieldLabel = field.fieldName.trim() || `field #${fieldIndex + 1}`;
      if (!field.fieldName.trim()) {
        errors.push(`${label}: ${fieldLabel} needs a name.`);
      } else {
        const key = field.fieldName.trim().toUpperCase();
        seenFieldNames.set(key, (seenFieldNames.get(key) || 0) + 1);
      }
      if (field.enterMethod !== "0" && field.values.length === 0) {
        errors.push(`${label}: ${fieldLabel} uses a menu entry method but has no options.`);
      }
    });
    seenFieldNames.forEach((count, name) => {
      if (count > 1) {
        errors.push(`${label}: field name "${name}" is used more than once.`);
      }
    });
  });

  seenCodes.forEach((count, code) => {
    if (count > 1) {
      errors.push(`Short code "${code}" is used more than once — short codes must be unique.`);
    }
  });

  return errors;
}

function buildFieldInfo(field: CodeEntry["fields"][number]): string {
  const valueList =
    field.enterMethod === "0"
      ? `<ValueList EnterMethod="0" />`
      : `<ValueList EnterMethod="${field.enterMethod}">${field.values
          .map((v) => el("Value", v))
          .join("")}</ValueList>`;

  return `<FieldInfo>${el("FieldName", field.fieldName.trim())}<FieldForeignName></FieldForeignName>${el(
    "FiledType",
    field.filedType
  )}<DateType>yyyy/MM/dd</DateType><MinValue></MinValue><MaxValue>255</MaxValue><FiledSize>255</FiledSize>${el(
    "IsRequired",
    field.isRequired ? "1" : "0"
  )}<Decimals>3</Decimals>${el(
    "FieldDefaultValue",
    field.fieldDefaultValue
  )}<FieldAttribute></FieldAttribute><FieldDescription></FieldDescription><IsRememberInput>1</IsRememberInput><IsShowAlias>0</IsShowAlias>${valueList}</FieldInfo>`;
}

function buildDataset(code: CodeEntry, codeId: string): string {
  const fieldInfos = code.fields.map(buildFieldInfo).join("");
  return `<Dataset>${el("DatasetName", codeId)}${el(
    "DatasetType",
    code.datasetType
  )}<DatasetOption>0</DatasetOption><DatasetDescription></DatasetDescription><FieldInfos><Count>${
    code.fields.length
  }</Count>${fieldInfos}</FieldInfos></Dataset>`;
}

function buildLayerInfo(
  code: CodeEntry,
  codeId: string,
  layerName: string,
  lineField: string,
  category: string,
  argb: number
): string {
  return `<LayerInfo>${el("LayerName", layerName)}<DataSourceName></DataSourceName>${el(
    "CategoryName",
    category
  )}${el("DatasetName", code.shortCode.trim())}<CodeKey></CodeKey>${el(
    "CodeId",
    codeId
  )}<PointGisDatasetName>CHC_MAP</PointGisDatasetName><LineGisDatasetName>CHC_MAP_LINE</LineGisDatasetName><RegionGisDatasetName>CHC_MAP_REGION</RegionGisDatasetName>${el(
    "DatasetType",
    code.datasetType
  )}${el("FieldDatasetName", codeId)}${el(
    "LineFieldDatasetName",
    lineField
  )}<VisibleScaleMin>0.000</VisibleScaleMin><VisibleScaleMax>0.000</VisibleScaleMax><IsVisible>1</IsVisible><IsEditable>1</IsEditable><IsSelectable>1</IsSelectable><IsSnapable>1</IsSnapable>${el(
    "Description",
    code.description.trim()
  )}<IsUsedField>1</IsUsedField><DisplayStyle StyleType="${code.datasetType}"><ColorByLayer>0</ColorByLayer>${el(
    "SymbolStyleID",
    code.symbolStyleId
  )}${el("SymbolSize", String(code.symbolSize))}<SymbolAngle>0</SymbolAngle>${el(
    "SymbolColor",
    String(argb)
  )}<LineStyleID>CONTINUOUS</LineStyleID><LineWidth>1</LineWidth><LineColor>-16777216</LineColor><RegionStyleID>CONTINUOUS</RegionStyleID><RegionFillColor>-15757035</RegionFillColor><RegionFrameColor>-15757035</RegionFrameColor><RegionFrameSize>1</RegionFrameSize><RegionOpaqueRate>100</RegionOpaqueRate></DisplayStyle></LayerInfo>`;
}

function buildCadLayer(
  code: CodeEntry,
  layerName: string,
  symbolStyleId: string,
  argb: number
): string {
  return `<CadLayer>${el("LayerName", layerName)}${el(
    "LayerAlias",
    code.shortCode.trim()
  )}<IsVisible>1</IsVisible><LayerStyle><LineStyleID>CONTINUOUS</LineStyleID><LineWidth>1.000</LineWidth><LayerColor>-16777216</LayerColor><LayerFillColor>0</LayerFillColor><LayerFillTransparent>100</LayerFillTransparent>${el(
    "LayerPointSymbolName",
    symbolStyleId
  )}${el("LayerPointSymbolColor", String(argb))}${el(
    "LayerPointSymbolSize",
    String(code.symbolSize)
  )}</LayerStyle></CadLayer>`;
}

const DEFAULT_CAD_LAYER = `<CadLayer><LayerName>0</LayerName><LayerAlias>0</LayerAlias><IsVisible>1</IsVisible><LayerStyle><LineStyleID>CONTINUOUS</LineStyleID><LineWidth>1.000</LineWidth><LayerColor>-16777216</LayerColor><LayerFillColor>0</LayerFillColor><LayerFillTransparent>100</LayerFillTransparent><LayerPointSymbolName></LayerPointSymbolName><LayerPointSymbolColor></LayerPointSymbolColor><LayerPointSymbolSize></LayerPointSymbolSize></LayerStyle></CadLayer>`;

export function buildCxlXml(
  listName: string,
  listDescription: string,
  codes: CodeEntry[]
): string {
  const codeIds = codes.map(() => generateId());
  const layerNames = codes.map(() => generateId());
  const lineFields = codes.map(() => lineFieldId());
  const categories = codes.map((c) => c.category.trim() || NO_CATEGORY);
  const argbColors = codes.map((c) => argbFromHex(c.symbolColor));

  const datasets = codes.map((code, i) => buildDataset(code, codeIds[i])).join("");
  const layerInfos = codes
    .map((code, i) =>
      buildLayerInfo(code, codeIds[i], layerNames[i], lineFields[i], categories[i], argbColors[i])
    )
    .join("");
  const cadLayers =
    codes
      .map((code, i) => buildCadLayer(code, layerNames[i], code.symbolStyleId, argbColors[i]))
      .join("") + DEFAULT_CAD_LAYER;

  const uniqueCategories = Array.from(new Set([NO_CATEGORY, ...categories]));
  const categoryBlocks = uniqueCategories
    .map((name) => `<Category>${el("CategoryName", name)}<CategoryType>1</CategoryType></Category>`)
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<LandTourTemplate version="8.2.0.1" xmlns="http://www.huacenav.com"><WorkSpace><WorkSpaceName></WorkSpaceName><DataSources><Count>1</Count><DataSource>${el(
    "DataSourceName",
    listName.trim()
  )}<DataSourceType>0</DataSourceType><DataSourceOption>0</DataSourceOption>${el(
    "DataSourceDescription",
    listDescription.trim()
  )}<Resources><SymbolLib><Name></Name></SymbolLib><LineStyleLib><Name></Name></LineStyleLib></Resources><DatasetInfos><Count>${
    codes.length
  }</Count>${datasets}</DatasetInfos></DataSource></DataSources><MapLayers><Count>${
    codes.length
  }</Count>${layerInfos}</MapLayers><CadLayers>${cadLayers}</CadLayers><Categories>${categoryBlocks}</Categories><ZipZagTemplateCodes /></WorkSpace></LandTourTemplate>`;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "code-list";
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(
    now.getHours()
  )}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

export function buildFilename(listName: string): string {
  return `${slugify(listName)}_${timestamp()}.cxl`;
}
