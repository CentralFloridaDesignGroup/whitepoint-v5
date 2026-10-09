import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { WorkInProgressComponent } from "@whitepoint/ui/layout";
import { Button } from "@whitepoint/ui/input";
import { type ReviewData, type ChecklistSection as Section } from "./createChecklistPdf";
import disclaimer from "./disclaimer.json" with { type: "json" };
import {
  useSidebarContext,
  SidebarLinkItem,
} from "@whitepoint/ui/layout";
import { useAuth } from "../../../auth/AuthContext";
import { ChecklistSection } from "./components/ChecklistSection";

type ExportReviewData = ReviewData & { isFinal: boolean };

interface ChecklistMeta {
  Title?: string;
  Category?: string;
  WIP?: boolean;
}

interface ChecklistConfig {
  breadcrumbName?: string;
}

export default function Checklist() {
  const { checklistType, "*": checklistPath } = useParams();
  const resolvedChecklistType = checklistType || checklistPath;
  return (
    <ChecklistReview
      key={resolvedChecklistType}
      checklistType={resolvedChecklistType}
    />
  );
}

function ChecklistReview({ checklistType }: { checklistType?: string }) {
  const { setSidebarItems } = useSidebarContext(),
    { isAuthenticated } = useAuth();
  const [noEntries, setNoEntries] = useState<string[]>([]);
  const [naEntries, setNaEntries] = useState<string[]>([]);
  const [yesEntries, setYesEntries] = useState<string[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [meta, setMeta] = useState<ChecklistMeta>({});
  const [config, setConfig] = useState<ChecklistConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReviewerModalOpen, setIsReviewerModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Load checklist JSON from public/checklists
    const loadChecklist = async () => {
      try {
        if (!checklistType) {
          setError("Checklist type is missing");
          setLoading(false);
          return;
        }

        const response = await fetch(`/checklists/${checklistType}.json`, {
          cache: "no-cache",
          signal: controller.signal,
        });
        if (!response.ok) {
          setError(`Checklist type "${checklistType}" not found`);
          setLoading(false);
          return;
        }

        const module = await response.json();
        if (controller.signal.aborted) return;
        setSections(module.Sections || []);
        setMeta(module.Meta || {});
        setConfig({ breadcrumbName: module?.Meta?.Title });
        setLoading(false);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("Error loading checklist:", err);
        setError(err instanceof Error ? err.message : "Could not load checklist.");
        setLoading(false);
      }
    };

    loadChecklist();
    return () => controller.abort();
  }, [checklistType]);

  // Set the sidebar to link to each section
  useEffect(() => {
    if (sections.length > 0) {
      const sidebarItems: SidebarLinkItem[] = sections.map((section) => ({
        label: section.title,
        href: `#${section.id ?? section.title}`,
        type: "link",
        display: "card",
      }));
      setSidebarItems(sidebarItems);
    }
  }, [sections, setSidebarItems]);

  useEffect(() => {
    if (config && meta && meta.Title) {
      document.title = `${meta.Title} - The Compass`;
    }
  }, [config, meta, checklistType]);

  const handlePrint = () => {
    setExportError(null);
    setIsReviewerModalOpen(true);
  };

  const onStatusChange = useCallback((itemId: string, status: string) => {
    if (status === "no") {
      setNoEntries((prev) => {
        if (!prev.includes(itemId)) {
          return [...prev, itemId];
        }
        return prev;
      });
      setNaEntries((prev) => prev.filter((id) => id !== itemId));
      setYesEntries((prev) => prev.filter((id) => id !== itemId));
    } else if (status === "na") {
      setNaEntries((prev) => {
        if (!prev.includes(itemId)) {
          return [...prev, itemId];
        }
        return prev;
      });
      setNoEntries((prev) => prev.filter((id) => id !== itemId));
    } else if (status === "yes") {
      setYesEntries((prev) => {
        if (!prev.includes(itemId)) {
          return [...prev, itemId];
        }
        return prev;
      });
      setNoEntries((prev) => prev.filter((id) => id !== itemId));
      setNaEntries((prev) => prev.filter((id) => id !== itemId));
    } else {
      setNoEntries((prev) => prev.filter((id) => id !== itemId));
      setNaEntries((prev) => prev.filter((id) => id !== itemId));
      setYesEntries((prev) => prev.filter((id) => id !== itemId));
    }
  }, []);

  const onNoteChange = useCallback((itemId: string, reason: string) => {
    setSections((prevSections) => {
      return prevSections.map((section) => {
        return {
          ...section,
          items: section.items.map((item) => {
            if ((item.id ?? item.title) === itemId) {
              return { ...item, reason };
            }
            return item;
          }),
        };
      });
    });
  }, []);

  const handleSaveReview = async (
    review: ExportReviewData,
    action: "download" | "preview" = "download",
  ) => {
    if (exporting) return;
    // Open during the click event, before loading jsPDF, to avoid popup blocking.
    const previewWindow =
      action === "preview" ? window.open("about:blank", "_blank") : null;
    if (action === "preview" && !previewWindow) {
      setExportError("Allow pop-ups for this site to preview the PDF.");
      return;
    }
    if (previewWindow) previewWindow.opener = null;
    let previewUrl: string | null = null;
    setExporting(true);
    setExportError(null);
    try {
      const { createChecklistPdf, checklistPdfFilename } =
        await import("./createChecklistPdf");
      const pdf = createChecklistPdf({
        meta: { ...meta, WIP: meta.WIP || !review.isFinal },
        sections,
        noEntries,
        naEntries,
        review,
        showDisclaimer: !isAuthenticated,
      });
      if (previewWindow) {
        if (previewWindow.closed) return;
        previewUrl = URL.createObjectURL(pdf.output("blob"));
        previewWindow.location.replace(previewUrl);
        const url = previewUrl;
        // Keep the blob available for the viewer's save/reload actions.
        const cleanup = window.setInterval(() => {
          if (previewWindow.closed) {
            URL.revokeObjectURL(url);
            window.clearInterval(cleanup);
          }
        }, 1000);
      } else {
        await pdf.save(
          checklistPdfFilename(meta.Title || "Checklist", review.jobNumber),
          { returnPromise: true },
        );
        setIsReviewerModalOpen(false);
      }
    } catch (error) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewWindow?.close();
      console.error("Checklist PDF export failed:", error);
      setExportError("The PDF could not be created. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  if (error || (!config && !loading)) {
    return (
      <div className="mx-auto w-full max-w-7xl p-6">
        <h2 className="text-3xl font-semibold text-red-600 text-center">
          Checklist not found
        </h2>
        <p className="text-center mt-4">
          {error || `The checklist type "${checklistType}" is not configured.`}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl p-6">
        <p className="text-center">Loading checklist...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Normal Screen View */}
      <div className="screen-only">
        <div className="mx-auto w-full space-y-6">
          {!isAuthenticated && (
            // <aside
            //   aria-label={disclaimer.title}
            //   className="rounded-md border border-gray-300 bg-gray-50 p-4 text-sm text-gray-700   "
            // >
            //   <p className="mb-1 font-semibold">{disclaimer.title}</p>
            //   <p>{disclaimer.body}</p>
            // </aside>
            <div className="space-y-1 bg-nile-blue-200 border-l-4 border-red-500 px-4 py-2 rounded-r-md screen-only">
              <p className="font-bold">{disclaimer.title}</p>
              <p className="text-nile-blue">{disclaimer.body}</p>
            </div>
          )}

          {meta.WIP && <WorkInProgressComponent />}
          <div className="flex flex-col xl:flex-row">
            <div className="flex-1 flex-col">
              <h2 className="text-3xl font-semibold text-gray-900 text-center lg:text-left mb-0 pb-2 ">
                {meta.Title}
              </h2>
              <p className="text-xl font-semibold text-gray-900 text-center lg:text-left ">
                {meta.Category}
              </p>
            </div>
            <div className="flex-1 grid grid-cols-2 lg:grid-cols-5">
              <CategorySummary label="yes" itemCount={yesEntries.length} />
              <CategorySummary label="no" itemCount={noEntries.length} />
              <CategorySummary label="n/a" itemCount={naEntries.length} />
              <CategorySummary
                label="total"
                itemCount={
                  (yesEntries.length / (yesEntries.length + noEntries.length + naEntries.length) * 100).toFixed(1)
                }
              />
              <div className="col-span-2 lg:col-span-1">
                <Button
                  colorMode="auto"
                  onClick={handlePrint}
                  label="Export Review"
                  style="primary"
                />
              </div>
            </div>
          </div>
          {sections.map((section, index) => (
            <ChecklistSection
              key={section.id ?? section.title ?? index}
              section={section}
              index={index}
              onStatusChange={onStatusChange}
              onNoteChange={onNoteChange}
            />
          ))}
        </div>
      </div>

      <ReviewerModal
        defaultFinal={noEntries.length === 0}
        isOpen={isReviewerModalOpen}
        exporting={exporting}
        error={exportError}
        onClose={() => {
          if (!exporting) setIsReviewerModalOpen(false);
        }}
        onSave={handleSaveReview}
      />
    </div>
  );
}

