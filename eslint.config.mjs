import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// FSD import boundaries — cross-slice imports must go through the slice's
// `index` barrel, never reach into `ui/`, `api/`, `model/`, `lib/` internals.
const fsdPatterns = [
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
];

// Locale-aware navigation only: Next's own Link/router know nothing about the
// locale prefix or `pathnames` (/about → /ru/o-nas).
const i18nNavigationPaths = [
  {
    name: "next/link",
    message: "Use Link from @/shared/ui/Link (locale prefix + localized pathnames).",
  },
  {
    name: "next/navigation",
    importNames: ["useRouter", "usePathname", "redirect", "permanentRedirect"],
    message: "Import it from @/shared/i18n/navigation (locale-aware).",
  },
];

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
      "no-restricted-imports": ["error", {
        paths: i18nNavigationPaths,
        patterns: fsdPatterns,
      }],
    },
  },
  // The two root 404s render without a locale: plain next/link to "/" is
  // right there (the proxy picks the visitor's locale).
  {
    files: ["src/app/global-not-found.tsx", "src/app/not-found.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: fsdPatterns }],
    },
  },
]);

export default eslintConfig;
