import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

/**
 * eslint-config-next 15.1 is eslintrc-only and loads @rushstack/eslint-patch,
 * which cannot identify its caller when a flat config imports it directly —
 * that fails with "Failed to patch ESLint because the calling module was not
 * recognized" before a single file is linted. Going through FlatCompat means
 * the config is required from inside ESLint's own module graph, where the
 * patch resolves correctly.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  { ignores: [".next/**", "node_modules/**", "services/renderer/**", "next-env.d.ts"] },

  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parserOptions: {
        // Type-aware linting. Required by no-floating-promises, and worth the
        // slower lint in a codebase this dependent on background work: the
        // pipeline is full of deliberately un-awaited calls and the rule is
        // what keeps the accidental ones visible.
        projectService: true,
        tsconfigRootDir: dirname(fileURLToPath(import.meta.url)),
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  {
    // Seeds and one-off scripts are CLIs; their output is the point.
    files: ["prisma/**/*.ts"],
    rules: { "no-console": "off" },
  },
];

export default config;
