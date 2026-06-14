# FSD Guide (Next.js edition)

A pragmatic, domain-oriented project layout inspired by Feature-Sliced
Design (FSD), trimmed to what actually pays for itself in a mid-sized
Next.js app. This document is the reusable reference — drop it into any
Next.js project and adapt the slice inventory to your domain.

## Goal

Three key distinctions drive the whole layout:

- **Entities** — business objects (model + API client + basic UI). Stable,
  reused across flows. Nouns.
- **Features** — user-facing flows that compose entities (create-post,
  add-to-cart, filter-products). Verbs.
- **Widgets** — page-level orchestrators that combine multiple features
  into a layout slot (dashboard shell, top navigation, settings panel).

Everything else (design-system primitives, generic hooks, HTTP client,
i18n, theming) is domain-agnostic and lives in `shared/`.

## Layers

Five layers, nothing else. **No `processes`.** Compositions live either
in a `widgets/` slice or, for trivial single-feature routes, directly in
an App Router route file.

```
src/
  app/                # Next.js App Router — routes, layouts, providers
    (app)/...         # authenticated routes
    (auth)/...        # public auth routes
  widgets/            # page/section compositions (dashboard, top-nav)
  features/           # user-facing flows (create-post, add-to-cart)
  entities/           # business objects (post, product, user, …)
  shared/             # domain-agnostic building blocks (flat — no slices)
    ui/               # design-system primitives (Button, Dialog, Select …)
    utils/            # pure helpers (url, date, formatters …)
    hooks/            # generic React hooks (no domain coupling)
    api/              # HTTP client, queryClient, interceptors, transports
    auth/             # auth provider, session, cookies, schemas (optional)
    state/            # cross-feature Zustand stores
    i18n/             # locale loaders, translation hooks
    config/           # feature flags, env access
    styles/           # global & theme CSS
    lib/              # misc reusable code that doesn't fit elsewhere
```

> **Note on shared segments.** This guide does **not** strictly enforce the
> canonical FSD segment names (`ui / api / model / lib / config`). `shared/`
> is flat — folders like `utils/`, `hooks/`, `state/`, `auth/`, `i18n/` are
> pragmatic conventions used wherever they make sense (both at the shared
> layer and inside slices). Pick the name that reads best for the contents;
> consistency matters more than purity.

## Import rules (the one rule that matters)

A slice can import from **its own layer or lower**:

| From → To        | shared | entities | features | widgets | app |
|------------------|:------:|:--------:|:--------:|:-------:|:---:|
| **shared**       |   ✅   |    ❌    |    ❌    |   ❌    | ❌  |
| **entities**     |   ✅   |    ⚠️*   |    ❌    |   ❌    | ❌  |
| **features**     |   ✅   |    ✅    |    ⚠️**  |   ❌    | ❌  |
| **widgets**      |   ✅   |    ✅    |    ✅    |   ⚠️*** | ❌  |
| **app**          |   ✅   |    ✅    |    ✅    |   ✅    | —  |

- ⚠️* **entity → entity**: allowed only for ID references in types/models
  (a `Post` has an `authorId`). No importing another entity's UI or
  hooks — if you need to render two entities together, that's a feature.
- ⚠️** **feature → feature**: forbidden. If two features need to render
  together on the same page, that's a widget. If they share logic, lift
  it down into an entity or `shared/`.
- ⚠️*** **widget → widget**: discouraged. Widgets are leaves of
  composition; composing a widget into another widget usually means the
  inner one should be a feature instead.

### Enforcement

Use ESLint's built-in `no-restricted-imports` to block cross-slice deep
imports — consumers must go through the slice's `index` barrel, not
reach into `@/entities/*/ui/...` or `@/features/*/hooks/...`. Allow
test overrides for `jest.mock(...)` and `import * as` namespace
patterns. A minimal example:

```js
// eslint.config.mjs
{
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['@/entities/*/api/*', '@/entities/*/ui/*',
                  '@/entities/*/lib/*', '@/entities/*/model/*'],
          message: 'Import from the entity slice root (@/entities/<x>).' },
        { group: ['@/features/*/ui/*', '@/features/*/api/*',
                  '@/features/*/hooks/*', '@/features/*/model/*'],
          message: 'Import from the feature slice root (@/features/<x>).' },
        { group: ['@/widgets/*/ui/*', '@/widgets/*/components/*',
                  '@/widgets/*/hooks/*', '@/widgets/*/model/*'],
          message: 'Import from the widget slice root (@/widgets/<x>).' },
      ],
    }],
  },
}
```

