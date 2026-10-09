import { useCallback, useMemo, useState } from "react";
import ChecklistItem from "./ChecklistItem";
import { ChevronDown } from "lucide-react";
import type { ChecklistSection as Section } from "../createChecklistPdf";

export interface ChecklistSectionProps {
  section: Section;
  index: number;
  onStatusChange: (title: string, status: string) => void;
  onNoteChange: (title: string, note: string) => void;
}

interface SectionStatus {
  yes: number;
  no: number;
  na: number;
}

const defaultItemStatus = (item: Section['items'][number]) =>
  item.options === "YesNo" ? "no" : "na";

export function ChecklistSection({
  section,
  index,
  onStatusChange,
  onNoteChange,
}: ChecklistSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [itemStatuses, setItemStatuses] = useState<Record<string, string>>(
    () => {
      const initial: Record<string, string> = {};
      section.items.forEach((item) => {
        initial[item.id ?? item.title] = defaultItemStatus(item);
      });
      return initial;
    },
  );

  const sectionColor = (text: keyof SectionStatus) =>
    text === "yes"
      ? "text-green-600 bg-green-200"
      : text === "no"
        ? "text-red-600 bg-red-200"
        : text === "na"
          ? "text-yellow-600 bg-yellow-200"
          : "text-gray-500 bg-gray-200";

  const sectionStatus = useMemo<SectionStatus>(() => {
    const counts: SectionStatus = { yes: 0, no: 0, na: 0 };
    Object.values(itemStatuses).forEach((status) => {
      if (status === "yes" || status === "no" || status === "na") {
        counts[status] += 1;
      }
    });
    return counts;
  }, [itemStatuses]);

  const onLocalStatusChange = useCallback(
    (title: string, status: string) => {
      setItemStatuses((prev) => ({ ...prev, [title]: status }));
      onStatusChange(title, status);
    },
    [onStatusChange],
  );

  return (
    <section key={index} id={`${section.id ?? section.title}`}>
      <div className="py-2 px-4 bg-neutral-200 ">
        <div
          className="cursor-pointer flex flex-col lg:flex-row justify-between lg:items-center"
          onClick={() => setExpanded(!expanded)}
        >
          <h3 className="text-xl font-semibold text-gray-800 ">
            {expanded ? (
              <ChevronDown className="inline-block w-4 h-4 mr-2 rotate-180" />
            ) : (
              <ChevronDown className="inline-block w-4 h-4 mr-2" />
            )}
            Section {index + 1}. {section.title}
          </h3>
          <div className="flex flex-row space-x-2">
            <span
              className={`px-2 py-1 rounded-full text-xs ${sectionColor("yes")}`}
            >
              {sectionStatus.yes}
            </span>
            <span
              className={`px-2 py-1 rounded-full text-xs ${sectionColor("no")}`}
            >
              {sectionStatus.no}
            </span>
            <span
              className={`px-2 py-1 rounded-full text-xs ${sectionColor("na")}`}
            >
              {sectionStatus.na}
            </span>
            <span
              className={`px-2 py-1 rounded-full text-xs text-blue-600 bg-blue-200`}
            >
              {(sectionStatus.yes / (sectionStatus.yes + sectionStatus.no + sectionStatus.na) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
        {/* Kept mounted (not conditionally rendered) so collapsed sections still report item status. */}
        <div className={`mt-4 space-y-2 ${expanded ? "" : "hidden"}`}>
          {section.items.map((item, itemIndex: number) => (
            <ChecklistItem
              key={item.id ?? item.title}
              item={item}
              checklistItem={itemIndex}
              onStatusChange={onLocalStatusChange}
              onNoteChange={onNoteChange}
            />
          ))}
        </div>
      </div>
    </section>
  );

  // return (
  //     <div
  //     key={index}
  //     id={`${section.id ?? section.title}`}
  //     className="space-y-4 border p-4 rounded-md"
  //     >
  //     <h3 className="text-3xl font-semibold text-gray-800 text-center ">
  //         Section {index + 1}. {section.title}
  //     </h3>
  //     {section.subtitle && (
  //         <h4 className="text-xl font-semibold text-gray-600 text-center ">
  //         {section.subtitle}
  //         </h4>
  //     )}
  //     <div className="grid grid-cols-1 gap-4">
  //         {section.items.map((item: any, itemIndex: number) => (
  //         <ChecklistItem
  //             key={item.id ?? item.title}
  //             item={item}
  //             checklistItem={itemIndex}
  //             onStatusChange={onStatusChange}
  //             onNoteChange={onNoteChange}
  //         />
  //         ))}
  //     </div>
  //     </div>
  // );
}
