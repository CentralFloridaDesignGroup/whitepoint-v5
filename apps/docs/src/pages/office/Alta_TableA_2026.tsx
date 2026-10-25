import { useEffect, useState } from "react";
import { Checkbox } from "@whitepoint/ui/input";
import { Printer } from "lucide-react";

interface TableAEntry {
  id: number | string;
  title: string;
  text: string;
  explanation: string;
  alwaysRequired: boolean;
  subitems?: TableAEntry[];
  listItems?: string[];
  default?: boolean;
}

export function Alta_TableA_2026() {
  const [tableA, setTableA] = useState<TableAEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch the Table A data from the JSON file
    fetch("/office/tableA.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => setTableA(data))
      .catch((error) => setError(error.message));
  }, []);

  if (error) return <div>Error: {String(error)}</div>;
  if (!tableA) return <div>Loading…</div>;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 py-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-3xl font-bold">
          ALTA Table A Additional Requirements
        </h1>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-900"
        >
          <Printer size={16} />
          Save as PDF
        </button>
      </div>
      <h1 className="hidden text-3xl font-bold print:block">
        ALTA Table A Additional Requirements
      </h1>
      <div className="flex flex-col gap-2">
        {tableA.map((entry) => (
          <TableEntry key={entry.id} item={entry} />
        ))}
      </div>
    </div>
  );
}

export function TableEntry({ item, parentId }: { item: TableAEntry; parentId?: number | string }) {
  return (
    <div key={item.id} className="p-4 flex flex-col gap-2">
      <div className="flex flex-row items-center gap-2">
        <Checkbox
          id={`${parentId ? `${parentId}-` : ""}${item.id}-checkbox`}
          checked={item.alwaysRequired || (item.default ?? false)}
          aria-label={`Include item ${item.id}`}
          disabled={item.alwaysRequired}
        />
        <h2 className="font-semibold text-lg">
          Item {parentId ? `${parentId}(${item.id})` : item.id}: {item.title}
        </h2>
      </div>
      <p className="text-sm/6 md:text-base">{item.text}</p>
      <p className="text-gray-600">{item.explanation}</p>
      {item.listItems && (
        <ul className="list-disc list-inside ml-6 space-y-2">
          {item.listItems.map((listItem, index) => (
            <li key={index}>{listItem}</li>
          ))}
        </ul>
      )}
      {item.subitems &&
        item.subitems.map((subItem) => (
          <div key={subItem.id} className="flex flex-col gap-2 ml-8">
            <TableEntry item={subItem} parentId={item.id} />
          </div>
        ))}
    </div>
  );
}
