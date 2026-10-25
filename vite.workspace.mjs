import { fileURLToPath } from "node:url";

const source = (path) => fileURLToPath(new URL(path, import.meta.url));

// Serve shared package source so Vite sees edits immediately. Production builds
// continue to consume the packages' compiled dist entry points.
export const workspaceAliases = [
  { find: /^@whitepoint\/types\/types\/(.+)$/, replacement: source("./packages/types/src/types/$1.ts") },
  { find: /^@whitepoint\/types\/constants$/, replacement: source("./packages/types/src/constants/index.ts") },
  { find: /^@whitepoint\/types\/mappers$/, replacement: source("./packages/types/src/mappers/index.ts") },
  { find: /^@whitepoint\/types\/permissions$/, replacement: source("./packages/types/src/permissions.ts") },
  { find: /^@whitepoint\/types$/, replacement: source("./packages/types/src/index.ts") },
  { find: /^@whitepoint\/utils$/, replacement: source("./packages/utils/src/index.ts") },
  { find: /^@whitepoint\/utils\/api-client$/, replacement: source("./packages/utils/src/apiClient.ts") },
  { find: /^@whitepoint\/ui\/components$/, replacement: source("./packages/ui/src/components/input/index.ts") },
  { find: /^@whitepoint\/ui\/input$/, replacement: source("./packages/ui/src/input/index.ts") },
  { find: /^@whitepoint\/ui\/layout$/, replacement: source("./packages/ui/src/layout/index.ts") },
  { find: /^@whitepoint\/ui$/, replacement: source("./packages/ui/src/index.ts") },
];
