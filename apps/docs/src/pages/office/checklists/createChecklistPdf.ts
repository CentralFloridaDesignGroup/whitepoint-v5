import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import disclaimer from "./disclaimer.json" with { type: "json" };

export interface ReviewData {
  reviewer: string;
  jobNumber: string;
  date: string;
  notes: string;
}

export interface ChecklistSection {
  id?: string;
  title: string;
  subtitle?: string;
  items: {
    id?: string;
    source?: { label: string; url?: string };
    reviewStatus?: string;
    reviewedAt?: string | null;
    title: string;
    statement: string;
    code?: string;
    reason?: string;
    options: "YesNo" | "YesNoN/A";
  }[];
}

interface ChecklistPdfInput {
  meta: { Title?: string; Category?: string; WIP?: boolean };
  sections: ChecklistSection[];
  noEntries: string[];
  naEntries: string[];
  review: ReviewData;
  showDisclaimer: boolean;
}

// Normalize punctuation unsupported by the PDF's built-in font.
const text = (value: string) =>
  value
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');

export function checklistPdfFilename(title: string, jobNumber: string) {
  return (
    [jobNumber, title]
      .filter(Boolean)
      .join("-")
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "") + ".pdf"
  );
}

export function createChecklistPdf({
  meta,
  sections,
  noEntries,
  naEntries,
  review,
  showDisclaimer,
}: ChecklistPdfInput) {
  const pdf = new jsPDF({ unit: "pt", format: "letter", compress: true });
  const navy = "#1c3d5a";
  const muted = "#526173";
  const margin = 42;
  const width = 528;
  const status = (title: string) =>
    noEntries.includes(title)
      ? "Not Satisfied"
      : naEntries.includes(title)
        ? "Not Applicable"
        : "Satisfied";
  const items = sections.flatMap((section) => section.items);
  const count = (value: string) =>
    items.filter((item) => status(item.id ?? item.title) === value).length;
  const title = text(meta.Title || "Survey Checklist");
  pdf.setProperties({
    title,
    author: "White Point Surveying & Mapping LLC",
    subject: "Checklist review",
  });

  pdf.setFillColor(navy);
  pdf.rect(0, 0, 612, 125, "F");
  pdf.setTextColor("#ffffff");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.text("WHITE POINT SURVEYING & MAPPING LLC", margin, 35);
  pdf.setFontSize(22);
  pdf.text(pdf.splitTextToSize(title, width), margin, 68);
  pdf.setFontSize(9);
  pdf.setFont("helvetica", "normal");
  pdf.text(
    text(
      [
        meta.Category,
        meta.WIP ? "DRAFT - WORK IN PROGRESS" : "CHECKLIST REVIEW",
      ]
        .filter(Boolean)
        .join("  /  "),
    ),
    margin,
    110,
  );

  let summaryY;

  if (showDisclaimer) {
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    const disclaimerLines: string[] = pdf.splitTextToSize(
      text(disclaimer.body),
      width - 24,
    );
    const disclaimerHeight = 34 + disclaimerLines.length * 11;
    pdf.setFillColor("#f2f5f8");
    pdf.roundedRect(margin, 145, width, disclaimerHeight, 4, 4, "F");
    pdf.setTextColor(navy);
    pdf.setFont("helvetica", "bold");
    pdf.text(disclaimer.title, margin + 12, 162);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor("#243447");
    pdf.text(disclaimerLines, margin + 12, 178, { lineHeightFactor: 11 / 9 });
    summaryY = 145 + disclaimerHeight + 16;
  } else {
    summaryY = 145;
  }

  autoTable(pdf, {
    startY: summaryY,
    margin: { left: margin, right: margin, top: 65, bottom: 45 },
    theme: "plain",
    styles: {
      fontSize: 10,
      cellPadding: 10,
      textColor: navy,
      overflow: "linebreak",
    },
    head: [["Satisfied", "Not Satisfied", "Not Applicable"]],
    headStyles: { fillColor: "#edf2f6", textColor: muted, fontSize: 8 },
    body: [
      [
        String(count("Satisfied")),
        String(count("Not Satisfied")),
        String(count("Not Applicable")),
      ],
    ],
    bodyStyles: { fontSize: 20, fontStyle: "bold" },
  });
  autoTable(pdf, {
    startY: summaryY + 80,
    margin: { left: margin, right: margin, top: 65, bottom: 45 },
    theme: "plain",
    styles: {
      fontSize: 10,
      cellPadding: 8,
      overflow: "linebreak",
      textColor: "#243447",
    },
    columnStyles: {
      0: { cellWidth: 100, fontStyle: "bold", textColor: muted },
    },
    body: [
      ["Reviewer", text(review.reviewer.trim() || "Not provided")],
      ["Job number", text(review.jobNumber.trim() || "Not provided")],
      ["Review date", review.date || "Not provided"],
      ["Comments", text(review.notes.trim() || "No reviewer comments.")],
    ],
    rowPageBreak: "avoid",
  });

  sections.forEach((section, index) => {
    pdf.addPage();
    type StyledLine = { content: string; bold: boolean; color: string; italics?: boolean };
    const richRows = new Map<
      unknown,
      { lines: StyledLine[]; offset: number }
    >();
    const fragments = new Map<unknown, string[]>();
    const body = section.items.map((item, itemIndex) => {
      const reason = item.reason?.trim();
      const blocks = [
        {
          content: `${index + 1}.${itemIndex + 1}  ${item.title}`,
          bold: true,
          color: "#243447",
        },
        { content: item.statement, bold: false, color: "#243447" },
        {
          content: item.source
            ? `Source: ${item.source.label}${item.source.url ? ` (${item.source.url})` : ""} | ${item.reviewStatus === "reviewed" ? "Reviewed" : "DRAFT - needs review"}${item.reviewedAt ? ` (${item.reviewedAt})` : ""}`
            : "",
          bold: false,
          color: "#526173",
        },
        {
          content: item.code ? `Reference: ${item.code}` : "",
          bold: false,
          color: "#243447",
          italics: true,
        },
        {
          content:
            status(item.id ?? item.title) === "Not Satisfied" && reason
              ? `Denial reason: ${reason}`
              : "",
          bold: true,
          color: "#9f2424",
        },
      ].filter((block) => block.content);
      const lines: StyledLine[] = [];
      blocks.forEach((block) => {
        pdf.setFont("helvetica", block.bold ? "bold" : "normal");
        pdf.setFontSize(9);
        // Measure with the same font used to draw each block.
        const wrapped: string[] = pdf.splitTextToSize(
          text(block.content),
          458 - 18,
        );
        lines.push(...wrapped.map((content) => ({ ...block, content })));
      });
      const row = [
        {
          content: lines.map((line) => line.content).join("\n"),
          styles: { overflow: "visible" as const },
        },
        status(item.id ?? item.title),
      ];
      richRows.set(row, { lines, offset: 0 });
      return row;
    });
    autoTable(pdf, {
      startY: 66,
      margin: { left: margin, right: margin, top: 66, bottom: 46 },
      theme: "grid",
      head: [
        [
          {
            content: text(
              `${index + 1}. ${section.title}${section.subtitle ? "\n" + section.subtitle : ""}`,
            ),
            colSpan: 2,
            styles: { halign: "center" },
          },
        ],
      ],
      body,
      styles: {
        font: "helvetica",
        fontSize: 9,
        cellPadding: 9,
        lineColor: "#dce3ea",
        lineWidth: 0.2,
        textColor: "#243447",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: navy,
        textColor: "#ffffff",
        fontSize: 11,
        cellPadding: 11,
      },
      alternateRowStyles: { fillColor: "#dbdbdb" },
      columnStyles: {
        0: { cellWidth: 458 },
        1: {
          cellWidth: 70,
          fontStyle: "bold",
          halign: "center",
          valign: "middle",
        },
      },
      rowPageBreak: "avoid",
      showHead: "everyPage",
      // AutoTable paginates the measured lines. Draw each fragment ourselves
      // so title/denial formatting survives even when a row spans pages.
      willDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 0) return;
        fragments.set(data.cell, data.cell.text);
        data.cell.text = [];
      },
      didDrawCell: (data) => {
        if (data.section !== "body" || data.column.index !== 0) return;
        const fragment = fragments.get(data.cell);
        const rich = richRows.get(data.row.raw);
        if (!fragment || !rich) return;
        const fontSize = data.cell.styles.fontSize;
        const lineHeight = fontSize * pdf.getLineHeightFactor();
        const x = data.cell.x + data.cell.padding("left");
        const y = data.cell.y + data.cell.padding("top") + fontSize * 0.85;
        pdf.saveGraphicsState();
        fragment.forEach((content, lineIndex) => {
          const style = rich.lines[rich.offset + lineIndex];
          pdf.setFont("helvetica", style?.bold ? "bold" : style?.italics ? "italic" : "normal");
          pdf.setFontSize(fontSize);
          pdf.setTextColor(style?.color || "#243447");
          if (content) pdf.text(content, x, y + lineIndex * lineHeight);
        });
        pdf.restoreGraphicsState();
        rich.offset += fragment.length;
        data.cell.text = fragment;
        fragments.delete(data.cell);
      },
      didParseCell: (data) => {
        if (data.section !== "body" || data.column.index !== 1) return;
        const label = data.cell.raw;
        data.cell.styles.textColor =
          label === "Not Satisfied"
            ? "#9f2424"
            : label === "Satisfied"
              ? "#176342"
              : muted;
        data.cell.styles.fillColor =
          label === "Not Satisfied"
            ? "#f9c8c8"
            : label === "Satisfied"
              ? "#bdfad8"
              : "#edf0f4";
      },
    });
  });

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    if (page > 1) {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.setTextColor(navy);
      pdf.text("CHECKLIST REVIEW", margin, 29);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.text(
        text(meta.WIP ? "DRAFT - WORK IN PROGRESS" : "SURVEY REVIEW"),
        570,
        29,
        { align: "right" },
      );
      pdf.setDrawColor("#dce3ea");
      pdf.line(margin, 43, 570, 43);
    }
    pdf.setDrawColor("#dce3ea");
    pdf.line(margin, 754, 570, 754);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(muted);
    const footer = text(
      review.jobNumber
        ? `Job ${review.jobNumber}`
        : "White Point Surveying & Mapping LLC",
    );
    pdf.text(
      footer.length > 80 ? footer.slice(0, 77) + "..." : footer,
      margin,
      769,
    );
    pdf.text(`${page} / ${pages}`, 570, 769, { align: "right" });
  }
  return pdf;
}
