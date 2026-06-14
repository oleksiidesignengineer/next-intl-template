# Обзор шаблона

Шаблон — это стартер для многоязычных приложений на Next.js 16 (App Router) + next-intl 4 + React 19 + TypeScript. Цель: показать полный рабочий пример с серверными переводами, типобезопасностью, локализованными URL, ICU-сообщениями и правильным SEO — чтобы при клонировании не нужно было собирать конфигурацию по частям.

## Что умеет next-intl

- **Server-side переводы** — `getTranslations` работает в Server Components и `generateMetadata` без клиентского JS.
- **Типобезопасность** — автокомплит ключей переводов, статическая проверка namespace'ов, типизированный union для локалей.
- **ICU Message Format** — plural, select, интерполяция переменных, rich text (`t.rich()`).
- **Форматирование** — `useFormatter` / `getFormatter` как типобезопасная обёртка над `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Intl.RelativeTimeFormat`, `Intl.ListFormat`.
- **Локализованные URL** — `/about` → `/ru/o-nas` → `/uk/pro-nas` через `pathnames` в routing.
- **Авто-определение локали** — по cookie `NEXT_LOCALE` и заголовку `Accept-Language` (опция `localeDetection`).
- **hreflang в sitemap** — `src/app/sitemap.ts` генерирует `alternates.languages` для каждой страницы.

## Карта файлов (FSD)

Шаблон организован по [Feature-Sliced Design](./FSD_GUIDE.md) — архитектурный гайд (FSD).
Манифест переноса i18n в другой проект — [PORTABILITY.md](./PORTABILITY.md).

### i18n-ядро (`shared/`)

| Путь | Роль |
|---|---|
| `src/shared/i18n/routing.ts` | Центральная конфигурация маршрутизации: список локалей, defaultLocale, localePrefix, pathnames |
| `src/shared/i18n/request.ts` | `getRequestConfig` — загрузка сообщений, timeZone, глобальные formats |
| `src/shared/i18n/navigation.ts` | Экспортирует типизированные `Link`, `redirect`, `useRouter`, `usePathname`, `getPathname` |
| `src/shared/i18n/messages/*.json` | Файлы переводов (`en.json`, `ru.json`, `uk.json`) |
| `src/shared/config/locales.ts` | Нативные названия локалей (`LOCALE_NATIVE_NAMES`) |
| `src/shared/seo/alternates.ts` | Хелпер `buildLanguageAlternates` для hreflang |
| `src/shared/seo/og-locale.ts` | Маппинг locale → `og:locale` |
| `src/shared/ui/Link.tsx` | Link-обёртка с `href: string` |

### Слайсы (`entities/`, `features/`, `widgets/`)

| Путь | Роль |
|---|---|
| `src/entities/post/api/posts.ts` | Данные блога (`getAllPosts`, `getPostBySlug`) |
| `src/entities/post/model/types.ts` | Тип `BlogPost` |
| `src/features/contact/ui/ContactForm.tsx` | Форма обратной связи (Client Component) |
| `src/features/contact/api/actions.ts` | Server Action `submitContact` |
| `src/features/contact/model/schema.ts` | Zod-схема (`buildContactSchema`) |
| `src/features/locale-switch/ui/LangSwitcher.tsx` | Переключатель локали (Client Component) |
| `src/widgets/site-header/ui/SiteHeader.tsx` | Хедер с навигацией (Server Component) |

### App Router (`app/`) и корень `src/`

