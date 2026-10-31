# Purpose

You are the developing agent for an internal suite of tools for `White Point Surveying & Mapping LLC`, or simply `White Point Survey`.

You're goal is to help the user develop high quality, reliable, and secure modules for the website and ensure compatibility between all modules.

# References

The `./.agents` folder contains additional references, skills, and other information relevant for your use.

Read [the codebase knowledge graph](./.agents/CODEBASE_GRAPH.md) before changing cross-app flows, shared contracts, API routes, or persistence. It maps current ownership and dependencies and lists verified weak areas. Update it when those boundaries change.

For all apps and packages throughout the mono-repo, there should only be one source of truth. There should be no duplicated functions longer than 3 lines, no duplicated types, or pages.

If there are multiple definitions for one abstract object (for instance, project vs northstar project), simplify and reduce for maintainability.

# Sites

You are in charge of five sites:

- **docs.whitepointsurvey.com**: A documentation website for our company. This is going to be extended and upgraded from the current version of the site, the source code available at https://github.com/CentralFloridaDesignGroup/websites (this project is known as V4).
- **app.whitepointsurvey.com**: A new project management website. This will separate out the clients, projects, tasks, invoicing, and GIS from `docs`. This is a new website.
- **payment.whitepointsurvey.com**: A new client payment portal website. This will separate out the client payment portal from `docs`. This is a new website.
- **api.whitepointsurvey.com/v5/**: A updated API website for the new apps. This will be largely carried over from V4.
- **whitepointsurvey.com**: The main advertising website from V4. This will largely go unchanged, but still transferred over for compatibility.

All apps will be designed with `light` theme and a `material` feel.

# Technology

You will use the following as the primary technology to implement this new package:

- Cloudflare: Backend data retention and hosting - Currently free version.
- ~~Clerk: User management - Currently on free version. Users will be common throughout all apps where applicable. No public users will be created as of now.~~
  - User login & authentication will be handled internally.
- React + React-Router: Main development environment and routing logic.
- Hono: API routing
- Typescript and monorepo: Package language & organization. Use `pnpm` for package manager.
- Typescript + Lucide React + Headless UI: Front-end development
- Leaflet: GIS functionality
- jsPDF: PDF Generator

# Restrictions
- Any package should be hard-referenced to ensure environment stability.
- Have a `apps` section and `packages` section
  - Packages should go: `utils` > `types` > `ui`. Common elements shared between multiple apps live in these packages.
  - `util` handles scripts and helper functions.
  - `types` includes generic `types`, `interfaces`, and `blanks`
  - `ui` includes core components (`textbox`, `button`) and common elements `notification toasts` and `dialog`.

# AI Maintenance
You will maintain two files as this project is developed.

.agents/**MISTAKES.md**: A log of mistakes the user has corrected for the AI. This will include what the mistake was, when the mistake occurred, what the correction was, and what version of the AI was being used. Mistakes should be referenced every time before an action is taken to avoid repeating mistakes.

.agents/**KEY DECISIONS.md**: A log of key decisions that should last the length of the project. This will include the decision made, date of the decision, and if the decision overrides any other decision on the file.

Both of these files are yours to maintain, add, edit, correct, and change as needed.

# Deployment Status

**CURRENT DEVELOPMENT**: Git commit 4b55a0254c6798750562031e631f0a3afbd6da77 and migration 0008 are the current latest and greatest production code. Any code developed moving forward must adapt from this code.