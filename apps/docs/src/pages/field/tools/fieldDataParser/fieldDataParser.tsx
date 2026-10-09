import { useState, useEffect } from "react";
import { Button } from "@whitepoint/ui/input";
import { Upload, Download, X } from "lucide-react";

type FileFormat = "txt" | "csv" | null;

interface ProcessingOptions {
  sortLines: boolean,
  capitalizeAll: boolean,
  removeAttributeCommas: boolean,
  processMagnetCodeErrors: boolean
}

export function FieldDataParser() {
  const [file, setFile] = useState<File | null>(null);
  const [fileFormat, setFileFormat] = useState<FileFormat>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [processedContent, setProcessedContent] = useState<string>("");
  const [isProcessed, setIsProcessed] = useState(false);
  const [options, setOptions] = useState<ProcessingOptions>({
    sortLines: true,
    capitalizeAll: true,
    removeAttributeCommas: false,
    processMagnetCodeErrors: false,
  });
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    document.title = "Field Data Parser - The Compass";
  }, []);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const filename = selectedFile.name.toLowerCase();
    const format: FileFormat = filename.endsWith(".txt")
      ? "txt"
      : filename.endsWith(".csv")
        ? "csv"
        : null;

    if (!format) {
      alert("Please select a .txt or .csv file");
      return;
    }

    setFile(selectedFile);
    setFileFormat(format);
    setIsProcessed(false);
    setProcessedContent("");

    // Read file content
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
    };
    reader.readAsText(selectedFile);
  };

  // Process the file according to selected options
  const processFile = () => {
    let lines = fileContent.split("\n");


    // Sort lines if option is enabled
    // First, compare lines by the first value before the first comma, then by the entire line if the first values are equal
    // Can be either numbers or text. Sort text last. If both are numbers, sort numerically. If both are text, sort alphabetically.
    if (options.sortLines) {
      lines.sort((a, b) => {
        const aFirst = a.split(",")[0].trim();
        const bFirst = b.split(",")[0].trim();
        if (!isNaN(Number(aFirst)) && !isNaN(Number(bFirst))) {
          return Number(aFirst) - Number(bFirst);
        }
        if (!isNaN(Number(aFirst))) return -1;
        if (!isNaN(Number(bFirst))) return 1;
        return aFirst.localeCompare(bFirst);
      });
    }

    // Capitalize all text if option is enabled
    if (options.capitalizeAll) {
      lines = lines.map((line) => line.toUpperCase());
    }

    // Remove attribute commas if option is enabled
    if (options.removeAttributeCommas) {
      lines = lines.map((line) => {
        let commaCount = 0;
        let result = "";

        for (const char of line) {
          if (char === ",") {
            commaCount += 1;
            result += commaCount >= 5 ? " " : char;
          } else {
            result += char;
          }
        }

        return result;
      });

    }
    // Process magnet code errors if option is enabled
    if (options.processMagnetCodeErrors) {
      lines = lines.map((line) => {
        const parts = line.split(",");

        if (!parts[4]) {
          console.warn("No code found for line:", line);
          return line; //there is no code associated with the point, just return the line.
        }

        const updatedCodes = [];

        for (let i = 4; i <= parts.length - 1; i++) {
          let fullCode = parts[i];
          if (/^\r$/g.test(fullCode)) {
            continue;
          }
          fullCode = fullCode.replace("CURB & GUTTER", "CURB AND GUTTER").replace(/"? \r/g, "");
          const codeAttr = fullCode.split(/[:&]/);
          const updatedValues = [];
          updatedValues.push(codeAttr[0].replace(/\(.*?\)/g, "")); // Remove parentheses after first code (restatement of code)

          if (codeAttr.length >= 2) {
            if (codeAttr[1].includes("=")) {
              const attributes = codeAttr[1].split("$");

              for (let i = 0; i < attributes.length; i++) {
                const parts = attributes[i].split('=');
                if (parts.length > 1 && parts[1]) {
                  const cleaned = parts[1].replace(/^"|"$/g, "");
                  updatedValues.push(cleaned.trim());
                }
              }
            }
            else {
              updatedValues[0] = updatedValues[0] + codeAttr[1].replace(/"/g, ""); // Remove parentheses after first code (restatement of code)
            }
          }

          if (codeAttr.length >= 3) {
            updatedValues[0] = updatedValues[0] + codeAttr[2].replace(/"/g, ""); // Remove parentheses after first code (restatement of code)
          }
          updatedCodes.push(updatedValues.join(" "));
        }
        const updatedCodeStr = updatedCodes.length > 1 ? updatedCodes.join(" | ") : updatedCodes[0];
        return (`${parts[0]},${parts[1]},${parts[2]},${parts[3]},${updatedCodeStr}`);

      });
    }

    const result = lines.join("\n");
    setProcessedContent(result);
    setIsProcessed(true);
  };

  // Download processed file
  const downloadFile = () => {
    if (!fileFormat || !processedContent) return;

    const filename = `${file?.name.slice(0, file.name.lastIndexOf("."))}_processed.${fileFormat}`;
    const element = document.createElement("a");
    const fileBlob = new Blob([processedContent], { type: "text/plain" });

    element.href = URL.createObjectURL(fileBlob);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    URL.revokeObjectURL(element.href);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    if (!droppedFile) return;

    const filename = droppedFile.name.toLowerCase();
    const format: FileFormat = filename.endsWith(".txt")
      ? "txt"
      : filename.endsWith(".csv")
        ? "csv"
        : null;

    if (!format) {
      alert("Please drop a .txt or .csv file");
      return;
    }

    setFile(droppedFile);
    setFileFormat(format);
    setIsProcessed(false);
    setProcessedContent("");

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setFileContent(content);
    };
    reader.readAsText(droppedFile);
  };

  // Clear all selections
  const clearAll = () => {
    setFile(null);
    setFileFormat(null);
    setFileContent("");
    setProcessedContent("");
    setIsProcessed(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 ">File Data Parser</h1>
        <p className="text-gray-600 ">
          Upload a .txt or .csv file, apply text modifications, and download the processed file.
        </p>
      </div>

      {/* File Upload Section */}
      <div className="bg-white  rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900  mb-4">1. Upload File</h2>
        <div className="relative">
          <input
            type="file"
            accept=".txt,.csv"
            onChange={handleFileChange}
            
            className="hidden"
            id="file-input"
          />
          <label
            htmlFor="file-input"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg p-8 cursor-pointer transition ${isDragging ? "border-nile-blue bg-blue-50 " : "border-gray-300 hover:border-nile-blue hover:bg-blue-50 "}`}
          >
            <Upload className="w-12 h-12 text-gray-400 mb-2 " />
            <span className="text-lg font-medium text-gray-700 ">
              Click to upload or drag and drop
            </span>
            <span className="text-sm text-gray-500 mt-1 ">
              Supported formats: .txt, .csv
            </span>
          </label>
        </div>

        {file && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-md flex items-center justify-between">
            <div>
              <p className="font-medium text-green-900">{file.name}</p>
              <p className="text-sm text-green-700">
                Format: {fileFormat?.toUpperCase()} • Size: {(file.size / 1024).toFixed(2)} KB
              </p>
            </div>
            <button
              onClick={clearAll}
              className="text-green-600 hover:text-green-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* Processing Options Section */}
      {file && (
        <div className="bg-white  rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 ">2. Select Modifications</h2>

          <div className="space-y-4">


            {/* Sort Lines */}
            <label className="flex items-center p-4 border border-gray-200 rounded-md hover:bg-gray-50  cursor-pointer">
              <input
                type="checkbox"
                checked={options.sortLines}
                onChange={(e) =>
                  setOptions({ ...options, sortLines: e.target.checked })
                }
                className="w-4 h-4 text-nile-blue rounded"
              />
              <div className="ml-3">
                <span className="font-medium text-gray-700 ">Sort Lines</span>
                <p className="text-sm text-gray-500 ">Sort lines alphabetically</p>
              </div>
            </label>

            {/* Capitalize All */}
            <label className="flex items-center p-4 border border-gray-200 rounded-md hover:bg-gray-50  cursor-pointer">
              <input
                type="checkbox"
                checked={options.capitalizeAll}
                onChange={(e) =>
                  setOptions({ ...options, capitalizeAll: e.target.checked })
                }
                className="w-4 h-4 text-nile-blue rounded"
              />
              <div className="ml-3">
                <span className="font-medium text-gray-700 ">Capitalize All</span>
                <p className="text-sm text-gray-500 ">Capitalize all text in the file</p>
              </div>
            </label>

            {/* Remove Attribute Commas */}
            <label className="flex items-center p-4 border border-gray-200 rounded-md hover:bg-gray-50  cursor-pointer">
              <input
                type="checkbox"
                checked={options.removeAttributeCommas}
                onChange={(e) =>
                  setOptions({ ...options, removeAttributeCommas: e.target.checked })
                }
                className="w-4 h-4 text-nile-blue rounded"
              />
              <div className="ml-3">
                <span className="font-medium text-gray-700 ">[Trimble] Remove Attribute Commas</span>
                <p className="text-sm text-gray-500 ">Remove commas from attributes added from the field software.</p>
              </div>
            </label>

            {/* Fix Magnet Field Errors */}
            <label className="flex items-center p-4 border border-gray-200 rounded-md hover:bg-gray-50  cursor-pointer">
              <input
                type="checkbox"
                checked={options.processMagnetCodeErrors}
                onChange={(e) =>
                  setOptions({ ...options, processMagnetCodeErrors: e.target.checked })
                }
                className="w-4 h-4 text-nile-blue rounded"
              />
              <div className="ml-3">
                <span className="font-medium text-gray-700 ">[Topcon] Fix Magnet Field Errors</span>
                <p className="text-sm text-gray-500 ">Automatically fix common magnet field errors in the file.</p>
              </div>
            </label>

          </div>

          {/* Process Button */}
          <div className="mt-6 flex gap-3">
            <Button colorMode="auto"
              label="Process File"
              onClick={processFile}
              style="primary"
              size="medium"
            />
            <Button colorMode="auto"
              label="Clear All"
              onClick={clearAll}
              style="secondary"
              size="medium"
            />
          </div>
        </div>
      )}

      {/* Preview Section */}
      {fileContent && (
        <div className="bg-white  rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900  mb-4">3. Preview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-medium text-gray-700  mb-2">Original</h3>
              <div className="bg-gray-50  border border-gray-200  rounded p-3 font-mono text-sm max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
                {fileContent.substring(0, 1000)}
                {fileContent.length > 1000 && "..."}
              </div>
            </div>
            {isProcessed && (
              <div>
                <h3 className="font-medium text-gray-700  mb-2">Processed</h3>
                <div className="bg-gray-50  border border-gray-200  rounded p-3 font-mono text-sm max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
                  {processedContent.substring(0, 1000)}
                  {processedContent.length > 1000 && "..."}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Download Section */}
      {isProcessed && processedContent && (
        <div className="bg-white  rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900  mb-4">4. Download</h2>
          <p className="text-gray-600  mb-4">
            Your file has been processed successfully. Download it now.
          </p>
          <Button colorMode="auto"
            label="Download Processed File"
            onClick={downloadFile}
            style="primary"
            size="medium"
            icon={Download}
          />
        </div>
      )}
    </div>
  );
}