Pair this with a `@/*` → `src/*` alias in `tsconfig.json` (or
`jsconfig.json`) so imports stay flat:

```jsonc
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

## Entity vs Feature vs Widget

- **Entity** — a **noun**: describes *what a thing is* and how it looks.
  Self-contained, doesn't know where or why it's used.
  Examples: `Post`, `Product`, `User`, `PostCard`, `usePost(id)`,
  `isPostPublished()`.

- **Feature** — a **verb**: describes *what a user does*. Composes one
  or more entities into a flow with its own UI and (usually) a mutation.
  Examples: `post-create`, `post-publish`, `cart-add`, `filter-products`,
  `auth-login`.

- **Widget** — a **layout-bound composition**: describes *what fills a
  slot on a page*. Wires multiple features together, plus possibly
  entities, into a unit that the App Router (or an outer widget) drops
  in. Has no domain logic of its own — it's glue.
  Examples: `app-navigation`, `customer-dashboard`, `admin-dashboard`,
  `settings-panel`, `checkout-summary`.

Dependency direction is one-way: **widgets depend on features, features
depend on entities, never the other way**. If you'd delete a widget,
every feature it used must keep working untouched. Same for features
and entities.

### Litmus tests

- *"If the UX changes completely tomorrow, does this survive?"* —
  yes → entity, no → feature/widget.
- *"Does this combine two or more independent features into one chunk?"*
  — yes → widget; no, it's a single user flow → feature.
- *"Is this glued to a specific page slot or page composition?"* —
  yes → widget; reusable across UX surfaces → feature.

When still unsure, start as a feature; promoting to widget later is
cheap, the reverse is painful.

## What goes where — quick test

- Could this be used in a completely different product without changes?
  → `shared/`.
- Is this a noun (a thing the business cares about)? → `entities/`.
- Is this a verb (what a user does)? → `features/`.
- Does this compose two or more features into a page or layout slot?
  → `widgets/`.
- Is this a trivial single-feature route (login page, settings page
  that just renders one feature)? → render the feature directly from
  the App Router route file. No widget needed for one-feature pages.

## Slice layout

Each slice (entity, feature, or widget) follows the same internal
shape. Only create the folders you actually need — no empty
scaffolding.

```
entities/post/
  model/        # types, selectors, query keys, status helpers
  api/          # HTTP calls, React Query hooks (usePost, usePosts)
  ui/           # PostCard, PostStatusBadge, PostRow
  lib/          # pure domain helpers (parsePost, formatPostDate, …)
  index.ts      # public API — only export what's meant to be consumed
```

```
features/post-create/
  model/        # form state, validation schema
  api/          # mutation hook (useCreatePost)
  ui/           # form components, submit button
  index.ts
```

```
widgets/customer-dashboard/
  ui/           # DashboardPage shell, layout, tab bar
  components/   # local sub-blocks specific to this composition
  hooks/        # composition-level state (which panel is open, …)
  index.ts      # public API — usually just the page component
