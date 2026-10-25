# API email templates

Each file owns the content for one email family. `layout.ts` owns the shared table layout, inline styles, HTML escaping, and link formatting. Edit the relevant family file to change its wording; edit `layout.ts` to change the appearance across all messages.

Every template returns `{ text, html }`. Pass both values to `sendEmail` in `src/services/brevo.ts`. Keep a plain text version for recipients whose mail clients do not render HTML. Put styles inline so email clients can display them without loading external CSS. Do not insert unescaped dynamic HTML into a template.
