import type { BillingAddress, RecordCapabilities, SyncStatus } from './recordShared';
import type { Contact } from './contact';
export type ClientAddress = BillingAddress & { id: string; label: string; isPrimaryMailingAddress: boolean }

export type ClientMetadata = { industry: string; size: string; public: boolean; notes: string }

export type ClientDocument = { id: string; name: string; sizeBytes: number; mimeType: string; description: string; expiresAt: string | null; createdAt: string }

export type Client = {
  id: string; clientNumber: string; name: string; status: 'active' | 'inactive'; email: string; phone: string
  billingAddress: BillingAddress; qboCustomerId: string | null; qboSyncStatus: SyncStatus
  qboSyncError: string | null; createdAt: string; updatedAt: string; contacts: Contact[]
  addresses: ClientAddress[]; documents: ClientDocument[]; metadata: ClientMetadata
  parentClientId: string | null; revision: number; archivedAt: string | null; capabilities: RecordCapabilities
}

export type ClientInput = { name: string; email?: string; phone?: string; status?: 'active' | 'inactive'; parentClientId?: string | null; metadata?: Partial<ClientMetadata>; addresses: Array<Partial<ClientAddress>>; contacts: Array<Partial<Contact>>; documents?: Array<Pick<ClientDocument, 'id' | 'name' | 'description' | 'expiresAt'>>; revision?: number }
