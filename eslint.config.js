import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    files: ["packages/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Enforce explicit return types on exported functions for contract clarity
      "@typescript-eslint/explicit-function-return-type": [
        "warn",
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      // Disallow unused variables (allow underscore-prefixed intentional ignores)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Prefer interfaces over type aliases for object shapes (better for extension)
      "@typescript-eslint/consistent-type-definitions": ["warn", "interface"],
      // Enforce type-only imports where possible
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports" },
      ],
      // No floating promises — all async operations must be awaited or explicitly voided
      "@typescript-eslint/no-floating-promises": "error",
      // No misused promises (e.g., passing async to a sync callback)
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  {
    ignores: [
      "node_modules/",
      "dist/",
      "coverage/",
      "mc-mod/",
      "*.config.*",
      "jest.config.*",
    ],
  },
);
