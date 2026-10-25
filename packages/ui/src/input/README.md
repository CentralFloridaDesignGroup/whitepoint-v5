# Shared form controls

Import `Textbox`, `Textarea`, `Dropdown`, `SearchableDropdown`, `Checkbox`, `Toggle`, `Button`, and `OTPInput` from `@whitepoint/ui/input`. They use one light Material style. Labels, descriptions, errors, and `labelPosition="side"` are available for form layouts.

```tsx
<Textbox name="projectName" label="Project name" value={name} onChange={event => setName(event.target.value)} required />
<Dropdown label="Client" options={clients} value={clientId} onChange={setClientId} />
<Checkbox label="Include exhibits" checked={includeExhibits} onChange={event => setIncludeExhibits(event.target.checked)} />
<Toggle label="Active" checked={active} onChange={setActive} />
<Button variant="primary" type="submit">Save project</Button>
```

Text controls and checkboxes accept native input attributes and change events. Use native `required` and `pattern` for browser validation, or handle validation in the caller. Selection options are `{ value, label, disabled? }`; selection callbacks receive a string. `Toggle` callbacks receive a boolean. Text, selection, toggle, and OTP controls support controlled and initial uncontrolled values. `SearchableDropdown` filters its option labels as the user types.

`Button` accepts native button attributes, `variant`, `size`, and an optional Lucide `icon`. It defaults to `type="button"`; set `type="submit"` for forms. Variants are `primary`, `secondary`, `success`, `danger`, `text`, and `custom`.

`OTPInput` handles six digits, local focus, and full-code paste for staff authentication. Survey-specific controls live in Docs rather than this package.
