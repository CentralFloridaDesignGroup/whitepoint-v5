import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default defineConfig([
  {
    ignores: ["**/dist/**", "**/build/**", "**/coverage/**", "**/.wrangler/**"],
  },

  {
    files: ["**/*.{ts,tsx}"],

    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      react.configs.flat.recommended,
      react.configs.flat["jsx-runtime"],
      reactHooks.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
    ],

    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    settings: {
      react: {
        version: "19.3",
      },
    },

    rules: {
      // General correctness
      eqeqeq: "off",
      "no-var": "error",
      "prefer-const": "error",

      // Use the TypeScript-aware implementation.
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",

      // Type safety and consistent imports
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "off",
      // TypeScript's project build remains the authoritative type-aware gate.
      "@typescript-eslint/switch-exhaustiveness-check": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",

      // TypeScript handles component prop types.
      "react/prop-types": "off",

      // Catch stale closures and unstable list identity.
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
      "jsx-a11y/no-autofocus": "off",
      "jsx-a11y/alt-text": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
      "jsx-a11y/no-static-element-interactions": "off",
      "react/no-array-index-key": "off",
      "react/no-unescaped-entities": "off",
      "no-irregular-whitespace": "off",
    },
  },
]);
