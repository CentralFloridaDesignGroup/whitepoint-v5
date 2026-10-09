import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface GisDisclaimerProps {
	markdownFile: string;
	cookieName?: string;
	cookieDays?: number;
	title?: string;
}

function readCookie(name: string): string | null {
	const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = document.cookie.match(new RegExp(`(?:^|; )${escapedName}=([^;]*)`));
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, days: number) {
	const maxAge = Math.max(0, Math.floor(days * 24 * 60 * 60));
	const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
	document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax${secureFlag}`;
}

export function GisDisclaimer({
	markdownFile,
	cookieName = "gis-disclaimer-acknowledged",
	cookieDays = 365,
	title = "GIS Disclaimer",
}: GisDisclaimerProps) {
	const disclaimerVersion = "2026-05-02";
	const [open, setOpen] = useState(false);
	const [dontShowAgain, setDontShowAgain] = useState(false);
	const [markdown, setMarkdown] = useState("");

	useEffect(() => {
		const cookieValue = readCookie(cookieName);
		const acknowledged =
			cookieValue === `1:${disclaimerVersion}` || cookieValue === "1";
		setOpen(!acknowledged);
	}, [cookieName, disclaimerVersion]);

	useEffect(() => {
		let cancelled = false;

		async function loadMarkdown() {
			try {
				const response = await fetch(markdownFile);
				if (!response.ok) {
					throw new Error(`Failed to load markdown: ${response.status}`);
				}

				const text = await response.text();
				if (!cancelled) {
					setMarkdown(text);
				}
			} catch {
				if (!cancelled) {
					setMarkdown("# Disclaimer unavailable\nPlease try again later.");
				}
			}
		}

		if (open) {
			loadMarkdown();
		}

		return () => {
			cancelled = true;
		};
	}, [markdownFile, open]);

	function handleAcknowledge() {
		if (dontShowAgain) {
			writeCookie(cookieName, `1:${disclaimerVersion}`, cookieDays);
		} else {
			writeCookie(cookieName, "", 0);
		}

		setOpen(false);
	}

	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-[700] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-[2px] ">
			<div className="w-full max-w-4xl border border-slate-200 bg-white shadow-2xl  ">
				<div className="border-b border-slate-200 px-6 py-4 text-center ">
					<h2 className="text-lg font-semibold text-slate-900 ">{title}</h2>
				</div>

				<div className="max-h-[45vh] overflow-y-auto px-6 py-4">
					<div className="max-w-none text-slate-800 ">
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							components={{
								h1: ({ children, ...props }) => (
									<h1 className="mb-3 text-2xl font-semibold tracking-tight text-slate-900 " {...props}>
										{children}
									</h1>
								),
								h2: ({ children, ...props }) => (
									<h2 className="mb-2 mt-4 text-xl font-semibold text-slate-900 " {...props}>
										{children}
									</h2>
								),
								p: ({ children, ...props }) => (
									<p className="mb-3 text-sm leading-6 text-slate-700 " {...props}>
										{children}
									</p>
								),
								ul: ({ children, ...props }) => (
									<ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-slate-700 " {...props}>
										{children}
									</ul>
								),
								li: ({ children, ...props }) => (
									<li className="leading-6 text-slate-700 " {...props}>
										{children}
									</li>
								),
								img: ({ ...props }) => (
									<img
										{...props}
										className="my-4 h-auto max-w-full rounded-md border border-slate-200 "
										loading="lazy"
									/>
								),
                                a: ({ children, ...props }) => (
                                    <a
                                        {...props}
                                        className="text-slate-700 underline transition hover:text-slate-900  "
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >{children}</a>
                                ),
							}}
						>
							{markdown}
						</ReactMarkdown>
					</div>
				</div>

				<div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between ">
					<label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700 ">
						<input
							type="checkbox"
							checked={dontShowAgain}
							onChange={(event) => setDontShowAgain(event.target.checked)}
							className="h-4 w-4 rounded border-slate-300 text-slate-700   focus:ring-slate-500"
						/>
						Do not show again
					</label>

					<button
						type="button"
						onClick={handleAcknowledge}
						className="inline-flex items-center justify-center rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400    "
					>
						I Understand
					</button>
				</div>
			</div>
		</div>
	);
}
