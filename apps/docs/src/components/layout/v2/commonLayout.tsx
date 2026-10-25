import { useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { ChevronDown, LogIn, LogOut } from "lucide-react";
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { NotificationCard } from "@whitepoint/ui/layout";
import { OutletProvider, useSidebarContext } from "@whitepoint/ui/layout";
import { useAuth } from "../../../auth/AuthContext";
import { rememberRecentPath } from "../../../browserPaths";


export function CommonLayout() {
  return <OutletProvider><CommonLayoutContent /></OutletProvider>;
}

function CommonLayoutContent() {
  const { sidebarItems } = useSidebarContext();
  const location = useLocation();
  const auth = useAuth();


  useEffect(() => {
    if (!auth.userId || location.pathname === "/") return;
    const key = "wps-document:recent:" + auth.userId;
    rememberRecentPath(key, location.pathname);
  }, [auth.userId, location.pathname]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-neutral-100 text-black  ">
      <NotificationCard />

      {!auth.isAuthenticated && (
        <div className="bg-blue-100 px-4 py-2 text-center text-sm text-blue-800  ">
          Public reference pages are available. Sign in with an invited White Point account to open protected workflows.
        </div>
      )}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto p-4 md:flex">
          <Link to="/" className="mb-6 block text-center text-2xl font-bold">
            <img src="/compass_Name.webp" alt="White Point Compass" className="inline-block w-full px-5 " />
            <img src="/compass_Name_Dark.webp" alt="White Point Compass" className="hidden w-full px-5 " />
          </Link>
          <nav className="flex flex-1 flex-col gap-2">
            {sidebarItems.map((item, index) => {
              if (item.type === "link") {
                return <a key={index} href={item.href} onClick={item.onClick} className="rounded-md px-3 py-2 hover:bg-white ">{item.label}</a>;
              }
              if (item.type === "header") return <div key={index} className="mt-4 px-2 text-xs font-bold uppercase text-slate-500">{item.label}</div>;
              if (item.type === "divider") return <hr key={index} className="my-2 border-slate-300 " />;
              return null;
            })}
          </nav>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 justify-end px-4">
            {auth.isAuthenticated ? (
              <Menu>
                <MenuButton className="my-2 flex items-center rounded px-2 py-1 hover:bg-slate-200 ">
                  <span className="font-semibold">{auth.userName || auth.userEmail}</span>
                  {auth.imageUrl && <img src={auth.imageUrl} alt="" className="ml-2 h-8 w-8 rounded-full" />}
                  <ChevronDown className="ml-1 h-4 w-4" />
                </MenuButton>
                <MenuItems anchor="bottom end" className="w-56 rounded border bg-white p-1 shadow  ">

                  <MenuItem><button className="flex w-full items-center gap-2 px-3 py-2 text-left" onClick={() => void auth.signOut()}><LogOut className="h-4 w-4" />Sign out</button></MenuItem>
                </MenuItems>
              </Menu>
            ) : (
              <Link to="/login" className="my-2 inline-flex items-center gap-2 rounded bg-blue-700 px-4 py-2 text-white"><LogIn className="h-4 w-4" />Sign in</Link>
            )}
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-4"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
