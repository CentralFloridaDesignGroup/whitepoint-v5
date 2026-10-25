import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import type {
  Client,
  ClientAddress,
  ClientDocument,
  ClientInput,
  Contact,
} from "@whitepoint/types";
import {
  Card,
  TextField,
  type ListRecord,
} from "../common/RecordControls";
import {
  Button,
  Dropdown,
  SearchableDropdown,
  Textarea,
  Textbox,
  LinkedTextbox,
  Toggle,
} from "@whitepoint/ui/input";
import { STATE_OPTIONS } from "@whitepoint/types/constants";

export type ClientProject = {
  id: string;
  project_number: string;
  name: string;
  stage: string;
};
type UpdateClient = (patch: Partial<ClientInput>) => void;
type ClientGeneralTabProps = {
  draft: ClientInput;
  editing: boolean;
  clients: ListRecord[];
  id?: string;
  update: UpdateClient;
};
type ClientAddressesTabProps = {
  draft: ClientInput;
  editing: boolean;
  update: UpdateClient;
  addressChange: (index: number, patch: Partial<ClientAddress>) => void;
  onAddAddress: () => void;
};
type ClientContactsTabProps = {
  draft: ClientInput;
  editing: boolean;
  update: UpdateClient;
  contactChange: (index: number, patch: Partial<Contact>) => void;
  onAddContact: () => void;
};
type ClientProjectsTabProps = {
  id?: string;
  projects: ClientProject[];
};
type ClientDocumentsTabProps = {
  draft: ClientInput;
  record: Client | null;
  editing: boolean;
  update: UpdateClient;
  download: (document: ClientDocument) => Promise<void>;
  onDocumentFileChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function ClientGeneralTab({
  draft,
  editing,
  clients,
  id,
  update,
}: ClientGeneralTabProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title="Client details">
        <div className="grid gap-4">
          <Textbox
            disabled={!editing}
            label="Client name"
            required
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
          />
          <Textbox
            disabled={!editing}
            label="Company email"
            type="email"
            value={draft.email || ""}
            onChange={(e) => update({ email: e.target.value })}
          />
          <Textbox
            disabled={!editing}
            label="Phone"
            value={draft.phone || ""}
            onChange={(e) => update({ phone: e.target.value })}
          />
          <Dropdown
            disabled={!editing}
            label="Status"
            value={draft.status || "active"}
            onChange={(value) =>
              update({ status: value as ClientInput["status"] })
            }
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
          <Dropdown
            disabled={!editing}
            label="Parent client"
            value={draft.parentClientId || ""}
            onChange={(value) => update({ parentClientId: value || null })}
            options={[
              { value: "", label: "None" },
              ...clients
                .filter((x) => x.id !== id)
                .map((x) => ({ value: x.id, label: x.name })),
            ]}
          />
        </div>
      </Card>
      <Card title="Client profile">
        <div className="grid gap-4">
          <Textbox
            disabled={!editing}
            label="Industry"
            value={draft.metadata?.industry || ""}
            onChange={(e) =>
              update({
                metadata: { ...draft.metadata, industry: e.target.value },
              })
            }
          />
          <Textbox
            disabled={!editing}
            label="Size"
            value={draft.metadata?.size || ""}
            onChange={(e) =>
              update({ metadata: { ...draft.metadata, size: e.target.value } })
            }
          />
          <Toggle
            disabled={!editing}
            label="Public organization"
            checked={Boolean(draft.metadata?.public)}
            onChange={(value) =>
              update({ metadata: { ...draft.metadata, public: value } })
            }
          />
          <Textarea
            disabled={!editing}
            label="Internal notes"
            value={draft.metadata?.notes || ""}
            onChange={(e) =>
              update({ metadata: { ...draft.metadata, notes: e.target.value } })
            }
            rows={5}
          />
        </div>
      </Card>
    </div>
  );
}
export function ClientAddressesTab({
  draft,
  editing,
  update,
  addressChange,
  onAddAddress,
}: ClientAddressesTabProps) {
  return (
    <div className="space-y-4">
      {draft.addresses.map((address, index) => (
        <Card
          key={address.id || index}
          title={address.label || `Address ${index + 1}`}
        >
          <div className="grid gap-4 mb-2 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Textbox
                disabled={!editing}
                label="Label"
                value={address.label || ""}
                onChange={(e) =>
                  addressChange(index, { label: e.target.value })
                }
              />
            </div>
            <div className="sm:col-span-2 flex items-end">
              <Toggle
                disabled={!editing}
                label="Primary mailing address"
                checked={Boolean(address.isPrimaryMailingAddress)}
                onChange={(value) =>
                  addressChange(index, { isPrimaryMailingAddress: value })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Textbox
                disabled={!editing}
                label="Address line 1"
                required
                value={address.line1 || ""}
                onChange={(e) =>
                  addressChange(index, { line1: e.target.value })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Textbox
                disabled={!editing}
                label="Address line 2"
                value={address.line2 || ""}
                onChange={(e) =>
                  addressChange(index, { line2: e.target.value })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Textbox
                disabled={!editing}
                label="City"
                required
                value={address.city || ""}
                onChange={(e) => addressChange(index, { city: e.target.value })}
              />
            </div>
            <SearchableDropdown
              disabled={!editing}
              label="State"
              placeholder="Select"
              value={address.state || ""}
              options={STATE_OPTIONS}
              onChange={(value) => addressChange(index, { state: value })}
            />
            <Textbox
              disabled={!editing}
              label="Postal code"
              required
              value={address.postalCode || ""}
              onChange={(e) =>
                addressChange(index, { postalCode: e.target.value })
              }
            />
          </div>
          {editing && draft.addresses.length > 1 && (
            <Button
              variant="danger"
              size="small"
              onClick={() =>
                update({
                  addresses: draft.addresses.filter((_, i) => i !== index),
                })
              }
            >
              Remove address
            </Button>
          )}
        </Card>
      ))}
      {editing && (
        <Button variant="primary" size="small" onClick={onAddAddress}>
          Add address
        </Button>
      )}
    </div>
  );
}
export function ClientContactsTab({
  draft,
  editing,
  update,
  contactChange,
  onAddContact,
}: ClientContactsTabProps) {
  return (
    <div className="space-y-4">
      {draft.contacts.map((contact, index) => (
        <Card
          key={contact.id || index}
          title={`${contact.firstName || "New"} ${contact.lastName || "contact"}`}
        >
          <div className="grid gap-4 md:grid-cols-6">
            <Dropdown
              disabled={!editing}
              label="Prefix"
              value={contact.prefix || ""}
              options={[
                { value: "Mr", label: "Mr." },
                { value: "Mrs", label: "Mrs." },
                { value: "Ms", label: "Ms." },
                { value: "Dr", label: "Dr." },
              ]}
              onChange={(e) => contactChange(index, { prefix: e })}
            />
            <Textbox
              disabled={!editing}
              label="First name"
              required
              value={contact.firstName || ""}
              onChange={(e) =>
                contactChange(index, { firstName: e.target.value })
              }
            />
            <Textbox
              disabled={!editing}
              label="Middle name"
              value={contact.middleName || ""}
              onChange={(e) =>
                contactChange(index, { middleName: e.target.value })
              }
            />
            <Textbox
              disabled={!editing}
              label="Last name"
              required
              value={contact.lastName || ""}
              onChange={(e) =>
                contactChange(index, { lastName: e.target.value })
              }
            />
            <Textbox
              disabled={!editing}
              label="Suffix"
              value={contact.suffix || ""}
              onChange={(e) => contactChange(index, { suffix: e.target.value })}
            />
            <Dropdown
              disabled={!editing}
              label="Mailing address"
              value={contact.clientAddressId || ""}
              onChange={(value) =>
                contactChange(index, { clientAddressId: value || null })
              }
              options={[
                { value: "", label: "Client primary" },
                ...draft.addresses.map((a) => ({
                  value: a.id || "",
                  label: a.label || a.line1 || "Address",
                })),
              ]}
            />
            <div className="md:col-span-3">
              <LinkedTextbox
                disabled={!editing}
                label="Email"
                type="email"
                linkRef={contact.email ? `mailto:${contact.email}` : ""}
                value={contact.email || ""}
                onChange={(e) =>
                  contactChange(index, { email: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-3">
              <LinkedTextbox
                disabled={!editing}
                label="Phone"
                linkRef={contact.phone ? `tel:${contact.phone}` : ""}
                value={contact.phone || ""}
                onChange={(e) =>
                  contactChange(index, { phone: e.target.value })
                }
              />
            </div>
            <div className="md:col-span-2">
            <Textbox
              disabled={!editing}
              label="Title"
              value={contact.metadata?.title || ""}
              onChange={(e) =>
                contactChange(index, {
                  metadata: {
                    ...contact.metadata,
                    title: e.target.value,
                  } as Contact["metadata"],
                })
              }
            />
            </div>
            <div className="md:col-span-2">
            <Textbox
              disabled={!editing}
              label="Department"
              value={contact.metadata?.department || ""}
              onChange={(e) =>
                contactChange(index, {
                  metadata: {
                    ...contact.metadata,
                    department: e.target.value,
                  } as Contact["metadata"],
                })
              }
            />
            </div>
            <div className="md:col-span-2">
            <Textbox
              disabled={!editing}
              label="Reports to"
              value={contact.metadata?.reportsTo || ""}
              onChange={(e) =>
                contactChange(index, {
                  metadata: {
                    ...contact.metadata,
                    reportsTo: e.target.value,
                  } as Contact["metadata"],
                })
              }
            />
            </div>
            <Toggle
              disabled={!editing}
              label="Point of contact"
              checked={Boolean(contact.isPoc)}
              onChange={(value) => contactChange(index, { isPoc: value })}
            />
            <Toggle
              disabled={!editing}
              label="Billing point of contact"
              checked={Boolean(contact.isBillingPoc)}
              onChange={(value) =>
                contactChange(index, { isBillingPoc: value })
              }
            />
            <Toggle
              disabled={!editing}
              label="Executive point of contact"
              checked={Boolean(contact.isExecutivePoc)}
              onChange={(value) =>
                contactChange(index, { isExecutivePoc: value })
              }
            />
            <div className="md:col-span-3">
              <Textarea
                disabled={!editing}
                label="Notes"
                value={contact.metadata?.notes || ""}
                onChange={(e) =>
                  contactChange(index, {
                    metadata: {
                      ...contact.metadata,
                      notes: e.target.value,
                    } as Contact["metadata"],
                  })
                }
                rows={3}
              />
            </div>
          </div>
          {editing && draft.contacts.length > 1 && (
            <button
              className="mt-4 text-sm text-red-700"
              onClick={() =>
                update({
                  contacts: draft.contacts.filter((_, i) => i !== index),
                })
              }
            >
              Remove contact
            </button>
          )}
        </Card>
      ))}
      {editing && (
        <button
          className="rounded-lg border bg-white px-4 py-2 text-sm"
          onClick={onAddContact}
        >
          Add contact
        </button>
      )}
    </div>
  );
}
export function ClientProjectsTab({
  id,
  projects,
}: ClientProjectsTabProps) {
  return (
    <Card title="Projects">
      {!id ? (
        <p className="text-sm text-slate-500">
          Save the client to add projects.
        </p>
      ) : projects.length ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/project/${project.id}`}
              className="block py-1 px-3 text-blue-500 hover:underline shadow-sm hover:shadow-md overflow-x-hidden"
            >
              {project.project_number} {project.name}
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No projects yet.</p>
      )}
    </Card>
  );
}
export function ClientDocumentsTab({
  draft,
  record,
  editing,
  update,
  download,
  onDocumentFileChange,
}: ClientDocumentsTabProps) {
  return (
    <Card title="Client documents">
      <div className="space-y-4">
        {(draft.documents || []).map((doc) => (
          <div
            key={doc.id}
            className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_140px_auto]"
          >
            <Textbox
              disabled={!editing}
              label="File name"
              value={doc.name}
              onChange={(e) =>
                update({
                  documents: (draft.documents || []).map((x) =>
                    x.id === doc.id ? { ...x, name: e.target.value } : x,
                  ),
                })
              }
            />
            <Textbox
              disabled={!editing}
              label="Description"
              value={doc.description}
              onChange={(e) =>
                update({
                  documents: (draft.documents || []).map((x) =>
                    x.id === doc.id ? { ...x, description: e.target.value } : x,
                  ),
                })
              }
            />
            <Textbox
              disabled={!editing}
              type="date"
              label="Expires"
              value={doc.expiresAt || ""}
              onChange={(e) =>
                update({
                  documents: (draft.documents || []).map((x) =>
                    x.id === doc.id
                      ? { ...x, expiresAt: e.target.value || null }
                      : x,
                  ),
                })
              }
            />
            <div className="flex gap-2 pb-2">
              {record?.documents.some((x) => x.id === doc.id) && (
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() =>
                    void download(
                      record.documents.find((x) => x.id === doc.id)!,
                    )
                  }
                >
                  Download
                </Button>
              )}
              {editing && (
                <Button
                  variant="danger"
                  size="small"
                  onClick={() =>
                    update({
                      documents: (draft.documents || []).filter(
                        (x) => x.id !== doc.id,
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        ))}
        {editing && (
          <TextField
            editing
            type="file"
            label="Add document"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
            onChange={onDocumentFileChange}
          />
        )}
        <p className="text-xs text-slate-500">
          PDF, images, and Office files, up to 10 MB each. Files are added with
          Save record.
        </p>
      </div>
    </Card>
  );
}