const ReviewerModal = ({
  defaultFinal,
  isOpen,
  exporting,
  error,
  onClose,
  onSave,
}: {
  defaultFinal: boolean;
  isOpen: boolean;
  exporting: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (
    data: ExportReviewData,
    action?: "download" | "preview",
  ) => Promise<void>;
}) => {
  const [reviewer, setReviewer] = useState("");
  const [jobNumber, setJobNumber] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [isFinal, setIsFinal] = useState(defaultFinal);

  useEffect(() => {
    if (isOpen) {
      // Reset form when modal opens
      setReviewer("");
      setJobNumber("");
      setDate("");
      setNotes("");
      setIsFinal(defaultFinal);
    }
  }, [isOpen, defaultFinal]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-dialog-title"
        className="bg-white  text-gray-900  rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <h2
          id="review-dialog-title"
          className="text-2xl font-semibold mb-4 text-center"
        >
          Export Checklist PDF
        </h2>
        <div className="-space-y-px mb-6">
          <div className="rounded-t-md bg-white  px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300  focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-nile-blue">
            <label
              htmlFor="reviewer-name"
              className="block text-xs font-medium text-gray-900 "
            >
              Reviewer Name
            </label>
            <input
              id="reviewer-name"
              name="reviewer-name"
              type="text"
              placeholder="Jane Smith"
              className="block w-full bg-transparent text-gray-900   placeholder:text-gray-400  focus:outline-none sm:text-sm/6"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
            />
          </div>
          <div className="bg-white  px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300  focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-nile-blue">
            <label
              htmlFor="job-number"
              className="block text-xs font-medium text-gray-900 "
            >
              Job Number
            </label>
            <input
              id="job-number"
              name="job-number"
              type="text"
              placeholder="##-####"
              className="block w-full bg-transparent text-gray-900   placeholder:text-gray-400  focus:outline-none sm:text-sm/6"
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
            />
          </div>
          <div className="bg-white  px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300  focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-nile-blue">
            <label
              htmlFor="job-review-date"
              className="block text-xs font-medium text-gray-900 "
            >
              Review Date
            </label>
            <input
              id="job-review-date"
              name="job-review-date"
              type="date"
              className="block w-full bg-transparent text-gray-900   placeholder:text-gray-400  focus:outline-none sm:text-sm/6"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="rounded-b-md bg-white  px-3 pt-2.5 pb-1.5 outline-1 -outline-offset-1 outline-gray-300  focus-within:relative focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-nile-blue">
            <label
              htmlFor="review-comments"
              className="block text-xs font-medium text-gray-900 "
            >
              Review Comments
            </label>
            <textarea
              id="review-comments"
              name="review-comments"
              placeholder="Enter your comments"
              rows={4}
              className="block w-full bg-transparent text-gray-900   placeholder:text-gray-400  focus:outline-none sm:text-sm/6 resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <label className="mb-4 flex items-start gap-3 text-sm text-gray-900 ">
          <input
            type="checkbox"
            checked={isFinal}
            onChange={(event) => setIsFinal(event.target.checked)}
            disabled={exporting}
            className="mt-0.5 h-4 w-4 accent-nile-blue  "
          />
          <span>
            <span className="font-semibold">Final review</span>
            <span className="block text-gray-600 ">
              Uncheck to label the PDF as draft / work in progress. Draft source
              checklists remain draft even for a final review.
            </span>
          </span>
        </label>
        {error && (
          <p
            role="alert"
            className="mb-4 text-sm text-red-600 "
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-4">
          <Button
            colorMode="auto"
            style="secondary"
            properties={{ disabled: exporting }}
            onClick={onClose}
            label="Cancel"
          />
          <Button
            colorMode="auto"
            style="secondary"
            properties={{ disabled: exporting }}
            onClick={() => {
              void onSave(
                { reviewer, jobNumber, date, notes, isFinal },
                "preview",
              );
            }}
            label="Preview PDF"
          />
          <Button
            colorMode="auto"
            style="primary"
            properties={{ disabled: exporting }}
            onClick={() => {
              void onSave({ reviewer, jobNumber, date, notes, isFinal });
            }}
            label={exporting ? "Creating PDF..." : "Download PDF"}
          />
        </div>
      </div>
    </div>
  );
};

const CategorySummary = ({
  label,
  itemCount,
}: {
  label: "yes" | "no" | "n/a" | "total";
  itemCount: number | string;
}) => {
  const textColor =
    label === "yes"
      ? "text-green-600 "
      : label === "no"
        ? "text-red-600 "
        : label === "n/a"
          ? "text-yellow-600 "
          : "text-gray-600 ";

  const labelText =
    label === "yes"
      ? "Satisfied"
      : label === "no"
        ? "Not Satisfied"
        : label === "n/a"
          ? "Not Applicable"
          : "Total";

  return (
    <div className="flex flex-row lg:flex-col items-center justify-between gap-2 px-2 lg:px-0">
      <p className="font-semibold text-lg mb-0 pb-0 ">{labelText}</p>
      {label === "total" ? (
        <p className={`font-bold text-3xl ${textColor}`}>{itemCount}%</p>
      ) : (
        <p className={`font-bold text-3xl ${textColor}`}>{itemCount}</p>
      )}
    </div>
  );
};
