import { Fragment, cloneElement, isValidElement, useEffect, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { SidebarHeaderItem, SidebarLinkItem, useSidebarContext } from "@whitepoint/ui/layout";
import { Textbox } from "@whitepoint/ui/input";

interface HeaderItem {
    level: number;
    text: string;
    id: string;
    index: number;
}

export function Documentation({
    markdownFile,
}: {
    markdownFile: string,
}) {
    const [markdown, setMarkdown] = useState("");
    const [headers, setHeaders] = useState<HeaderItem[]>([]);
    const [search, setSearch] = useState("");
    const { setSidebarItems } = useSidebarContext();

    const extractHeaders = (text: string): HeaderItem[] => {
        const headerRegex = /^(#{3,4})\s+(.+)$/gm;
        const foundHeaders: HeaderItem[] = [];
        let match;
        let index = 0;

        while ((match = headerRegex.exec(text)) !== null) {
            const level = match[1].length;
            const text = match[2];
            const id = text
                .toLowerCase()
                .replace(/[^\w\s-]/g, "")
                .replace(/\s+/g, "-")
                .replace(/-+/g, "-")

            foundHeaders.push({ level, text, id, index });
            index++;
        }

        return foundHeaders;
    };

    useEffect(() => {
        setSidebarItems([]);

        function GetHeaderEntry(header: HeaderItem): SidebarHeaderItem {
            return {
                type: "header",
                label: header.text,
            };
        }

        function GetLinkEntry(header: HeaderItem): SidebarLinkItem {
            return {
                type: "link",
                label: header.text.padStart(header.level - 2, "\t"),
                href: `#${header.id}`,
            };
        }

        const newSidebarItems = headers.map((header) => {
            if (header.level === 3) {
                return GetHeaderEntry(header);
            } else {
                return GetLinkEntry(header);
            }
        });

        setSidebarItems(newSidebarItems);
    }, [setSidebarItems, headers]);

    useEffect(() => {
        const loadMarkdown = async () => {
            const response = await fetch(markdownFile);
            if (!response.ok) {
                throw new Error(`Failed to load markdown: ${response.status}`);
            }
            const text = await response.text();
            setMarkdown(text);
            setHeaders(extractHeaders(text));
        };
        loadMarkdown();
    }, [markdownFile]);

    const escapeRegExp = (value: string): string => {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const highlightText = (text: string): ReactNode => {
        const searchTerm = search.trim();
        if (searchTerm === "") {
            return text;
        }

        const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, "gi");
        const parts = text.split(regex);
        const normalizedSearch = searchTerm.toLowerCase();

        return parts.map((part, index) => {
            if (part.toLowerCase() === normalizedSearch) {
                return <mark key={`mark-${index}`} className="bg-yellow-200 px-0.5 rounded-sm">{part}</mark>;
            }

            return <Fragment key={`text-${index}`}>{part}</Fragment>;
        });
    };

    const highlightNode = (node: ReactNode): ReactNode => {
        if (typeof node === "string") {
            return highlightText(node);
        }

        if (Array.isArray(node)) {
            return node.map((child, index) => <Fragment key={`node-${index}`}>{highlightNode(child)}</Fragment>);
        }

        if (isValidElement<{ children?: ReactNode }>(node) && node.props.children) {
            return cloneElement(node, {
                children: highlightNode(node.props.children),
            });
        }

        return node;
    };

    return (

        < div className="w-full flex flex-col justify-center items-center" >
            <div className="w-full max-w-3xl px-4 py-8">
                <Textbox
                    name="search"
                    label="Search documentation"
                    placeholder="Search documentation..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="mb-4"
                />
            </div>
            <div className="prose max-w-7xl w-full px-4 py-8">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSlug]}
                    components={{
                        h1: ({ children, ...props }) => (
                            <h1 className="text-3xl font-semibold text-center uppercase" {...props}>
                                {highlightNode(children)}
                            </h1>
                        ),
                        h2: ({ children, ...props }) => (
                            <h2 id={children?.toString().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")} className="text-2xl font-semibold tracking-tight text-center" {...props}>
                                {highlightNode(children)}
                            </h2>
                        ),
                        h3: ({ children, ...props }) => (
                            <h3 id={children?.toString().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")} className="text-2xl font-semibold tracking-tight mt-6 scroll-mt-2" {...props}>
                                {highlightNode(children)}
                            </h3>
                        ),
                        h4: ({ children, ...props }) => (
                            <h4 id={children?.toString().toLowerCase().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-")} className="text-xl font-semibold tracking-tight mt-4 scroll-mt-2" {...props}>
                                {highlightNode(children)}
                            </h4>
                        ),
                        p: ({ children, ...props }) => (
                            <p className="text-base leading-7 text-justify mt-2" {...props}>
                                {highlightNode(children)}
                            </p>
                        ),
                        ul: ({ children, ...props }) => (
                            <ul className="list-disc pl-6 space-y-2 mt-2" {...props}>
                                {highlightNode(children)}
                            </ul>
                        ),
                        ol: ({ children, ...props }) => (
                            <ol className="list-decimal pl-6 space-y-2 mt-2" {...props}>
                                {highlightNode(children)}
                            </ol>
                        ),
                        li: ({ children, ...props }) => (
                            <li className="" {...props}>
                                {highlightNode(children)}
                            </li>
                        ),
                        table: ({ children, ...props }) => (
                            <table className="w-full text-left mt-2" {...props}>
                                {children}
                            </table>
                        ),
                        thead: ({ children, ...props }) => (
                            <thead className="p-2 border-b border-primary" {...props}>
                                {children}
                            </thead>
                        ),
                        th: ({ children, ...props }) => (
                            <th className="border-b border-slate-200 px-4 py-2 text-sm font-semibold" {...props}>
                                {highlightNode(children)}
                            </th>
                        ),
                        td: ({ children, ...props }) => (
                            <td className="border-b border-slate-200 px-4 py-2 text-sm" {...props}>
                                {highlightNode(children)}
                            </td>
                        ),
                    }}
                >
                    {markdown}
                </ReactMarkdown>
            </div>
        </div >
    );
}
