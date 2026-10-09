import { Suspense, lazy } from "react";
import {
  createBrowserRouter,
  Navigate,
  RouterProvider,
} from "react-router-dom";
import { CommonLayout } from "./components";
import { AuthProvider, ProtectedRoutes, useAuth } from "./auth/AuthContext";
import { StaffLogin } from "@whitepoint/ui/layout";
import { ErrorPage, RouteError } from "./pages/common";
import { ManageHome } from "./pages/dashboard/ManageHome";

const ClientRecordPage = lazy(() =>
  import("./pages/client/ClientRecord").then((module) => ({
    default: module.ClientRecordPage,
  })),
);
const ProjectRecordPage = lazy(() =>
  import("./pages/project/ProjectRecord").then((module) => ({
    default: module.ProjectRecordPage,
  })),
);
const ApplicationSettings = lazy(() =>
  import("./pages/settings/application/ApplicationSettings").then((module) => ({
    default: module.ApplicationSettings,
  })),
);
const UserDirectory = lazy(() =>
  import("./pages/settings/users/UserDirectory").then((module) => ({
    default: module.UserDirectory,
  })),
);
const UserDetailPage = lazy(() =>
  import("./pages/settings/users/UserDetailPage").then((module) => ({
    default: module.UserDetailPage,
  })),
);
const RoleSettings = lazy(() =>
  import("./pages/settings/roles/RoleSettings").then((module) => ({
    default: module.RoleSettings,
  })),
);
const QboSettings = lazy(() =>
  import("./pages/settings/qbo/QboSettings").then((module) => ({
    default: module.QboSettings,
  })),
);
const SearchResults = lazy(() =>
  import("./pages/search/SearchResults").then((module) => ({
    default: module.SearchResults,
  })),
);
const TimesheetsPage = lazy(() => import('./pages/timesheets/TimesheetsPage').then(module => ({default:module.TimesheetsPage})));
const TimesheetDetailPage = lazy(() => import('./pages/timesheets/TimesheetDetailPage').then(module => ({default:module.TimesheetDetailPage})));
const TimesheetReviewPage = lazy(() => import('./pages/timesheets/TimesheetReviewPage').then(module => ({default:module.TimesheetReviewPage})));
const TimesheetInvoicePoolPage = lazy(() => import('./pages/timesheets/TimesheetInvoicePoolPage').then(module => ({default:module.TimesheetInvoicePoolPage})));
const RateSettings = lazy(() => import('./pages/settings/rates/RateSettings').then(module => ({default:module.RateSettings})));
const InvoicesPage = lazy(() => import('./pages/invoices/InvoicesPage').then(module => ({default:module.InvoicesPage})));
const InvoiceDetailPage = lazy(() => import('./pages/invoices/InvoiceDetailPage').then(module => ({default:module.InvoiceDetailPage})));

function Loading() {
  return (
    <div className="flex min-h-48 items-center justify-center text-sm">
      Loading…
    </div>
  );
}

function RootRedirect() {
  const auth = useAuth();
  if (!auth.isLoaded) return <Loading />;
  return (
    <Navigate to={auth.isAuthenticated ? "/dashboard" : "/login"} replace />
  );
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: (
      <StaffLogin
        logo={
          <img
            src="/White_Point_Logo_Name.webp"
            className="h-20 mx-auto"
            alt="Logo"
          />
        }
      />
    ),
    errorElement: <RouteError />,
  },
  {
    path: "/",
    element: <CommonLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <RootRedirect /> },
      {
        element: <ProtectedRoutes />,
        children: [{ path: "dashboard", element: <ManageHome /> }],
      },
      {
        element: (
          <ProtectedRoutes permissions={["projects.view", "clients.view"]} />
        ),
        children: [{ path: "search", element: <SearchResults /> }],
      },
      {
        element: <ProtectedRoutes permission="company.roles.view" />,
        children: [{ path: "settings/roles", element: <RoleSettings /> }],
      },
      {
        element: <ProtectedRoutes permission="company.view" />,
        children: [{ path: "settings", element: <ApplicationSettings /> }],
      },
      {
        element: <ProtectedRoutes permission="users.view" />,
        children: [
          { path: "settings/users", element: <UserDirectory /> },
          { element: <ProtectedRoutes permission="users.manage" />, children: [{ element: <ProtectedRoutes permission="users.create" />, children: [{ path: "settings/users/new", element: <UserDetailPage creating /> }] }] },
          { path: "settings/users/:id", element: <UserDetailPage /> },
        ],
      },
      {
        element: <ProtectedRoutes permission="company.qbo.view" />,
        children: [{ path: "settings/qbo", element: <QboSettings /> }],
      },
      {
        element: <ProtectedRoutes permission="timesheets.rates.view" />,
        children: [{ path: "settings/rates", element: <RateSettings /> }],
      },
      {
        element: <ProtectedRoutes />,
        children: [{ path: "timesheets", element: <TimesheetsPage /> }, { path: "timesheets/review", element: <TimesheetReviewPage /> }, { path: "timesheets/:start", element: <TimesheetDetailPage /> }],
      },
      {
        element: <ProtectedRoutes permission="timesheets.rates.view" />,
        children: [{ path: "timesheets/invoice-pool", element: <TimesheetInvoicePoolPage /> }],
      },
      {
        element: <ProtectedRoutes permission="clients.view" />,
        children: [
          { path: "client", element: <ClientRecordPage /> },
          { path: "client/:id", element: <ClientRecordPage /> },
        ],
      },
      {
        element: <ProtectedRoutes permission="clients.create" />,
        children: [{ path: "client/new", element: <ClientRecordPage /> }],
      },
      {
        element: <ProtectedRoutes permission="projects.view" />,
        children: [
          { path: "project", element: <ProjectRecordPage /> },
          { path: "project/:id", element: <ProjectRecordPage /> },
        ],
      },
      {
        element: <ProtectedRoutes permission="projects.create" />,
        children: [{ path: "project/new", element: <ProjectRecordPage /> }],
      },
      {
        element: <ProtectedRoutes />,
        children: [{ path: "invoices", element: <InvoicesPage /> }, { path: "invoices/:id", element: <InvoiceDetailPage /> }],
      },
      { path: "*", element: <ErrorPage /> },
    ],
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<Loading />}>
        <RouterProvider router={router} />
      </Suspense>
    </AuthProvider>
  );
}
