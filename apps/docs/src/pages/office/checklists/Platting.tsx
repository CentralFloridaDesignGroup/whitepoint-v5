import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import locationsData from "./plattingLocations.json" with { type: "json" };
import { plattingSlug } from "../../../plattingSlug.mjs";

type PlattingLocation = {
  county: string;
  municipalities: string[];
};

type PlattingLocations = {
  locations: PlattingLocation[];
};

const locations = (locationsData as PlattingLocations).locations;

function checklistPath(county: string, municipality?: string) {
  return municipality
    ? `/checklists/platting/${plattingSlug(county)}/${plattingSlug(municipality)}`
    : `/checklists/platting/${plattingSlug(county)}`;
}

export default function Platting() {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredLocations = useMemo(() => {
    if (!normalizedQuery) return locations;
    return locations
      .map((location) => ({
        ...location,
        municipalities: location.municipalities.filter((municipality) =>
          municipality.toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter(
        (location) =>
          location.county.toLowerCase().includes(normalizedQuery) ||
          location.municipalities.length > 0,
      );
  }, [normalizedQuery]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-5  md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900 ">
            County and Municipality Checklists
          </h1>
          <p className="mt-2 max-w-3xl text-gray-600 ">
            Select a jurisdiction to open its platting checklist. Local
            requirements are placeholders until jurisdiction-specific research
            is completed.
          </p>
        </div>
        <Link
          to="/"
          className="text-sm font-semibold text-nile-blue hover:underline "
        >
          Back to home
        </Link>
      </div>

      <label className="relative block max-w-xl">
        <span className="sr-only">Search counties and municipalities</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search counties or municipalities"
          className="w-full rounded-md border border-gray-300 bg-white py-3 pl-10 pr-4 text-gray-900 outline-none focus:border-nile-blue focus:ring-2 focus:ring-nile-blue/30   "
        />
      </label>

      <div className="flex flex-col gap-4">
        {filteredLocations.map((location) => (
          <CountyLists key={location.county} locations={[location]} />
        ))}
      </div>

      {filteredLocations.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 p-6 text-center text-gray-600  ">
          No matching county or municipality.
        </p>
      )}
    </div>
  );
}

export function CountyLists({
  locations,
}: {
  locations: Array<{ county: string; municipalities: string[] }>;
}) {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <div>
      {locations.map((location) => (
        <div key={location.county} className="mb-2">
          <h2
            className="font-semibold border-b pb-2 border-neutral-300  cursor-pointer"
            onClick={() => setOpen(!open)}
          >
            {open ? <ChevronDown className="inline-block mr-2" /> : <ChevronRight className="inline-block mr-2" />}
            {location.county} County
          </h2>
          {open && (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
              <Link
                to={checklistPath(location.county)}
                className="mb-2 block rounded-md bg-nile-blue px-3 py-2 text-sm font-semibold text-white hover:bg-nile-blue-800"
              >
                Unincorporated {location.county} County Checklist
              </Link>
              {location.municipalities.map((municipality) => (
                <Link
                  key={municipality}
                  to={checklistPath(location.county, municipality)}
                  className="mb-2 block rounded-md bg-nile-blue px-3 py-2 text-sm font-semibold text-white hover:bg-nile-blue-800"
                >
                  City of {municipality} Checklist
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