```

A widget never owns API calls or mutations — those live in the
features it composes. A widget's `model/` should stay empty unless it
holds purely local UI state that doesn't belong in any single feature.

Cross-slice imports should go through `index.ts` of the target slice,
not reach into its internals.

## State boundaries

Three state mechanisms coexist; the boundary keeps each one cheap:

| Mechanism | What lives there | Where |
|-----------|------------------|-------|
| **TanStack Query** | Server state — anything fetched, cached, or mutated against the backend. | API consumers; cache lives behind `shared/api/queryClient.ts` |
| **Zustand stores** | UI / client state — filter selections, derived selectors, modal stacks, transient preferences. | `shared/state/` for cross-feature stores; `entities/<x>/model/` for entity-owned stores |
| **React Context** | Inversion-of-control / tree-scoped concerns — auth lifecycle, i18n, theme. Anything that needs the *provider* shape, not just shared state. | `shared/auth/AuthProvider.tsx`, `shared/i18n/provider.tsx`, etc. |

Two rules to keep them separate:

1. **Server data never lives in Zustand.** If it came from the network,
   it goes through React Query. Mirroring API data in a store creates a
   duplicate cache that drifts.
2. **Zustand stores are flat.** No deeply nested mutations, no thunks.
   If a store grows complex, split it (one slice per logical group).
   Selectors (`useStore(s => s.foo)`) keep re-renders narrow.

State convention by layer:

- `shared/state/` — Zustand stores that genuinely don't belong to any
  single entity (e.g. cross-feature filter state used by two features).
- `entities/<x>/model/` — Zustand stores tied to one entity (e.g. user
  role preference, last selected item).
- `features/<x>/model/` — feature-local stores. Most features won't
  need one; prefer local `useState` + custom hook when state is
  contained.
- `widgets/`, `app/` — no stores; only composition.

## Next.js App Router fit

- `src/app/` (Next.js) replaces FSD's `app` layer — it owns routing,
  layouts, and the provider stack. `public/` stays at the repo root
  (Next.js requirement).
- Route files stay thin: import one widget (or one feature, for
  trivial single-feature routes) and render it.
- Layouts compose layout-slot widgets (navigation, status banner)
  directly.
- `"use client"` lives as close to the leaf as possible — server-render
  shells where you can. Most widgets will be client components
  (interactive UIs); pages and layouts can often stay server.

### Layouts must stay Server Components when possible

The single most common Next.js antipattern with FSD is slapping
`'use client'` on a layout file because *something* inside it needs
`usePathname`, `useAuth`, or another hook. That marks the **entire
subtree** below the layout as a client bundle and disables RSC for
every route under it.

❌ **Don't do this — whole authenticated tree becomes client:**

```tsx
// src/app/(app)/layout.tsx
'use client';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/auth';
import { AppNavigation } from '@/widgets/app-navigation';

export default function AppLayout({ children }) {
  const pathname = usePathname();
  const { user } = useAuth();
  // …conditional rendering based on path/user…
  return (
    <>
      <AppNavigation />
      <main>{children}</main>
    </>
  );
}
```

✅ **Do this — layout stays server, client logic in a leaf widget:**

```tsx
// src/app/(app)/layout.tsx — Server Component (no "use client")
import { AppNavigation } from '@/widgets/app-navigation';

export default function AppLayout({ children }) {
  return (
    <>
      <AppNavigation />
      <main>{children}</main>
    </>
  );
}

// src/widgets/app-navigation/ui/AppNavigation.tsx
'use client';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/auth';
// usePathname/useAuth live here — only this leaf hydrates as client.
```

Rule of thumb: if a layout needs a hook, the hook belongs in a widget
the layout renders, not in the layout itself.
- Route groups `(app)` / `(auth)` segregate authenticated vs public
  trees without affecting URLs.
- Server Actions and route handlers can live either in
  `src/app/<route>/actions.ts` (if they're route-local glue) or in the
  feature that owns the mutation (`features/<x>/api/actions.ts`),
  re-exported from the slice barrel. Prefer the feature when the same
  action is needed from more than one route.

### Suggested route shape

```tsx
// src/app/(app)/dashboard/page.tsx
import { CustomerDashboard } from '@/widgets/customer-dashboard';

export default function Page() {
  return <CustomerDashboard />;
}
```

```tsx
// src/app/(auth)/login/page.tsx
import { LoginForm } from '@/features/auth-login';

