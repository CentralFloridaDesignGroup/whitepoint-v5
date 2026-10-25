import { Link } from "react-router-dom";
import type {
  Project,
  ProjectInput,
  ProjectStage,
  ProjectContact,
  RecordTask,
} from "@whitepoint/types";
import {
  Card,
  CheckField,
  SelectField,
  TextAreaField,
  TextField,
} from "../common/RecordControls";
import { CurrencyField } from "../common/CurrencyField";
import {
  Dropdown,
  LinkedSearchableDropdown,
  SearchableDropdown,
  Textarea,
  Textbox,
  Toggle,
} from "@whitepoint/ui/input";
import { STATE_OPTIONS, getCountyOptions } from "@whitepoint/types/constants";

export type ProjectChoice = {
  id: string;
  name?: string;
  display_name?: string;
  client_number?: string;
  email?: string;
  is_poc?: number;
};
export type PayTableChoice = {
  id: string;
  name: string;
  active: number;
  expires_on: string | null;
  is_default: number;
};
type ProjectDraft = ProjectInput & { revision?: number };
type UpdateProject = (patch: Partial<ProjectInput>) => void;
type ProjectGeneralTabProps = {
  draft: ProjectDraft;
  record: Project | null;
  editing: boolean;
  basicEditing: boolean;
  canStatus: boolean;
  canMoney: boolean;
  canViewRates: boolean;
  canViewFinancials: boolean;
  nextNumber: string;
  clients: ProjectChoice[];
  contacts: ProjectChoice[];
  projectManagers: ProjectChoice[];
  payTables: PayTableChoice[];
  update: UpdateProject;
};
type ProjectContactsTabProps = {
  draft: ProjectDraft;
  basicEditing: boolean;
  users: ProjectChoice[];
  contacts: ProjectChoice[];
  update: UpdateProject;
  roleChange: (index: number, patch: Partial<ProjectContact>) => void;
};
type ProjectTasksTabProps = {
  draft: ProjectDraft;
  record: Project | null;
  editing: boolean;
  basicEditing: boolean;
  canMoney: boolean;
  canViewFinancials: boolean;
  users: ProjectChoice[];
  update: UpdateProject;
  taskChange: (index: number, patch: Partial<RecordTask>) => void;
};
type ProjectAccountingTabProps = {
  draft: ProjectDraft;
  record: Project | null;
  basicEditing: boolean;
  canMoney: boolean;
  canViewRates: boolean;
  canViewFinancials: boolean;
  update: UpdateProject;
};
type ProjectInvoicesTabProps = {
  record: Project | null;
  canViewFinancials: boolean;
};

const stageOptions: Array<{ value: ProjectStage; label: string }> = [
  { value: "opportunity", label: "Opportunity" },
  { value: "proposal", label: "Proposal" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "negotiating", label: "Negotiating" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "holdExternal", label: "External hold" },
  { value: "holdInternal", label: "Internal hold" },
  { value: "cancelled", label: "Cancelled" },
];
const roleOptions = [
  "busDevManager",
  "clientBillingPoc",
  "clientStakeholder",
  "externalStakeholder",
] as const;
const taskBillOptions = [
  "fixed-fee",
  "time-and-materials",
  "time-and-materials-nte",
  "direct-expense",
  "non-billable",
] as const;
const newTask = (): Partial<RecordTask> => ({
  id: crypto.randomUUID(),
  taskId: "",
  taskName: "",
  shortDescription: "",
  longDescription: [],
  taskManagerId: null,
  dueDate: null,
  status: "active",
  isUnderContract: false,
  isCompleted: false,
  contractAmountCents: 0,
  billType: "fixed-fee",
  billNotes: "",
});

