export type AppSettings = {
  companyName: string;
  companyShortName: string;
  invoiceNumberTemplate: string;
  defaultInvoiceNote: string;
  projectNumberTemplate: string;
  clientNumberTemplate: string;
  invoiceResetYearly: boolean;
  projectResetYearly: boolean;
  clientResetYearly: boolean;
  rectangularLogoUrl: string | null;
  squareLogoUrl: string | null;
  revision: number;
};
