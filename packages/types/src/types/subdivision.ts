import type { ProjectStage } from './project';
import type { RecordTask } from './task';

export type ParcelType = 'lot' | 'tract' | 'parcel' | 'pad';
export type SubdivisionParcel = {
  id: string; subdivisionId: string; parcelType: ParcelType; block: string; label: string;
  platReference: string; streetAddress: string; parcelId: string;
  assignment: null | { projectId: string; parentProjectId: string; projectNumber: string; clientName: string; stage: ProjectStage; active: boolean; unfinishedTasks: number; unpaidInvoices: number; qboSyncStatus: string };
  appliedTemplates: Array<{ name: string; appliedAt: string }>;
};
export type SubdivisionParent = { projectId: string; projectNumber: string; projectName: string; clientId: string; clientName: string; stage: ProjectStage; active: boolean; managerUserId: string | null; contactId: string | null; qboSyncStatus: string };
export type Subdivision = { id: string; name: string; location: string; platReference: string; revision: number; parcels: SubdivisionParcel[]; parents: SubdivisionParent[] };
export type SubdivisionListItem = Pick<Subdivision, 'id' | 'name' | 'location' | 'platReference'> & { parcelCount: number; assignedCount: number };
export type PhaseTemplate = { id: string; name: string; revision: number; tasks: Array<Pick<RecordTask, 'taskId' | 'taskName' | 'shortDescription' | 'billType' | 'contractAmountCents' | 'isUnderContract'>> };
export type SubdivisionBatchRow = { parcelId: string; projectNumber: string; previousProjectId: string | null; status: 'pending' | 'created' | 'failed'; projectId: string | null; error: string | null; taskIds?: string[]; targetRevision?: number };
export type SubdivisionBatch = { id: string; operation: 'assign' | 'append'; rows: SubdivisionBatchRow[] };
