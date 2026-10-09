import { Link } from "react-router-dom";
import { BriefcaseBusiness, FileText, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";

const tiles = [
  {
    label: "Clients",
    path: "/client",
    permission: "clients.view",
    description: "Client records and invoice contacts.",
    icon: Users,
  },
  {
    label: "Projects",
    path: "/project",
    permission: "projects.view",
    description: "Project, task, and assignment workflows.",
    icon: BriefcaseBusiness,
  },
  {
    label: "Invoices",
    path: "/invoices",
    permission: "invoices.view",
    description: "Prepare invoices and track payments.",
    icon: FileText,
  },
  {
    label: "Settings",
    path: "/settings",
    permission: "company.view",
    description: "Application settings, users, roles, and QuickBooks.",
    icon: ShieldCheck,
  },
] as const;

export function ManageHome() {
  const auth = useAuth();
  if (!auth.isLoaded)
    return (
      <section className="mx-auto max-w-3xl p-8">Checking your access…</section>
    );
  if (!auth.isAuthenticated)
    return (
      <section className="mx-auto max-w-3xl p-8">
        <h1 className="text-3xl font-bold">Northstar</h1>
        <p className="mt-3">
          Sign in with your White Point account to open internal project
          workflows.
        </p>
        <Link
          className="mt-5 inline-flex rounded bg-blue-700 px-4 py-2 font-semibold text-white"
          to="/login"
        >
          Sign in
        </Link>
      </section>
    );
  return (
    <section className="mx-auto w-full max-w-6xl p-6">
      <p className="text-sm text-slate-500">
        Signed in as {auth.userName} · {auth.roleName}
      </p>
      <h1 className="mt-1 text-3xl font-bold">Northstar</h1>
      <p className="mt-2 text-slate-600">
        Internal project, client, invoice, and GIS workflows.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles
          .filter((tile) => auth.hasPermission(tile.permission))
          .map(({ label, path, description, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-400 hover:shadow-md"
            >
              <Icon className="h-6 w-6 text-blue-700" />
              <h2 className="mt-4 text-lg font-semibold">{label}</h2>
              <p className="mt-1 text-sm text-slate-600">{description}</p>
            </Link>
          ))}
      </div>
    </section>
  );
}
