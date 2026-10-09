import { useState, useEffect } from "react";
import { CircleCheck, CircleX, CircleSlash } from "lucide-react";

/**
 * A checklist item component.
 * @param {object} item - The checklist item data.
 * @param {number} checklistItem - The index of the checklist item.
 * @param {function} onStatusChange - Callback function when status changes.
 * @param {function} onNoteChange - Callback function when note changes.
 * @returns JSX.Element
 */
export default function ChecklistItem({
  item,
  checklistItem,
  onStatusChange,
  onNoteChange,
}: {
  item: {
    id?: string;
    source?: { label: string; url?: string };
    reviewStatus?: string;
    reviewedAt?: string | null;
    title: string;
    code?: string;
    statement: string;
    options: "YesNo" | "YesNoN/A";
  };
  checklistItem: number;
  onStatusChange: (title: string, status: string) => void;
  onNoteChange: (title: string, note: string) => void;
}) {
  const itemId = item.id ?? item.title;
  const [selectedOption, setSelectedOption] = useState(
    item.options === "YesNo" ? "no" : "na",
  );
  const [reason, setReason] = useState("");

  useEffect(() => {
    onStatusChange(itemId, selectedOption);
  }, [selectedOption, itemId, onStatusChange]);

  useEffect(() => {
    onNoteChange(itemId, reason);
  }, [reason, itemId, onNoteChange]);

  return (
    <div className="flex items-start justify-between px-4 py-2 border-l-4 border-mercury-700">
      <div className="w-full">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
          <h3 className="text-lg font-medium text-gray-900 flex-grow text-center lg:text-left ">
            Item {checklistItem + 1}. {item.title}
          </h3>
          {item.options === "YesNo" && (
            <YesNoOption group_id={itemId} onOptionChange={setSelectedOption} />
          )}
          {item.options === "YesNoN/A" && (
            <YesNoNAOption
              group_id={itemId}
              onOptionChange={setSelectedOption}
            />
          )}
        </div>
        {item.source ? (
          <p className="text-sm italic mt-1 ">
            Reference:{" "}
            {item.source.url ? (
              <a
                className="underline"
                href={item.source.url}
                target="_blank"
                rel="noreferrer"
              >
                {item.source.label}
              </a>
            ) : (
              item.source.label
            )}{" "}
            
            {item.reviewStatus === "reviewed"
              ? ""
              : "| DRAFT - needs review"}
          </p>
        ) : (
          <p className="text-sm mt-1 w-full text-center lg:text-left ">
            Reference: {item.code}
          </p>
        )}
        <p className="mt-1 w-full ">
          {item.statement}
        </p>
        {((item.options === "YesNoN/A" && selectedOption === "no") ||
          (item.options === "YesNo" && selectedOption === "no")) && (
          <div className="mt-2 flex flex-col lg:flex-row lg:items-center">
            <p className="text-sm text-red-600  font-semibold lg:w-[20%] lg:me-5">
              Denial Reason:
            </p>

            <input
              id={`denial-reason-${itemId}`}
              type="text"
              aria-label={`Denial reason for ${item.title}`}
              className="w-full border border-neutral-300  bg-white  text-neutral-900  placeholder:text-neutral-500  rounded-md p-2 text-sm"
              placeholder="Provide reasoning for denial here."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A Yes/No option component.
 * @param {Number} group_id - The unique identifier for the option group.
 * @param {function} onOptionChange - Callback function when option changes.
 * @returns JSX.Element
 */
const YesNoOption = ({
  group_id,
  onOptionChange,
}: {
  group_id: string;
  onOptionChange: (value: string) => void;
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionChange(event.target.value);
  };

  return (
    <div className="isolate inline-flex justify-between rounded-md shadow-xs w-full lg:w-50">
      <label
        key="yes-option"
        aria-label="Yes"
        className="group relative inline-flex flex-grow flex-1 items-center rounded-l-md bg-white  px-3 py-1 mr-0 text-sm font-semibold text-gray-900 inset-ring-1 inset-ring-gray-300  hover:bg-green-100  has-focus-visible:z-10 has-focus-visible:ring-2 has-focus-visible:ring-blue-400 focus:z-10 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 has-checked:bg-green-500   group-has-checked:text-white"
      >
        <input
          id={`option-yes-${group_id}`}
          aria-label="Yes"
          defaultValue="yes"
          defaultChecked={false}
          onChange={(e) => handleChange(e)}
          name={`option-${group_id}`}
          type="radio"
          disabled={false}
          className="absolute inset-0 appearance-none cursor-pointer focus:outline-none disabled:cursor-not-allowed"
        />
        <CircleCheck className="w-6 h-6 mx-auto text-green-500  group-has-checked:text-white" />
      </label>
      <label
        key="no-option"
        aria-label="No"
        className="group relative inline-flex flex-grow flex-1 items-center rounded-r-md bg-white  px-3 py-1 ms-0 text-sm font-semibold text-gray-900 inset-ring-1 inset-ring-gray-300  hover:bg-red-100  has-focus-visible:z-10 has-focus-visible:ring-2 has-focus-visible:ring-blue-400 focus:z-10 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 has-checked:bg-red-500   group-has-checked:text-white"
      >
        <input
          id={`option-no-${group_id}`}
          aria-label="No"
          defaultValue="no"
          defaultChecked={true}
          onChange={(e) => handleChange(e)}
          name={`option-${group_id}`}
          type="radio"
          disabled={false}
          className="absolute inset-0 appearance-none cursor-pointer focus:outline-none disabled:cursor-not-allowed"
        />
        <CircleX className="w-6 h-6 mx-auto text-red-500  group-has-checked:text-white" />
      </label>
    </div>
  );
};

/**
 * A Yes/No/N/A option component.
 * @param {Number} group_id - The unique identifier for the option group.
 * @param {function} onOptionChange - Callback function when option changes.
 * @returns JSX.Element
 */
const YesNoNAOption = ({
  group_id,
  onOptionChange,
}: {
  group_id: string;
  onOptionChange: (value: string) => void;
}) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onOptionChange(event.target.value);
  };

  return (
    <div className="isolate inline-flex justify-between rounded-md shadow-xs w-50">
      <label
        key="yes-option"
        aria-label="Yes"
        className="group relative inline-flex flex-grow flex-1 items-center rounded-l-md bg-white  px-3 py-1 mr-0 text-sm font-semibold text-gray-900 inset-ring-1 inset-ring-gray-300  hover:bg-green-100  has-focus-visible:z-10 has-focus-visible:ring-2 has-focus-visible:ring-blue-400 focus:z-10 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 has-checked:bg-green-500   group-has-checked:text-white"
      >
        <input
          id={`option-yes-${group_id}`}
          aria-label="Yes"
          defaultValue="yes"
          defaultChecked={false}
          onChange={(e) => handleChange(e)}
          name={`option-${group_id}`}
          type="radio"
          disabled={false}
          className="absolute inset-0 appearance-none cursor-pointer focus:outline-none disabled:cursor-not-allowed"
        />
        <CircleCheck className="w-6 h-6 mx-auto text-green-500  group-has-checked:text-white" />
      </label>
      <label
        key="na-option"
        aria-label="N/A"
        className="group relative inline-flex flex-grow flex-1 items-center bg-white  px-3 py-1 mr-0 text-sm font-semibold text-gray-900 inset-ring-1 inset-ring-gray-300  hover:bg-gray-100  has-focus-visible:z-10 has-focus-visible:ring-2 has-focus-visible:ring-blue-400 focus:z-10 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 has-checked:bg-gray-500   group-has-checked:text-white"
      >
        <input
          id={`option-na-${group_id}`}
          aria-label="N/A"
          defaultValue="na"
          defaultChecked={true}
          onChange={(e) => handleChange(e)}
          name={`option-${group_id}`}
          type="radio"
          disabled={false}
          className="absolute inset-0 appearance-none cursor-pointer focus:outline-none disabled:cursor-not-allowed"
        />
        <CircleSlash className="w-6 h-6 mx-auto text-gray-500  group-has-checked:text-white" />
      </label>
      <label
        key="no-option"
        aria-label="No"
        className="group relative inline-flex flex-grow flex-1 items-center rounded-r-md bg-white  px-3 py-1 ms-0 text-sm font-semibold text-gray-900 inset-ring-1 inset-ring-gray-300  hover:bg-red-100  has-focus-visible:z-10 has-focus-visible:ring-2 has-focus-visible:ring-blue-400 focus:z-10 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 has-checked:bg-red-500   group-has-checked:text-white"
      >
        <input
          id={`option-no-${group_id}`}
          aria-label="No"
          defaultValue="no"
          defaultChecked={false}
          onChange={(e) => handleChange(e)}
          name={`option-${group_id}`}
          type="radio"
          disabled={false}
          className="absolute inset-0 appearance-none cursor-pointer focus:outline-none disabled:cursor-not-allowed"
        />
        <CircleX className="w-6 h-6 mx-auto text-red-500  group-has-checked:text-white" />
      </label>
    </div>
  );
};
