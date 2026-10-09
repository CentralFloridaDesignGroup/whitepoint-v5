import { Sections } from "../SectionRef.json";
import * as LucideIcons from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchUserFavoritePaths, saveUserFavoritePaths } from "../homeFavoritesApi";
import { Keyboard, LucideIcon, Star } from "lucide-react";
import { SidebarHeaderItem, SidebarLinkItem, useSidebarContext } from "@whitepoint/ui/layout";
import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions } from "@headlessui/react";
import { useAuth } from "../../auth/AuthContext";

type SectionLink = {
    name: string;
    description: string;
    tags?: string[];
    path: string;
    requiresAuth?: boolean;
    requiredPermission?: import("@whitepoint/types").AppPermission;
};

type HomeSection = {
    name: string;
    description: string;
    icon?: string;
    requiresAuth?: boolean;
    requiredPermission?: import("@whitepoint/types").AppPermission;
    links?: SectionLink[];
};

function normalizePaths(value: unknown): string[] {
    const items = Array.isArray(value) ? value : [];
    const unique = new Set<string>();

    for (const item of items) {
        const text = String(item ?? "").trim();
        if (!text || !text.startsWith("/")) {
            continue;
        }
        unique.add(text);
    }

    return Array.from(unique);
}

export function HomeV2() {
    const { isAuthenticated, userId, hasPermission } = useAuth();
    const favoritesStorageKey = `wps-document:favorites:${userId ?? "anonymous"}`;
    const recentStorageKey = `wps-document:recent:${userId ?? "anonymous"}`;

    const [favoritePaths, setFavoritePaths] = useState<string[]>([]);
    const [recentPaths, setRecentPaths] = useState<string[]>([]);
    const [favoritesHydrated, setFavoritesHydrated] = useState(false);
    const [recentHydrated, setRecentHydrated] = useState(false);
    const [favoritesLoaded, setFavoritesLoaded] = useState(false);
    const { setSidebarItems } = useSidebarContext();
    const [filterQuery, setFilterQuery] = useState<string | null>(null);
    const [searchResults, setSearchResults] = useState<SectionLink[]>([]);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    const GetLucideIcon = (iconName: string) => {
        const IconComponent = LucideIcons[iconName as keyof typeof LucideIcons] as LucideIcon | undefined;
        return IconComponent ? <IconComponent className="w-6 h-6" /> : null;
    };

    useEffect(() => {
        window.document.title = "Home - The Compass";
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
                event.preventDefault();
                searchInputRef.current?.focus();
                searchInputRef.current?.select();
            }
        };

        window.document.addEventListener("keydown", onKeyDown);

        return () => {
            window.document.removeEventListener("keydown", onKeyDown);
        };
    }, []);

    const getVisibleLinks = useCallback(
        (section: HomeSection) => (section.links ?? []).filter((link) => (!link.requiresAuth || isAuthenticated) && (!link.requiredPermission || hasPermission(link.requiredPermission))),
        [hasPermission, isAuthenticated]
    );

    const visibleSections = useMemo(() => {
        return (Sections as HomeSection[])
            .filter((section) => (!section.requiresAuth || isAuthenticated) && (!section.requiredPermission || hasPermission(section.requiredPermission)))
            .map((section) => ({ ...section, visibleLinks: getVisibleLinks(section) }))
            .filter((section) => section.visibleLinks.length > 0);
    }, [getVisibleLinks, hasPermission, isAuthenticated]);

    const linksByPath = useMemo(() => {
        const links = new Map<string, SectionLink>();
        for (const section of visibleSections) {
            for (const link of section.visibleLinks) {
                links.set(link.path, link);
            }
        }
        return links;
    }, [visibleSections]);

    const favoritesLinks = useMemo(() => {
        if (favoritePaths.length === 0) {
            return [] as SectionLink[];
        }

        return favoritePaths
            .map((path) => linksByPath.get(path))
            .filter((link): link is SectionLink => Boolean(link));
    }, [favoritePaths, linksByPath]);

    const recentLinks = useMemo(() => {
        if (recentPaths.length === 0) {
            return [] as SectionLink[];
        }

        return recentPaths
            .map((path) => linksByPath.get(path))
            .filter((link): link is SectionLink => Boolean(link));
    }, [linksByPath, recentPaths]);

    useEffect(() => {
        if (favoritesLinks.length === 0 && recentLinks.length === 0) {
            setSidebarItems([]);
            return;
        }

        const sidebarItems: (SidebarHeaderItem | SidebarLinkItem)[] = [];

        if (favoritesLinks.length > 0) {
            const favoriteSidebarItems = favoritesLinks.map(
                (favorite) =>
                ({
                    type: "link",
                    label: favorite.name,
                    href: favorite.path,
                    display: "card",
                } as SidebarLinkItem)
            );

            sidebarItems.push({ type: "header", label: "Favorites", icon: <LucideIcons.Star width={20} height={20} /> } as SidebarHeaderItem, ...favoriteSidebarItems);
        }

        if (recentLinks.length > 0) {
            const recentSidebarItems = recentLinks.map(
                (recent) =>
                ({
                    type: "link",
                    label: (<div className="flex flex-row items-center justify-between gap-2"><p>{recent.name}</p>{favoritePaths.includes(recent.path) && <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />}</div>),
                    href: recent.path,
                    display: "card",
                } as SidebarLinkItem)
            );

            sidebarItems.push({ type: "header", label: "Recent", icon: <LucideIcons.Clock width={20} height={20} /> } as SidebarHeaderItem, ...recentSidebarItems);
        }

        setSidebarItems(sidebarItems);
    }, [favoritesLinks, recentLinks, setSidebarItems]);

    useEffect(() => {
        if (!filterQuery) {
            setSearchResults(visibleSections.flatMap((section) => section.visibleLinks));
            return;
        }

        if (!filterQuery) {
            const allLinks = visibleSections.flatMap((section) => section.visibleLinks);
            setSearchResults(allLinks);
            return;
        }

        const lowerQuery = filterQuery.toLowerCase();
        const results: SectionLink[] = [];
        for (const section of visibleSections) {
            for (const link of section.visibleLinks) {
                if (
                    link.name.toLowerCase().includes(lowerQuery) ||
                    link.description.toLowerCase().includes(lowerQuery) ||
                    (link.tags ?? []).some((tag) => tag.toLowerCase().includes(lowerQuery))
                ) {
                    results.push(link);
                }
            }
        }
        setSearchResults(results);
    }, [filterQuery, visibleSections]);

    const isFavorite = useCallback((path: string) => favoritePaths.includes(path), [favoritePaths]);

    const toggleFavorite = useCallback((path: string) => {
        setFavoritePaths((previous) => {
            if (previous.includes(path)) {
                return previous.filter((item) => item !== path);
            }
            return [...previous, path];
        });
    }, []);

    const rememberRecentPath = useCallback((path: string) => {
        setRecentPaths((previous) => {
            const normalizedPath = String(path ?? "").trim();
            if (!normalizedPath.startsWith("/")) {
                return previous;
            }

            const next = [normalizedPath, ...previous.filter((item) => item !== normalizedPath)];
            return next.slice(0, 5);
        });
    }, []);

    function navigate(path: string) {
        rememberRecentPath(path);
        window.location.href = path;
    }

    useEffect(() => {
        setFavoritesLoaded(false);
    }, [isAuthenticated, userId]);

    useEffect(() => {
        setFavoritesHydrated(false);
    }, [favoritesStorageKey]);

    useEffect(() => {
        setRecentHydrated(false);
    }, [recentStorageKey]);

    useEffect(() => {
        const rawValue = localStorage.getItem(favoritesStorageKey);
        if (!rawValue) {
            setFavoritePaths([]);
            setFavoritesHydrated(true);
            return;
        }

        try {
            const parsed = JSON.parse(rawValue);
            setFavoritePaths(normalizePaths(parsed));
        } catch {
            setFavoritePaths([]);
        } finally {
            setFavoritesHydrated(true);
        }
    }, [favoritesStorageKey]);

    useEffect(() => {
        const rawValue = localStorage.getItem(recentStorageKey);
        if (!rawValue) {
            setRecentPaths([]);
            setRecentHydrated(true);
            return;
        }

        try {
            const parsed = JSON.parse(rawValue);
            setRecentPaths(normalizePaths(parsed).slice(0, 5));
        } catch {
            setRecentPaths([]);
        } finally {
            setRecentHydrated(true);
        }
    }, [recentStorageKey]);

    useEffect(() => {
        let active = true;

        async function loadFavoritesFromApi() {
            if (!isAuthenticated || !userId) {
                setFavoritesLoaded(true);
                return;
            }

            try {
                const serverFavorites = await fetchUserFavoritePaths();
                if (!active) {
                    return;
                }
                setFavoritePaths(serverFavorites);
                localStorage.setItem(favoritesStorageKey, JSON.stringify(serverFavorites));
            } catch {
                // Local storage favorites remain the fallback if network sync fails.
            } finally {
                if (active) {
                    setFavoritesLoaded(true);
                }
            }
        }

        void loadFavoritesFromApi();

        return () => {
            active = false;
        };
    }, [favoritesStorageKey, isAuthenticated, userId]);

    useEffect(() => {
        if (!favoritesHydrated) {
            return;
        }

        localStorage.setItem(favoritesStorageKey, JSON.stringify(favoritePaths));

        if (!favoritesLoaded || !isAuthenticated || !userId) {
            return;
        }

        void saveUserFavoritePaths(favoritePaths).catch(() => {
            // Keep local favorites when server save is temporarily unavailable.
        });
    }, [favoritePaths, favoritesHydrated, favoritesLoaded, favoritesStorageKey, isAuthenticated, userId]);

    useEffect(() => {
        if (!recentHydrated) {
            return;
        }

        localStorage.setItem(recentStorageKey, JSON.stringify(recentPaths.slice(0, 5)));
    }, [recentHydrated, recentPaths, recentStorageKey]);


    const renderCard = useCallback(
        (link: SectionLink) => (
            <div key={link.path}>
                <div className="border rounded-md px-4 py-3 flex flex-col h-full shadow-md hover:shadow-lg transition-shadow cursor-pointer bg-white hover:bg-gray-50   group"
                    onClick={() => navigate(link.path)}
                >
                    <div className="flex flex-row items-center justify-between">
                        <h3 className="text-lg font-semibold">{link.name}</h3>
                        {isAuthenticated && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Prevent card click navigation when toggling favorite state.
                                    toggleFavorite(link.path);
                                }}
                                className={`p-1 rounded cursor-pointer ${isFavorite(link.path) ? "text-yellow-400" : "text-transparent group-hover:text-gray-600 "}`}
                                aria-label={isFavorite(link.path) ? "Remove from favorites" : "Add to favorites"}
                            >
                                <Star className={`h-5 w-5 ${isFavorite(link.path) ? "fill-yellow-400" : ""}`} />
                            </button>
                        )}
                    </div>
                    <div className="relative group">
                        <p className="text-xs text-gray-600  whitespace-nowrap overflow-hidden" title={link.description}>
                            {link.description}
                        </p>
                    </div>
                </div>
            </div>
        ),
        [isAuthenticated, isFavorite, toggleFavorite]
    );

    return (
        <div className="flex flex-col items-center justify-center ">
            {/* search bar with dropdown showing names and descriptions */}
            <Combobox
                as="div"
                className="relative w-full max-w-4xl mb-4"
                value={filterQuery}
                onChange={(value) => { if (value) { navigate(value); } }}
                immediate
            >
                <ComboboxInput
                    ref={searchInputRef}
                    className="w-full rounded-md border border-gray-300 bg-white  py-2 pl-3 pr-28 shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary sm:text-sm md:text-lg"
                    placeholder="Search for resources, tools, references..."
                    onChange={(event) => setFilterQuery(event.target.value)}
                    autoComplete="off"
                />
                <div className="pointer-events-none absolute inset-y-0 right-3 items-center gap-1 text-gray-500  hidden sm:flex">
                    <Keyboard className="h-4 w-4" aria-hidden="true" />
                    <span className="text-sm font-medium">Ctrl+K</span>
                </div>
                <ComboboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white  py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                    {searchResults.map((result) => (
                        <ComboboxOption
                            key={result.path}
                            value={result.path}
                            className={({ focus }) =>
                                `relative cursor-pointer select-none py-2 pl-3 pr-9 z-[250] ${focus ? "bg-primary text-white" : "text-gray-900 "}`
                            }
                        >
                            {({ focus }) => (
                                <>
                                    <div className="flex items-center justify-start">
                                        <span className={`block truncate ${focus ? "font-semibold" : "font-normal"}`}>
                                            {result.name}
                                        </span>
                                        {favoritePaths.includes(result.path) && (
                                            <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 ml-2" />
                                        )}
                                    </div>
                                    <span className={`block text-sm ${focus ? "text-gray-200" : "text-gray-500"}`}>
                                        {result.description}
                                    </span>
                                </>
                            )}
                        </ComboboxOption>
                    ))}
                </ComboboxOptions>
            </Combobox>

            {favoritesLinks.length > 0 && (
                <div className="w-full mb-10 md:hidden">
                    <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                        <Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />
                        Favorites
                    </h2>
                    <p className="text-gray-600  mb-4">Your favorite resources for quick access.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                        {favoritesLinks.map((link) => renderCard(link))}
                    </div>
                </div>
            )}

            {visibleSections.map((section) => (
                <div key={section.name} className="w-full mb-6 md:mb-11">
                    <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
                        {section.icon && GetLucideIcon(section.icon)}
                        {section.name}
                    </h2>
                    <p className="text-gray-600  mb-4">{section.description}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                        {section.visibleLinks?.map((link) => renderCard(link))}
                    </div>
                </div>
            ))}
        </div>
    );
}
