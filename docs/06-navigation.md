# Навигация

Внутренние ссылки, переходы и редиректы идут через обёртки next-intl. Они делают то, чего нет у `next/link` и `next/navigation`: добавляют префикс локали и применяют маппинг `pathnames` (`/about` → `/ru/o-nas`). Клиентские `Link` и `useRouter` при смене языка ещё и синхронизируют cookie `NEXT_LOCALE`, серверный `redirect` её не трогает.

Смежные темы:
- почему `pathnames` минимальный и чем за это платишь — [08-pathnames.md](./08-pathnames.md);
- динамические роуты — [11-dynamic-routes.md](./11-dynamic-routes.md);
- кто и когда ставит cookie — [13-locale-persistence.md](./13-locale-persistence.md).

## Что откуда импортировать

| Задача | API | Откуда |
|---|---|---|
| Внутренняя ссылка | `Link` (default export) | `@/shared/ui/Link` |
| Переход из обработчика события | `useRouter` | `@/shared/i18n/navigation` |
| Текущий путь без префикса локали | `usePathname` | `@/shared/i18n/navigation` |
| Редирект на сервере | `redirect`, `permanentRedirect` | `@/shared/i18n/navigation` |
| Локализованный путь строкой (metadata, sitemap) | `localizePath` | `@/shared/i18n/navigation` |
| Значения динамических сегментов, `notFound()` | `useParams`, `notFound` | `next/navigation` |
| Внешний URL, якорь на текущей странице | `<a>` | — |

Всё, что выше помечено `@/shared/i18n/navigation`, лежит в [src/shared/i18n/navigation.ts](../src/shared/i18n/navigation.ts): один вызов `createNavigation(routing)` и хелпер `localizePath` поверх его `getPathname`. Из `next/navigation` берём только API, которые не строят URL.

## `Link` — обёртка `@/shared/ui/Link`

Типизированный `Link` из next-intl при заданном `pathnames` принимает только ключи этой карты. В шаблоне там один маршрут (`/about`), поэтому `<Link href="/blog">` из `@/shared/i18n/navigation` не скомпилируется. Обёртка [src/shared/ui/Link.tsx](../src/shared/ui/Link.tsx) принимает любую строку и делает каст в одном месте:

```tsx
type LinkProps = Omit<ComponentProps<typeof I18nLink>, 'href'> & {
  href: string
}

export default function Link({ href, ...rest }: LinkProps) {
  // '/about?tab=1' → { pathname, query } so `pathnames` still applies;
  // anchors, external and mailto: links pass through untouched.
  return <I18nLink href={toLinkHref(href) as never} {...rest} />
}
```

