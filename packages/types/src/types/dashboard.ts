export type DashboardResponse = {
  asOf: string;
  projects: null | {
    active: number;
    dueSoon: number;
    overdue: number;
    opportunities: { opportunity: number; proposal: number; shortlisted: number; negotiating: number };
  };
  financials: null | {
    months: Array<{ month: string; sentCents: number; incomeCents: number }>;
    invoiceValue: { draftCents: number; paidCents: number; outstandingCents: number; lateCents: number; lateCount: number };
  };
  staff: {
    utilization: null | { billableHours: number; targetHours: number; percent: number; missingTargetCount: number; from: string; through: string };
    incomeMultiplier: number | null;
  };
};
