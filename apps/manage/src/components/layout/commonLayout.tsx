import { useEffect, useState } from "react";
import { GlobalSearch } from "../../pages/search/GlobalSearch";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BriefcaseBusiness,
  ChevronDown,
  FileText,
  Clock3,
  Home,
  LogIn,
  LogOut,
  Menu as MenuIcon,
  UserRound,
  Settings,
  Users,
  X,
} from "lucide-react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { NotificationCard } from "@whitepoint/ui/layout";
import { OutletProvider, useSidebarContext } from "@whitepoint/ui/layout";
import { useAuth } from "../../auth/AuthContext";

export function CommonLayout() {
  return (
    <OutletProvider>
      <CommonLayoutContent />
    </OutletProvider>
  );
}

function CommonLayoutContent() {
  const { sidebarItems } = useSidebarContext();
  const location = useLocation();
  // const navigate = useNavigate();
  const auth = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => setMobileNavOpen(false), [location.key]);

  const primaryLinks = [
    { label: "Overview", path: "/", permission: "dashboard.view", icon: Home },
    {
      label: "Projects",
      path: "/project",
      permission: "projects.view",
      icon: BriefcaseBusiness,
    },
    {
      label: "Clients",
      path: "/client",
      permission: "clients.view",
      icon: Users,
    },
    {
      label: "Invoices",
      path: "/invoices",
      permission: "invoices.view",
      icon: FileText,
    },
    { label: "Timesheets", path: "/timesheets", permission: "dashboard.view", icon: Clock3 },
    {
      label: "Settings",
      path: "/settings",
      permission: "company.view",
      icon: Settings,
    }
  ];

  const translateRoleTitle = (role: string | null) => {
    if (!role) return "Account";
    switch (role) {
      case "super-administrator":
        return "Super Administrator";
      case "employee":
        return "Employee";
      default:
        return role;
    }
  };

  function navigation() {
    return (
      <>
        <nav aria-label="Main navigation" className="space-y-1">
          {primaryLinks
            .filter(
              (item) =>
                item.path === '/timesheets' || auth.hasPermission(item.permission),
            )
            .map(({ label, path, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === "/"}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${isActive ? "bg-white/12 font-semibold text-white" : "text-slate-300 hover:bg-white/8 hover:text-white"}`
                }
              >
                <Icon
                  className="h-[18px] w-[18px] shrink-0 text-sky-300"
                  strokeWidth={1.8}
                />
                <span>{label}</span>
              </NavLink>
            ))}
        </nav>
        {sidebarItems.length > 0 && (
          <section className="mt-7 border-t border-white/10 pt-5">
            <h2 className="mb-2 px-3 text-xs font-medium text-slate-400">
              Current workspace
            </h2>
            <div className="space-y-1">
              {sidebarItems.map((item, index) => {
                if (item.type === "link")
                  return (
                    <a
                      key={index}
                      href={item.href}
                      onClick={item.onClick}
                      className="block rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/8 hover:text-white"
                    >
                      {item.label}
                    </a>
                  );
                if (item.type === "header")
                  return (
                    <div
                      key={index}
                      className="px-3 pb-1 pt-4 text-xs font-medium text-slate-400"
                    >
                      {item.label}
                    </div>
                  );
                if (item.type === "divider")
                  return <hr key={index} className="my-2 border-white/10" />;
                return null;
              })}
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-slate-50 text-slate-950  ">
      <NotificationCard />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-[260px] shrink-0 flex-col overflow-y-auto bg-[#10283d] px-4 py-5 text-white md:flex">
          <Link
            to="/"
            className="mb-8 flex items-center gap-3 px-2"
            aria-label="NorthStar overview"
          >
            <img src="/northstar-mark.svg" alt="" className="h-9 w-9" />
            <span>
              <span className="block text-lg font-semibold tracking-wide">
                NorthStar
              </span>
              <span className="block text-[11px] text-slate-400">
                White Point Survey
              </span>
            </span>
          </Link>
          {navigation()}
        </aside>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              aria-label="Close navigation"
              className="absolute inset-0 bg-slate-950/50"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-[min(84vw,300px)] overflow-y-auto bg-[#10283d] px-4 py-5 text-white shadow-2xl">
              <div className="mb-7 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-3">
                  <img src="/northstar-mark.svg" alt="" className="h-9 w-9" />
                  <span>
                    <span className="block text-lg font-semibold">
                      NorthStar
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      White Point Survey
                    </span>
                  </span>
                </Link>
                <button
                  aria-label="Close navigation"
                  onClick={() => setMobileNavOpen(false)}
                  className="rounded p-2 hover:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {navigation()}
            </aside>
          </div>
        )}
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-10 flex min-h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:px-6  ">
            <button
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileNavOpen(true)}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 md:hidden  "
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            {auth.isAuthenticated &&
              (auth.hasPermission("projects.view") ||
                auth.hasPermission("clients.view")) && <GlobalSearch />}
            <div className="ml-auto flex items-center">
              {auth.isAuthenticated ? (
                <Menu>
                  <MenuButton className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 ">
                    <span className="hidden sm:block sm:text-right">
                      <span className="block text-sm font-medium">
                        {auth.userName || auth.userEmail}
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        {translateRoleTitle(auth.roleName)}
                      </span>
                    </span>
                    {auth.imageUrl ? (
                      <img
                        src={auth.imageUrl}
                        alt=""
                        className="h-8 w-8 rounded-full"
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-900  ">
                        {(auth.userName || auth.userEmail || "W")
                          .slice(0, 1)
                          .toUpperCase()}
                      </span>
                    )}
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  </MenuButton>
                  <MenuItems
                    anchor="bottom end"
                    className="z-50 w-60 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl  "
                  >
                    <MenuItem>
                      <Link to="/me" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100"><UserRound className="h-4 w-4" />My account</Link>
                    </MenuItem>
                    <MenuItem>
                      <button
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 "
                        onClick={() => void auth.signOut()}
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </MenuItem>
                  </MenuItems>
                </Menu>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 "
                >
                  <LogIn className="h-4 w-4" />
                  Sign in
                </Link>
              )}
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