Это сознательное отступление от документации next-intl, в которой при `pathnames` перечисляют все маршруты. Что именно теряется, разобрано в [08-pathnames.md](./08-pathnames.md#trade-off-что-теряешь-с-обёрткой).

Что получается на `/ru/...` (проверено SSR-рендером production-сборки):

| `href` | Результат |
|---|---|
| `/about` | `/ru/o-nas` |
| `/blog` | `/ru/blog` (маршрута нет в `pathnames`, добавляется только префикс) |
| `/about?ref=terms` | `/ru/o-nas?ref=terms` |
| `/about#team` | `/ru/o-nas#team` |
| `/about?tag=a&tag=b#team` | `/ru/o-nas?tag=a&tag=b#team` |
| `/about` с `locale="en"` | `/en/about` и `hreflang="en"` на `<a>` |
| `#team`, `?page=2`, `https://example.com/a?b=1`, `mailto:…` | без изменений |
| `//cdn.example.com/a?b=1` | `https://cdn.example.com/a?b=1`: без обёртки next-intl считает protocol-relative URL внутренним путём и отдал бы `/ru//cdn.example.com/a?b=1`, поэтому обёртка подставляет `https:` (`toLinkHref`) |

### Query и hash: почему строка разбирается

next-intl ищет в `pathnames` всю строку `href` целиком. Строка `'/about?ref=terms'` там не найдётся, и голый next-intl `Link` отрендерит `/ru/about?ref=terms` вместо `/ru/o-nas?ref=terms`. В HTML окажется неканоничная ссылка, а клик даст лишний 307 от proxy. Поэтому обёртка раскладывает абсолютный внутренний путь с `?` или `#` в объектную форму через [src/shared/lib/href.ts](../src/shared/lib/href.ts):

```ts
export function splitHref(href: string): string | HrefObject {
  if (!href.startsWith('/') || href.startsWith('//') || !/[?#]/.test(href)) return href

  const url = new URL(href, 'http://localhost')
  return {
    pathname: url.pathname,
    ...(url.search && { query: searchParamsToObject(url.searchParams) }),
    ...(url.hash && { hash: url.hash.slice(1) }),
  }
}
```

- Разбираются только пути, которые начинаются с одного `/`. Якорь `#team`, `?page=2`, относительный путь, `https://…`, `mailto:` и `tel:` возвращаются как есть, и next-intl оставляет их без префикса. Protocol-relative `//cdn…` тоже начинается с `/`, и голый next-intl `Link` добавил бы к нему префикс локали (`/ru//cdn.example.com/a?b=1`). Поэтому обёртка сначала вызывает `toLinkHref`, который подставляет `https:`, и только потом `splitHref`. Проверено SSR-рендером на `/ru`.
- [`searchParamsToObject`](../src/shared/lib/search-params.ts) сохраняет повторяющиеся параметры (`?tag=a&tag=b` → `{ tag: ['a', 'b'] }`). `Object.fromEntries` оставил бы только последнее значение.

Покрытие тестами:
- unit — [tests/unit/href.test.ts](../tests/unit/href.test.ts): разбор и все пропускаемые формы;
- e2e — `the shared Link localizes pathnames, also with a query string` в [tests/e2e/routing.spec.ts](../tests/e2e/routing.spec.ts).

### `locale` на ссылке

`<Link href="/about" locale="en">` всегда рендерит префикс, даже для дефолтной локали при `as-needed`: `/en/about`. Так задумано в next-intl. Остальное включается, только если `locale` отличается от текущей локали страницы. Тогда:

- Если по ссылке кликнут до гидрации, браузер сделает обычный document-запрос, proxy обновит cookie и редиректнет `/en/about` → `/about`.
- После гидрации cookie выставляет обработчик клика (`document.cookie`).
- Prefetch отключён: по документации next-intl, он «would otherwise result in prematurely overwriting the locale cookie». Если передать `prefetch` вместе с `locale`, next-intl в dev выведет `console.error`.

## `useRouter`

```tsx
// Example
'use client'
import { useRouter } from '@/shared/i18n/navigation'

const router = useRouter()
router.push('/about')                      // on /ru/... → /ru/o-nas
router.push({ pathname: '/about', query: { tab: 'team' } })
router.replace('/about', { locale: 'uk' }) // → /uk/pro-nas, cookie NEXT_LOCALE=uk
```

- С опцией `locale` роутер, как и `Link`, принудительно ставит префикс: переход на `en` идёт через `/en/...` → 307 → `/about`. Перед навигацией он пишет cookie через `document.cookie`.
- То же делает `router.prefetch(href, { locale })`: он тоже пишет cookie. Не префетчи страницы другой локали.
- Hash роутер не сохраняет: из объектного `href` он берёт только `pathname`, `params` и `query`.
- Типы у роутера строгие, обёртки для него нет: `router.push('/blog')` даёт TS2345, потому что `/blog` нет в `pathnames`. Варианты описаны в [08-pathnames.md](./08-pathnames.md#trade-off-что-теряешь-с-обёрткой).

## `usePathname`

Возвращает канонический внутренний путь: без префикса локали и без локализованного сегмента.

| Где пользователь | `next/navigation` | `@/shared/i18n/navigation` |
|---|---|---|
| `/ru/o-nas` | `/ru/o-nas` | `/about` |
| `/uk/blog/hello-world` | `/uk/blog/hello-world` | `/blog/hello-world` (маршрута нет в `pathnames`) |
| динамический маршрут из `pathnames` | фактический URL | шаблон, например `/news/[slug]` (значения нужно брать из `useParams`) |

## `redirect` и `permanentRedirect`

```ts
// Example
import { redirect } from '@/shared/i18n/navigation'

redirect({ href: '/about', locale: 'ru' }) // → /ru/o-nas
```

- `locale` обязателен. В Server Component текущую локаль даёт `getLocale()` из `next-intl/server`. В Server Action и Route Handler root params недоступны, поэтому локаль передаётся явно ([12-server-actions.md](./12-server-actions.md)).
- Коды ответа задаёт Next.js: `redirect` отвечает 307, `permanentRedirect` — 308. В Server Action при включённом JS выполняется клиентская навигация, а при отправке формы без JS Next отвечает 303.
- `redirect` бросает исключение, поэтому в `try/catch` его вызывают снаружи блока. Чтобы TypeScript сузил тип после вызова, пиши `return redirect(...)`.
- Серверный `redirect` cookie не трогает. Если язык меняется на сервере, cookie ставь сам ([13-locale-persistence.md](./13-locale-persistence.md#после-логина-язык-из-профиля)).
- `forcePrefix: true` принудительно ставит префикс и для дефолтной локали.

## `localizePath` — путь строкой вне JSX

`getPathname` строго типизирован так же, как `Link`. Для произвольного внутреннего пути шаблон даёт хелпер [src/shared/i18n/navigation.ts](../src/shared/i18n/navigation.ts) с тем же кастом и тем же разбором строки, что у `Link`:

```ts
export function localizePath(locale: Locale, href: string): string {
  const split = splitHref(href)
  if (typeof split === 'string') {
    // Untyped href: the same deliberate trade-off as in @/shared/ui/Link.
    return getPathname({ locale, href: split as never })
  }
  // getPathname ignores the hash, so it is appended here.
  const { hash, ...rest } = split
  return getPathname({ locale, href: rest as never }) + (hash ? `#${hash}` : '')
}
```

Результаты (проверено рендером на production-сборке):
- `localizePath('ru', '/about')` → `/ru/o-nas`;
- `localizePath('en', '/blog')` → `/blog`;
- `localizePath('ru', '/about?x=1')` → `/ru/o-nas?x=1`;
- `localizePath('ru', '/about#team')` → `/ru/o-nas#team`.

Hash хелпер дописывает сам: `getPathname` берёт из объекта только `pathname`, `params` и `query`. На `localizePath` построены canonical, hreflang и sitemap ([src/shared/seo/alternates.ts](../src/shared/seo/alternates.ts), подробно — в [07-metadata-seo.md](./07-metadata-seo.md)).

Оговорка: `getPathname` возвращает путь без `basePath`. Если включишь `basePath`, добавляй его при сборке абсолютного URL.

## LangSwitcher

[src/features/locale-switch/ui/LangSwitcher.tsx](../src/features/locale-switch/ui/LangSwitcher.tsx) — Client Component, у которого на сервере нет ничего, что выбило бы его из статического HTML. Основа повторяет рецепт next-intl: `usePathname` + `useParams` + `router.replace(..., { locale })`. К нему добавлены три решения.

### 1. Query читается в момент переключения, а не через `useSearchParams`

```tsx
      onChange={(event) => {
        const next = event.target.value as Locale
        // Read the query at the moment of switching instead of via
        // useSearchParams(): that hook would opt the switcher out of static
        // rendering (it'd render only on the client, inside a Suspense boundary).
        // The #hash is not kept: next-intl's router ignores it, and navigating
        // around it would mean re-implementing its cookie sync.
        const query = searchParamsToObject(new URLSearchParams(window.location.search))
        startTransition(() => {
          router.replace(
            // @ts-expect-error -- TypeScript validates that only known params
            // are used with a given pathname. Since we're on the current route,
            // they always match at runtime.
            { pathname, params, query },
            { locale: next }
          )
        })
      }}
```

Документация Next.js про `useSearchParams`: «If a route is prerendered, calling `useSearchParams` will cause the Client Component tree up to the closest `Suspense` boundary to be client-side rendered». В предыдущей версии шаблона так и было: на SSG-страницах в HTML шапки вместо `<select>` стоял пустой `<template>` от Suspense, и переключатель появлялся только после гидрации. Query нужен только в момент выбора, а `window.location.search` внутри обработчика события ничего не стоит.

### 2. Подписи и названия языков приходят пропами с сервера

```tsx
        <LangSwitcher
          label={tCommon('languageSwitcher')}
          options={routing.locales.map((locale) => ({
            locale,
            name: LOCALE_NATIVE_NAMES[locale],
          }))}
        />
```

Фрагмент взят из [src/widgets/site-header/ui/SiteHeader.tsx](../src/widgets/site-header/ui/SiteHeader.tsx). Это даёт две вещи:

- Namespace `common` не уходит на клиент. Layout отдаёт клиенту только `error`, и e2e это проверяет. Для пары строк передать готовый текст пропом дешевле, чем `<ClientMessages>` ([03-translations.md](./03-translations.md)).
- Названия языков считает `Intl.DisplayNames` один раз и на сервере ([src/shared/config/locales.ts](../src/shared/config/locales.ts)). Если считать их в браузере, ICU-данные Node и браузера могут разойтись, и получится hydration mismatch.

У каждого `<option>` стоит `lang={locale}`, чтобы скринридер читал «Русский» по-русски.

### 3. `pathname` + `params`, а не готовый URL

`usePathname` отдаёт внутренний путь (`/about`), и next-intl заново собирает URL для новой локали (`/uk/pro-nas`). `params` из `useParams` нужны маршрутам с динамическими сегментами из `pathnames`: для них `usePathname` возвращает шаблон (`/news/[slug]`), и без значений URL не собрать. Маршрутам вне `pathnames` (`/blog/[slug]` в шаблоне) `params` не мешают. `@ts-expect-error` взят из документации next-intl: статически TypeScript не может доказать, что `params` подходят к `pathname`. `useTransition` блокирует `<select>` (`disabled={pending}`), пока идёт переход.

Переход на дефолтную локаль идёт через `/en/...` → 307 → `/about`. Это не баг, а `forcePrefix` из раздела про `useRouter`.

**Что покрыто e2e** ([tests/e2e/i18n.spec.ts](../tests/e2e/i18n.spec.ts), `language switcher`):
- `<select>` есть в серверном HTML;
- сохраняются локализованный путь и многозначный query (`/about?tag=a&tag=b` → `/ru/o-nas?tag=a&tag=b`);
- выставляется cookie;
- переход на дефолтную локаль (`/ru/o-nas` → `/about`) проходит без ошибок в консоли;
- сохраняется `/blog/hello-world` при смене языка.

**Hash теряется.** С `/about#team` после смены языка попадёшь на `/ru/o-nas`: роутер игнорирует `hash` (см. выше). Обойти роутер ради hash значило бы повторить его синхронизацию cookie, поэтому в шаблоне этого нет. Если якоря важны, например у длинных документов с оглавлением, восстанавливай их сам после навигации.

**Альтернатива — список ссылок** `<Link href={...} locale="uk">` вместо `<select>`. Такие ссылки работают до гидрации, а ссылки на другие языки сами ставят `hreflang`. Минус: при рендере неоткуда взять query и hash текущей страницы. Hash до сервера не доходит вообще, а query на клиенте снова означает `useSearchParams` и CSR-bailout. Поэтому такие ссылки сохраняют только путь.

## Почему не `next/link` и не `next/navigation`

Эти API не знают ни про префикс, ни про `pathnames`, ни про cookie:

- **`usePathname` из `next/navigation`** возвращает `/ru/o-nas`. Если подставить его в переключатель, получится так (проверено на production-сборке):
  - смена ru → en: `/en/ru/o-nas` → 307 на `/ru/o-nas`, язык молча не меняется;
  - смена ru → uk: `/uk/ru/o-nas` → 404.
- **`next/link`** с `href="/about"` на русской странице ведёт на URL дефолтной локали. Дальше proxy выбирает язык по cookie `NEXT_LOCALE`, а если её нет — по `Accept-Language`. Выпало `ru` — будет лишний 307 на `/ru/o-nas`, иначе пользователь увидит английскую страницу.
- **`useRouter` из `next/navigation`** не пишет cookie. При soft-навигации proxy cookie тоже не обновляет, он делает это только на document-запросах. В итоге cookie остаётся со старым языком, и следующий заход на `/` уведёт на него ([13-locale-persistence.md](./13-locale-persistence.md#кто-и-когда-ставит-cookie)).
- **`redirect` из `next/navigation`** не добавляет префикс и не применяет маппинг.

Из `next/navigation` спокойно бери `notFound`, `useParams`, `useSelectedLayoutSegment`. `useSearchParams` тоже можно, но помни про Suspense и CSR-bailout.

В шаблоне запрет закреплён правилом `no-restricted-imports` в [eslint.config.mjs](../eslint.config.mjs) (`paths: i18nNavigationPaths` рядом с FSD-паттернами):

```js
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
```

Пробный файл с `next/link` и семью импортами из `next/navigation` (`useRouter`, `usePathname`, `redirect`, `permanentRedirect`, `useParams`, `notFound`, `useSelectedLayoutSegment`) получает пять ошибок: `next/link` и четыре запрещённых имени. `useParams`, `notFound` и `useSelectedLayoutSegment` проходят.

Исключение — корневые 404 [src/app/global-not-found.tsx](../src/app/global-not-found.tsx) и [src/app/not-found.tsx](../src/app/not-found.tsx). Они рендерятся для запросов без локали и вне `NextIntlClientProvider`, так что `next/link` там законен. Для них отдельный блок конфига оставляет только FSD-паттерны:

```js
  // The two root 404s render without a locale: plain next/link to "/" is
  // right there (the proxy picks the visitor's locale).
  {
    files: ["src/app/global-not-found.tsx", "src/app/not-found.tsx"],
    rules: {
      "no-restricted-imports": ["error", { patterns: fsdPatterns }],
    },
  },
```
