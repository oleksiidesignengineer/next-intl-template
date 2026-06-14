<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# next-intl specifics in this template

When working with i18n in this codebase, follow these rules:

## Файловые конвенции
- `src/proxy.ts`, `src/global.d.ts` — в корне `src/`. Proxy: не `src/middleware.ts` — Next.js 16 переименовал middleware в proxy. Сам импорт остаётся `next-intl/middleware`.
- `src/app/` — роуты (App Router). `[locale]` — корневой сегмент всех публичных маршрутов. `src/app/layout.tsx` пустой (`return children`), всё `<html>` и `<body>` идут в `src/app/[locale]/layout.tsx`.
- `src/shared/i18n/` — i18n-ядро: `routing.ts`, `request.ts`, `navigation.ts`, `messages/{en,ru,uk}.json`. `en.json` — source of truth, типы переводов берутся из него через `declare module 'next-intl'` в `src/global.d.ts`.
- `src/{entities,features,widgets}/<slice>/` — FSD-слайсы. Структура каждого: `ui/`, `api/`, `model/` + барель `index.ts`. Импорты из других слайсов — ТОЛЬКО через барель `index.ts` (никаких deep-import во внутренности — запрещено ESLint-правилом `no-restricted-imports`).

## Обязательно в каждом server page/layout под [locale]
```ts
import { setRequestLocale } from 'next-intl/server'

const { locale } = await params
setRequestLocale(locale)
```

Иначе страница вылетает из static rendering. `setRequestLocale` — стабильный API next-intl: он кладёт локаль в его request-scoped store (на базе React `cache()`) и сейчас **обязателен** в каждом server page/layout под `[locale]`. Next.js 16 уже поставляет `next/root-params`, но он решает другую задачу (чтение значений root-сегментов) и **не отменяет** `setRequestLocale` — убрать строку нельзя. Прогресс по интеграции: github.com/vercel/next.js/discussions/58862.

## Типы params в server page/layout
- В `[locale]/layout.tsx` и `[locale]/<page>.tsx` тип params — `Promise<{ locale: string }>` (НЕ `Locale` union). Это требуется генерируемым Next.js 16 `LayoutProps`/`PageProps` интерфейсом.
- Сужение до конкретной локали делаем в runtime через `hasLocale(routing.locales, locale)`.

## Навигация
- `<Link>` — берём из `@/shared/ui/Link` (default export). Это тонкая обёртка над `Link` из `@/shared/i18n/navigation` с `href: string`. Сделана чтобы НЕ перечислять каждый маршрут в `pathnames` ради типов. См. `docs/06-navigation.md` и `docs/08-pathnames.md`.
- `pathnames` в `routing.ts` держим минимальным: только маршруты с РАЗНЫМИ URL по локалям (`/about` → `/o-nas`/`/pro-nas`). Маршруты с одинаковым URL во всех локалях туда не добавляем.
- `useRouter`, `usePathname`, `redirect`, `getPathname` — берём из `@/shared/i18n/navigation`, не из `next/navigation`. Только так работает `pathnames` mapping и автоматический префикс локали.
- `usePathname` из `@/shared/i18n/navigation` возвращает канонический путь без префикса локали и без localized сегмента — это то, что нужно `LangSwitcher`.
- В `LangSwitcher`: используем `router.replace({ pathname, params }, { locale })` с `useParams` из `next/navigation`. Передача голого `pathname` сломается на dynamic routes.

## Переводы
- Server Component: `import { getTranslations } from 'next-intl/server'`, `const t = await getTranslations('namespace')`.
- Client Component: `import { useTranslations } from 'next-intl'`, `const t = useTranslations('namespace')`.
- `error.tsx` — обязан быть `'use client'` (требование Next.js), `useTranslations` работает потому что выше в дереве есть `NextIntlClientProvider`.

## Добавление новой локали
1. Добавить код в `src/shared/i18n/routing.ts` (`locales` + `pathnames`, если нужны локализованные пути).
2. Создать `src/shared/i18n/messages/<code>.json` зеркально к `en.json`.
3. Ничего не делать с `Locale` в `src/global.d.ts` — он выведен из `routing.locales` и расширится автоматически.
4. `LOCALE_NATIVE_NAMES` в `src/shared/config/locales.ts` обновится автоматически — `Intl.DisplayNames` вычислит название по коду локали. Проверь как оно выглядит и при необходимости переопредели вручную.
