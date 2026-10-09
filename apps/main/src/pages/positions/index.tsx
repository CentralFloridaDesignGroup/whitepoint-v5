import { useEffect, useState } from 'react';
import { Dates } from "@whitepoint/utils";
import type { JobPosition } from './jobPosition';
import { MarketingSelect, MarketingTextField } from '../../components/marketing';
import { JobPostingCard } from './components/jobPostingCard';

type PositionFileResponse = {
    jobData: JobPosition;
};

type KeyValueOption = {
    key: string;
    value: string;
};

export function Positions() {
    const [loading, setLoading] = useState(true);
    const [positions, setPositions] = useState<JobPosition[]>([]);
    const [filteredPositions, setFilteredPositions] = useState<JobPosition[]>([]);
    const [locationFilter, setLocationFilter] = useState<string[]>([]);
    const [stateFilter, setStateFilter] = useState<KeyValueOption[]>([]);
    const [tagsFilter, setTagsFilter] = useState<KeyValueOption[]>([]);
    const [userFilters, setUserFilters] = useState({
        name: "",
        location: "",
        state: "",
        tags: ""
    });

    const locationOptions: KeyValueOption[] = [...new Set(locationFilter)]
        .sort((a, b) => a.localeCompare(b))
        .map((location) => ({ key: location, value: location }));

    useEffect(() => {
        const filtered = positions.filter((position) => {
            const today = new Date();
            const openDate = new Date(position.basicInfo.positionOpenDate);
            const matchesName = position.displayName.toLowerCase().includes(userFilters.name.toLowerCase());
            const matchesLocation = userFilters.location ? position.basicInfo.positionCity === userFilters.location : true;
            const matchesState = userFilters.state ? position.basicInfo.positionState === userFilters.state : true;
            const positionTags = (position.meta as { tags?: unknown }).tags;
            const matchesTags = userFilters.tags ? (Array.isArray(positionTags) && positionTags.includes(userFilters.tags)) : true;
            const isOpen = openDate <= today && Dates.getDaysRemaining(position.basicInfo.positionEndDate) >= 0;
            const exclusionReasons: string[] = [];

            if (!position.isActive) exclusionReasons.push("inactive position");
            if (!isOpen) exclusionReasons.push("outside open date window");
            if (!matchesName) exclusionReasons.push(`name filter mismatch (query: "${userFilters.name}")`);
            if (!matchesLocation) exclusionReasons.push(`location mismatch (expected: "${userFilters.location}", actual: "${position.basicInfo.positionCity}")`);
            if (!matchesState) exclusionReasons.push(`state mismatch (expected: "${userFilters.state}", actual: "${position.basicInfo.positionState}")`);
            if (!matchesTags) exclusionReasons.push(`tag mismatch (expected: "${userFilters.tags}", actual: "${Array.isArray(positionTags) ? positionTags.join(", ") : "no tags"}")`);

            if (exclusionReasons.length > 0) {
                console.debug("[Positions] Filtered out", {
                    id: position.id,
                    displayName: position.displayName,
                    reasons: exclusionReasons
                });
            }

            return exclusionReasons.length === 0;
        });
        const collator = new Intl.Collator(undefined, { sensitivity: "base" });

        const sortedFiltered = [...filtered].sort((a, b) => {
            const stateComparison = collator.compare(a.basicInfo.positionState.trim(), b.basicInfo.positionState.trim());
            if (stateComparison !== 0) return stateComparison;

            const locationComparison = collator.compare(a.basicInfo.positionCity.trim(), b.basicInfo.positionCity.trim());
            if (locationComparison !== 0) return locationComparison;

            return collator.compare(a.displayName.trim(), b.displayName.trim());
        });

        setFilteredPositions(sortedFiltered);
    }, [userFilters, positions]);

    useEffect(() => {
        async function fetchPositions() {
            try {
                const response = await fetch("/positions/index.json");
                if (!response.ok) {
                    throw new Error(`Error fetching job positions: ${response.statusText}`);
                }
                const positionFiles = await response.json() as string[];

                const loadedPositions: JobPosition[] = await Promise.all(positionFiles.map(async (fileName): Promise<JobPosition> => {
                    const positionResponse = await fetch(`/positions/${fileName}`);

                    if (!positionResponse.ok) {
                        throw new Error(`Error fetching position file ${fileName}: ${positionResponse.statusText}`);
                    }

                    const fileData = await positionResponse.json() as unknown;

                    if (fileData && typeof fileData === "object" && "jobData" in fileData) {
                        return (fileData as PositionFileResponse).jobData;
                    }

                    return fileData as JobPosition;
                }));

                setPositions(loadedPositions);

                const uniqueLocations = new Set<string>();
                const uniqueStates = new Set<string>();
                const uniqueTags = new Set<string>();

                loadedPositions.forEach((position) => {
                    uniqueLocations.add(position.basicInfo.positionCity);
                    uniqueStates.add(position.basicInfo.positionState);

                    const rawTags = (position.meta as { tags?: unknown }).tags;
                    if (Array.isArray(rawTags)) {
                        rawTags.forEach((tag) => {
                            if (typeof tag === "string") uniqueTags.add(tag);
                        });
                    }
                });

                setLocationFilter(Array.from(uniqueLocations).sort((a, b) => a.localeCompare(b)));
                setStateFilter(Array.from(uniqueStates).sort((a, b) => a.localeCompare(b)).map(state => ({ key: state, value: state })));
                setTagsFilter(Array.from(uniqueTags).sort((a, b) => a.localeCompare(b)).map(tag => ({ key: tag, value: tag })));
            }
            catch (error) {
                console.error("Failed to fetch job positions:", error);
            }
            finally {
                setLoading(false);
            }
        }
        fetchPositions();
    }, []);

    return (
        <div className="mx-auto max-w-7xl px-4 py-12">
            <h1 className="text-center text-4xl font-bold text-primary">Positions</h1>
            <p className="mt-2 text-center">Explore our current job openings and find the right fit for you.</p>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
                <MarketingTextField
                    field="positionName"
                    label="Position Name"
                    value={userFilters.name}
                    onChange={(event) => setUserFilters(prev => ({ ...prev, name: event.target.value }))}
                    placeholder="Search by position name..."
                />
                <MarketingSelect
                    field="location"
                    label="Location"
                    value={userFilters.location}
                    onChange={(event) => setUserFilters(prev => ({ ...prev, location: event.target.value }))}
                    options={[{ label: "All locations", value: "" }, ...locationOptions.map((option) => ({ label: option.key, value: option.value }))]}
                />
                <MarketingSelect
                    field="state"
                    label="State"
                    value={userFilters.state}
                    onChange={(event) => setUserFilters(prev => ({ ...prev, state: event.target.value }))}
                    options={[{ label: "All states", value: "" }, ...stateFilter.map((option) => ({ label: option.key, value: option.value }))]}
                />
                <MarketingSelect
                    field="tags"
                    label="Tags"
                    value={userFilters.tags}
                    onChange={(event) => setUserFilters(prev => ({ ...prev, tags: event.target.value }))}
                    options={[{ label: "All tags", value: "" }, ...tagsFilter.map((option) => ({ label: option.key, value: option.value }))]}
                />
            </div>
            {loading ? (
                <p className="mt-4 text-center">Loading positions...</p>
            ) : (
                filteredPositions.length > 0 ? (
                    <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                        {filteredPositions.map((position) => (
                            <JobPostingCard key={position.id} position={position} />
                        ))}
                    </div>
                ) : (
                    <p className="mt-6 text-center text-lg font-bold text-primary">Unfortunately, we are not hiring at this time. Please check back later for new opportunities.</p>
                )
            )}
        </div>
    );
}
