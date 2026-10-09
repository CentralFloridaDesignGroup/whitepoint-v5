/** Cached QuickBooks Online customer or sub-customer used by Compass forms. */
export type QboCustomer = {
  /** Unique identifier of the customer */
  id: string;
  /** Unique identifier of the parent customer, if applicable */
  parentId: string;
  /** Display name of the customer. */
  displayName: string;
  /** Fully qualified name of the customer. Typically includes the parent customer's name if applicable */
  fullyQualifiedName: string;
  /** Company name of the customer */
  companyName: string;
  /** Given name of the customer */
  givenName: string;
  /** Family name of the customer */
  familyName: string;
  /** Primary email address of the customer */
  primaryEmail: string;
  /** Primary phone number of the customer */
  primaryPhone: string;
  /** Billing address line 1 of the customer */
  billAddrLine1: string;
  /** Billing address line 2 of the customer */
  billAddrLine2: string;
  /** Billing address city of the customer */
  billAddrCity: string;
  /** Billing address state of the customer */
  billAddrState: string;
  /** Billing address postal code of the customer */
  billAddrPostalCode: string;
  /** Shipping address line 1 of the customer */
  shipAddrLine1: string;
  /** Shipping address line 2 of the customer */
  shipAddrLine2: string;
  /** Shipping address city of the customer */
  shipAddrCity: string;
  /** Shipping address state of the customer */
  shipAddrState: string;
  /** Shipping address postal code of the customer */
  shipAddrPostalCode: string;
  /** Whether the customer is active */
  active: boolean;
  /** Sync token of the customer */
  syncToken: string;
  /** Last updated time of the customer in QuickBooks Online */
  qboUpdatedTime: string;
  /** Last synced date of the customer in the local system */
  lastSyncedDate: string;
};

/** Local sync status for the connected QuickBooks Online company. */
export type QboConnectionStatus = {
  /** Whether the connection to QuickBooks Online is established */
  connected: boolean;
  /** Realm ID of the connected QuickBooks Online company */
  realmId: string;
  /** Environment of the connected QuickBooks Online company */
  environment: string;
  /** Last date when customers were synced */
  lastCustomerSyncDate: string;
  /** Last date when items were synced */
  lastItemSyncDate: string;
  /** Last date when accounts were synced */
  lastAccountSyncDate: string;
  /** Expiration date of the QuickBooks Online access token */
  tokenExpiresDate: string;
  /** Default service item ID for invoices */
  defaultServiceItemId: string;
  /** Default service item name for invoices */
  defaultServiceItemName: string;
  /** Default deposit account ID for payments */
  defaultDepositAccountId: string;
  /** Default deposit account name for payments */
  defaultDepositAccountName: string;
  /** Stripe fee expense account ID */
  stripeFeeExpenseAccountId: string;
  /** Stripe fee expense account name */
  stripeFeeExpenseAccountName: string;
};

/** Cached QuickBooks Online service item used for invoice line sync. */
export type QboServiceItem = {
  /** Unique identifier of the service item */
  id: string;
  /** Name of the service item */
  name: string;
  /** Fully qualified name of the service item */
  fullyQualifiedName: string;
  /** Description of the service item */
  description: string;
  /** Whether the service item is active */
  active: boolean;
  /** Sync token of the service item */
  syncToken: string;
  /** Last updated time of the service item in QuickBooks Online */
  qboUpdatedTime: string;
  /** Last synced date of the service item in the local system */
  lastSyncedDate: string;
};

/** Cached QuickBooks Online account used for payment deposits and fee accounting. */
export type QboAccount = {
  /** Unique identifier of the account */
  id: string;
  /** Name of the account */
  name: string;
  /** Fully qualified name of the account */
  fullyQualifiedName: string;
  /** Type of the account */
  accountType: string;
  /** Sub-type of the account */
  accountSubType: string;
  /** Classification of the account */
  classification: string;
  /** Whether the account is active */
  active: boolean;
  /** Sync token of the account */
  syncToken: string;
  /** Last updated time of the account in QuickBooks Online */
  qboUpdatedTime: string;
  /** Last synced date of the account in the local system */
  lastSyncedDate: string;
};
