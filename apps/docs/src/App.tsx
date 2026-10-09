import { Suspense, lazy } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { CommonLayout } from "./components/layout/v2";
import { AuthProvider, ProtectedRoutes } from "./auth/AuthContext";
import { StaffLogin } from "@whitepoint/ui/layout";
import { ErrorPage, HomeV2, RouteError } from "./pages/v2";

const FieldDataParser = lazy(() => import("./pages/field/tools/fieldDataParser/fieldDataParser").then((module) => ({ default: module.FieldDataParser })));
const CxlEditor = lazy(() => import("./pages/field/tools/cxlEditor/LayeredCxlEditor").then((module) => ({ default: module.LayeredCxlEditor })));
const Checklist = lazy(() => import("./pages/office/checklists/checklist"));
const Platting = lazy(() => import("./pages/office/checklists/Platting"));
const AltaTableA2026 = lazy(() => import("./pages/office/Alta_TableA_2026").then((module) => ({ default: module.Alta_TableA_2026 })));
const AltaStandards2026 = lazy(() => import("./pages/office/alta_standards_2026"));
const Documentation = lazy(() => import("./pages/general/documentation").then((module) => ({ default: module.Documentation })));
const SurveyNotes = lazy(() => import("./pages/office/SurveyorNotesTsx/SurveyorNotes"));

function Loading() {
  return <div className="flex min-h-48 items-center justify-center text-sm">Loading…</div>;
}

const router = createBrowserRouter([
  { path: "/login", element: <StaffLogin />, errorElement: <RouteError /> },
  {
    path: "/",
    element: <CommonLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomeV2 /> },
      { path: "office", element: <HomeV2 /> },
      { path: "tools/field-data-parser", element: <FieldDataParser /> },
      { path: "tools/cxl-editor", element: <CxlEditor /> },
      { path: "checklists/*", element: <Checklist /> },
      { path: "platting", element: <Platting /> },
      { path: "reference/alta-tablea", element: <AltaTableA2026 /> },
      { path: "office/alta-standards", element: <AltaStandards2026 /> },
      { path: "documents/employee-handbook", element: <Documentation markdownFile="/documents/handbooks/employeeHandbook.md" title="Employee Handbook" /> },
      { element: <ProtectedRoutes />, children: [
        { path: "tools/survey-notes", element: <SurveyNotes /> },
      ] },
      { path: "*", element: <ErrorPage /> },
    ],
  },
]);

export default function App() {
  return <AuthProvider><Suspense fallback={<Loading />}><RouterProvider router={router} /></Suspense></AuthProvider>;
}
