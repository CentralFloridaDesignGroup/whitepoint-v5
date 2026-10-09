import type { ProjectStage } from './project';
export type ClientSearchResult = { id: string; client_number: string; name: string; email: string; phone: string; status: 'active' | 'inactive'; created_at: string }

export type ProjectSearchResult = { id: string; project_number: string; name: string; stage: ProjectStage; created_at: string; client_name?: string }

export type SearchResults = { clients: ClientSearchResult[]; projects: ProjectSearchResult[] }
