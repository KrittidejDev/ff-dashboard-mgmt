import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Allow `any` type usage across the codebase (API responses are dynamic)
      "@typescript-eslint/no-explicit-any": "warn",
      // Allow calling setState within effects (common pattern in this codebase for data fetching)
      "react-hooks/set-state-in-effect": "off",
      // Allow unescaped entities in JSX text content (pre-existing text patterns)
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
