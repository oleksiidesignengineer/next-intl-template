# FAQ и грабли

Короткие ответы на вопросы, которые возникают при внедрении, и грабли, на которые наступили при сборке этого шаблона. Подробности — по ссылкам в каждом ответе. Сниппеты с комментарием `// Example` — образцы для твоего проекта, в шаблоне их нет; остальные — выдержки из кода шаблона.

- [Структура и рендеринг](#структура-и-рендеринг)
- [Переводы на клиенте](#переводы-на-клиенте)
- [Навигация и переключение языка](#навигация-и-переключение-языка)
- [Даты и время](#даты-и-время)
- [Формы, Server Actions, ошибки и 404](#формы-server-actions-ошибки-и-404)
- [Сообщения: организация, источники, новые локали](#сообщения-организация-источники-новые-локали)

## Структура и рендеринг

### Почему нет `src/app/layout.tsx`? Можно вернуть pass-through layout?

Нет. Root layout — тот, над которым нет другого layout. Пока существует `src/app/layout.tsx`, даже пустой `return children`, root layout — он, а `[locale]` становится обычным динамическим сегментом. `next/root-params` видит только сегменты до root layout: `next typegen` записывает в `.next/types/root-params.d.ts` пустую декларацию с комментарием «No root params detected», и `next build` падает на импорте в [`request.ts`](../src/shared/i18n/request.ts) с ошибкой «Export locale doesn't exist in target module». `tsc` этого не ловит: без root params Next.js оставляет `next/root-params` без типов, и `rootParams.locale` получает тип `any`.

Поэтому `<html>`/`<body>` есть ровно в трёх файлах:

- [`src/app/[locale]/layout.tsx`](../src/app/[locale]/layout.tsx) — root layout, `lang` и `dir` берутся из локали;
- [`src/app/global-not-found.tsx`](../src/app/global-not-found.tsx) — 404 для URL без маршрута среди тех, что пропускает matcher proxy (`/unknown.txt`). Включается флагом `experimental.globalNotFound`;
- [`src/app/global-error.tsx`](../src/app/global-error.tsx) — заменяет root layout, когда падает он сам. `NextIntlClientProvider` находится ниже, поэтому next-intl там недоступен и текст захардкожен на английском.

Четвёртый файл без layout, [`src/app/not-found.tsx`](../src/app/not-found.tsx), ловит `notFound()` из `request.ts` (`/api/x`) и `<html>` не рендерит: Next.js оборачивает его в свой документ, а вложенный `<html>` в dev ломает гидратацию. `/xx/about` ни в один корневой файл не попадает: proxy считает его путём без префикса, и запрос получает локализованную 404.

Подробно — [02-app-router.md](./02-app-router.md) и [09-error-pages.md](./09-error-pages.md#какой-url-куда-попадает).

### Почему не включён `cacheComponents`, хотя `create-next-app` его включает?

`create-next-app` 16.4 по умолчанию пишет в `next.config` `cacheComponents: true` и `partialPrefetching: true`. Шаблон их не включает, как и официальный example next-intl. Включение проверено на копии шаблона, и оно стоит нескольких правок:

- убрать `now` из `request.ts` и `dynamicParams` из layout и OG-картинки;
- добавить `'use cache'` в загрузчик шрифта OG;
- смириться с soft 404 на неизвестный slug (ниже) или проверять slug в proxy;
- разобраться с ошибками префетча после смены языка на default-локаль.

Полный список и причины — [02-app-router.md](./02-app-router.md#cache-components).

### `useTranslations` падает: «not callable within an async component» или «No intl context found»

`useTranslations` — не «только клиентский» хук. next-intl подставляет реализацию по месту выполнения:

| Где вызываешь | Что использовать |
|---|---|
| `async` Server Component | `await getTranslations('ns')`. Хуки в async-компонентах запрещены, отсюда «`useTranslations` is not callable within an async component» |
| Не-async Server Component | `useTranslations('ns')` работает на сервере, сообщения на клиент не уходят. Так сделан [`[locale]/not-found.tsx`](../src/app/[locale]/not-found.tsx) |
| Client Component (`'use client'`) | `useTranslations('ns')`, но namespace должен прийти от провайдера (см. следующий раздел). Если провайдера над компонентом нет вовсе, получишь «No intl context found» |

```tsx
export default function NotFound() {
  const t = useTranslations('notFound')
```

Учти: не-async компонент без директивы становится клиентским, если его импортирует Client Component. Тогда ему тоже нужны сообщения на клиенте. Таблица целиком — в [03-translations.md](./03-translations.md).

### Страницы вдруг стали динамическими (`ƒ` в выводе `next build`)

Проверь два места:

1. **`request.ts`.** Он выполняется при рендере любой страницы, поэтому `cookies()` или `headers()` в нём делают динамическим весь сайт. То же самое даёт деструктуризация устаревшего параметра `requestLocale`: это геттер, который читает `headers()`. Локаль бери из аргумента `locale` (явный override) и из `rootParams.locale()`, как в шаблоне:

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

2. **`generateStaticParams` в `[locale]/layout.tsx`.** Без него Next не знает значений `[locale]` на этапе сборки и не пререндерит страницы по локалям.

Если переносишь код со старым паттерном (`setRequestLocale` в каждой странице и `requestLocale` в `request.ts`), убери оба. `setRequestLocale` в next-intl deprecated, и с root params он не нужен. `requestLocale` — тот самый геттер из пункта 1.

### Где `next/root-params` недоступен и что будет, если забыть

Root params читаются только в Server Components. Next.js явно не поддерживает их в Server Actions и Route Handlers (для последних поддержку обещают позже) и внутри `unstable_cache`. Metadata-маршруты картинок (`opengraph-image`) документация Next.js называет особыми Route Handlers, поэтому в [`[locale]/opengraph-image.tsx`](../src/app/[locale]/opengraph-image.tsx) локаль берётся из `params`. Server Action, который вызывает `getTranslations('ns')` без локали, падает с 500.

Решение — передать локаль явно. Тогда `request.ts` возьмёт её как override:

```ts
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale
  const t = await getTranslations({ locale, namespace: 'contact.errors' })
```

Откуда action берёт `requestedLocale` — в разделе про `.bind` ниже и в [12-server-actions.md](./12-server-actions.md).

## Переводы на клиенте

### В Client Component вместо текста виден `contactForm.submit`, в консоли — `MISSING_MESSAGE`

На клиент не передан нужный namespace. Layout отдаёт клиенту только `error` (для `error.tsx`):

```tsx
        {/* Client Components of the whole tree get ONLY `error` (for
            [locale]/error.tsx). Page islands get their namespaces from a
            <ClientMessages> on their page (see contact/page.tsx). */}
        <ClientMessages namespaces={['error']}>
```

Всё остальное страница передаёт сама, оборачивая островок в свой [`<ClientMessages>`](../src/shared/i18n/ClientMessages.tsx):

```tsx
      {/* Only this page ships `contactForm` — the form's own namespace — to
          the client. `contact` (title, intro, errors) stays on the server:
          the action returns already translated error strings. */}
      <ClientMessages namespaces={['contactForm']}>
        {/* Server Actions can't read next/root-params, so the locale is bound
            here, on the server, and the action translates its errors with it. */}
        <ContactForm action={submitContact.bind(null, locale)} />
      </ClientMessages>
```

Удобно держать строки клиентского островка в отдельном namespace (`contactForm`), а серверные — в своём (`contact`). Тогда на клиент уходит ровно то, что нужно форме.

Две грабли:

- **Вложенный `NextIntlClientProvider` заменяет `messages` родителя, а не сливается с ними.** Под `<ClientMessages namespaces={['contactForm']}>` namespace `error` из layout уже недоступен. Перечисляй все namespace, которые нужны поддереву. `locale`, `timeZone`, `now` и `formats` при этом наследуются из `request.ts`.
- **`onError` и `getMessageFallback` из `request.ts` работают только на сервере.** Функции не сериализуются, поэтому на клиенте действует поведение next-intl по умолчанию: `console.error` и текст `namespace.key`. e2e-фикстура валит тест на любой ошибке в консоли, и такие пропуски ловятся сами ([14-testing.md](./14-testing.md)).

Если островку нужны одна-две строки, проще передать уже переведённый текст пропом. Так сделаны `LangSwitcher` (`label`, `options`) и `ErrorTrigger` (`label`).

### Как переводить тосты и обработчики вне React

`toast()` вызывается из эффекта или обработчика, но `t` при этом берётся из хука в замыкании компонента. Так работает `ContactForm`:

```tsx
  useEffect(() => {
    if (state.status === 'success') toast.success(t('successToast'))
  }, [state, t])
```

Для ошибок от сервера удобнее, чтобы Server Action сразу вернул переведённую строку: `submitContact` переводит ошибки валидации через `getTranslations({ locale, namespace: 'contact.errors' })`, поэтому namespace `contact` на клиент не уходит. Глобальный обработчик (axios interceptor, WebSocket) оформи как клиентский компонент под провайдером: он вызывает `useTranslations` и подписывается на события в `useEffect` с `[t]` в зависимостях. Его namespace тоже нужно передать на клиент. При строгой типизации ключей `t(code)` с произвольной строкой не скомпилируется: сначала сузь `code` до известного union.

## Навигация и переключение языка

### При смене языка в Network виден `/en/…`, хотя `localePrefix: 'as-needed'`

Так и задумано. `useRouter().replace(…, { locale })` и `<Link locale>` из next-intl при смене локали всегда строят адрес с префиксом (`forcePrefix`), даже для default-локали: `/en/about`. Proxy отвечает на него редиректом `307` на `/about`. Пока страница не гидрирована, cookie по такому переходу обновит именно proxy. Итоговый URL — без префикса. Если `/en/…` остался в адресной строке, значит, запрос не прошёл через proxy: проверь `matcher` в [`src/proxy.ts`](../src/proxy.ts).

### После переключения языка — 404 или язык молча не меняется

`pathname` взят из `next/navigation`. Он содержит префикс и локализованный сегмент (`/ru/o-nas`), и next-intl добавляет к нему новый префикс:

- ru → uk: `/uk/ru/o-nas` — 404;
- ru → en: `/en/ru/o-nas` → `307` на `/ru/o-nas` — язык не сменился, ошибки нет.

`usePathname` из `@/shared/i18n/navigation` возвращает канонический путь (`/about`). Для динамических маршрутов к нему нужны `params`, для сохранения query — `query`:

```tsx
          router.replace(
            // @ts-expect-error -- TypeScript validates that only known params
            // are used with a given pathname. Since we're on the current route,
            // they always match at runtime.
            { pathname, params, query },
            { locale: next }
          )
```

Полный разбор — [06-navigation.md](./06-navigation.md).

### `/about?tab=1` ведёт на `/ru/about?tab=1` вместо `/ru/o-nas?tab=1`

next-intl сопоставляет с `pathnames` только pathname. Строка с query или hash не совпадает с ключом `/about`, и маппинг пропускается. [`@/shared/ui/Link`](../src/shared/ui/Link.tsx) и `localizePath` раскладывают такую строку в объект `{ pathname, query, hash }` через `splitHref` из [`shared/lib/href.ts`](../src/shared/lib/href.ts). В `router.push`/`redirect` из `@/shared/i18n/navigation` передавай объект сам: `{ pathname: '/about', query: { tab: '1' } }`.

### Почему `LangSwitcher` не использует `useSearchParams`

На пререндеренной странице `useSearchParams` переводит клиентское дерево до ближайшего `<Suspense>` в клиентский рендер. Переключатель пропал бы из статического HTML. Query нужен только в момент смены, поэтому [`LangSwitcher`](../src/features/locale-switch/ui/LangSwitcher.tsx) читает `window.location.search` в `onChange`.

### Язык не запоминается после перезапуска браузера, а `/` уводит на прошлый язык

Это два свойства cookie `NEXT_LOCALE`:

- **Она сессионная.** `localeCookie` в [`routing.ts`](../src/shared/i18n/routing.ts) не задан, и это дефолт next-intl 4. Proxy ставит cookie на document-запрос, когда локаль URL расходится с cookie или, если cookie нет, с `Accept-Language`. Например, англоязычный браузер пришёл из поиска на `/ru/…`. Значит, cookie получают и те, кто язык не выбирал, поэтому долгоживущая cookie — вопрос согласия по GDPR/ePrivacy. Включается явно: `localeCookie: { maxAge: … }`.
- **`/` и любой другой URL без префикса редиректят по ней.** При `localeDetection: true` и `localePrefix: 'as-needed'` сначала смотрится cookie, потом `Accept-Language`. После переключения на uk запрос `/` до конца сессии ведёт на `/uk`, а `/about` — на `/uk/pro-nas`.

Подробнее, включая «выставить язык пользователя после логина», — [13-locale-persistence.md](./13-locale-persistence.md).

### Почему в переключателе нет флагов

Флаг обозначает страну, а не язык: 🇬🇧 не подходит англоязычным из США, Канады или Австралии. Поэтому [`LOCALE_NATIVE_NAMES`](../src/shared/config/locales.ts) показывает каждый язык на нём самом («English», «Русский», «Українська»), как портал wikipedia.org. Имена вычисляет `Intl.DisplayNames`, и для любой новой локали они получаются автоматически. Считаются они на сервере и приходят в `LangSwitcher` пропами. Так ICU-данные Node и браузера не могут разойтись при гидрации.

## Даты и время

### Hydration mismatch на относительном времени или застывшее «3 дня назад»

`Date.now()` на сервере и на клиенте разный. Поэтому в [`request.ts`](../src/shared/i18n/request.ts) задан общий `now: new Date()`. Серверный рендер и клиентский провайдер (он наследует `now`) считают от одного момента, и гидрация совпадает.

Но на статических страницах `now` — **время сборки**, а не запроса. Из этого следует:

- `format.relativeTime(date)` без второго аргумента в Server Component показывает время относительно сборки, пока сайт не пересоберут. Передавай явную опорную дату, как в [`demo/formats`](../src/app/[locale]/demo/formats/page.tsx): `format.relativeTime(SAMPLE_DATE, SAMPLE_RANGE_END)`. Либо считай на клиенте.
- `useNow()` без `updateInterval` всегда возвращает этот общий `now`. `useNow({ updateInterval })` начинает с него же и переключается на реальное время только на первом тике интервала. Первые `updateInterval` миллисекунд значение отсчитывается от сборки. Если это неприемлемо, бери короткий интервал или рисуй значение только после монтирования.

Так устроен клиентский островок [`LiveRelativeTime`](../src/app/[locale]/demo/formats/_components/LiveRelativeTime.tsx) на `/demo/formats`:

```tsx
export function LiveRelativeTime({ date }: { date: Date }) {
  const format = useFormatter()
  const now = useNow({ updateInterval: 1000 })

  return <time dateTime={date.toISOString()}>{format.relativeTime(date, now)}</time>
}
```

С `cacheComponents` `new Date()` в `request.ts` валит сборку: его придётся убрать, а клиентские островки с `useNow` обернуть в `<Suspense>`. Подробнее — [05-formatting.md](./05-formatting.md) и [02-app-router.md](./02-app-router.md).

### `{date, date, short}` в сообщении выглядит не так, как в документации ICU

Глобальный формат, названный как встроенный стиль ICU (`short`, `long`, `currency`, `percent`), перекрывает этот стиль и внутри сообщений. В шаблоне `dateTime.short` — это `{ day: 'numeric', month: 'short', year: 'numeric' }`, поэтому `{d, date, short}` для en даёт `Mar 15, 2026`, а не ICU-шное `3/15/26`. Если нужен встроенный стиль, назови свой формат иначе.

## Формы, Server Actions, ошибки и 404

### Форма без JS зависает, сервер грузит CPU на 100% — `.bind` в Client Component

Root params в Server Action недоступны, поэтому локаль приходит первым, привязанным аргументом. Привязывай её **в Server Component** (на странице) и передавай форме готовый action пропом, как в `contact/page.tsx` выше. Документация Next.js разрешает `.bind` и в Client Component. Но на Next.js 16.4 вызов `submitContact.bind(null, locale)` внутри `ContactForm` (вместе с `useActionState`) стабильно вешал отправку формы без JS: ответа нет, `next-server` уходит в 100% CPU и перестаёт отвечать на любые запросы. Привязанные аргументы проходят через клиент, поэтому action проверяет локаль через `hasLocale`. Отправку без JS проверяет e2e ([`forms-errors.spec.ts`](../tests/e2e/forms-errors.spec.ts)).

### После ошибки валидации поля формы очищаются

React сбрасывает неконтролируемые поля `<form action={…}>` после завершения action. Это происходит и тогда, когда action вернул ошибку валидации: для React это обычный `return`. Поэтому `submitContact` в состоянии с ошибкой возвращает введённые `values`, а форма подставляет их в `defaultValue`:

```tsx
  // React resets the form after every action; defaultValue restores the
  // submitted values on error, and an empty form after success.
  const values = state.status === 'error' ? state.values : undefined
```

После успеха `values` нет, и форма очищается, как и должна.

### Кнопка «Try again» в `error.tsx` падает с `TypeError`

Проп `unstable_retry` появился в Next.js 16.2. В 16.3 стабильным стал `retry`, а старое имя удалили без алиаса. В старой кнопке `unstable_retry` приходит как `undefined`, и клик падает с `TypeError`. Типизируй пропы из `next/error`, тогда tsc поймает такое переименование:

```tsx
export default function ErrorBoundary({ error, retry }: Pick<ErrorInfo, 'error' | 'retry'>) {
```

`retry()` заново запрашивает и рендерит сегмент, а `reset()` сбрасывает ошибку и перерисовывает сегмент без повторного запроса. `error` имеет тип `unknown`, потому что бросить можно что угодно. Живой пример — `/demo/errors`, подробности — [09-error-pages.md](./09-error-pages.md).

### Неизвестный slug отдаёт `200` вместо `404`

Статус фиксируется, когда начинается стрим ответа. Если `notFound()` срабатывает уже после этого, Next.js дорисует 404 с `<meta name="robots" content="noindex">`, но статус останется `200`. Это soft 404. Стрим начинается раньше проверки, если у маршрута есть `loading.tsx` или страница успела приостановиться под `<Suspense>`.

В шаблоне набор локалей и slug закрыт: в `[locale]/layout.tsx` стоит `export const dynamicParams = false`, и значение вне `generateStaticParams` — это `404` без рендера страницы (`/uk/blog/does-not-exist` проверяет e2e). Soft 404 появится в двух случаях:

- список slug открыт ради параметров из CMS (строку `dynamicParams = false` для этого убирают из layout, см. [11-dynamic-routes.md](./11-dynamic-routes.md#много-постов)), и страница проверяет slug через `notFound()` уже после начала стрима;
- включён `cacheComponents`. С ним `dynamicParams` не поддерживается, и первый запрос неизвестного slug получает `200` с `noindex` (повторные — `404` из кеша).

Если в таком режиме нужен настоящий `404`, проверяй slug до рендера — в proxy (rewrite на not-found или `404`-ответ). Так советует документация Next.js. Как встроить свою логику в proxy рядом с next-intl — [01-setup.md](./01-setup.md).

### `curl` на 404 показывает пустой `<body>` — что-то сломано?

Нет. На Next.js 16.4 404, построенная во время запроса, приходит оболочкой `<html id="__next_error__">` с пустым `<body>`, а разметку браузер рисует из RSC payload. Статус `404` и `noindex` в ответе есть, а полный HTML получает только пререндеренная `global-not-found` (`/unknown.txt`). Проверяй 404 в браузере, как e2e. Замеры — в [09-error-pages.md](./09-error-pages.md#как-выглядит-ответ-404).

## Сообщения: организация, источники, новые локали

### Как разбить messages по фичам?

Документация next-intl советует сначала попробовать редакторные инструменты для одного большого файла. Разбивать стоит, когда переводами независимо владеют разные команды. Если разбиваешь, делай файл на группу namespace'ов, а не дерево с пересекающимися ключами. Пример структуры (в шаблоне один файл на локаль):

```
src/shared/i18n/messages/
  en/  common.json  contact.json  …
  ru/  common.json  contact.json  …
```

Каждый файл содержит целые namespace'ы (`contact.json` → `{ "contact": { … } }`). Тогда хватит обычного spread, как в документации next-intl. Второй `deepMerge` не нужен: межлокальный fallback по ключам уже делает `deepMerge` в [`request.ts`](../src/shared/i18n/request.ts), и он продолжит работать поверх собранного объекта.

```ts
// Example — replaces `import(`./messages/${locale}.json`)` inside loadMessages.
// Spread is shallow: namespaces must not repeat across files, or the later file wins.
async function importLocale(locale: string): Promise<Messages> {
  return {
    ...(await import(`./messages/${locale}/common.json`)).default,
    ...(await import(`./messages/${locale}/contact.json`)).default,
  }
}
```

Что ещё поменять (проверено `next typegen` + `tsc` и production-сборкой: строгие ICU-аргументы, ключи и fallback по ключам работают):

- [`src/global.d.ts`](../src/global.d.ts): `Messages: typeof common & typeof contact` из `import type common from './shared/i18n/messages/en/common.json'` и остальных файлов;
- [`next.config.ts`](../next.config.ts): `createMessagesDeclaration` принимает массив путей ко всем `en/*.json`;
- [`scripts/check-translations.ts`](../scripts/check-translations.ts): `loadLocale` читает `${locale}.json` — научи его собирать каталог;
- [`tests/e2e/i18n.spec.ts`](../tests/e2e/i18n.spec.ts): импортирует `en.json` ради первых ключей namespace'ов — собери объект из новых файлов, иначе `tsc` упадёт на этом импорте.

### Как подключить переводы из CMS или TMS?

Сначала реши, что именно приходит из CMS.

**UI-строки (вместо JSON в репозитории)** загружай в `loadMessages`. Определение локали в `getRequestConfig` при этом не меняется:

```ts
// Example — loadMessages in src/shared/i18n/request.ts reading a remote source.
async function loadMessages(locale: string): Promise<Messages> {
  const response = await fetch(`https://cms.example.com/messages/${locale}`, {
    next: { revalidate: 3600 },
  })
  if (!response.ok) throw new Error(`Messages for "${locale}": HTTP ${response.status}`)
  return response.json()
}
```

- Без опций кеша `fetch` на статическом маршруте выполняется один раз, при `next build`. В dev и на динамических маршрутах он выполняется на каждый запрос. Чтобы тексты обновлялись без деплоя, нужен `next: { revalidate }`. Учти: `revalidate` у `fetch` понижает интервал ревалидации всего маршрута, а `request.ts` вызывается почти на каждой странице.
- Тип `Messages` выводится из локального `en.json`. Держи выгрузку из CMS в репозитории как контракт и гоняй по ней `check:translations`, иначе ключи и ICU-аргументы никто не проверит.
- Сохрани fallback на default-локаль (`deepMerge`) и не глотай ошибку CMS: лучше упавшая сборка, чем сайт с ключами вместо текста.

**Контент страниц** (статьи, товары) не смешивай с UI-строками. Страница читает локаль через `getLocale()` и передаёт её источнику данных. В шаблоне источник — заглушка [`entities/post`](../src/entities/post/api/posts.ts):

```tsx
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  const locale = await getLocale()
  const t = await getTranslations('blog')
  const translation = post.translations[locale]
```

В реальном проекте `getPostBySlug` становится запросом к CMS с `locale`. Локализованные slug и hreflang для них — [11-dynamic-routes.md](./11-dynamic-routes.md) и [07-metadata-seo.md](./07-metadata-seo.md).

### Как добавить новую локаль?

Короткий чек-лист есть в [AGENTS.md](../AGENTS.md), полный — в [15-production-checklist.md](./15-production-checklist.md#7-новая-локаль). На чём легко споткнуться:

1. **[`routing.ts`](../src/shared/i18n/routing.ts).** Добавь код в `locales`. Для каждого маршрута из `pathnames` нужна запись для новой локали. Тип там `Partial`, поэтому tsc об этом не напомнит, а без записи локаль получит внутренний путь `/de/about`.
2. **`messages/<code>.json`.** `npm run check:translations` сверит ключи, ICU-аргументы и теги, а также plural-категории CLDR именно этой локали. В рантайме недостающие ключи подставятся из `en`, но CI на расхождении упадёт.
3. **`npm run typecheck`** потребует записи везде, где лежит `Record<Locale, …>`: направление текста в [`TEXT_DIRECTION`](../src/shared/config/locales.ts), [`OG_LOCALE`](../src/shared/seo/og-locale.ts) и переводы в заглушке постов.
4. **Шрифты.** `Geist({ subsets: ['latin', 'cyrillic'] })` в `[locale]/layout.tsx`: добавь нужный subset (например, `latin-ext` для польского или чешского). Греческого, арабицы, иврита и CJK в Geist нет, для них нужен второй шрифт. OG-картинка грузит Geist по тексту: из греческого «Ελλάδα» в подмножество попадёт одна «λ», а на арабский, иврит и CJK Google Fonts отвечает на файл шрифта `400`, и `loadGoogleFont` бросает ошибку. В `opengraph-image.tsx` передай шрифт нужной письменности.

Ничего не нужно делать с `Locale` в `global.d.ts`, `LOCALE_NATIVE_NAMES`, `generateStaticParams`, hreflang, sitemap и `LOCALES` в [`tests/e2e/fixtures.ts`](../tests/e2e/fixtures.ts): всё это выводится из `routing.locales`. Название языка из `Intl.DisplayNames` проверь глазами.

### Как поддержать RTL (арабский, иврит)?

Направление уже прокинуто: [`TEXT_DIRECTION`](../src/shared/config/locales.ts) хранит его для каждой локали, а layout ставит `<html dir={TEXT_DIRECTION[locale]}>`. Это `Record<Locale, …>`, поэтому новую локаль tsc не пропустит, пока не решено её направление. Sonner читает направление из `<html dir>` сам. Тебе остаётся:

1. Указать `'rtl'` для новой локали в `TEXT_DIRECTION`.
2. Вёрстка. В Tailwind v4 всё нужное встроено, плагин `tailwindcss-rtl` не нужен. Логические утилиты (`ms-4`, `me-2`, `ps-*`, `pe-*`, `start-*`, `end-*`, `border-s`, `rounded-s`, `text-start`) сами отражаются по `dir`, а варианты `rtl:`/`ltr:` — для исключений. Замени физические `ml-*`/`pr-*`/`left-*` на логические.
3. Иконки направления (стрелки «назад/вперёд») отрази по горизонтали через `rtl:-scale-x-100`, как стрелку «←» в [`blog/[slug]/page.tsx`](../src/app/[locale]/blog/[slug]/page.tsx). `rtl:rotate-180` переворачивает и по вертикали, поэтому несимметричную иконку он исказит.
4. Шрифт с нужной письменностью для этих локалей. В Geist её нет. Например, у `next/font/google` есть `Noto_Sans_Arabic` (subset `arabic`) и `Noto_Sans_Hebrew` (subset `hebrew`). Отдельно подбери шрифт для OG-картинки и проверь её глазами.

### Как отправлять письма на языке получателя?

Локаль письма — это язык получателя из его профиля, а не язык того, кто вызвал API. Root params в Route Handler недоступны, поэтому локаль передаётся явно:

```ts
// Example — src/app/api/notify/route.ts (the proxy matcher skips /api).
import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { routing } from '@/shared/i18n/routing'

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

export async function POST(request: Request) {
  const { userId } = await request.json()
  const user = await getUser(userId) // your data source
  const locale = hasLocale(routing.locales, user.locale) ? user.locale : routing.defaultLocale
  const t = await getTranslations({ locale, namespace: 'emails.welcome' })

  await sendEmail({
    to: user.email,
    subject: t('subject'),
    // t.markup does NOT escape interpolated values — escape user input yourself.
    html: t.markup('body', {
      name: escapeHtml(user.name),
      link: (chunks) => `<a href="https://example.com/activate">${chunks}</a>`,
    }),
  })
  return Response.json({ ok: true })
}
```

`t.markup` собирает HTML-строку без React, но **не экранирует аргументы**: `{name}` со значением `<img onerror=…>` попадёт в письмо как есть. Экранируй пользовательские значения сам, а внутри tag-функций — и `chunks`, если в них может оказаться пользовательский ввод.

### Как тестировать псевдолокализацией?

Псевдолокализация меняет видимый текст каждого сообщения: `Hello` → `⟦Héllö⟧`. Так находятся:

- хардкод, который не прошёл через `t()` (текст без `⟦⟧`);
- обрезанный текст (пропала `⟧`);
- склейка переводов конкатенацией (`⟦…⟧⟦…⟧` подряд вместо одного сообщения с аргументом).

Регулярками по строке это делать нельзя: они задевают имена аргументов, ключи `plural`/`select` и теги. Получаются `INVALID_MESSAGE` и `FORMATTING_ERROR`. Правильно разобрать сообщение парсером ICU, поменять только текстовые узлы и собрать обратно. Парсер уже стоит в devDependencies (его использует `check:translations`). Если сборка ставит только `dependencies`, перенеси его туда.

```ts
// Example — src/shared/i18n/pseudo.ts
import { type MessageFormatElement, TYPE, parse } from '@formatjs/icu-messageformat-parser'
import { printAST } from '@formatjs/icu-messageformat-parser/printer.js'

const ACCENTS: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ö', u: 'ü', A: 'Á', E: 'É', I: 'Í', O: 'Ö', U: 'Ü' }

// Rewrites literal text only: argument names, plural/select keys, `#` and
// tag names stay intact, so the message still formats with the same values.
function transform(elements: MessageFormatElement[]): MessageFormatElement[] {
  return elements.map((element) => {
    switch (element.type) {
      case TYPE.literal:
        return { ...element, value: element.value.replace(/[aeiou]/gi, (ch) => ACCENTS[ch]) }
      case TYPE.tag:
        return { ...element, children: transform(element.children) }
      case TYPE.plural:
      case TYPE.select:
        return {
          ...element,
          options: Object.fromEntries(
            Object.entries(element.options).map(([key, option]) => [
              key,
              { ...option, value: transform(option.value) },
            ])
          ),
        }
      default:
        return element
    }
  })
}

// ⟦…⟧ marks the boundaries: a cut-off bracket means truncated text.
const pseudoMessage = (message: string) => `⟦${printAST(transform(parse(message)))}⟧`

export function pseudoizeMessages<T>(value: T): T {
  if (typeof value === 'string') return pseudoMessage(value) as T
  if (Array.isArray(value)) return value.map(pseudoizeMessages) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, pseudoizeMessages(nested)])
    ) as T
  }
  return value
}
```

```ts
// Example — in getRequestConfig of src/shared/i18n/request.ts
// (plus `import { pseudoizeMessages } from './pseudo'`)
  const messages = await loadMessages(locale)

  return {
    locale,
    messages: process.env.PSEUDO_L10N === '1' ? pseudoizeMessages(messages) : messages,
```

Рецепт проверен на всех 222 сообщениях шаблона (74 ключа × en/ru/uk), из них 27 — с ICU-конструкциями: после снятия `⟦⟧` и акцентов вывод совпадает с оригиналом, ошибок форматирования нет. В production-сборке с ним проходят клиентские островки, `plural` с `=0`, rich text и ошибки Server Action, а в консоли пусто.

- **Где переменная читается.** Статические страницы читают `PSEUDO_L10N` при сборке, Server Actions — в рантайме. Для production задай её и на `build`, и на `start`. В dev хватит `PSEUDO_L10N=1 npm run dev`.
- **Какую локаль смотреть.** Кириллица почти не меняется, остаются только скобки. Смотри default-локаль (`/`).
- **Совместимость.** Рецепт несовместим с `experimental.messages.precompile` (см. ниже). При нём сообщения с аргументами и тегами приходят уже скомпилированными массивами, а не строками, и такой рецепт испортил бы в них имена аргументов.
- **Удлинение текста.** Чтобы ловить переполнение вёрстки, можно ещё и удлинять литералы (переводы часто длиннее английского) — добавь это в ветку `TYPE.literal`.

### Можно ли уменьшить JS next-intl на клиенте?

Можно прекомпилировать сообщения на этапе сборки (`experimental.messages.precompile`). Тогда клиенту не нужен ICU-парсер: на этом шаблоне замер дал −8,9 KB gzip клиентского JS на каждой из шести проверенных страниц при том же выводе, а fallback по ключам продолжает работать. В шаблоне опция не включена: она экспериментальная, не поддерживает `t.raw` и несовместима с рантайм-трансформациями сообщений вроде псевдолокализации выше. Официальный пример next-intl её тоже не включает. Конфиг и ограничения — в [03-translations.md](./03-translations.md#опционально-прекомпиляция-сообщений).
