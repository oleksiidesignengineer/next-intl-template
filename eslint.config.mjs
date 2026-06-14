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
  // FSD import boundaries — cross-slice imports must go through the slice's
  // `index` barrel, never reach into `ui/`, `api/`, `model/`, `lib/` internals.
  {
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: [
              "@/entities/*/ui/*", "@/entities/*/api/*",
              "@/entities/*/model/*", "@/entities/*/lib/*",
            ],
            message: "Import from the entity slice root (@/entities/<x>).",
          },
          {
            group: [
              "@/features/*/ui/*", "@/features/*/api/*",
              "@/features/*/model/*", "@/features/*/hooks/*",
            ],
            message: "Import from the feature slice root (@/features/<x>).",
          },
          {
            group: [
              "@/widgets/*/ui/*", "@/widgets/*/components/*",
              "@/widgets/*/model/*", "@/widgets/*/hooks/*",
            ],
            message: "Import from the widget slice root (@/widgets/<x>).",
          },
        ],
      }],
    },
  },
]);

export default eslintConfig;
