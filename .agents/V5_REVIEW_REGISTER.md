# V5 feature review register

Snapshot: 2026-10-23. Current V5 routes and consumers define the implemented scope. V4 paths below are read-only references for future product decisions, not V5 contracts or promised routes.

| V4 capability | V4 reference | V5 status | Review decision needed |
| --- | --- | --- | --- |
| GIS point map, import, editing, and persistence | `sites/document/src/components/gis`, `sites/document/src/pages/office/Gis`, `sites/api/src/gisPointsApi.ts` | No current V5 route or consumer. The stale Docs GIS home link and unused local GIS disclaimer were removed. | Decide the V5 GIS workflow and owner before adding routes or types. |
| Review/comment packages and PDFs | `sites/document/src/pages/pm/commentsManager`, `sites/api/src/comments` | No current V5 route or consumer. | Decide whether review packages are part of a future Manage release. |
| Client account and invoice reporting | `sites/document/src/pages/pm/invoices/ClientAccountReport.tsx`, `sites/api/src/invoiceReports.ts` | V5 has invoice list, detail, PDF, payments, and QBO sync; it has no separate account report page. | Specify report audience and fields if this becomes a new improvement. |

## Retained V5 compatibility code

`packages/ui/src/input/compatibility.tsx` still serves active Manage and Docs callers. Its `Combobox` and `TextboxSuggestion` adapters carry `@deprecated` annotations because direct shared controls exist and callers have not yet been migrated. Domain-specific `Bearing` and `Multiselect` controls remain active without a replacement decision.

## Validation boundary

V5 contact, careers, favorites, auth, client/project records, timesheets, invoices, payment, and QBO paths have current code owners in the [codebase graph](CODEBASE_GRAPH.md). Provider sandbox delivery and checkout require live credentials and are tracked separately from local tests.