export default function Page() {
  return <LoginForm />;
}
```

## Public API of a slice (`index.ts`)

Only re-export what external consumers actually need. Internal helpers,
sub-components, and private hooks stay behind the facade. Keep the
barrel small — every export is a contract you'll have to keep stable.

```ts
// entities/post/index.ts
export { PostCard } from './ui/PostCard';
export { usePost, usePosts } from './api/queries';
export type { Post, PostStatus } from './model/types';
export { isPostPublished, formatPostDate } from './lib';
```

```ts
// features/post-create/index.ts
export { PostCreateForm } from './ui/PostCreateForm';
// useCreatePost stays internal — consumers use the form component.
```

```ts
// widgets/customer-dashboard/index.ts
export { CustomerDashboard } from './ui/CustomerDashboard';
```

## Common tensions and how to resolve them

- **Entity cross-references.** Entities often reference each other by
  ID (a `Post` has an `authorId`). Default rule: type-level refs only,
  compose UI in features/widgets. Revisit only if it starts feeling
  artificial — then consider whether the "combined" view is itself a
  feature.

- **Auth.** Technically a set of features (login, register, callback),
  but the *auth provider* plus its tooling (session lookup, cookie
  forwarding, validation schemas, Server Actions) is app-level
  infrastructure. Resolution: give it its own dedicated segment at the
  shared layer — `shared/auth/` — instead of cramming it into
  `shared/api/`. A typical layout:

  ```
  shared/auth/
    AuthProvider.tsx       # React context provider (client)
    AuthSessionWatcher.tsx # cross-tab logout watcher (client)
    session.ts             # getCurrentUser() — Server-side session lookup
    actions.ts             # Server Actions (login, logout, refresh)
    cookie-forwarding.ts   # cookie pass-through helpers
    schemas.ts             # zod/yup schemas for auth payloads
    normalize.ts           # API-shape → app-shape mapping
    index.ts               # public API (useAuth, AuthProvider, session helpers)
  ```

  Login/register stay as feature slices (`features/auth-login`,
  `features/auth-register`); the OAuth `/callback` route is a thin
  wrapper in `src/app/(auth)/callback/page.tsx` that delegates to
  `useAuth().handleCallback()` — no dedicated slice, no widget. Keep
  `shared/auth/` strictly infrastructural — domain-shaped user fields
  belong in `entities/user/`.

- **"This widget is just one feature."** Then don't make it a widget —
  render the feature directly from the route. Widgets earn their slice
  by composing two or more features.

- **"This feature shares logic with another feature."** Lift the
  shared logic down — into an entity (if it's domain-shaped) or
  `shared/` (if it's domain-agnostic). Feature → feature imports are
  banned; the lift-down is the fix.

- **App chrome (nav, banners) over a full-screen widget.** A
  full-screen widget (e.g. a map taking the whole viewport) is
  tempting to compose with `app-navigation` inside itself — that's a
  widget → widget import. The clean resolution is **not** to allow
  the cross-widget import, but to keep `AppNavigation` rendered by
  the layout *unconditionally* and let the full-screen widget paint
  underneath:

  ```tsx
  // app/(app)/layout.tsx — always renders chrome
  export default function Layout({ children }) {
    return (
      <>
        <AppNavigation />        {/* fixed-position, z-index above */}
        <main className="pt-nav">{children}</main>
      </>
    );
  }

  // widgets/map-page/ui/MapPage.tsx
  export function MapPage() {
    return <div className="h-screen-minus-nav">{/* map fills slot */}</div>;
  }
  ```

  If a route genuinely needs a *different* chrome variant, accept it
  as a prop (`<AppNavigation variant="overlay" />`) or expose a layout
  slot — never reach across widgets. Conditional rendering of chrome
  inside the layout (`if (isMapRoute) ...`) is the antipattern this
  rule prevents.

- **Server components vs client components.** Both can live in the
  same slice. Keep `"use client"` on the leaf that needs interactivity;
  let server components render the shell. The slice barrel can export
  both — consumers don't need to know which is which.

## Maintenance

- Keep slice barrels minimal — only re-export what external consumers
  actually need; internal helpers stay behind the facade.
- Update the import-rules ESLint config when adding a new layer-style
  folder (e.g. a new top-level convention). Boundary drift is the
  fastest way to lose FSD's benefits.
- Document the slice inventory separately (e.g. `docs/TARGET_LAYOUT.md`)
  so this guide stays a stable reference and the inventory can churn
  freely.
- When a slice has only one consumer and that consumer is the only
  route that will ever use it, consider whether it should be a slice
  at all — inline code in `src/app/<route>/` is a valid endpoint.

## TL;DR

- Five layers: `app / widgets / features / entities / shared`.
- Imports flow downward only. Cross-slice imports go through the
  slice's `index` barrel.
- Entity = noun, Feature = verb, Widget = layout-bound composition of
  features.
- Server state → React Query. Client state → Zustand. Tree-scoped
  concerns → Context.
- Next.js App Router *is* the `app/` layer. Route files stay thin.
- When in doubt: start as a feature, lift down to entity/shared if
  reused, promote to widget when composing multiple features.
