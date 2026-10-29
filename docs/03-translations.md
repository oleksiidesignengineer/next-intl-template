# Переводы: Server и Client Components

Главный принцип шаблона: **переводи на сервере, на клиент отправляй минимум**. Строка, переведённая в Server Component, приходит в браузер готовым HTML. Словарь нужен клиенту только там, где Client Component сам вызывает `t()`, и только тот namespace, который этому компоненту нужен.

> Синтаксис сообщений (plural, select, rich text) — [04-icu-messages.md](./04-icu-messages.md). Откуда берётся конфигурация (`request.ts`, плагин) — [01-setup.md](./01-setup.md). Переводы в Server Actions и zod-валидации — [12-server-actions.md](./12-server-actions.md).

## Какой API где

| Где вызываешь | API | Пример в шаблоне |
|---|---|---|
| `async` Server Component, `generateMetadata` | `await getTranslations('ns')` из `next-intl/server` | [about/page.tsx](../src/app/[locale]/about/page.tsx) |
| Не-async Server Component | `useTranslations('ns')` из `next-intl` | [[locale]/not-found.tsx](../src/app/[locale]/not-found.tsx) |
| Client Component (`'use client'`) | `useTranslations('ns')`, но namespace должен быть в ближайшем `NextIntlClientProvider` | [PluralsPlayground.tsx](../src/app/[locale]/demo/plurals/_components/PluralsPlayground.tsx), [ContactForm.tsx](../src/features/contact/ui/ContactForm.tsx), [error.tsx](../src/app/[locale]/error.tsx) |
| Server Action, Route Handler, `opengraph-image` | `await getTranslations({ locale, namespace })` с явной локалью | [actions.ts](../src/features/contact/api/actions.ts), [opengraph-image.tsx](../src/app/[locale]/opengraph-image.tsx) |

Функция `t` одинакова везде: ключ, необязательные аргументы ICU и методы `t.rich`, `t.markup`, `t.raw`, `t.has` (см. [04-icu-messages.md](./04-icu-messages.md)).

### `useTranslations` — не только клиентский хук

next-intl через conditional exports (`react-server`) отдаёт Server Components отдельную реализацию хуков. На сервере `useTranslations` читает конфигурацию из `request.ts`, на клиенте — из контекста `NextIntlClientProvider`. Ограничение одно: хуки нельзя вызывать в `async`-компонентах, поэтому для них есть `getTranslations`.

Отсюда локализованная 404, чей namespace на клиент не уходит:

```tsx
export default function NotFound() {
  const t = useTranslations('notFound')
```

