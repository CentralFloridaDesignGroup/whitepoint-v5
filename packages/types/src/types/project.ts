import type { BillingAddress, RecordCapabilities, SyncStatus } from './recordShared';
import type { RecordTask } from './task';
import type { ProjectInvoiceReference } from './invoicing';
export type ProjectStage = 'opportunity' | 'proposal' | 'shortlisted' | 'negotiating' | 'withdrawn' | 'active' | 'completed' | 'holdExternal' | 'holdInternal' | 'cancelled'
export type ProjectAddress = Omit<BillingAddress, 'line2'> & { county: string; parcelId: string; isUnincorporated: boolean; latitude: number | null; longitude: number | null }
export type ProjectContactRole = 'projectManager' | 'busDevManager' | 'clientPoc' | 'clientBillingPoc' | 'clientStakeholder' | 'externalStakeholder'
export type ProjectContact = { role: ProjectContactRole; userId: string | null; contactId: string | null }
export type ProjectAccounting = { contractPriceCents: number; budgetCents: number; actualCostCents: number; timeChargeCents: number; remainingBudgetCents: number; invoices: ProjectInvoiceReference[] }
export type Project = {
  id: string; projectNumber: string; clientId: string; clientName?: string; name: string
  description: string
  managerUserId: string | null; startDate: string | null; dueDate: string | null
  qboCustomerId: string | null; qboSyncStatus: SyncStatus; qboSyncError: string | null
  revision: number; createdAt: string; updatedAt: string
  stage: ProjectStage; active: boolean; contactId: string; address: ProjectAddress
  payTableId: string | null
  contacts: ProjectContact[]; tasks: RecordTask[]; accounting: ProjectAccounting
  archivedAt: string | null; capabilities: RecordCapabilities
}

export type ProjectInput = { projectNumber?: string; clientId: string; name: string; stage?: ProjectStage; active?: boolean; description: string; managerUserId: string; contactId: string; payTableId?: string | null; startDate?: string | null; dueDate?: string | null; address?: Partial<ProjectAddress>; contacts?: ProjectContact[]; tasks?: Array<Partial<RecordTask>>; contractPriceCents?: number; budgetCents?: number; confirmContractSigned?: boolean }

export type ProjectUpdateInput = Partial<ProjectInput> & { revision: number }
