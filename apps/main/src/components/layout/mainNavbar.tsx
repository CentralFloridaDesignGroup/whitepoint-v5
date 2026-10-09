import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { MarketingButton } from "../marketing";
import White_Point_Logo_Name from "../../assets/white_point_logo_name_1625_500.webp";

const navItems = [
	{ label: "Home", href: "/" },
	{ label: "Services", href: "/services", subItems: [
		{ label: "Discounts", href: "/services/discounts" },
	] },
	{ label: "Company", href: "/company" },
	{ label: "Positions", href: "/positions" },
	{ label: "Compass", href: "https://docs.whitepointsurvey.com" },
];

export function Navbar() {
	const [menuOpen, setMenuOpen] = useState(false);
	const location = useLocation();
	const activePath = location.pathname;

	return (
		<nav className="w-full border-b border-gray-200 bg-white/90 backdrop-blur">
			<div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
				<a href="/" className="flex items-center gap-2 text-lg font-semibold text-gray-900">
					<img src={White_Point_Logo_Name} alt="White Point Logo" className="h-12 w-auto" />
				</a>

				<div className="hidden items-center gap-8 md:flex">
					<div className="flex items-center gap-6 text-sm font-medium text-gray-700">
						{navItems.map((item) => {
							const isActive =
								activePath === item.href ||
								item.subItems?.some((subItem) => activePath.startsWith(subItem.href));
							const hasSubItems = Boolean(item.subItems?.length);

							if (!hasSubItems) {
								return (
									<a
										key={item.label}
										href={item.href}
										className={`transition-colors hover:text-gray-900 ${isActive ? "border-b-2 border-primary text-gray-900" : "text-gray-700"}`}
									>
										{item.label}
									</a>
								);
							}

							return (
								<div key={item.label} className="group relative">
									<a
										href={item.href}
										className={`inline-flex items-center gap-1 transition-colors hover:text-gray-900 ${isActive ? "border-b-2 border-primary text-gray-900" : "text-gray-700"}`}
									>
										{item.label}
										<ChevronDown className="h-4 w-4" aria-hidden="true" />
									</a>
									<div className="invisible absolute left-0 top-full z-10 w-64 translate-y-1 border border-gray-200 bg-white py-2 text-sm text-gray-700 opacity-0 shadow-lg transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
										{item.subItems?.map((subItem) => {
											const isSubActive = activePath.startsWith(subItem.href);
											return (
												<a
													key={subItem.label}
													href={subItem.href}
													className={`block px-4 py-2 transition-colors hover:bg-gray-50 hover:text-gray-900 ${isSubActive ? "bg-primary text-white" : "text-gray-700"}`}
												>
													{subItem.label}
												</a>
											);
										})}
									</div>
								</div>
							);
						})}
					</div>
					<MarketingButton
						label="Contact Us"
						variant="primary"
						size="small"
						onClick={() => {
							setMenuOpen(false);
							window.location.href = "/contact";
						}}
					/>
				</div>

				<button
					type="button"
					onClick={() => setMenuOpen((prev) => !prev)}
					aria-expanded={menuOpen}
					aria-controls="mobile-nav"
					className="inline-flex items-center justify-center rounded-md border border-gray-300 px-3 py-2 text-gray-700 transition hover:bg-gray-50 md:hidden"
				>
					<span className="sr-only">Toggle menu</span>
					<span className="relative h-4 w-5">
						<span className={`absolute left-0 top-0 h-0.5 w-full bg-current transition ${menuOpen ? "translate-y-1.5 rotate-45" : ""}`} />
						<span className={`absolute left-0 top-1.5 h-0.5 w-full bg-current transition ${menuOpen ? "opacity-0" : ""}`} />
						<span className={`absolute left-0 top-3 h-0.5 w-full bg-current transition ${menuOpen ? "-translate-y-1.5 -rotate-45" : ""}`} />
					</span>
				</button>
			</div>

			{menuOpen && (
				<div id="mobile-nav" className="border-t border-gray-200 bg-white md:hidden">
					<div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
						<div className="flex flex-col gap-3 text-base font-medium text-gray-700">
							{navItems.map((item) => {
								const isActive =
									activePath === item.href ||
									item.subItems?.some((subItem) => activePath.startsWith(subItem.href));
								return (
									<div key={item.label} className="flex flex-col gap-2">
										<a href={item.href} className={`transition-colors hover:text-gray-900 ${isActive ? "border-b-2 border-primary text-gray-900" : "text-gray-700"}`}>
											{item.label}
										</a>
										{item.subItems?.length ? (
											<div className="flex flex-col gap-2 border-l border-gray-200 pl-4 text-sm">
												{item.subItems.map((subItem) => {
													const isSubActive = activePath.startsWith(subItem.href);
													return (
														<a key={subItem.label} href={subItem.href} className={`transition-colors hover:text-gray-900 ${isSubActive ? "bg-primary p-2 text-white" : "text-gray-700"}`}>
															{subItem.label}
														</a>
													);
												})}
											</div>
										) : null}
									</div>
								);
							})}
						</div>
						<MarketingButton
							label="Contact Us"
							variant="primary"
							size="medium"
							onClick={() => {
								setMenuOpen(false);
								window.location.href = "/contact";
							}}
						/>
					</div>
				</div>
			)}
		</nav>
	);
}