[[locale]/not-found.tsx](../src/app/[locale]/not-found.tsx) не помечен `'use client'`, поэтому рендерится на сервере, и namespace `notFound` в браузер не уходит: из сообщений там только `error` из layout. Готовый текст 404 при этом приходит в RSC payload, а не в HTML: так Next.js 16.4.3 отвечает на `notFound()` во время запроса ([09-error-pages.md](./09-error-pages.md#как-выглядит-ответ-404)).

Соглашение шаблона: страницы и layout — `async` и используют `getTranslations`; `useTranslations` в Server Component встречается там, где компонент естественно не-async. Это стиль, а не техническое требование. Документация next-intl прямо говорит, что догматично выбирать одно из двух не нужно, и по производительности они взаимозаменяемы.

**Грабли: shared-компонент.** Компонент без директивы и без `async` — «shared»: он становится Server Component, если его импортирует Server Component, и Client Component, если его импортирует Client Component. Во втором случае его `useTranslations` читает сообщения из провайдера, и namespace должен там быть. Иначе в браузере будет `MISSING_MESSAGE` и сырой ключ `ns.key` на месте текста (см. [ниже](#ошибки-и-fallback-на-клиенте)).

## Локаль без `params`

Локаль для `getTranslations`, `getLocale`, `getFormatter` берётся в [src/shared/i18n/request.ts](../src/shared/i18n/request.ts) из `next/root-params`: `[locale]` — сегмент root layout, его значение доступно любому Server Component, в том числе при статическом рендеринге.

```ts
  if (!locale) {
    // The value of the [locale] segment of the root layout. Works during
    // static rendering — no setRequestLocale needed in pages/layouts.
    const param = await rootParams.locale()
    if (!hasLocale(routing.locales, param)) notFound()
    locale = param
  }
```

Поэтому `generateMetadata` и страницы не читают `params` ради локали и не передают её явно:

```tsx
export async function generateMetadata() {
  const t = await getTranslations('about')
  return buildPageMetadata({
    href: '/about',
    title: t('seo.title'),
    description: t('seo.description'),
  })
}
```

Старый паттерн `getTranslations({ locale, namespace })` в `generateMetadata` нужен был ради статического рендеринга вместе с `setRequestLocale`. С `next/root-params` next-intl рекомендует убрать оба. `setRequestLocale` помечен deprecated, в шаблоне его нет. Подробности — в [02-app-router.md](./02-app-router.md).

**Явная локаль нужна в четырёх случаях** — три первых там, где root params недоступны:

- **Server Actions** — `next/root-params` там не работает. Локаль привязывается в Server Component через `.bind` и валидируется в action:

  ```ts
  const t = await getTranslations({ locale, namespace: 'contact.errors' })
  ```

  Полный разбор — в [12-server-actions.md](./12-server-actions.md).
- **Route Handlers** — поддержку в Next.js обещают позже.
- **Metadata image routes** (`opengraph-image.tsx`, `generateImageMetadata`) ведут себя как Route Handlers. Локаль берётся из `params`, см. [07-metadata-seo.md](./07-metadata-seo.md).
- **Несколько локалей в одном рендере**, например список «этот текст на всех языках». Это редкий случай.

Явный `locale` проходит в `getRequestConfig` как аргумент и перекрывает root param — ветка `if (!locale)` выше.

## Namespace'ы и ключи

Пример:

```ts
const t = useTranslations('home')
t('title')        // home.title
t('links.about')  // home.links.about — nested keys use dots

const tAll = useTranslations()
tAll('home.title') // without a namespace: full path
```

Ключи типизированы от `en.json`: опечатка в namespace или ключе — ошибка компиляции.

**Ключ из переменной** должен иметь тип union литералов. Переменная типа `string` не скомпилируется ни сама по себе, ни внутри шаблонной строки (`` t(`links.${name}`) ``): TypeScript не может доказать, что такой ключ есть в `en.json`. Union литералов проходит, в том числе в шаблонной строке. Массив `as const` даёт TypeScript точный набор ключей, как в [SiteHeader.tsx](../src/widgets/site-header/ui/SiteHeader.tsx):

```tsx
const NAV_ITEMS = [
  { href: '/', key: 'home' },
  { href: '/about', key: 'about' },
  { href: '/blog', key: 'blog' },
  { href: '/contact', key: 'contact' },
  { href: '/demo/plurals', key: 'plurals' },
  { href: '/demo/formats', key: 'formats' },
] as const
```

Дальше `t(key)` проверяется без кастов.

## Сообщения на клиенте

### Что получает клиент

`NextIntlClientProvider`, отрендеренный из Server Component, **наследует** из `request.ts` `locale`, `messages`, `now`, `timeZone` и `formats`. Без пропа `messages` клиент получает **весь словарь**. Это поведение по умолчанию.

Всё, что передано провайдеру, сериализуется в RSC payload. При первой загрузке Next.js встраивает его прямо в HTML страницы, при клиентской навигации он приходит в RSC-ответе. Это данные, а не JS-бандл. Документация next-intl связывает их объём с Total Blocking Time и INP и советует сначала измерять, потом оптимизировать. Для масштаба: весь `ru.json` шаблона — около 5,6 КБ (≈2,2 КБ gzip). На таком объёме выигрыш от выборки невелик, но он растёт вместе со словарём, а паттерн остаётся тем же.

### Четыре варианта — по убыванию выгоды для производительности

Порядок взят из документации next-intl («Internationalization of Server & Client Components»):

1. **Передать переведённый текст пропом или `children` из Server Component.** Клиенту не нужны ни сообщения, ни провайдер с `messages`. Шаблон делает так везде, где строк немного:

   ```tsx
   <LangSwitcher
     label={tCommon('languageSwitcher')}
     options={routing.locales.map((locale) => ({
       locale,
       name: LOCALE_NATIVE_NAMES[locale],
     }))}
   />
   ```

   Так же устроены `ErrorTrigger label={t('trigger')}` на [/demo/errors](../src/app/[locale]/demo/errors/page.tsx) и `Toaster containerAriaLabel={t('notifications')}` в layout. Бонус для `LangSwitcher`: нативные имена языков считает `Intl.DisplayNames` один раз на сервере, поэтому ICU-данные Node и браузера не могут разойтись при гидрации.
2. **Перенести состояние на сервер** (search params, cookie, БД). Сервер перерендерит переведённый текст сам. В шаблоне не используется, но для пагинации и фильтров это часто лучший вариант: состояние заодно живёт в URL.
3. **Вложенный провайдер с выборкой namespace'ов** — когда Client Component сам форматирует строки с динамическими аргументами. В шаблоне это [`ClientMessages`](../src/shared/i18n/ClientMessages.tsx), он стоит на странице рядом с островком:

   ```tsx
   <ClientMessages namespaces={['contactForm']}>
     {/* Server Actions can't read next/root-params, so the locale is bound
         here, on the server, and the action translates its errors with it. */}
     <ContactForm action={submitContact.bind(null, locale)} />
   </ClientMessages>
   ```

   Внутри это `async` Server Component: `getMessages()` → `pickNamespaces` → `<NextIntlClientProvider messages={…}>`. Проп `namespaces` типизирован как `keyof Messages`, так что опечатка в имени namespace — ошибка компиляции. Используется на [contact/page.tsx](../src/app/[locale]/contact/page.tsx), [demo/plurals/page.tsx](../src/app/[locale]/demo/plurals/page.tsx) и в самом layout (namespace `error`, см. ниже).
4. **Все сообщения** — `<NextIntlClientProvider>` без `messages`. Разумно для очень интерактивного приложения, где почти всё — Client Components. Начинать с этого можно, но в шаблоне-эталоне такого нет.

Выбирай вариант 1, если клиенту нужна пара готовых строк. Вариант 3 — если клиент сам вызывает `t()` с аргументами, которые меняются в браузере (счётчик и имя в `PluralsPlayground`), или строк так много, что прокидывать их пропсами неудобно (подписи, плейсхолдеры и toast в `ContactForm`). Ошибки валидации формы клиенту не нужны вовсе: action переводит их на сервере и возвращает готовыми строками. Поэтому namespace `contact` (заголовок, вступление, `contact.errors`) остаётся на сервере, а на клиент уходит только `contactForm`.

### Почему layout отдаёт только `error`

Layout оборачивает всё дерево тем же компонентом ([[locale]/layout.tsx](../src/app/[locale]/layout.tsx)):

```tsx
<ClientMessages namespaces={['error']}>
```

[[locale]/error.tsx](../src/app/[locale]/error.tsx) по требованию Next.js — Client Component. Пропсов с сервера он не получает, а сработать может на любой странице. Поэтому namespace `error` должен быть на клиенте всегда, и это единственный такой namespace. Остальное в layout обходится без клиентских сообщений:

- `SiteHeader` — Server Component, `LangSwitcher` получает подписи пропсами;
- `not-found.tsx` — Server Component;
- подпись `Toaster` передана пропом.

e2e-тест это фиксирует ([tests/e2e/i18n.spec.ts](../tests/e2e/i18n.spec.ts)): в HTML `/ru` есть `error`, но нет `contactForm`, `contact`, `plurals`, `header`, `common` и других. На `/ru/contact` добавляется `contactForm`, а `contact` и `plurals` туда не попадают ([14-testing.md](./14-testing.md)).

### Вложенный провайдер заменяет `messages`, остальное наследует

Документация next-intl: пропсы провайдера атомарны, `messages` при вложении **не мержатся**. Поэтому внутри `<ClientMessages namespaces={['contactForm']}>` Client Components видят только `contactForm`; namespace `error` из layout там недоступен. Для `error.tsx` это не проблема: граница ошибок стоит выше страницы и живёт в провайдере layout. Если островку нужны два namespace'а, перечисли оба, например `namespaces={['contactForm', 'common']}`.

`locale`, `timeZone`, `now` и `formats` вложенный провайдер, как и провайдер layout, наследует из `request.ts`. Поэтому [LiveRelativeTime](../src/app/[locale]/demo/formats/_components/LiveRelativeTime.tsx) на `/demo/formats` обходится без своего `ClientMessages`: `useFormatter` и `useNow` сообщения не нужны, хватает провайдера layout.

```tsx
<Suspense fallback={null}>
  <LiveRelativeTime date={SAMPLE_DATE} />
</Suspense>
```

Про `now` из `request.ts` и согласованную гидратацию относительного времени — [05-formatting.md](./05-formatting.md).

### Ошибки и fallback на клиенте

`onError` и `getMessageFallback` из `request.ts` **на клиент не наследуются**: это функции, а функции не сериализуются в RSC. Отсюда разное поведение, когда сообщение не найдено. С fallback-merge это значит: ключа нет даже в `en.json`, или namespace не передан клиенту.

| Где | Что видит пользователь | Что в логе |
|---|---|---|
| Server Component | dev: `[!ns.key]`, prod: `ns.key` (наш `getMessageFallback`) | `[next-intl] Missing message: …` (наш `onError`) |
| Client Component | `ns.key` (дефолт next-intl) | дефолтный `console.error` с `MISSING_MESSAGE` |

Нужна та же обработка на клиенте — добавь `'use client'`-провайдер с этими функциями и рендери его внутри серверного `NextIntlClientProvider`. Так делает пример `IntlErrorHandlingProvider` в документации next-intl (configuration → NextIntlClientProvider). Функции придётся вынести в модуль без серверных импортов. В шаблоне такого провайдера нет.

Забытый namespace в `ClientMessages` ловит e2e: фикстура валит тест на любой `console.error`, а тест обходит все 8 маршрутов шаблона в каждой локали ([tests/e2e/i18n.spec.ts](../tests/e2e/i18n.spec.ts)). Статической проверки «какому клиентскому компоненту какой namespace нужен» нет. Документация next-intl признаёт, что выборку сейчас делают по знанию реализации, а автоматический tree-shaking сообщений пока в исследовании.

## Fallback на `defaultLocale`

Ключ есть в `en.json`, но пропущен в `ru.json` — на `/ru` будет английский текст, а не путь ключа. **Это не дефолт next-intl**: библиотека берёт ровно те сообщения, что вернул `request.ts`, а в её документации это один файл активной локали. Fallback включён в `loadMessages`:

```ts
async function loadMessages(locale: string) {
  const messages: Messages = (await import(`./messages/${locale}.json`)).default
  if (locale === routing.defaultLocale) return messages

  const fallback: Messages = (
    await import(`./messages/${routing.defaultLocale}.json`)
  ).default
  return deepMerge(fallback, messages)
}
```

`deepMerge` рекурсивный, поэтому fallback работает по ключам, а не по namespace'ам: частично переведённый namespace не теряет соседние ключи. Слить словарь локали по умолчанию с текущим документация next-intl и предлагает для локалей, которые заведомо переведены не полностью. Как именно сливать, она не уточняет, рекурсивный merge — решение шаблона.

Следствия:

- непереведённый ключ тихо показывается по-английски, без ошибки. Ловить такие пропуски — задача `npm run check:translations`, он падает на любом расхождении ключей ([14-testing.md](./14-testing.md));
- `onError` с `MISSING_MESSAGE` срабатывает, только когда ключа нет и в `en.json`. Это всегда баг (опечатка или динамический ключ), поэтому шаблон логирует его `console.error` во всех окружениях, а не только в dev;
- `ClientMessages` берёт namespace'ы из уже смёрженного словаря, так что fallback работает и на клиенте.

Не нужен fallback — убери merge, и вернётся поведение next-intl по умолчанию: путь ключа вместо текста (на сервере в dev — `[!ns.key]`, см. таблицу выше) и `MISSING_MESSAGE` в логе.

## Типобезопасность

### Ключи, локаль, форматы — `src/global.d.ts`

```ts
declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages
    Locale: (typeof routing.locales)[number]
    // Makes named format strings ('short', 'currency', …) type-checked and
    // autocompleted. `formats` is the single source of truth in request.ts.
    Formats: typeof formats
  }
}
```

- **`Messages`** — ключи и namespace'ы от `en.json`, source of truth.
- **`Locale`** — union выводится из `routing.locales`. Новая локаль в [routing.ts](../src/shared/i18n/routing.ts) расширяет тип сама. В коде тип импортируется из библиотеки: `import type { Locale } from 'next-intl'`. `useLocale()` и `getLocale()` возвращают `'en' | 'ru' | 'uk'`, а не `string`.
- **`Formats`** — имена глобальных форматов в `format.dateTime(date, 'short')` проверяются и автодополняются ([05-formatting.md](./05-formatting.md)).

### Строгие ICU-аргументы — `createMessagesDeclaration`

TypeScript выводит значения импортированного JSON как `string`, а не как литералы. Из `"Hello, {name}!"` он не узнает, что нужен `name`. next-intl обходит это генерацией декларации:

```ts
const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/shared/i18n/request.ts',
  experimental: {
    // Generates en.d.json.ts next to en.json (on dev/build/`next typegen`) so
    // ICU arguments are strictly typed: t('items', { count: 'x' }) is a type
    // error, and `{min, plural, …}` requires a number.
    createMessagesDeclaration: './src/shared/i18n/messages/en.json',
  },
})
```

Плюс `"allowArbitraryExtensions": true` в [tsconfig.json](../tsconfig.json): этого требует документация next-intl. Без флага TypeScript 6.0 всё равно находит `en.d.json.ts` (видно в `tsc --traceResolution`), и `import type` в `global.d.ts` проходит. Но обычный импорт `en.json`, как в [tests/e2e/i18n.spec.ts](../tests/e2e/i18n.spec.ts), падает с `TS6263: … but '--allowArbitraryExtensions' is not set`, так что флаг нужен. Что это ловит (проверено `tsc` на сообщениях шаблона):

```ts
const t = useTranslations('plurals')

t('items', { count: 'x' })
// TS2322: Type 'string' is not assignable to type 'number | bigint'.

t('greeting')
// TS2554: Expected 2-3 arguments, but got 1.

t('greeting', { nam: 'Alex' })
// TS2561: ... 'nam' does not exist in type '{ name: string; }'. Did you mean to write 'name'?

t.rich('terms', { link: (chunks) => chunks })
// TS2345: ... Property 'strong' is missing ...
```

Как ICU-конструкция задаёт тип аргумента:

| В сообщении | Тип аргумента |
|---|---|
| `{name}` | `string` |
| `{n, number}`, `{n, plural, …}`, `{n, selectordinal, …}` | `number \| bigint` |
| `{d, date}`, `{d, time}` | `Date` |
| `{role, select, …}` | `string` (любая строка, лишние значения уходят в `other`) |
| `<tag>…</tag>` | функция-обработчик в `t.rich` / `t.markup`, все теги обязательны |

Практическое следствие: простой `{min}` типизируется как `string`, и `t('messageTooShort', { min: 10 })` не скомпилируется. Поэтому ошибки формы написаны как `{min, plural, …}`: тип становится числовым, а форма слова — правильной для ru/uk ([04-icu-messages.md](./04-icu-messages.md#плюралы-en--ru--uk)).

**Грабли с генерацией:**

- `en.d.json.ts` генерируют `next dev`, `next build` и `next typegen`. Файл в `.gitignore`, поэтому в чистом клоне и в CI его нет, и голый `tsc --noEmit` молча проверит аргументы по «рыхлым» типам. Отсюда скрипт `"typecheck": "next typegen && tsc --noEmit --incremental false"`. `next typegen` заодно генерирует типы маршрутов (`LayoutProps`, `PageProps`, `next/root-params`).
- Опция находится под `experimental` — следи за changelog next-intl при обновлениях.

**Чего типы не дают:** проверки, что `ru.json` и `uk.json` содержат те же ключи, аргументы и plural-категории, что `en.json`. Типы смотрят только на `en.json`. Паритет проверяет `npm run check:translations` ([14-testing.md](./14-testing.md)).

## Опционально: прекомпиляция сообщений

`experimental.messages.precompile` компилирует ICU-сообщения на этапе сборки в компактное JSON-представление. ICU-парсер из бандла уходит, его место занимает рантайм `icu-minify` примерно на 650 байт. По замерам next-intl это примерно −9 КБ сжатого JS, плюс форматирование ускоряется. На этом шаблоне клиентский JS `/ru/demo/plurals` с опцией тоже стал меньше на ≈9 КБ gzip. В шаблоне опция **не включена**:

- она экспериментальная, и официальный example next-intl её тоже не включает;
- `t.raw` с ней не работает. Это ещё одна причина не хранить массивы в сообщениях ([04-icu-messages.md](./04-icu-messages.md#массивы-необязательные-ключи-traw-и-thas));
- после импорта сообщения — уже не ICU-строки, а скомпилированное представление: `Hello {name}!` превращается в `["Hello ", ["name"], "!"]`, простые строки остаются строками. Код, который читает или трансформирует исходные строки сообщений в рантайме, сломается.

Если решишь включить, добавь в `experimental` плагина (пример):

```ts
messages: {
  path: './src/shared/i18n/messages',
  format: 'json',
  locales: 'infer', // required by the types, though the docs snippet omits it
  precompile: true,
},
```

Loader обрабатывает JSON, импортированный через `import()`, — именно так грузит `loadMessages`. В проверке на этом шаблоне сборка проходила, а per-key fallback через `deepMerge` продолжал работать.

Ещё одна экспериментальная альтернатива — `useExtracted`: ключи генерируются из текста в исходниках, а `en.json` пишется автоматически. Это другая модель работы со словарями, в шаблоне не используется.

## Чек-лист при добавлении перевода

1. Ключ — в `en.json`, затем в `ru.json` и `uk.json` с теми же аргументами и тегами.
2. Компонент async → `getTranslations`; не-async серверный → `useTranslations`.
3. Client Component? Сначала попробуй передать готовый текст пропом. Если нужен `t()` на клиенте — добавь namespace в `<ClientMessages>` на странице.
4. `npm run check:translations && npm run typecheck`, затем `npm run build` и `npm run test:e2e` (e2e идут по production-сборке).
