# Страницы ошибок и 404

Ошибки и 404 обрабатываются на трёх уровнях. Внутри локали страница переведена и выводится с шапкой. Ошибку root layout и запрос без локали показывает английский фолбэк: переводов там нет.

| Файл | Что ловит | Язык |
|---|---|---|
| [`src/app/[locale]/not-found.tsx`](../src/app/[locale]/not-found.tsx) | `notFound()` из страниц внутри `[locale]`, в том числе из catch-all `[...rest]`. Через catch-all сюда приходит и неизвестный slug: `dynamicParams = false` закрывает для него `blog/[slug]` | язык локали, с шапкой |
| [`src/app/[locale]/[...rest]/page.tsx`](../src/app/[locale]/[...rest]/page.tsx) | любой путь внутри локали, для которого нет открытого маршрута (`/ru/foo`, `/uk/blog/does-not-exist`), превращает его в `notFound()` | — |
| [`src/app/global-not-found.tsx`](../src/app/global-not-found.tsx) | URL, которому не соответствует ни один маршрут: значение `[locale]` вне `generateStaticParams` при `dynamicParams = false` (`/unknown.txt`) | английский, `lang="en"` |
| [`src/app/not-found.tsx`](../src/app/not-found.tsx) | `notFound()` из `request.ts` для невалидного значения `[locale]` в маршруте, который рендерится по запросу (`/api/foo`) | английский, без `lang` |
| [`src/app/[locale]/error.tsx`](../src/app/[locale]/error.tsx) | ошибки рендера страниц и вложенных layout | язык локали |
| [`src/app/global-error.tsx`](../src/app/global-error.tsx) | ошибки в root layout `[locale]/layout.tsx` | английский |

## Какой URL куда попадает

Замер на production-сборке (`next start`), с временным логированием в `request.ts`, `blog/[slug]` и `[...rest]`:

| Запрос | Что происходит | Результат |
|---|---|---|
| `/ru/foo`, `/ru/xx/about` | proxy узнаёт локаль `ru` → `[locale]/[...rest]` → `notFound()` | 404, `[locale]/not-found.tsx` на русском, `lang="ru"`, с шапкой |
| `/uk/blog/does-not-exist` | slug нет в `generateStaticParams`, а `dynamicParams = false` из `[locale]/layout.tsx` действует и на `blog/[slug]`: для этого URL маршрут закрыт, страница не вызывается. URL достаётся `[locale]/[...rest]` (`rest` = `blog/does-not-exist`), и `notFound()` вызывает он. Без `[...rest]` ответом была бы английская `global-not-found`. `notFound()` в странице — страховка на случай, если строку `dynamicParams = false` убрать | 404, `[locale]/not-found.tsx` на украинском |
| `/xx`, `/xx/about` | `xx` для proxy не локаль, а обычный сегмент пути без префикса. Без предпочтений это rewrite на `/en/xx/about`. С cookie или `Accept-Language` для `ru` — 307 на `/ru/xx/about` | 404, локализованная, на языке посетителя |
| `/unknown.txt`, `/api` | matcher proxy пропускает путь с точкой и `/api`. Единственный сегмент становится `[locale]`, его нет в `generateStaticParams`, и при `dynamicParams = false` маршрута для URL нет. Next.js отдаёт пререндеренный `global-not-found`, `request.ts` не вызывается | 404, `src/app/global-not-found.tsx`, английский |
| `/foo.bar/baz`, `/api/foo`, `/blog/v1.2` | matcher пропускает и эти пути (точка, `/api`). Два сегмента совпадают с `[locale]/[...rest]`, который рендерится по запросу. `request.ts` получает `foo.bar`, `api` или `blog`, не находит их среди локалей и вызывает `notFound()` при рендере root layout | 404, `src/app/not-found.tsx`, английский |

До корневых 404 доходят только пути, которые пропускает matcher proxy. Любой другой путь proxy приводит к известной локали, и такой запрос получает локализованную страницу.

### Как выглядит ответ 404

На 404, которую Next.js строит во время запроса (`/ru/foo`, `/uk/blog/does-not-exist`, `/xx/about`, `/api/foo`), Next.js 16.4.3 отвечает оболочкой `<html id="__next_error__">` без `lang`, а в `<body>` нет разметки страницы, только скрипты. Саму страницу React рисует на клиенте из RSC payload. Статус 404 и `<meta name="robots" content="noindex">` в ответе при этом есть. Полный HTML с сервера получает только `global-not-found` (`/unknown.txt`, `/api`): он пререндерен при сборке. Так ведёт себя сам Next.js, а не next-intl и не `[locale]` как root layout: на минимальном приложении без next-intl с обычным `app/layout.tsx` и страницей, которая вызывает `notFound()`, ответ такой же. Что из этого следует:

