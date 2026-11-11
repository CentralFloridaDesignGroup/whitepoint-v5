import { Hono } from "hono";
import type {
  ClientSearchResult,
  ProjectSearchResult,
  SubdivisionSearchResult,
  SearchResults,
} from "@whitepoint/types";
import { jsonResponse, type HonoEnv } from "../types/apiTypes";

export function createSearchApi() {
  const api = new Hono<HonoEnv>();
  api.get("/", async (c) => {
    const permissions = c.get("permissions");
    const canClients = permissions.hasPermission("clients.view");
    const canProjects = permissions.hasPermission("projects.view");
    const canSubdivisions = permissions.hasPermission("subdivisions.view");
    if (!canClients && !canProjects && !canSubdivisions)
      return jsonResponse({ error: "Forbidden" }, { status: 403 });
    const query = (c.req.query("q") || "").trim().slice(0, 200);
    if (!query) return jsonResponse({ clients: [], projects: [], subdivisions: [] });
    const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const [clients, projects, subdivisions] = await Promise.all([
      canClients
        ? c.env.DB.prepare(
            `SELECT id,client_number,name,email,phone,status,created_at FROM clients WHERE archived_at IS NULL AND (client_number LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM contacts ct WHERE ct.client_id=clients.id AND ct.archived_at IS NULL AND ct.name LIKE ? ESCAPE '\\')) ORDER BY name COLLATE NOCASE LIMIT 25`,
          )
            .bind(like, like, like)
            .all<ClientSearchResult>()
        : Promise.resolve({ results: [] as ClientSearchResult[] }),
      canProjects
        ? c.env.DB.prepare(
            `SELECT p.id,p.project_number,p.name,p.stage,p.created_at,c.name AS client_name FROM projects p JOIN clients c ON c.id=p.client_id WHERE p.archived_at IS NULL AND (p.project_number LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\') ORDER BY p.project_number DESC LIMIT 25`,
          )
            .bind(like, like, like)
            .all<ProjectSearchResult>()
        : Promise.resolve({ results: [] as ProjectSearchResult[] }),
      canSubdivisions
        ? c.env.DB.prepare(`SELECT DISTINCT s.id,s.name,s.location,s.plat_reference FROM subdivisions s LEFT JOIN subdivision_parcels sp ON sp.subdivision_id=s.id WHERE s.archived_at IS NULL AND (s.name LIKE ? ESCAPE '\\' OR s.location LIKE ? ESCAPE '\\' OR s.plat_reference LIKE ? ESCAPE '\\' OR sp.label LIKE ? ESCAPE '\\' OR sp.block LIKE ? ESCAPE '\\') ORDER BY s.name COLLATE NOCASE LIMIT 25`).bind(like,like,like,like,like).all<SubdivisionSearchResult>()
        : Promise.resolve({ results: [] as SubdivisionSearchResult[] }),
    ]);
    const result: SearchResults = {
      clients: clients.results || [],
      projects: projects.results || [],
      subdivisions: subdivisions.results || [],
    };
    return jsonResponse(result);
  });
  return api;
}
