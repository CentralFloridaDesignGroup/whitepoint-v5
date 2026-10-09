import type { AppSettings } from "@whitepoint/types";

export function businessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  return {
    year: parts.find((part) => part.type === "year")!.value,
    month: parts.find((part) => part.type === "month")!.value,
  };
}

export function validateNumberTemplate(
  template: string,
  resetYearly: boolean,
): string | null {
  if (!template || template.length > 80)
    return "Enter a number template of 1–80 characters.";
  const tokens = [...template.matchAll(/\{([^{}]*)\}/g)];
  if (tokens.filter((match) => /^#{1,10}$/.test(match[1] || "")).length !== 1)
    return "Include exactly one sequence token with 1–10 # characters.";
  if (
    tokens.some(
      (match) =>
        !["YY", "MM"].includes(match[1] || "") &&
        !/^#{1,10}$/.test(match[1] || ""),
    )
  )
    return "Only {YY}, {MM}, and {#} through {##########} are supported.";
  if (
    template.replace(/\{[^{}]*\}/g, "").includes("{") ||
    template.replace(/\{[^{}]*\}/g, "").includes("}")
  )
    return "A template contains an invalid token.";
  if (resetYearly && !template.includes("{YY}"))
    return "Annual reset requires {YY} in the template.";
  return null;
}

export function formatNumber(
  template: string,
  sequence: number,
  date = businessDate(),
) {
  return template
    .replace(/\{YY\}/g, date.year.slice(-2))
    .replace(/\{MM\}/g, date.month)
    .replace(/\{(#{1,10})\}/, (_, hashes: string) =>
      String(sequence).padStart(hashes.length, "0"),
    );
}

export async function nextNumber(
  db: D1Database,
  kind: "invoice" | "project" | "client",
  settings: Pick<
    AppSettings,
    | "invoiceNumberTemplate"
    | "projectNumberTemplate"
    | "clientNumberTemplate"
    | "invoiceResetYearly"
    | "projectResetYearly"
    | "clientResetYearly"
  >,
) {
  const date = businessDate();
  const yearly =
    kind === "invoice"
      ? settings.invoiceResetYearly
      : kind === "project"
        ? settings.projectResetYearly
        : settings.clientResetYearly;
  const template =
    kind === "invoice"
      ? settings.invoiceNumberTemplate
      : kind === "project"
        ? settings.projectNumberTemplate
        : settings.clientNumberTemplate;
  const period = yearly ? date.year : "all";
  const row =
    kind === "client"
      ? await db
          .prepare(
            `INSERT INTO client_number_sequences(period,last_value) VALUES(?,1)
      ON CONFLICT(period) DO UPDATE SET last_value=last_value+1 RETURNING last_value`,
          )
          .bind(period)
          .first<{ last_value: number }>()
      : await db
          .prepare(
            `INSERT INTO number_sequences(kind,period,last_value) VALUES(?,?,1)
      ON CONFLICT(kind,period) DO UPDATE SET last_value=last_value+1 RETURNING last_value`,
          )
          .bind(kind, period)
          .first<{ last_value: number }>();
  return formatNumber(template, row!.last_value, date);
}
