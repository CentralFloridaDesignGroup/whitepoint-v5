# Duplicate code snapshot ? 2026-10-29

Reviewed TypeScript/TSX/JavaScript in `apps` and `packages` (234 source files, excluding generated output), using exact six-line cross-file windows and manual inspection of matches. The scan found 24 overlapping windows, concentrated in a few source pairs.

## Consolidated

- Marketing service lookup, cost formatting, and service type now live in `apps/main/src/pages/servicePricing.ts`.
- Timesheet short-date formatting now lives in `apps/manage/src/pages/timesheets/model.ts`.
- Metadata DOM updates use `packages/utils/src/pageMetadata.ts`.

## Retained after review

- Manage and Docs auth entry points provide app-specific environment configuration; authentication behavior is already shared in `packages/ui/src/layout/staffAuth.tsx`.
- Manage and Docs Vite configs and `main.tsx` files are required workspace bootstraps.
- Marketing job-posting share controls and service-stat markup are presentation code in distinct layouts; extracting them would couple those layouts without removing business logic.
- API route helpers and contracts were checked against the ownership graph. Similar validation and persistence steps belong to different record or provider boundaries; the exact-window snapshot did not reveal a verified duplicate block to extract.
