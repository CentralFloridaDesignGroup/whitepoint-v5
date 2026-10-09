import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { workspaceAliases } from "../../vite.workspace.mjs";

export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ["react", "react-dom"], alias: command === "serve" ? workspaceAliases : [] },
}));
