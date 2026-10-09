# Shared form inputs

Import from `@whitepoint/ui/input`. All controls use the light Material palette from `@whitepoint/ui/styles/globals.css`. Use `label`, `description`, and `error` for field text; `className` adds local styling. Native input and button attributes are passed through where applicable.

```tsx
import { Button, Checkbox, Dropdown, OTPInput, SearchableDropdown, Textarea, Textbox, Toggle } from "@whitepoint/ui/input";

const clients = [
  { value: "c1", label: "Acme Surveying" },
  { value: "c2", label: "Central Florida Design Group" },
];

// Uncontrolled values are supplied once, then held by the control.
<Textbox name="projectName" label="Project name" defaultValue="Boundary survey" required />;
<Textarea name="notes" label="Notes" defaultValue="" rows={4} />;
<Dropdown name="clientId" label="Client" options={clients} defaultValue="c1" />;
<Checkbox name="includeExhibits" label="Include exhibits" defaultChecked />;

// Controlled values are owned by the caller.
<SearchableDropdown name="clientId" label="Client" options={clients} value={clientId} onChange={setClientId} />;
<Toggle name="active" label="Active" checked={active} onChange={setActive} />;
<OTPInput name="code" label="Authenticator code" value={code} onChange={setCode} />;
<Button variant="primary" type="submit">Save project</Button>;
<Button variant="custom" className="bg-slate-900 text-white">Custom action</Button>;
```

Button variants: `primary`, `secondary`, `success`, `danger`, `text`, and `custom`. Button defaults to `type="button"`; set `type="submit"` for forms.

Select options use string values. `Dropdown` and `SearchableDropdown` support `value`/`defaultValue` and report the selected string through `onChange`. `SearchableDropdown` also supports controlled or uncontrolled search text through `query`/`defaultQuery` and `onQueryChange`.

Existing apps may continue importing `Combobox`, `TextboxSuggestion`, `Bearing`, and `Multiselect`. `Combobox` maps its `selections` and `(field, value)` callback to `SearchableDropdown`; the other controls retain their established behavior while those screens are migrated.

`OTPInput` accepts six digits, moves focus within its own six boxes, and accepts pasted codes. It supports `value`/`defaultValue`. Its optional `triggerSubmittal` receives the completed string, so a submit handler can use that value directly.
