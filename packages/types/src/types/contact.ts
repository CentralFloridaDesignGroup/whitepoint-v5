export type ContactMetadata = { title: string; department: string; reportsTo: string; notes: string }

export type Contact = {
  id: string; clientId: string; name: string; email: string; phone: string; role: string
  invoiceRecipient: boolean; createdAt: string; updatedAt: string
  prefix: string; firstName: string; middleName: string; lastName: string; suffix: string
  clientAddressId: string | null; isPoc: boolean; isBillingPoc: boolean; isExecutivePoc: boolean
  metadata: ContactMetadata
}
