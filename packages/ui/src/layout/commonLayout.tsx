import { Outlet } from "react-router-dom";
import { NotificationCard } from "./notificationCard";

export function CommonLayout({
  navbar,
  footer,
}: {
  navbar?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {navbar || null}
      <NotificationCard />
      <main className="grow">
        <Outlet />
      </main>
      {footer || null}
    </div>
  );
}
