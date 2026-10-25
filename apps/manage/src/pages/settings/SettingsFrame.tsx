import type { ReactNode } from "react";
import { useAuth } from "../../auth/AuthContext";
import { TabNavigation } from "../common/TabNavigation";

const links = [
  {
    to: "/settings",
    label: "Application",
    permission: "company.view",
    end: true,
  },
  { to: "/settings/users", label: "User Management", permission: "users.view" },
  {
    to: "/settings/roles",
    label: "Roles & permissions",
    permission: "company.roles.view",
  },
  { to: "/settings/rates", label: "Billing rates", permission: "timesheets.rates.view" },
  { to: "/settings/qbo", label: "QBO Integration", permission: "company.qbo.view" },
];
export function SettingsFrame({ children }: { children: ReactNode }) {
  const auth = useAuth();

  return (
    <div className="space-y-4">
      <TabNavigation
        ariaLabel="Settings"
        tabs={links.filter((link) => auth.hasPermission(link.permission))}
      />
      {children}
    </div>
  );
}
