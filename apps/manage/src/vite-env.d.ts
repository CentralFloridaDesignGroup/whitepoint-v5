/// <reference types="vite/client" />
import type { ViteEnvironment } from '@whitepoint/types'

declare global {
  // This empty extension applies the shared env shape to Vite's ambient interface.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface ImportMetaEnv extends ViteEnvironment {}
  interface ImportMeta { readonly env: ImportMetaEnv }
}