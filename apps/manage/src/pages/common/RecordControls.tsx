import type { ReactNode } from "react";
import {
  Button,
  Dropdown,
  Textarea,
  Textbox,
  Toggle,
} from "@whitepoint/ui/input";
import { TabNavigation } from "./TabNavigation";

export function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-5 text-lg font-semibold text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
export function Tabs({
  names,
  active,
  onChange,
}: {
  names: string[];
  active: string;
  onChange: (name: string) => void;
}) {
  return (
    <TabNavigation
      ariaLabel="Record sections"
      tabs={names.map((name) => ({ label: name, value: name }))}
      activeValue={active}
      onChange={onChange}
    />
  );
}
export function TextField(
  props: React.ComponentProps<typeof Textbox> & { editing: boolean },
) {
  const { editing, ...rest } = props;
  return <Textbox {...rest} readOnly={!editing} />;
}
export function TextAreaField(
  props: React.ComponentProps<typeof Textarea> & { editing: boolean },
) {
  const { editing, ...rest } = props;
  return <Textarea {...rest} readOnly={!editing} />;
}
export function SelectField(
  props: React.ComponentProps<typeof Dropdown> & { editing: boolean },
) {
  const { editing, ...rest } = props;
  return <Dropdown {...rest} disabled={!editing} />;
}
export function CheckField(
  props: React.ComponentProps<typeof Toggle> & { editing: boolean },
) {
  const { editing, ...rest } = props;
  return <Toggle {...rest} disabled={!editing} />;
}
export function SaveBar({
  editing,
  busy,
  canSave,
  onSave,
  onCancel,
}: {
  editing: boolean;
  busy: boolean;
  canSave: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return editing ? (
    <div className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg">
      <Button type="button" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="button" onClick={onSave} disabled={busy || !canSave}>
        {busy ? "Saving…" : "Save record"}
      </Button>
    </div>
  ) : null;
}
export type ListRecord = {
  id: string;
  name: string;
  client_number?: string;
  project_number?: string;
  client_name?: string;
  contact_names?: string;
  status?: string;
  stage?: string;
};
