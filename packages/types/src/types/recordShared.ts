export type SyncStatus = 'pending' | 'synced' | 'failed' | 'not_configured'

export type BillingAddress = { line1: string; line2: string; city: string; state: string; postalCode: string }

export type RecordCapabilities = { edit: boolean; status: boolean; financials: boolean; archive: boolean }