- 404 проверяй в браузере, как делает e2e. `grep` по HTML найдёт текст только внутри payload;
- без JavaScript посетитель увидит пустую страницу. Для поисковиков это некритично: статус 404 и `noindex` на месте.

## `[locale]/not-found.tsx` — локализованная 404

```tsx
export default function NotFound() {
  const t = useTranslations('notFound')
  return (
    <section className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="text-8xl font-bold text-gray-500">404</div>
      <h1 className="text-2xl font-bold">{t('title')}</h1>
      <p className="text-gray-500">{t('description')}</p>
      <Link href="/" className="text-blue-600 hover:underline">
        {t('home')}
      </Link>
    </section>
  )
}
```

- **Это Server Component.** `useTranslations` работает и в не-async Server Components: next-intl сам подставляет серверную реализацию. Поэтому `'use client'` здесь не нужен, и namespace `notFound` не уходит на клиент. Замер: в payload `/ru/foo` есть только `error` из layout. Async-компоненту понадобился бы `getTranslations`. Правило целиком описано в [03-translations.md](./03-translations.md#usetranslations--не-только-клиентский-хук).
- **Рендерится внутри root layout**, поэтому у страницы есть шапка и правильные `<html lang>` и `dir`.
- `Link` из `@/shared/ui/Link` ведёт на главную текущей локали.
- `<meta name="robots" content="noindex">` Next.js добавляет сам. `<title>` берётся по умолчанию из layout (`site.name`, «Шаблон next-intl»). Вложенный `not-found` metadata не экспортирует: документация Next.js описывает поддержку `metadata` только у корневого `app/not-found` и `global-not-found`.

**Чего этот файл не ловит:** `notFound()` из `[locale]/layout.tsx`, а значит и из `request.ts`, который выполняется при рендере layout. `not-found` сегмента рендерится внутри layout этого сегмента ([документация](https://nextjs.org/docs/app/api-reference/file-conventions/not-found): «`not-found.js` renders between `loading.js` and `page.js`»), поэтому ошибку самого layout он не перехватывает. Невалидная локаль уходит на уровень выше, в корневую 404.

## `[locale]/[...rest]/page.tsx` — неизвестные пути внутри локали

```tsx
export default function CatchAllPage() {
  notFound()
}
```

Next.js рендерит `not-found.tsx` сегмента, только когда маршрут вызвал `notFound()`. Путь, которому не соответствует ни один маршрут, до него не доходит. Catch-all превращает любой неизвестный путь внутри локали в такой вызов. Без него `/ru/foo` и `/uk/blog/does-not-exist` получают английскую `global-not-found` без шапки и с `lang="en"`: так отвечает сборка, из которой `[...rest]` удалён. Тот же приём описан в документации next-intl («Catching unknown routes») и используется в официальном example.

Конкретные маршруты приоритетнее catch-all, поэтому `[...rest]` получает только те пути, которым ничего не соответствует.

## Корневые 404: запрос без локали

Корневая 404 нужна, когда в `[locale]` попало значение, которое не является локалью. Такое значение отсекают две проверки, и у каждой свой файл.

Первая — `export const dynamicParams = false` в [`[locale]/layout.tsx`](../src/app/[locale]/layout.tsx). Набор локалей и, по наследству, slug закрыт: маршрут не рендерит значение вне `generateStaticParams` и ничего не кладёт для него в кеш. Неизвестная локаль (`/unknown.txt`) получает пререндеренный `global-not-found.tsx`. Неизвестный slug страницу не вызывает и достаётся `[...rest]` (см. таблицу выше). Без этой строки страница рендерилась бы по запросу, и её 404 оседал бы в кеше по URL: на повторный запрос того же slug страница уже не вызывается. Открыть список ниже по дереву через `dynamicParams = true` нельзя, а с Cache Components экспорт не поддерживается ([02-app-router.md](./02-app-router.md#generatestaticparams)).

Вторая — проверка в [request.ts](../src/shared/i18n/request.ts). Она нужна для путей, которые рендерятся по запросу (`/api/foo` через `[...rest]`), и для Cache Components, где `dynamicParams` не поддерживается:

```ts
  if (!locale) {
    // The value of the [locale] segment of the root layout. Works during
    // static rendering — no setRequestLocale needed in pages/layouts.
    const param = await rootParams.locale()
    if (!hasLocale(routing.locales, param)) notFound()
    locale = param
  }
```

`notFound()` из `request.ts` бросается при рендере root layout. Внутри `[locale]` границы для него нет, и Next.js показывает корневой `src/app/not-found.tsx`.

Почему файлов два. `global-not-found` срабатывает только для URL, которому не соответствует ни один маршрут. `/api/foo` маршрут находит (`[locale]/[...rest]`), и `notFound()` бросает уже `request.ts` при рендере root layout. Такой вызов Next.js отдаёт корневому `not-found`, поэтому он нужен и рядом с `global-not-found`.

### `src/app/global-not-found.tsx` — URL без маршрута

`global-not-found.js` — экспериментальный file convention Next.js, включается флагом `experimental.globalNotFound` в [next.config.ts](../next.config.ts). Он рендерится вместо всего дерева, без layout. Документация Next.js называет его в том числе для root layout под динамическим сегментом (`app/[country]/layout.tsx`), то есть для структуры шаблона.

- **Свои `<html lang="en">` и `<body>`.** Layout над файлом нет, документ он рисует сам.
- **Экспорт `metadata` работает**: `title` и `description` заданы обычным `export const metadata`.
- **Пререндерится при сборке.** Поэтому `/unknown.txt` получает с сервера полный HTML, в отличие от остальных 404 ([выше](#как-выглядит-ответ-404)).
- **Стили инлайновые.** Глобальный CSS подключается в `[locale]/layout.tsx` и сюда не попадает.

### `src/app/not-found.tsx` — невалидная локаль из `request.ts`

- **Без `<html>` и `<body>`.** Root layout над файлом нет, и Next.js оборачивает его в свои `<html><body>`. Собственный `<html>` оказался бы вложенным и в dev даёт ошибку гидрации (см. комментарий в [global-not-found.tsx](../src/app/global-not-found.tsx)). Цена: у этой страницы нет `lang`.
- **`<title>` задан элементом.** Экспорт `metadata` здесь не применяется, а React поднимает `<title>` в `<head>`. e2e проверяет заголовок вкладки «Page not found» на `/api/does-not-exist`.
- **Стили инлайновые**, как и в `global-not-found`.

В обоих корневых файлах текст английский, а ссылка ведёт через `next/link` на `/`. Локали нет, переводов тоже, а на `/` proxy сам уведёт посетителя на его язык.

Сниппет из документации next-intl для этого случая (`import Error from 'next/error'` в Server Component) на Next.js 16.4.3 не собирается: «Export default doesn't exist in target module». Default export `next/error` есть только для Pages Router.

## `[locale]/error.tsx` — ошибки рендера внутри локали

```tsx
export default function ErrorBoundary({ error, retry }: Pick<ErrorInfo, 'error' | 'retry'>) {
  const t = useTranslations('error')

  useEffect(() => {
    // Wire this to your error tracker (Sentry, etc.) in production.
    console.error(error)
  }, [error])
```

- **Client Component обязателен.** Это требование Next.js: React error boundary работает только на клиенте.
- **Переводы приходят из layout.** `useTranslations('error')` работает, потому что [`[locale]/layout.tsx`](../src/app/[locale]/layout.tsx) отдаёт клиенту namespace `error`, и только его:

  ```tsx
          <ClientMessages namespaces={['error']}>
  ```

  Если в `error.tsx` понадобятся строки из другого namespace, добавь его в этот список. Иначе клиент получит `MISSING_MESSAGE` в консоли и путь ключа (`notFound.home`) вместо текста. e2e этого не заметит: тест границы после проверки на `TypeError` очищает `consoleErrors`. Поэтому новую строку добавь и в его проверки. Подробнее в [03-translations.md](./03-translations.md#почему-layout-отдаёт-только-error).
- **Охват.** Граница оборачивает страницы, вложенные layout и `not-found` своего сегмента. `[locale]/layout.tsx` в него не входит: по документации Next.js `error.js` «does **not** wrap the `layout.js` or `template.js` above it in the same segment». Ошибки самого layout ловит `global-error.tsx`.
- **`role="alert"`.** Скринридер объявит сообщение, и e2e находит границу по этой роли.

### `retry` и `reset`

| Функция | Что делает | Когда использовать |
|---|---|---|
| `retry()` | в transition вызывает `router.refresh()` и сбрасывает состояние ошибки: Server Components запрашиваются заново, сегмент перерисовывается | по умолчанию. Восстанавливает и после ошибки Server Component |
| `reset()` | только сбрасывает состояние ошибки и перерисовывает детей без нового запроса | редкие случаи. По документации Next.js после ошибки Server Component не поможет |

Устройство видно в `node_modules/next/dist/client/components/error-boundary.js`. Документация Next.js: «In most cases, you should use `retry()` instead».

**История имени.** `retry` появился в Next.js 16.2 как `unstable_retry` и стал стабильным в 16.3. Старое имя удалили без алиаса. Код с `unstable_retry` по-прежнему компилируется (props типизированы вручную), но клик по кнопке падает с `TypeError: … is not a function`. Поэтому props типизированы через `ErrorInfo` из `next/error`: если имя снова поменяется, ошибку покажет `tsc`.

**`error: unknown`.** В `ErrorInfo` поле `error` имеет тип `unknown`. Ошибка из Server Component приходит как `Error`, а Client Component может бросить любое значение. Прежде чем читать `message` или `digest`, сужай тип через `instanceof Error`. В production `message` у ошибок Server Components обобщённый, а `digest` совпадает с записью в серверных логах.

## Демо: `/demo/errors`

[`ErrorTrigger`](../src/app/[locale]/demo/errors/_components/ErrorTrigger.tsx) — Client Component, который после клика бросает ошибку при рендере:

```tsx
  const [shouldThrow, setShouldThrow] = useState(false)
  if (shouldThrow) throw new Error('Demo error thrown on purpose')
```

Ближайшая граница — `[locale]/error.tsx` — показывает переведённое сообщение. Кнопка «Спробувати знову» вызывает `retry()`, сегмент перерисовывается, `ErrorTrigger` монтируется заново с `shouldThrow = false`. Подпись кнопки `ErrorTrigger` переводится на сервере и приходит пропом, так что островку клиентские сообщения не нужны. Весь сценарий проверяет e2e ([forms-errors.spec.ts](../tests/e2e/forms-errors.spec.ts)): заголовок «Щось пішло не так», клик по «Спробувати знову», кнопка снова на месте. Страница помечена `noindex` и в sitemap не входит.

## `global-error.tsx` — ошибки root layout

Ловит то, до чего не дотягивается `[locale]/error.tsx`: ошибки в самом `[locale]/layout.tsx` и в том, что он рендерит вокруг страницы (`SiteHeader`, `ClientMessages`, `Toaster`). Например, ошибку при рендере бросил Client Component, который рендерит сам layout, как шапку. Ошибка layout во время пререндера сюда не доходит: на ней падает `next build` («Error occurred prerendering page»).

По документации Next.js:

- файл **заменяет** root layout, пока активен, поэтому рендерит свои `<html>`/`<body>`;
- глобальные стили не подключаются, поэтому стили в шаблоне инлайновые;
- `metadata` и `generateMetadata` не поддерживаются, потому что это Client Component. Вместо них можно использовать React `<title>`, в шаблоне он не задан.

next-intl здесь недоступен: `NextIntlClientProvider` живёт в том самом layout, который упал. Поэтому текст на английском. `retry` и `ErrorInfo` такие же, как в `error.tsx`.

e2e `global-error` не проверяет. Проверить вручную можно так: временно добавь в `[locale]/layout.tsx` Client Component, который бросает ошибку после клика (как `ErrorTrigger`), и нажми его на production-сборке. Откроется `global-error` с `lang="en"` и без шапки, а «Try again» вызовет `retry()` и вернёт страницу. Безусловный `throw` в layout для этого не годится: `next build` на нём падает.

## Логирование

Обе границы пишут `console.error(error)` в `useEffect`. В продакшне подключи трекер:

```tsx
// example: an error tracker in [locale]/error.tsx
useEffect(() => {
  Sentry.captureException(error)
}, [error])
```

- `captureException` принимает любое значение. Если `digest` нужен отдельно, сначала сузь тип: `error instanceof Error && 'digest' in error`.
- Пользователю показывай только переведённый `t('description')`, без `message`.
- В production ошибка Server Component приходит в клиентскую границу без исходного `message`, только с `digest`. Полную серверную ошибку лови на сервере, через `onRequestError` в [`instrumentation.ts`](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation#onrequesterror-optional).
- Ошибки переводов (`MISSING_MESSAGE` и другие) логирует `onError` в `request.ts`, но только на сервере. На клиенте `MISSING_MESSAGE` пишет в консоль обработчик next-intl по умолчанию. См. раздел про `onError` в [01-setup.md](./01-setup.md#ошибки-onerror-и-getmessagefallback).

## Опции, которых в шаблоне нет

### `catchError` — граница на уровне компонента

`catchError` из `next/error` стабилен с Next.js 16.3 (в 16.2 был `unstable_catchError`). Он создаёт error boundary вокруг любой части дерева, а не только вокруг сегмента маршрута. По документации Next.js `notFound()` и `redirect()` он не перехватывает, состояние ошибки сбрасывает при клиентской навигации, а `retry` у него работает так же, как в `error.tsx`. Пригодится, когда упавший виджет не должен ронять всю страницу.

Пропсы обёртки (кроме `children`) передаются в fallback. Значит, переведённые строки можно отдать пропами из Server Component, как в демо, без клиентских сообщений:

```tsx
// example: not in the template, type-checked with tsc
'use client'

import { catchError, type ErrorInfo } from 'next/error'

function WidgetFallback(props: { title: string; retryLabel: string }, { retry }: ErrorInfo) {
  return (
    <div role="alert">
      <p>{props.title}</p>
      <button type="button" onClick={() => retry()}>
        {props.retryLabel}
      </button>
    </div>
  )
}

export default catchError(WidgetFallback)
```

```tsx
// example: usage in a Server Component
const t = await getTranslations('error')

<WidgetBoundary title={t('title')} retryLabel={t('tryAgain')}>
  <Widget />
</WidgetBoundary>
```

### Ленивый `error.tsx`

По документации next-intl `error.tsx` загружается сразу после инициализации приложения. Чтобы код переводов не попадал в этот чанк, можно экспортировать ленивую ссылку:

```tsx
// example from the next-intl docs, not verified in the template
'use client'

import { lazy } from 'react'

// Move error content to a separate chunk and load it only when needed
export default lazy(() => import('./Error'))
```

Выигрыш зависит от того, что из next-intl уже лежит в общем клиентском чанке (навигация, другие островки). Измерь его до того, как внедрять.

### Cache Components и soft 404

`dynamicParams = false` с Cache Components не поддерживается, его придётся убрать из `[locale]/layout.tsx` и `opengraph-image.tsx`. Тогда неизвестные значения отсекают `notFound()` в `request.ts` и в страницах. С включённым `cacheComponents` первый запрос неизвестного slug вне `generateStaticParams` получает 200 с `noindex` вместо 404 (повторный — 404 из кеша): к моменту `notFound()` стрим ответа уже начался. Обходной путь — проверять slug в proxy, подробнее в [02-app-router.md](./02-app-router.md#cache-components).

## Как перенести в свой проект

1. В `request.ts` вызывай `notFound()` для значения `[locale]`, которое не прошло `hasLocale`. Если набор локалей закрыт и Cache Components не включены, добавь в root layout `generateStaticParams` и `dynamicParams = false`.
2. Добавь `[locale]/not-found.tsx` (Server Component с `useTranslations`) и `[locale]/[...rest]/page.tsx`.
3. Если `src/app/layout.tsx` нет: включи `experimental.globalNotFound`, добавь `src/app/global-not-found.tsx` со своими `<html lang>`/`<body>` и `metadata`, а для `notFound()` из `request.ts` — `src/app/not-found.tsx` без `<html>`/`<body>`, с `<title>` элементом.
4. Добавь `[locale]/error.tsx` с `Pick<ErrorInfo, 'error' | 'retry'>`. Его namespace должен быть в провайдере root layout.
5. Добавь `global-error.tsx` без next-intl, со своими `<html>`/`<body>` и инлайновыми стилями.
6. Если переходишь со старого Next.js, переименуй `unstable_retry` в `retry`. Там, где нужен повторный запрос, замени `reset` на `retry`.
7. Перенеси e2e-проверки: 404 из [routing.spec.ts](../tests/e2e/routing.spec.ts), граница ошибок и `retry` из [forms-errors.spec.ts](../tests/e2e/forms-errors.spec.ts). Как устроены тесты, описано в [14-testing.md](./14-testing.md).