| Путь | Роль |
|---|---|
| `src/proxy.ts` | Замена `middleware.ts` в Next.js 16 — i18n middleware с matcher'ом |
| `src/global.d.ts` | Augmentation модуля `next-intl` — типизация сообщений и локалей |
| `src/app/layout.tsx` | Корневой layout (пустой — делегирует `[locale]/layout.tsx`) |
| `src/app/[locale]/layout.tsx` | Locale layout: `<html lang>`, `NextIntlClientProvider`, `generateStaticParams` |
| `src/app/[locale]/page.tsx` | Главная страница — Server Component с `getTranslations` |
| `src/app/[locale]/not-found.tsx` | 404-страница — Client Component с `useTranslations` |
| `src/app/[locale]/error.tsx` | Error boundary — Client Component с `useTranslations` |
| `src/app/[locale]/about/page.tsx` | Страница /about — пример локализованного pathname + `generateMetadata` |
| `src/app/[locale]/demo/plurals/page.tsx` | Демо ICU: plural, select, rich text |
| `src/app/[locale]/demo/formats/page.tsx` | Демо форматирования: дата, число, валюта, relative time, список |
| `src/app/sitemap.ts` | Sitemap с hreflang через `getPathname` |
| `src/app/robots.ts` | robots.txt |
| `next.config.ts` | Обёртка `withNextIntl` поверх конфига Next.js |

## Быстрый старт

```bash
npm install
npm run dev
```

После запуска проверь в браузере:

| URL | Что показывает |
|---|---|
| `/` | Главная, английский (defaultLocale, без префикса) |
| `/ru` | Главная, русский |
| `/uk` | Главная, украинский |
| `/about` | About, английский |
| `/ru/o-nas` | About, русский (локализованный pathname) |
| `/uk/pro-nas` | About, украинский (локализованный pathname) |
| `/demo/plurals` | ICU plural / select / rich text demo |
| `/demo/formats` | Форматирование дат, чисел, валюты, relative time |

## Важные особенности Next.js 16 + next-intl 4

**`proxy.ts` вместо `middleware.ts`** — в Next.js 16 файл middleware переименован в `proxy.ts`. Шаблон использует именно его; код тот же, что раньше шёл в `middleware.ts`, а импорт остаётся `next-intl/middleware`.

**`setRequestLocale` обязателен** — без него страница выпадает из static rendering в dynamic. Это стабильный API next-intl: он кладёт локаль в его request-scoped store (на базе React `cache()`), и сейчас нужен в каждом server page/layout под `[locale]`. Next.js 16 уже добавил `next/root-params`, но он решает другую задачу и **не заменяет** `setRequestLocale` — строку убрать нельзя.

**`params: Promise<...>` (async)** — в Next.js 16 `params` в layout и page — асинхронный. Всегда `await params` перед использованием.

## Куда дальше

| Документ | О чём |
|---|---|
| [01-setup.md](./01-setup.md) | Установка, конфигурация `next.config.ts`, разбор `routing.ts`, `request.ts`, `proxy.ts` |
| [02-app-router.md](./02-app-router.md) | Структура `[locale]` сегмента, root layout, `setRequestLocale`, `generateStaticParams` |
| [03-translations.md](./03-translations.md) | `useTranslations` vs `getTranslations`, namespace'ы, типобезопасность, fallback |
| [04-icu-messages.md](./04-icu-messages.md) | ICU синтаксис, plural для ru/uk, `t.rich()`, `t.raw()`, грабли |
| [05-formatting.md](./05-formatting.md) | `useFormatter`, глобальные formats, даты, числа, relative time, timeZone |
| [06-navigation.md](./06-navigation.md) | `Link`, `useRouter`, `usePathname` из `@/shared/i18n/navigation`, language switcher |
| [07-metadata-seo.md](./07-metadata-seo.md) | `generateMetadata`, hreflang, sitemap, OpenGraph, JSON-LD |
| [08-pathnames.md](./08-pathnames.md) | Локализованные URL через `pathnames`, trade-off минимального маппинга |
| [09-error-pages.md](./09-error-pages.md) | `not-found.tsx`, `error.tsx` с переводами |
| [10-faq.md](./10-faq.md) | Частые вопросы: RTL, CMS, email-шаблоны, псевдо-локализация |
| [11-dynamic-routes.md](./11-dynamic-routes.md) | `/blog/[slug]` с `generateStaticParams`, sitemap для постов |
| [12-server-actions.md](./12-server-actions.md) | `/contact` форма с zod-валидацией и переводами в Server Action |
| [13-locale-persistence.md](./13-locale-persistence.md) | Cookie `NEXT_LOCALE`, Route Handler `/api/locale`, паттерны смены локали |