export function ProjectGeneralTab({
  draft,
  record,
  editing,
  basicEditing,
  canStatus,
  canMoney,
  canViewRates,
  canViewFinancials,
  nextNumber,
  clients,
  contacts,
  projectManagers,
  payTables,
  update,
}: ProjectGeneralTabProps) {
  const selectedClient = clients.find((x) => x.id === draft.clientId);
  return (
    <div className="grid gap-5 lg:grid-cols-[3fr_1fr]">
      <div className="space-y-5">
        <Card title="Project details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Textbox
              label="Project Number"
              value={draft.projectNumber || ""}
              placeholder={nextNumber}
              disabled={!basicEditing}
              onChange={(e) => update({ projectNumber: e.target.value })}
            />
            <Textbox
              label="Project Name"
              value={draft.name}
              disabled={!basicEditing}
              onChange={(e) => update({ name: e.target.value })}
            />
            <Textbox label="PO number" value={draft.poNumber||''} disabled={!basicEditing} onChange={e=>update({poNumber:e.target.value})}/>
            <div className="sm:col-span-2">
              <Textarea
                label="Scope of work"
                disabled={!basicEditing}
                value={draft.description}
                onChange={(e) => update({ description: e.target.value })}
                rows={4}
              />
            </div>
            {canViewRates && (
              <SearchableDropdown
                disabled={!basicEditing || !canMoney}
                label="Pay table"
                placeholder="Use default on new project"
                value={draft.payTableId || ""}
                onChange={(value) => update({ payTableId: value || null })}
                options={[
                  ...payTables
                    .filter(
                      (t) =>
                        (t.active === 1 &&
                          (!t.expires_on ||
                            t.expires_on >=
                              new Date().toISOString().slice(0, 10))) ||
                        t.id === draft.payTableId,
                    )
                    .map((t) => ({ value: t.id, label: t.name })),
                ]}
              />
            )}
            {canViewFinancials && (
              <CurrencyField
                label="Contract price"
                valueCents={draft.contractPriceCents}
                disabled={!basicEditing || !canMoney}
                onCentsChange={(cents) =>
                  update({ contractPriceCents: cents ?? 0 })
                }
              />
            )}
          </div>
        </Card>
        <Card title="Survey location">
          <div className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <Textbox
                label="Parcel ID"
                disabled={!basicEditing}
                value={draft.address?.parcelId || ""}
                onChange={(e) =>
                  update({
                    address: { ...draft.address, parcelId: e.target.value },
                  })
                }
              />
            </div>
            <div className="sm:col-span-3">
              <Textbox
                label="Street address"
                disabled={!basicEditing}
                value={draft.address?.line1 || ""}
                onChange={(e) =>
                  update({
                    address: { ...draft.address, line1: e.target.value },
                  })
                }
              />
            </div>
            <div className="sm:col-span-3">
              <Textbox
                label="City"
                disabled={!basicEditing}
                value={draft.address?.city || ""}
                onChange={(e) =>
                  update({
                    address: { ...draft.address, city: e.target.value },
                  })
                }
              />
            </div>
            <div className="sm:col-span-3 flex items-center">
              <Toggle
                disabled={!basicEditing}
                label="The property falls outside the city limits (unincorporated)"
                checked={draft.address?.isUnincorporated || false}
                onChange={(e) =>
                  update({
                    address: { ...draft.address, isUnincorporated: e },
                  })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <SearchableDropdown
                disabled={!basicEditing}
                label="State"
                placeholder="Select"
                value={draft.address?.state || ""}
                options={STATE_OPTIONS}
                onChange={(value) =>
                  update({
                    address: { ...draft.address, state: value, county: "" },
                  })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <SearchableDropdown
                disabled={!basicEditing || !draft.address?.state}
                label="County"
                placeholder="Select"
                value={draft.address?.county || ""}
                options={getCountyOptions(draft.address?.state)}
                onChange={(value) =>
                  update({ address: { ...draft.address, county: value } })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Textbox
                disabled={!basicEditing}
                label="Postal code"
                value={draft.address?.postalCode || ""}
                onChange={(e) =>
                  update({
                    address: { ...draft.address, postalCode: e.target.value },
                  })
                }
              />
            </div>
            <div className="sm:col-span-3">
              <Textbox
                label="Project Latitude"
                disabled={!basicEditing}
                value={draft.address?.latitude || ""}
                onChange={(e) =>
                  update({
                    address: {
                      ...draft.address,
                      latitude: e.target.value ? Number(e.target.value) : null,
                    },
                  })
                }
              />
            </div>
            <div className="sm:col-span-3">
              <Textbox
                label="Project Longitude"
                disabled={!basicEditing}
                value={draft.address?.longitude || ""}
                onChange={(e) =>
                  update({
                    address: {
                      ...draft.address,
                      longitude: e.target.value ? Number(e.target.value) : null,
                    },
                  })
                }
              />
            </div>
          </div>
        </Card>
      </div>
      <div className="space-y-5">
        <Card title="Client and people">
          <div className="grid gap-4">
            {selectedClient ? (
              <LinkedSearchableDropdown
                disabled={!basicEditing}
                label="Client"
                placeholder="Select client"
                linkRef={`/client/${draft.clientId}`}
                value={draft.clientId || ""}
                options={clients.map((x) => ({
                  value: x.id,
                  label: `${x.name}`,
                }))}
                onChange={(value) =>
                  update({ clientId: value, contactId: "", contacts: [] })
                }
              />
            ) : (
              <SearchableDropdown
                disabled={!basicEditing}
                label="Client"
                placeholder="Select client"
                value={draft.clientId || ""}
                options={clients.map((x) => ({
                  value: x.id,
                  label: `${x.name}`,
                }))}
                onChange={(value) =>
                  update({ clientId: value, contactId: "", contacts: [] })
                }
              />
            )}
            <SearchableDropdown
              disabled={!basicEditing || !selectedClient}
              label="Contact"
              placeholder="Select contact"
              value={draft.contactId || ""}
              options={contacts.map((x) => ({
                value: x.id,
                label: x.name || "",
              }))}
              onChange={(value) => update({ contactId: value })}
            />
            <SearchableDropdown
              disabled={!basicEditing}
              label="Project manager"
              required
              value={draft.managerUserId}
              placeholder="Select employee"
              onChange={(value) => update({ managerUserId: value })}
              options={projectManagers.map((x) => ({
                value: x.id,
                label: x.display_name || "",
              }))}
            />
          </div>
        </Card>
        <Card title="Schedule and stage">
          <div className="grid gap-4">
            <Dropdown
              disabled={!editing && (!record || canStatus)}
              label="Stage"
              value={draft.stage || "opportunity"}
              onChange={(value) => update({ stage: value as ProjectStage })}
              options={stageOptions}
            />
            <Toggle
              disabled={!editing && (!record || canStatus)}
              label="Active record"
              checked={draft.active !== false}
              onChange={(value) => update({ active: value })}
            />
            <Textbox
              disabled={!basicEditing}
              label="Start date"
              type="date"
              value={draft.startDate || ""}
              onChange={(e) => update({ startDate: e.target.value || null })}
            />
            <Textbox
              disabled={!basicEditing}
              label="Due date"
              type="date"
              value={draft.dueDate || ""}
              onChange={(e) => update({ dueDate: e.target.value || null })}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
export function ProjectContactsTab({
  draft,
  basicEditing,
  users,
  contacts,
  update,
  roleChange,
}: ProjectContactsTabProps) {
  return (
    <Card title="Project team and contacts">
      <p className="mb-4 text-sm text-slate-600">
        The project manager and primary client contact are selected on General.
        Add other roles here.
      </p>
      <div className="space-y-4">
        {(draft.contacts || []).map((role, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_2fr_auto]"
          >
            <SelectField
              editing={basicEditing}
              label="Role"
              value={role.role}
              onChange={(value) =>
                roleChange(index, {
                  role: value as ProjectContact["role"],
                  userId: null,
                  contactId: null,
                })
              }
              options={roleOptions.map((x) => ({
                value: x,
                label: x.replaceAll(/([A-Z])/g, " $1"),
              }))}
            />
            <SelectField
              editing={basicEditing}
              label="Person"
              value={
                role.role === "busDevManager"
                  ? role.userId || ""
                  : role.contactId || ""
              }
              onChange={(value) =>
                roleChange(
                  index,
                  role.role === "busDevManager"
                    ? { userId: value, contactId: null }
                    : { contactId: value, userId: null },
                )
              }
              options={(role.role === "busDevManager" ? users : contacts).map(
                (x) => ({ value: x.id, label: x.display_name || x.name || "" }),
              )}
            />
            {basicEditing && (
              <button
                className="self-end pb-3 text-sm text-red-700"
                onClick={() =>
                  update({
                    contacts: (draft.contacts || []).filter(
                      (_, i) => i !== index,
                    ),
                  })
                }
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {basicEditing && (
          <button
            className="rounded-lg border bg-white px-4 py-2 text-sm"
            onClick={() =>
              update({
                contacts: [
                  ...(draft.contacts || []),
                  { role: "clientStakeholder", userId: null, contactId: null },
                ],
              })
            }
          >
            Add role
          </button>
        )}
      </div>
    </Card>
  );
}
export function ProjectTasksTab({
  draft,
  record,
  editing,
  basicEditing,
  canMoney,
  canViewFinancials,
  users,
  update,
  taskChange,
}: ProjectTasksTabProps) {
  return (
    <div className="space-y-4">
      {(draft.tasks || []).map((task, index) => (
        <Card
          key={task.id || index}
          title={task.taskName || `Task ${index + 1}`}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField
              editing={
                basicEditing &&
                !record?.tasks.some((existing) => existing.id === task.id)
              }
              label="Task ID"
              value={task.taskId || ""}
              placeholder="Assigned on save"
              onChange={(e) =>
                taskChange(index, { taskId: e.target.value.toUpperCase() })
              }
            />
            <TextField
              editing={basicEditing}
              label="Task name"
              required
              value={task.taskName || ""}
              onChange={(e) => taskChange(index, { taskName: e.target.value })}
            />
            <SelectField
              editing={basicEditing}
              label="Manager"
              value={task.taskManagerId || ""}
              onChange={(value) =>
                taskChange(index, { taskManagerId: value || null })
              }
              options={[
                { value: "", label: "Project manager" },
                ...users.map((x) => ({
                  value: x.id,
                  label: x.display_name || "",
                })),
              ]}
            />
            <TextField
              editing={basicEditing}
              label="Due date"
              type="date"
              value={task.dueDate || ""}
              onChange={(e) =>
                taskChange(index, { dueDate: e.target.value || null })
              }
            />
            <SelectField
              editing={basicEditing}
              label="Status"
              value={task.status || "active"}
              onChange={(value) =>
                taskChange(index, { status: value as RecordTask["status"] })
              }
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
            <SelectField
              editing={basicEditing}
              label="Billing type"
              value={task.billType || "fixed-fee"}
              onChange={(value) =>
                taskChange(index, { billType: value as RecordTask["billType"] })
              }
              options={taskBillOptions.map((x) => ({ value: x, label: x }))}
            />
            <div className="sm:col-span-2 lg:col-span-3">
              <TextAreaField
                editing={basicEditing}
                label="Short description"
                value={task.shortDescription || ""}
                onChange={(e) =>
                  taskChange(index, { shortDescription: e.target.value })
                }
                rows={2}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <TextAreaField
                editing={basicEditing}
                label="Long description"
                value={(task.longDescription || [])
                  .map((x) => x.content)
                  .join("\n")}
                onChange={(e) =>
                  taskChange(index, {
                    longDescription: e.target.value
                      ? e.target.value
                          .split("\n")
                          .map((content) => ({ type: "text", content }))
                      : [],
                  })
                }
                rows={4}
              />
            </div>
            <CheckField
              editing={basicEditing}
              label="Under contract"
              checked={Boolean(task.isUnderContract)}
              onChange={(value) =>
                taskChange(index, { isUnderContract: value })
              }
            />
            <CheckField
              editing={basicEditing}
              label="Completed"
              checked={Boolean(task.isCompleted)}
              onChange={(value) => taskChange(index, { isCompleted: value })}
            />
            {canViewFinancials && (
              <CurrencyField
                disabled={!basicEditing || !canMoney}
                label="Contract amount ($)"
                valueCents={task.contractAmountCents || 0}
                onCentsChange={(cents) =>
                  taskChange(index, { contractAmountCents: cents ?? 0 })
                }
              />
            )}
            {canViewFinancials && (
              <Textbox
                disabled={!basicEditing || !canMoney}
                label="Billing notes"
                value={task.billNotes || ""}
                onChange={(e) =>
                  taskChange(index, { billNotes: e.target.value })
                }
              />
            )}
          </div>
          {basicEditing && (
            <button
              className="mt-4 text-sm text-red-700"
              onClick={() =>
                update({
                  tasks: (draft.tasks || []).filter((_, i) => i !== index),
                })
              }
            >
              Archive task
            </button>
          )}
        </Card>
      ))}
      {basicEditing && (
        <button
          className="rounded-lg border bg-white px-4 py-2 text-sm"
          onClick={() => update({ tasks: [...(draft.tasks || []), newTask()] })}
        >
          Add task
        </button>
      )}
      {!(draft.tasks || []).length && !editing && (
        <p className="rounded-xl border bg-white p-5 text-sm text-slate-500">
          No tasks yet.
        </p>
      )}
    </div>
  );
}
export function ProjectAccountingTab({
  draft,
  record,
  basicEditing,
  canMoney,
  canViewRates,
  canViewFinancials,
  update,
}: ProjectAccountingTabProps) {
  return (
    <>
      {canViewRates && canViewFinancials && record && (
        <Card title="Approved time comparison">
          <div className="grid gap-3 sm:grid-cols-2">
            <p>
              Actual labor cost:{" "}
              <strong>
                {(record.accounting.actualCostCents / 100).toLocaleString(
                  "en-US",
                  { style: "currency", currency: "USD" },
                )}
              </strong>
            </p>
            <p>
              Rate card value:{" "}
              <strong>
                {(record.accounting.timeChargeCents / 100).toLocaleString(
                  "en-US",
                  { style: "currency", currency: "USD" },
                )}
              </strong>
            </p>
          </div>
        </Card>
      )}
      <Card title="Project accounting">
        {!canViewFinancials ? (
          <p className="text-sm text-slate-500">
            Financial access is required.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <CurrencyField
              disabled={!basicEditing || !canMoney}
              label="Budget ($)"
              valueCents={draft.budgetCents || 0}
              onCentsChange={(cents) => update({ budgetCents: cents ?? 0 })}
            />
            <CurrencyField
              disabled={true}
              label="Actual cost ($)"
              valueCents={record?.accounting.actualCostCents || 0}
              onCentsChange={() => undefined}
            />
            <CurrencyField
              disabled={true}
              label="Remaining budget ($)"
              valueCents={
                (draft.budgetCents || 0) -
                (record?.accounting.actualCostCents || 0)
              }
              onCentsChange={() => undefined}
            />
            <p className="sm:col-span-2 text-xs text-slate-500">
              Actual costs and invoice totals will come from their source
              workflows.
            </p>
          </div>
        )}
      </Card>
    </>
  );
}
export function ProjectInvoicesTab({
  record,
  canViewFinancials,
}: ProjectInvoicesTabProps) {
  return (
    <Card title="Linked invoices">
      <div className="mb-3">
        <Link
          className="text-sm font-medium text-sky-800"
          to={`/invoices?projectId=${record?.id || ""}`}
        >
          Create or review invoices →
        </Link>
      </div>
      {!canViewFinancials ? (
        <p className="text-sm text-slate-500">
          Invoice amounts require financial access.
        </p>
      ) : record?.accounting.invoices.length ? (
        <div className="divide-y">
          {record.accounting.invoices.map((invoice) => (
            <Link
              key={invoice.id}
              to={`/invoices/${invoice.id}`}
              className="block py-3 text-sm text-sky-800"
            >
              {invoice.invoiceNumber} · {invoice.status} ·{" "}
              {(invoice.amountCents / 100).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No invoices yet.</p>
      )}
    </Card>
  );
}
