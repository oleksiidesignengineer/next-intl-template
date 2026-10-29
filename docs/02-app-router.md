# App Router: `[locale]` как корневой layout

Все публичные маршруты лежат под `src/app/[locale]/`, и `[locale]/layout.tsx` — **корневой** layout приложения. Локаль задаёт URL, а серверный код получает её из `next/root-params` через [src/shared/i18n/request.ts](../src/shared/i18n/request.ts). Поэтому не нужны ни `setRequestLocale`, ни прокидывание `params`, и все страницы во всех локалях пререндерятся статически.

Для этой схемы нужен Next.js 16.3 или новее: в этой версии появился `next/root-params`.

## Структура `src/app`

```
src/app/
├── [locale]/
│   ├── layout.tsx            ← ROOT layout: <html lang dir>, <body>, провайдер, generateStaticParams
│   ├── page.tsx, about/, blog/, blog/[slug]/, contact/, demo/…
│   ├── not-found.tsx         ← локализованная 404 внутри root layout
│   ├── [...rest]/page.tsx    ← notFound() для неизвестных путей внутри локали (/ru/foo)
│   ├── error.tsx
│   └── opengraph-image.tsx   ← OG-картинка своей локали
├── global-not-found.tsx      ← 404 для URL без маршрута (/unknown.txt): свои <html>/<body>
├── not-found.tsx             ← 404 для notFound() из request.ts (/api/foo), без <html>/<body>
├── global-error.tsx          ← ошибки самого root layout: свои <html>/<body>
├── robots.ts, sitemap.ts, favicon.ico
└── (layout.tsx НЕТ — и это намеренно)
```

## Почему нет `src/app/layout.tsx`

Root params в Next.js — это динамические сегменты, которые стоят **до** root layout. Root layout — это любой layout, над которым нет другого layout. Если оставить в `src/app/` pass-through layout (`return children`), корневым станет он, а `[locale]` превратится в обычный сегмент. Тогда `next typegen` пишет в `.next/types/root-params.d.ts` строку `// No root params detected.`, и импортировать `locale` из `next/root-params` нельзя: `next build` падает с «Export locale doesn't exist in target module». `tsc` эту ошибку не ловит, потому что без сгенерированных типов модуль объявлен «голым» (см. раздел про типы ниже). Без pass-through layout там появляется:

```ts
declare module 'next/root-params' {
  export function locale(): Promise<string>
}
```

