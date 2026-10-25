export type EmailContent = { text: string; html: string };

type EmailLayout = {
  title: string;
  text: string;
  paragraphs?: string[];
  details?: Array<[string, string]>;
  action?: { label: string; url: string };
};

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function formatted(value: string): string {
  const urls = /https?:\/\/[^\s<>]+/g;
  let html = "",
    offset = 0;
  for (const match of value.matchAll(urls)) {
    const start = match.index;
    const url = match[0].replace(/[.,;!?)]*$/, "");
    html += escapeHtml(value.slice(offset, start)).replace(/\n/g, "<br>");
    html += `<a href="${escapeHtml(url)}" style="color:#176b86;text-decoration:underline">${escapeHtml(url)}</a>`;
    offset = start + url.length;
  }
  return html + escapeHtml(value.slice(offset)).replace(/\n/g, "<br>");
}

export function emailLayout({
  title,
  text,
  paragraphs = [],
  details = [],
  action,
}: EmailLayout): EmailContent {
  const heading = escapeHtml(title);
  const content = paragraphs
    .map(
      (paragraph) =>
        `<p style="margin:0 0 16px;color:#263746;font-size:15px;line-height:1.6">${formatted(paragraph)}</p>`,
    )
    .join("");
  const rows = details
    .map(
      ([label, value]) =>
        `<tr><th scope="row" align="left" valign="top" style="padding:9px 12px 9px 0;color:#526575;font-size:13px;font-weight:600;white-space:nowrap">${escapeHtml(label)}</th><td valign="top" style="padding:9px 0;color:#263746;font-size:14px;line-height:1.5;overflow-wrap:anywhere">${formatted(value)}</td></tr>`,
    )
    .join("");
  const detailTable = rows
    ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin:8px 0 22px;border-top:1px solid #dce5e9;border-bottom:1px solid #dce5e9">${rows}</table>`
    : "";
  const button = action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td bgcolor="#176b86" style="border-radius:4px"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 20px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(action.label)}</a></td></tr></table><p style="margin:0 0 16px;color:#526575;font-size:12px;line-height:1.5">If the button does not work, open this link: ${formatted(action.url)}</p>`
    : "";
  return {
    text,
    html: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:#f3f6f7;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;background:#f3f6f7">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="width:100%;max-width:600px;border-collapse:collapse;background:#ffffff;border:1px solid #dce5e9">
        <tr><td style="padding:24px 28px;background:#176b86;color:#ffffff;font-size:18px;font-weight:700">White Point Survey</td></tr>
        <tr><td style="padding:28px">
          <h1 style="margin:0 0 20px;color:#17394b;font-size:24px;line-height:1.3">${heading}</h1>
          ${content}${detailTable}${button}
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f7f9fa;color:#526575;font-size:12px;line-height:1.5">White Point Surveying &amp; Mapping LLC</td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  };
}
