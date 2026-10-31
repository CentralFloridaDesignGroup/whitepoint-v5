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

export type DashboardDetailMetric =
  | "project-active"
  | "project-due-soon"
  | "project-overdue"
  | "project-opportunity"
  | "project-proposal"
  | "project-shortlisted"
  | "project-negotiating"
  | "invoice-paid"
  | "invoice-all"
  | "invoice-outstanding"
  | "invoice-late"
  | "invoice-draft"
  | "month"
  | "utilization"
  | "missing-targets"
  | "income-multiplier";

export type DashboardDetailRow = {
  id: string;
  kind: "project" | "invoice" | "payment" | "staff" | "time-entry";
  label: string;
  description?: string;
  status?: string;
  date?: string;
  amountCents?: number;
  amountLabel?: string;
  secondaryAmountCents?: number;
  secondaryAmountLabel?: string;
  hours?: number;
  targetHours?: number;
  relatedProjectId?: string;
  relatedInvoiceId?: string;
};

export type DashboardDetailResponse = {
  title: string;
  sections: Array<{ title: string; rows: DashboardDetailRow[] }>;
};
