import type { ReviewData, ChecklistSection } from './createChecklistPdf';

export type ChecklistMeta = { Title?: string; Category?: string; WIP?: boolean };
export type ExportReviewData = ReviewData & { isFinal: boolean };

type ExportOptions = {
  action: 'download' | 'preview';
  review: ExportReviewData;
  meta: ChecklistMeta;
  sections: ChecklistSection[];
  noEntries: string[];
  naEntries: string[];
  isAuthenticated: boolean;
};

export async function exportChecklistPdf(options: ExportOptions): Promise<void> {
  const { action, review, meta, sections, noEntries, naEntries, isAuthenticated } = options;
  // Open while handling the click, before the PDF module loads.
  const previewWindow = action === 'preview' ? window.open('about:blank', '_blank') : null;
  if (action === 'preview' && !previewWindow) throw new Error('Allow pop-ups for this site to preview the PDF.');
  if (previewWindow) previewWindow.opener = null;
  let previewUrl: string | null = null;
  try {
    const { createChecklistPdf, checklistPdfFilename } = await import('./createChecklistPdf');
    const pdf = createChecklistPdf({
      meta: { ...meta, WIP: meta.WIP || !review.isFinal },
      sections, noEntries, naEntries, review,
      showDisclaimer: !isAuthenticated,
    });
    if (!previewWindow) {
      await pdf.save(checklistPdfFilename(meta.Title || 'Checklist', review.jobNumber), { returnPromise: true });
      return;
    }
    if (previewWindow.closed) return;
    previewUrl = URL.createObjectURL(pdf.output('blob'));
    previewWindow.location.replace(previewUrl);
    const url = previewUrl;
    const cleanup = window.setInterval(() => {
      if (previewWindow.closed) {
        URL.revokeObjectURL(url);
        window.clearInterval(cleanup);
      }
    }, 1000);
  } catch (error) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewWindow?.close();
    throw error;
  }
}
