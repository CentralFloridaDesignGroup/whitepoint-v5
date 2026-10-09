export type RecordTask = {
  id: string; taskId: string; sequence: number; taskName: string; shortDescription: string
  longDescription: { type: 'text'; content: string }[]; taskManagerId: string | null; dueDate: string | null
  status: 'active' | 'inactive'; isUnderContract: boolean; isCompleted: boolean
  contractAmountCents: number; billType: 'fixed-fee' | 'time-and-materials' | 'time-and-materials-nte' | 'direct-expense' | 'non-billable'; billNotes: string
}