Документация Next.js прямо описывает этот вариант: «The root layout can be under a **dynamic segment**, for example when implementing internationalization with `app/[lang]/layout.js`» ([layout.md](https://nextjs.org/docs/app/api-reference/file-conventions/layout#root-layout)). Root layout обязателен, но лежать именно в `app/layout.tsx` он не обязан.

Что из этого следует:

- `<html>` и `<body>` рендерит [src/app/[locale]/layout.tsx](../src/app/[locale]/layout.tsx). Над ним ничего нет.
- Файлы вне `[locale]` остаются без layout. [src/app/global-not-found.tsx](../src/app/global-not-found.tsx) (флаг `experimental.globalNotFound`) и [src/app/global-error.tsx](../src/app/global-error.tsx) рендерят собственные `<html>`/`<body>`. [src/app/not-found.tsx](../src/app/not-found.tsx) их не рендерит: Next.js оборачивает его в свой документ, а вложенный `<html>` в dev ломает гидратацию. Все уровни 404 и ошибок разобраны в [09-error-pages.md](./09-error-pages.md).
- Смена языка остаётся клиентской навигацией. Next.js делает полную перезагрузку при переходе между *разными* root layouts, но здесь root layout один, меняется только значение его параметра. Это проверено: при переключении с `/ru/o-nas` на английский (`/about`) новых document-запросов нет, состояние `window` сохраняется.
- **404, отрендеренные во время запроса (`/ru/foo`, `/uk/blog/does-not-exist`), приходят с сервера пустой оболочкой `<html id="__next_error__">`**, а страницу с шапкой и `lang` браузер строит из RSC payload. Это общее поведение Next.js 16.4, а не следствие `[locale]` как root layout. Замеры и выводы — в [09-error-pages.md](./09-error-pages.md#как-выглядит-ответ-404).

### Если нужен раздел без локали

В шаблоне такого нет. Если понадобится, например, `/admin` без префикса, вынеси его в route group со своим root layout под статическим сегментом: `app/(admin)/admin/layout.tsx`. Layout прямо в группе (`app/(admin)/layout.tsx`) в рантайме работает, но `next typegen` в Next.js 16.4.3 приравнивает его к `/` и пишет «No root params detected», так что `next/root-params` остаётся без типов ([PORTABILITY.md](./PORTABILITY.md#нелокализованные-разделы)). Учти три вещи:

- root layouts станет два. По документации Next.js тип `locale()` тогда включает `undefined`, а переход между разделами вызывает полную перезагрузку страницы;
- `request.ts` в шаблоне вызывает `notFound()` для любого значения, не прошедшего `hasLocale`, в том числе для `undefined`. Если в разделе без локали нужны API next-intl, добавь туда фолбэк на `routing.defaultLocale` (такой паттерн показан в [блоге next-intl](https://next-intl.dev/blog/nextjs-root-params#multiple-root-layouts));
- исключи путь раздела из matcher в [src/proxy.ts](../src/proxy.ts). Иначе proxy обработает `/admin` как путь локали (rewrite на `/en/admin` или редирект на `/ru/admin`), и запрос попадёт в `[locale]/[...rest]`, то есть в 404.

## `[locale]/layout.tsx`: что в нём важно

Целиком файл не дублирую, он короткий: [src/app/[locale]/layout.tsx](../src/app/[locale]/layout.tsx). Ключевые решения:

- **Локаль берётся из next-intl, а не из `params`**: `LocaleLayout({ children }: LayoutProps<'/[locale]'>)` и `const locale = await getLocale()`. `getLocale()` возвращает union `Locale` (`'en' | 'ru' | 'uk'`, выведен в [src/global.d.ts](../src/global.d.ts)), поэтому ни каст, ни `hasLocale` в layout не нужны: неизвестное значение уже отсеяли `dynamicParams = false` и `request.ts`.
- **`<html lang={locale} dir={TEXT_DIRECTION[locale]} className={geist.variable}>`**. Направление текста задаёт `TEXT_DIRECTION` в [src/shared/config/locales.ts](../src/shared/config/locales.ts). Это `Record<Locale, 'ltr' | 'rtl'>`, поэтому новая локаль в `routing.ts` без записи там — ошибка типов. Подмножества шрифта (`subsets: ['latin', 'cyrillic']`) расширяй вместе с новыми письменностями.
- **`generateStaticParams`** перечисляет локали для пререндеринга, а **`export const dynamicParams = false`** закрывает этот список (см. [ниже](#generatestaticparams)).
- **`generateMetadata`** задаёт `metadataBase: SITE_URL` и шаблон заголовка `%s | <site.name>` из namespace `site`. Остальную metadata каждая страница собирает через `buildPageMetadata`, подробнее в [07-metadata-seo.md](./07-metadata-seo.md).
- **На клиент уходит только namespace `error`**, он нужен для `error.tsx`:

  ```tsx
  {/* Client Components of the whole tree get ONLY `error` (for
      [locale]/error.tsx). Page islands get their namespaces from a
      <ClientMessages> on their page (see contact/page.tsx). */}
  <ClientMessages namespaces={['error']}>
  ```

  [`<ClientMessages>`](../src/shared/i18n/ClientMessages.tsx) — это `NextIntlClientProvider` с `messages`, урезанными до перечисленных namespace. Без пропа `messages` провайдер, отрендеренный из Server Component, отдал бы клиенту весь словарь локали. Островки страниц получают свои namespace через собственный `<ClientMessages>`. Вложенный провайдер заменяет `messages` родителя, а не дополняет их. Подробнее в [03-translations.md](./03-translations.md).
- **`<Toaster … containerAriaLabel={t('notifications')} />`**. Без этого пропа sonner называет landmark по-английски («Notifications alt+T») на всех языках. Направление текста sonner сам берёт из `<html dir>`.

## Как локаль доходит до Server Components

Любой серверный API next-intl (`getTranslations`, `getLocale`, `getFormatter`, `getMessages`, `useTranslations` в не-async Server Component) вызывает `getRequestConfig`. Локаль он берёт из root param:

```ts
export default getRequestConfig(async ({ locale }) => {
  // `locale` is an explicit override from the caller — e.g.
  // getTranslations({ locale, namespace }) in a Server Action or Route
  // Handler, where next/root-params is not available (Next.js plans support
  // for Route Handlers only).
  if (!locale) {
    // The value of the [locale] segment of the root layout. Works during
    // static rendering — no setRequestLocale needed in pages/layouts.
    const param = await rootParams.locale()
    if (!hasLocale(routing.locales, param)) notFound()
    locale = param
  }
```

Выдержка из [src/shared/i18n/request.ts](../src/shared/i18n/request.ts). Что здесь важно:

- **Аргумент `locale` — это override от вызывающего.** Он заполнен, когда код передаёт локаль явно, например `getTranslations({ locale, namespace })`. В обычном Server Component его нет, и локаль читается из `rootParams.locale()`.
- **Результат кешируется на запрос.** next-intl оборачивает загрузку конфигурации в React `cache()`, поэтому `request.ts` выполняется один раз на рендер (и отдельно для каждого явного `locale`), а не при каждом `getTranslations`.
- **Статический рендеринг работает сам.** Root params доступны во время пререндеринга, поэтому `next build` помечает все страницы под `[locale]` как `●` (SSG), кроме служебного `[...rest]`, хотя `setRequestLocale` нигде не вызывается.
- **Неизвестное значение → `notFound()`.** Обычно до этой проверки дело не доходит:
  - пути, которые обрабатывает proxy, всегда получают известную локаль. `/xx/about` для proxy — путь без префикса (`xx` не локаль), поэтому он получает локаль посетителя (rewrite в `en` или редирект на `/ru/xx/about`) и локализованную 404 с шапкой через `[...rest]`;
  - пути, которые matcher proxy пропускает, отсекает `dynamicParams = false` в layout. Для `/unknown.txt` (значения `unknown.txt` нет в `generateStaticParams`) маршрута нет, и Next.js отвечает пререндеренной [src/app/global-not-found.tsx](../src/app/global-not-found.tsx), не рендеря layout.

  Проверка в `request.ts` срабатывает там, где `dynamicParams` не действует: в маршруте, который не пререндерится (`/api/x` попадает в `[locale]/[...rest]`, помеченный `ƒ`, с локалью `api`), и с Cache Components, где `dynamicParams` запрещён. Такой `notFound()` показывает корневая [src/app/not-found.tsx](../src/app/not-found.tsx).

### `setRequestLocale` и `requestLocale` больше не нужны

Раньше next-intl требовал вызывать `setRequestLocale(locale)` в каждом page и layout под `[locale]`, иначе страница становилась динамической. Это был временный обходной путь, пока в Next.js не появился способ читать параметры глубоко в дереве. `next/root-params` закрыл эту потребность, и next-intl пометил старые API как deprecated:

- `setRequestLocale` — deprecated с next-intl 4.13.5;
- параметр `requestLocale` в `getRequestConfig` — deprecated с 4.13.6.

Оба по-прежнему работают ради обратной совместимости, но в шаблоне их нет.

**Грабли:** не деструктурируй `requestLocale` в `getRequestConfig` даже «на всякий случай»: `async ({ locale, requestLocale }) => …`. Это геттер: при обращении к нему next-intl читает локаль из заголовков запроса через `headers()`. Деструктуризация вызывает геттер сразу, и все страницы становятся динамическими (`ƒ`).

## Где root params нет: локаль передаётся явно

`next/root-params` работает только в Server Components. В остальных местах локаль передаётся вызову напрямую, а `request.ts` использует её как override.

| Где | Откуда берётся локаль | В шаблоне |
|---|---|---|
| Server Action | Привязывается в Server Component через `.bind(null, locale)`, в action проверяется `hasLocale` | [contact/page.tsx](../src/app/[locale]/contact/page.tsx), [features/contact/api/actions.ts](../src/features/contact/api/actions.ts) |
| Metadata image routes (`opengraph-image`) | Из `params` с проверкой `hasLocale`, неизвестная локаль → `notFound()`. Эти маршруты ведут себя как Route Handlers | [`[locale]/opengraph-image.tsx`](../src/app/[locale]/opengraph-image.tsx) |
| Route Handler | Из URL, `params` или тела запроса. Поддержку root params в Route Handlers Next.js планирует в будущих версиях | нет |
| `generateStaticParams` корневого layout | Нигде: эта функция сама перечисляет значения `[locale]` | [`[locale]/layout.tsx`](../src/app/[locale]/layout.tsx) |
| Client Component | `useLocale()` из ближайшего `NextIntlClientProvider`. Сам `next/root-params` в клиентском коде не импортируется: это ошибка сборки | [LangSwitcher](../src/features/locale-switch/ui/LangSwitcher.tsx) |

Пример из Server Action. Page привязывает локаль:

```tsx
<ContactForm action={submitContact.bind(null, locale)} />
```

Action проверяет её и переводит с явной локалью:

```ts
const locale = hasLocale(routing.locales, requestedLocale)
  ? requestedLocale
  : routing.defaultLocale
const t = await getTranslations({ locale, namespace: 'contact.errors' })
```

Проверка обязательна: bound-аргументы проходят через клиент, и их можно подменить. `.bind` делается именно в Server Component. Если привязать локаль внутри Client Component, на Next.js 16.4 отправка формы без JS зависает: POST не получает ответа, а процесс `next-server` держит 100% CPU. С JS такая форма работает. Подробнее в [12-server-actions.md](./12-server-actions.md).

Ещё один случай для явного override, по документации next-intl: если UI одновременно показывает сообщения **нескольких** локалей.

**Вложенный `generateStaticParams`** (например, в `blog/[slug]`) к ограничениям не относится. По документации Next.js в нём доступен getter root param, и это проверено в шаблоне: и при `next build`, и в `next dev` там работают `rootParams.locale()` и `getTranslations('blog')` без явной локали. Но удобнее и нагляднее брать локаль из аргумента `params`, который заполняет родительский `generateStaticParams`. Пример есть в [11-dynamic-routes.md](./11-dynamic-routes.md).

## Типы: `LayoutProps`, `PageProps` и `next typegen`

Глобальные типы `LayoutProps` и `PageProps` и объявление модуля `next/root-params` Next.js генерирует в `.next/types/` при `next dev`, `next build` или `next typegen`. Импортировать хелперы не нужно.

- **На свежем клоне их ещё нет.** До генерации `tsc` падает с `Cannot find name 'LayoutProps'`, а `next/root-params` объявлен «голым» модулем (`declare module 'next/root-params'`), то есть имеет тип `any`. Поэтому в [package.json](../package.json) `"typecheck": "next typegen && tsc --noEmit --incremental false"`. Та же генерация создаёт `en.d.json.ts` со строгими типами ICU-аргументов (см. [03-translations.md](./03-translations.md)).
- **Layout типизируй через `LayoutProps<'/[locale]'>`.** В нём `params` — это `Promise<{ locale: string }>`. Next.js проверяет default export layout строго: рукописный `Promise<{ locale: Locale }>` даёт ошибку TS2344. Сужение до `Locale` делается в runtime, и в шаблоне его уже сделал `request.ts`: `getLocale()` возвращает `Locale`.
- **Страницам `params` обычно не нужны.** Локаль даёт `getLocale()`. Если нужен свой параметр, используй `PageProps`:

  ```tsx
  type Props = PageProps<'/[locale]/blog/[slug]'>
  ```

  Это строка из [blog/[slug]/page.tsx](../src/app/[locale]/blog/[slug]/page.tsx). Для страниц сгенерированная проверка слабая (`{ params: … } & any`), и неправильный рукописный тип она не поймает. Поэтому лучше хелпер, а не ручной тип.
- **Тип локали** — `import type { Locale } from 'next-intl'`. Он выведен из `routing.locales` в [src/global.d.ts](../src/global.d.ts). Собственного `Locale` в `routing.ts` нет.
- `rootParams.locale()` возвращает `Promise<string>`. `hasLocale(routing.locales, param)` сужает значение до `Locale`.

## `generateStaticParams`

```tsx
// Pre-render every locale at build time. With next/root-params this is all
// static rendering needs — no setRequestLocale in layouts or pages.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}
```

Root params работают и без этой функции, но статический пререндеринг без неё пропадает. Это проверено на [`[locale]/layout.tsx`](../src/app/[locale]/layout.tsx). Если убрать функцию вместе с `dynamicParams = false`, `next build` не пререндерит ни одной страницы с локалью: они становятся `ƒ` (Dynamic), а `blog/[slug]` остаётся `●`, но без единого пути. Если убрать только её, сборка падает: «Segment … exports "dynamicParams: false" but the param "locale" is missing from the generated route params». С ней каждая страница пререндерится в каждой локали:

```
├   /[locale]/about
│ ├ ● /en/about
│ ├ ● /ru/about
│ └ ● /uk/about
```

Что ещё нужно знать:

- **Вложенные сегменты возвращают только свои параметры.** `blog/[slug]` возвращает `{ slug }`. Next.js вызывает дочерний `generateStaticParams` один раз для каждого набора параметров родителя, и получается 3 локали × 3 поста = 9 страниц. Подробнее в [11-dynamic-routes.md](./11-dynamic-routes.md).
- **В манифесте пререндера пути внутренние**: `/ru/about`, а не `/ru/o-nas`. Локализованный URL proxy переписывает во внутренний (см. [08-pathnames.md](./08-pathnames.md)).
- **Значения вне списка — 404 без рендера.** В layout стоит `export const dynamicParams = false`, поэтому у маршрутов под `[locale]` в манифесте пререндера `fallback: false`. Для slug вне списка маршрут `blog/[slug]` закрыт, страница даже не вызывается: URL достаётся `[locale]/[...rest]`, и уже он вызывает `notFound()` → `[locale]/not-found.tsx` (без `[...rest]` ответом была бы английская `global-not-found.tsx`). Для локали вне списка (`/unknown.txt`) Next.js сразу отвечает `global-not-found.tsx`. Проверено временным логированием в странице и в `[...rest]`. Без этой строки (по умолчанию `true`) неизвестное значение рендерилось бы по запросу и упиралось в `notFound()` страницы или `request.ts`.
- **Дочерний сегмент список не откроет.** Next.js закрывает маршрут, если `dynamicParams = false` объявил хоть один сегмент пути (`segments.every(… !== false)` в `next/dist/build/static-paths/app.js`). `export const dynamicParams = true` в `blog/[slug]/page.tsx` поэтому не помогает: проверено, slug вне `generateStaticParams` и с ним отдаёт 404. Если нужны параметры из CMS, рендерящиеся по запросу, убирай строку из layout. Неизвестные локали тогда отсечёт `notFound()` в `request.ts`, см. [11-dynamic-routes.md](./11-dynamic-routes.md#много-постов).
- **Проверка в `request.ts` остаётся** ещё и потому, что с Cache Components `dynamicParams` запрещён (next-intl пишет о том же: `dynamicParams = false` не работает с Cache Components).
- `[locale]/[...rest]` в выводе сборки помечен `ƒ`. Это нормально: он только вызывает `notFound()`.

## Cache Components

Шаблон **не** включает `cacheComponents`. Официальный example next-intl его тоже не включает.

Контекст: `create-next-app` 16.4 по умолчанию пишет в `next.config` `cacheComponents: true` и `partialPrefetching: true`. Документация Next.js сообщает, что в следующей мажорной версии обе возможности будут включены везде, а флаги удалят. Root params для этой модели подходят хорошо: getter, вызванный внутри `'use cache'`, добавляет в ключ кеша только тот параметр, который реально прочитан.

Включение проверено на копии шаблона. Ниже полный список того, что пришлось изменить:

1. **Флаги в [next.config.ts](../next.config.ts).** `partialPrefetching` задаётся явно: без него Next.js выводит предупреждение.

   ```ts
   // example: not enabled in the template
   const nextConfig: NextConfig = {
     cacheComponents: true,
     partialPrefetching: true,
     // ...
   }
   ```

2. **Убрать `now: new Date()` из [request.ts](../src/shared/i18n/request.ts).** Иначе сборка падает: «Next.js encountered the unstable value `new Date()` while prerendering». Комментарий у этой строки в коде предупреждает о том же. Без глобального `now` серверный `relativeTime` считай от явной опорной даты, как на `/demo/formats` (см. [05-formatting.md](./05-formatting.md)).
3. **Убрать `export const dynamicParams = false`** из [`[locale]/layout.tsx`](../src/app/[locale]/layout.tsx) и [`[locale]/opengraph-image.tsx`](../src/app/[locale]/opengraph-image.tsx). Иначе сборка падает: «Route segment config "dynamicParams" is not compatible with `nextConfig.cacheComponents`. Please remove it.» Неизвестные локали после этого отсекает `notFound()` в `request.ts` и в `opengraph-image.tsx`, неизвестные slug — `notFound()` в странице. Побочный эффект: `/unknown.txt` теперь тоже доходит до `request.ts`, и вместо `global-not-found.tsx` (`<html lang="en">`) его показывает корневая `not-found.tsx` без `lang`.
4. **Клиентские островки с `useNow` обернуть в `<Suspense>`.** В шаблоне это уже сделано: `LiveRelativeTime` на `/demo/formats`.
5. **Добавить `'use cache'` в загрузчик шрифта OG-картинки** (`loadGoogleFont` в [`[locale]/opengraph-image.tsx`](../src/app/[locale]/opengraph-image.tsx), комментарий в коде говорит о том же). Без него картинка работает, но перестаёт пререндериться: в выводе сборки маршрут становится `ƒ`, и шрифт запрашивается у Google Fonts на каждый запрос картинки. С `'use cache'` картинки снова `●`.

   ```ts
   // example: only needed with cacheComponents
   async function loadGoogleFont(family: string, text: string): Promise<ArrayBuffer> {
     'use cache'
     // ...
   }
   ```

6. **Принять или обойти soft 404.** Первый запрос неизвестного slug вне `generateStaticParams` (`/uk/blog/does-not-exist`) отдаёт **200** с `<meta name="robots" content="noindex">` вместо 404. Повторные запросы того же URL получают 404 из кеша. Причина в том, что к моменту `notFound()` стрим ответа уже начался. Документация Next.js прямо говорит, что `notFound()` возвращает 404, только если вызван до начала стриминга, и предлагает проверять slug в Proxy, до рендера ([not-found](https://nextjs.org/docs/app/api-reference/functions/not-found), [loading.md#status-codes](https://nextjs.org/docs/app/api-reference/file-conventions/loading#status-codes)). Проверка в proxy должна быть быстрой, без загрузки контента. Композиция proxy с next-intl описана в [01-setup.md](./01-setup.md). `/ru/foo` (через `[...rest]`) и `/unknown.txt` при этом остаются честными 404.
7. **Ошибки префетча после смены языка.** После клиентского переключения на локаль по умолчанию (`/ru/o-nas` → `/about`) сегментные префетчи ссылок шапки `/about`, `/blog`, `/contact` отвечают 404. Префетч запрашивает по их URL сегмент страницы главной (`/$d$locale/__PAGE__`). Сама навигация работает, переходы по этим ссылкам остаются клиентскими, но в консоли браузера появляются ошибки, и e2e-тест «switching to the default locale drops the prefix without errors» падает. Без Cache Components этого нет. Глубже причина не разобрана, так что перед включением проверь это на своём проекте.

Что работает без изменений: чтение локали через root params, `<ClientMessages>`, статический пререндеринг страниц (`○`). `'use cache'` для страниц не понадобился. В эксперименте после пунктов 1–5 на свежей сборке проходит весь e2e, кроме трёх тестов: английская корневая 404 для `/unknown.txt` (пункт 3), 404 на неизвестный slug (пункт 6) и смена языка на локаль по умолчанию (пункт 7).

Ещё две детали:

- с Cache Components `generateStaticParams` обязан вернуть хотя бы одно значение каждого root param, иначе сборка падает. В шаблоне это выполнено;
- Cache Components не поддерживает route segment config `runtime`. В шаблоне таких экспортов нет, но в твоём проекте их нужно убрать.

## Миграция со схемы `setRequestLocale`

Если твой проект устроен по-старому (pass-through `app/layout.tsx`, `setRequestLocale` в каждой странице), перевод на схему шаблона выглядит так:

1. Обнови Next.js до 16.3 или новее.
2. Удали `src/app/layout.tsx`. Перенеси `<html>`/`<body>` в `[locale]/layout.tsx` и типизируй его через `LayoutProps<'/[locale]'>`.
3. В `request.ts` читай локаль через `rootParams.locale()` с override `locale`, как показано выше. Не деструктурируй `requestLocale`.
4. Удали все вызовы `setRequestLocale`. В layout и страницах вместо `(await params).locale` используй `await getLocale()`.
5. В `generateMetadata` убери явную локаль: `getTranslations('ns')` вместо `getTranslations({ locale, namespace: 'ns' })`.
6. Server Actions, Route Handlers и metadata image routes переведи на явную локаль (см. таблицу выше). Это обязательный шаг: без него форма из шаблона после миграции падала с HTTP 500.
7. 404: `[locale]/not-found.tsx` и `[locale]/[...rest]/page.tsx` для локализованных, для запросов без локали — `src/app/global-not-found.tsx` (флаг `experimental.globalNotFound`) и `src/app/not-found.tsx` без `<html>`/`<body>`. Подробнее в [09-error-pages.md](./09-error-pages.md).
8. Добавь `next typegen` перед `tsc` в скрипт проверки типов и в CI.
9. Проверь `next build`: страницы под `[locale]` должны остаться `●`.

## Ссылки

- [`next/root-params`](https://nextjs.org/docs/app/api-reference/functions/next-root-params) — API, ограничения, `generateStaticParams`.
- [Using `next/root-params` in Next.js 16.3](https://next-intl.dev/blog/nextjs-root-params) — блог next-intl: интеграция с `request.ts`, удаление `setRequestLocale` и pass-through layout.
- [vercel/next.js discussions/58862](https://github.com/vercel/next.js/discussions/58862) — «Reading params deeply in Server Components»: исходный запрос автора next-intl в репозитории Next.js. Формально обсуждение не закрыто, но сама потребность закрыта `next/root-params` в Next.js 16.3.
- [`cacheComponents`](https://nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents).
