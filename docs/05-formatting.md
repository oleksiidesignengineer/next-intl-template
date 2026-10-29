# Форматирование: даты, числа, списки, относительное время

Всё форматирование в шаблоне идёт через `Intl` с конфигом из [src/shared/i18n/request.ts](../src/shared/i18n/request.ts). Там лежат три вещи, которые влияют на вывод: `formats` (именованные шаблоны), `timeZone` и `now`. Живой пример — `/demo/formats`: страница [src/app/[locale]/demo/formats/page.tsx](../src/app/[locale]/demo/formats/page.tsx) форматирует на сервере, а клиентский островок [LiveRelativeTime.tsx](../src/app/[locale]/demo/formats/_components/LiveRelativeTime.tsx) пересчитывает относительное время на клиенте.

Главное правило: **форматируй на сервере**. На клиент уходит только то, что должно меняться без перезагрузки страницы.

## `getFormatter` и `useFormatter`

| API | Импорт | Где работает |
|---|---|---|
| `getFormatter()` | `next-intl/server` | async Server Components, `generateMetadata` |
| `getFormatter({ locale })` | `next-intl/server` | там, где нет root params: Server Actions, Route Handlers, OG-картинки ([12-server-actions.md](./12-server-actions.md)) |
| `useFormatter()` | `next-intl` | Client Components и не-async Server Components |

Оба API читают один и тот же конфиг: `locale`, `timeZone`, `formats`, `now`. Client Components получают его от `NextIntlClientProvider`, который [layout](../src/app/[locale]/layout.tsx) рендерит через `<ClientMessages namespaces={['error']}>`. Провайдер рендерится из Server Component и сериализует клиенту `formats`, `timeZone` и `now` независимо от `messages`. Поэтому островку, который только форматирует (как `LiveRelativeTime`), обёртка `<ClientMessages>` не нужна: она отвечает лишь за переводы ([03-translations.md](./03-translations.md)).

Почему по умолчанию на сервере:

- **Нет JS.** Готовая строка приходит в HTML, клиенту ничего не нужно считать.
- **Одна ICU.** На сервере строку один раз считает ICU из Node. Клиентский компонент при гидрации форматирует ту же дату заново, уже движком браузера. Если данные CLDR или их обработка в движках различаются, текст разойдётся, и React выдаст hydration error. Это не теория: `format.dateTimeRange(SAMPLE_DATE, SAMPLE_RANGE_END, 'short')` в Node 24 даёт «Mar 15 – 22, 2026» с U+2009 вокруг тире, а Chromium, Firefox и WebKit выдают ту же строку с обычными пробелами. Тот же вызов в клиентском островке на production-сборке дал React error #418 (hydration mismatch) во всех трёх браузерах. По той же причине `LangSwitcher` получает названия языков пропами с сервера ([06-navigation.md](./06-navigation.md)).

Из демо-страницы:

```tsx
  const format = await getFormatter()

  const rows = [
    [t('date'), format.dateTime(SAMPLE_DATE, 'short')],
    [t('dateLong'), format.dateTime(SAMPLE_DATE, 'long')],
    [t('dateWithTime'), format.dateTime(SAMPLE_DATE, 'withTime')],
    [t('dateRange'), format.dateTimeRange(SAMPLE_DATE, SAMPLE_RANGE_END, 'short')],
```

Методы форматтера соответствуют стандартным API:

| Метод | Под капотом |
|---|---|
| `format.dateTime(value, format?, overrides?)` | `Intl.DateTimeFormat#format` |
| `format.dateTimeRange(start, end, format?, overrides?)` | `Intl.DateTimeFormat#formatRange` |
| `format.number(value, format?, overrides?)` | `Intl.NumberFormat` |
| `format.relativeTime(date, nowOrOptions?)` | `Intl.RelativeTimeFormat` |
| `format.list(items, format?, overrides?)` | `Intl.ListFormat` |
| `format.displayName(code, format, overrides?)` | `Intl.DisplayNames` (второй аргумент обязателен) |

Второй аргумент — либо имя глобального формата, либо объект опций. Третий (`overrides`) дописывает опции поверх именованного формата:

```ts
// Example: a named format plus one overridden option
format.dateTime(date, 'short', { timeZone: 'America/New_York' })
```

## Глобальные `formats`

```ts
export const formats = {
  dateTime: {
    short: { day: 'numeric', month: 'short', year: 'numeric' },
    long: { day: 'numeric', month: 'long', year: 'numeric' },
    withTime: {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      // 'numeric', not '2-digit': "8:30 PM" in en, "20:30" in ru/uk.
      hour: 'numeric',
      minute: '2-digit',
    },
  },
  number: {
    currency: { style: 'currency', currency: 'EUR' },
    percent: { style: 'percent', maximumFractionDigits: 1 },
  },
} satisfies Formats
```

Объект экспортируется из [request.ts](../src/shared/i18n/request.ts) и передаётся в конфиг (`formats,` в `return` у `getRequestConfig`). Его тип подключён в [src/global.d.ts](../src/global.d.ts):

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

Что это даёт:

- **Одно место.** Формат валюты или даты меняется в одном файле и применяется в `format.*` и в сообщениях.
- **Проверка имён.** `format.number(x, 'currancy')` не компилируется (TS2769), в ошибке перечислены допустимые `"currency" | "percent"`. Без augment `Formats` имена типизированы как `string`, и опечатка всплывёт только в рантайме: `MISSING_FORMAT` в `onError`, а вместо результата получишь `String(value)`.
- **Проверка опций.** `satisfies Formats` ловит опечатки внутри шаблонов: `stlye: 'currency'` даёт TS2561. При этом литеральные имена форматов сохраняются, так что `as const` не нужен. Если написать просто `as const`, опечатки в опциях проходят молча.

Кроме `dateTime` и `number`, тип `Formats` допускает `list` и `displayName`. Их можно вызывать через `format.list(items, 'name')` и `format.displayName(code, 'name')`, но в ICU-сообщениях они недоступны.

### Имена `short`, `long`, `currency`, `percent` перекрывают стили ICU

В `format.*` имя просто ссылается на глобальный формат. В аргументах сообщений глобальный формат с именем встроенного ICU-стиля накладывается на этот стиль по полям: его опции перекрывают одноимённые опции стиля, а остальные опции стиля остаются. Поэтому `long: { year: 'numeric' }` не сократит `{d, date, long}` до года: вывод останется «March 15, 2026». Это штатный приём из документации next-intl (в её примере `{orderDate, date, short}` ссылается на глобальный `short`), но о нём легко забыть. Замер на `en`, `SAMPLE_DATE` из демо:

| Сообщение | С `formats` шаблона | Без глобальных `formats` |
|---|---|---|
| `{d, date, short}` | Mar 15, 2026 | 3/15/26 |
| `{d, date, long}` | March 15, 2026 | March 15, 2026 |
| `{d, time, short}` | Mar 15, 2026, 8:30 PM | 8:30 PM |
| `{p, number, percent}` при 0.8723 | 87.2% | 87% |

Обрати внимание на третью строку. Глобальные `dateTime`-форматы подставляются и в `date`, и в `time`, поэтому `{d, time, short}` с датовым `short` выводит дату вместе со временем.

Отсюда раскладка шаблона: `short` и `long` содержат только дату, время вынесено в отдельный `withTime`. Сообщение `blog.publishedOn` (`"Published on {date, date, long}"`) поэтому выводит «Published on May 10, 2026» без времени. Будь в `long` часы, они попали бы в каждую дату публикации. Синтаксис ICU и скелетоны (`{count, number, ::compact-short}`) разобраны в [04-icu-messages.md](./04-icu-messages.md).

### Валюта

`currency: 'EUR'` задан один на все локали. Знак берётся из CLDR для пары «локаль + валюта», поэтому вывод разный:

| Локаль | `format.number(99.95, 'currency')` | с `currencyDisplay: 'narrowSymbol'` |
|---|---|---|
| en | €99.95 | €99.95 |
| ru | 99,95 € | 99,95 € |
| uk | 99,95 EUR | 99,95 € |

В украинских данных CLDR у евро нет символа для стиля `symbol`, поэтому «99,95 EUR» — правильный вывод, а не баг. Нужен везде знак — добавь `currencyDisplay: 'narrowSymbol'`. С гривной обратная картина: `{ currency: 'UAH' }` даёт «99,95 ₴» в uk и ru, но «UAH 99.95» в en.

Валюта — бизнес-данные, а не свойство локали. Форматтер ничего не конвертирует, он только рисует сумму. Если цены хранятся в разных валютах, передавай валюту вместе с суммой при вызове:

```ts
// Example: the currency comes with the price, not from the locale
format.number(price.amount, 'currency', { currency: price.currency })
```

Проценты тоже различаются по CLDR: «87,2 %» в ru (с пробелом) и «87,2%» в uk.

## Реальный вывод `/demo/formats`

Значения сняты с production-сборки шаблона. `SAMPLE_DATE = 2026-03-15T18:30:00Z`, `SAMPLE_RANGE_END = 2026-03-22T18:30:00Z`, пояс `Europe/Kyiv`, поэтому в выводе 20:30.

| Вызов | en | ru | uk |
|---|---|---|---|
| `dateTime(SAMPLE_DATE, 'short')` | Mar 15, 2026 | 15 мар. 2026 г. | 15 бер. 2026 р. |
| `dateTime(SAMPLE_DATE, 'long')` | March 15, 2026 | 15 марта 2026 г. | 15 березня 2026 р. |
| `dateTime(SAMPLE_DATE, 'withTime')` | March 15, 2026 at 8:30 PM | 15 марта 2026 г. в 20:30 | 15 березня 2026 р. о 20:30 |
| `dateTimeRange(SAMPLE_DATE, SAMPLE_RANGE_END, 'short')` | Mar 15 – 22, 2026 | 15–22 мар. 2026 г. | 15–22 бер. 2026 р. |
| `relativeTime(SAMPLE_DATE, SAMPLE_RANGE_END)` | 1 week ago | 1 неделю назад | 1 тиждень тому |
| `number(1234567.89)` | 1,234,567.89 | 1 234 567,89 | 1 234 567,89 |
| `number(1234567.89, { notation: 'compact' })` | 1.2M | 1,2 млн | 1,2 млн |
| `number(99.95, 'currency')` | €99.95 | 99,95 € | 99,95 EUR |
| `number(0.872, 'percent')` | 87.2% | 87,2 % | 87,2% |
| `list(['Apple', 'Pear', 'Orange'], { type: 'conjunction' })` | Apple, Pear, and Orange | Apple, Pear и Orange | Apple, Pear і Orange |

На что обратить внимание:

- **`hour: 'numeric'`** в `withTime` даёт в en «8:30 PM». С `hour: '2-digit'` было бы «08:30 PM». В ru и uk в обоих случаях будет 20:30.
- **Пробелы.** Часть пробелов в выводе — не U+0020. Разделитель тысяч в ru и uk, пробел перед «€»/«EUR» и перед «%» в ru — U+00A0 (неразрывный). В выводе `dateTimeRange` Node ставит U+2009 вокруг тире в en и U+202F перед «г.»/«р.» в ru/uk, а также перед AM/PM. В `format.dateTime` перед AM/PM у Node обычный пробел (`withTime` выше). Playwright в `getByText`/`toHaveText` нормализует пробелы, поэтому e2e ищет `'99,95 EUR'` с обычным пробелом и проходит. А вот `===` в unit-тесте или сравнение снапшотов на этом упадёт.
- **Версия ICU.** Вывод зависит от ICU/CLDR рантайма (Node на сервере и при сборке, браузер у клиента). После обновления Node строки могут поменяться, а тесты с точными строками — покраснеть.

## `dateTimeRange`

`formatRange` склеивает общие части интервала: «Mar 15 – 22, 2026» вместо «Mar 15, 2026 – Mar 22, 2026». Для бронирований и событий в пределах дня это особенно заметно:

```ts
// Example: same-day event, start 2026-03-20T07:00:00Z, end 2026-03-20T15:00:00Z, Europe/Kyiv
format.dateTimeRange(start, end, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
// en: "Mar 20, 9:00 AM – 5:00 PM"
// ru: "20 мар., 09:00–17:00"
```

В en диапазон выводит «9:00», а не «09:00», несмотря на `hour: '2-digit'`, хотя `format.dateTime` с теми же опциями даёт «Mar 20, 09:00 AM». Этот диапазон одинаков в Node, Chromium, Firefox и WebKit, а остальное расходится: WebKit пишет тот же `dateTime` как «Mar 20 at 09:00 AM», а ru-диапазон из демо — как «15—22 марта 2026 г.» (длинное тире, полный месяц). Точные строки диапазонов в тестах не фиксируй.

`dateTimeRange` принимает те же именованные `dateTime`-форматы и `overrides`, что и `dateTime`.

## Относительное время и `now`

`format.relativeTime(date, now)` всегда считает разницу от опорной точки `now`. Единица выбирается автоматически: до минуты — секунды, до часа — минуты, дальше часы, дни, недели, месяцы, годы. Значение округляется. Зафиксировать единицу можно так:

```ts
// Example: always "N days ago" on a blog index; publishedAt is an ISO string
format.relativeTime(new Date(post.publishedAt), { now, unit: 'day' })
```

`relativeTime` принимает `Date | number`. Строку ISO сначала оберни в `new Date(...)`, иначе получишь ошибку типов.

Если `now` не передан, берётся глобальный `now` из `request.ts`. Без глобального `now` поведение различается: на сервере next-intl молча подставит `new Date()` момента рендера, а на клиенте вызовет `onError` с `ENVIRONMENT_FALLBACK` (по умолчанию это `console.error`) и тоже возьмёт текущее время.

### `now: new Date()` в `request.ts` — на SSG это время сборки

```ts
    timeZone: 'Europe/Kyiv',
    // A shared `now` keeps server-rendered relative times and the client's
    // useNow() consistent during hydration. On statically rendered pages it is
    // the time of the build — useNow({ updateInterval }) refreshes it.
    // Remove it when enabling `cacheComponents`: new Date() during prerender
    // fails the build there. The other steps of that switch are listed in
    // docs/02-app-router.md (Cache Components).
    now: new Date(),
```

Все страницы под `[locale]`, кроме catch-all `[...rest]` (он только вызывает `notFound()`), пререндерятся при сборке ([02-app-router.md](./02-app-router.md)), так что `new Date()` вычисляется в момент пререндера каждой страницы. Это значение вшивается в HTML и в RSC-payload, например `"now":"$D2026-10-29T13:57:56.461Z"` в `.next/server/app/en/demo/formats.rsc` (в `formats.html` то же значение с экранированными кавычками), и не меняется до следующей сборки (или ревалидации, если включишь ISR). Это **не** момент запроса.

Отсюда первое правило: **на статической странице не считай относительное время на сервере от `now`**. `format.relativeTime(date)` в Server Component покажет «3 days ago» относительно сборки и будет показывать это неделями. Поэтому демо передаёт явную опорную дату:

```tsx
    // An explicit reference date keeps static output stable. Against `now`
    // it would be frozen at build time on this statically rendered page.
    [t('relative'), format.relativeTime(SAMPLE_DATE, SAMPLE_RANGE_END)],
```

Для дат публикаций и подобного показывай абсолютную дату (`format.dateTime`, `{date, date, long}`): на SSG она не устаревает.

Зачем тогда `now` вообще нужен — ради гидрации клиентских островков. Начальное значение `useNow()` в use-intl — `useState(globalNow || getNow())`. С глобальным `now` и пререндер, и гидрация в браузере стартуют с одного и того же `Date`, поэтому текст совпадает. Без него пререндер возьмёт время сборки, а браузер — текущее время. Любая строка, которая зависит от `now`, разойдётся при гидрации, как только разница во времени изменит вывод.

`now` нужно убрать, если включаешь Cache Components: там `new Date()` во время пререндера валит сборку. Что ещё меняется в этом режиме, описано в [02-app-router.md](./02-app-router.md).

### `useNow` и живое обновление

| Вызов | Что возвращает |
|---|---|
| `useNow()` | глобальный `now` (стабилен между рендерами) |
| `useNow({ updateInterval: 1000 })` | сначала глобальный `now`, затем каждые `updateInterval` мс — текущее время браузера (только в Client Components) |
| `await getNow()` | глобальный `now` на сервере, без него — `new Date()` момента рендера |

В Server Component `updateInterval` игнорируется, а next-intl пишет об этом в `console.error`. Тикающему времени место только в клиентском островке.

Островок из демо:

```tsx
export function LiveRelativeTime({ date }: { date: Date }) {
  const format = useFormatter()
  const now = useNow({ updateInterval: 1000 })

  return <time dateTime={date.toISOString()}>{format.relativeTime(date, now)}</time>
}
```

Страница передаёт фиксированную дату (`<LiveRelativeTime date={SAMPLE_DATE} />`) и оборачивает островок в `<Suspense fallback={null}>`. `Suspense` — задел под Cache Components: в этом режиме клиентский компонент, который читает текущее время, должен лежать внутри `<Suspense>`.

Так и строится живое «N минут назад» до даты из данных (`format.relativeTime(comment.createdAt, now)`). Первый кадр совпадает с HTML, потому что сервер и клиент считают от одного глобального `now`. С первым тиком интервала значение становится актуальным. На production-сборке шаблона в HTML приходит «7 months ago», и гидрация проходит без ошибок.

> **Грабли: первый кадр `useNow` на статической странице — это время сборки.** Первое значение `useNow({ updateInterval })` — глобальный `now`, то есть момент сборки. Реальное время приходит только с первым тиком интервала. При интервале 10–60 секунд устаревшее значение висит всё это время. Поэтому не фиксируй точку отсчёта через `useState(now)`, чтобы показать «время с момента открытия страницы»: на SSG это момент **сборки**. Замер на production-сборке: страница собрана в 14:25:32 UTC, открыта в 14:26:00. Островок с `useState(now)` сначала показал «now», а с первым тиком интервала — «28 seconds ago», и дальше счёт шёл от сборки. Если нужно именно «время с момента открытия», точку отсчёта и текущее время бери из часов браузера уже после гидрации, а первый кадр рендери нейтральным плейсхолдером.

## Часовой пояс

```ts
    timeZone: 'Europe/Kyiv',
```

Пояс применяется к `format.dateTime`/`dateTimeRange` и ко всем аргументам `{x, date, …}`/`{x, time, …}` в сообщениях, включая скелетоны. Например, `2026-03-15T23:30:00Z` в `{d, date, long}` (ru) при `Europe/Kyiv` даёт «16 марта 2026 г.», а при UTC — «15 марта 2026 г.».

**Почему задан явно.** Без него next-intl на сервере берёт `Intl.DateTimeFormat().resolvedOptions().timeZone` процесса: на SSG это пояс машины сборки (в CI это часто UTC), при динамическом рендере — пояс сервера. Клиент при этом получает тот же пояс от провайдера, отрендеренного Server Component, так что hydration mismatch не будет. Проблема в другом: вывод зависит от окружения. `SAMPLE_DATE` в формате `withTime` при `Europe/Kyiv` даёт «March 15, 2026 at 8:30 PM», а при UTC — «6:30 PM». Локальная сборка и сборка в CI выдадут разный HTML.

У use-intl есть предупреждения `ENVIRONMENT_FALLBACK` про пояс: «There is no `timeZone` configured, this can lead to markup mismatches…» из `useTranslations` при серверном рендере и «The `timeZone` parameter wasn't provided…» из форматтера. Оба срабатывают, только когда в контексте нет `timeZone`. Так бывает, если провайдер рендерится **не** из Server Component и пояс ему не передан. В этом шаблоне такого провайдера нет.

Фиксированный пояс — продуктовое решение: все посетители, включая en, видят время по Киеву. Варианты:

- **Пояс места события.** Для расписаний и мероприятий обычно правильно показывать время там, где событие проходит, и подписывать пояс: `{ day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }` даёт «Mar 15, 8:30 PM GMT+2».
- **Пояс по локали** (`timeZone: locale === 'uk' ? 'Europe/Kyiv' : 'UTC'`). SSG сохраняется, потому что локаль известна при пререндере. Но язык ≠ пояс: русскоязычные пользователи живут в десятке поясов.
- **Пояс пользователя на сервере.** Клиент пишет cookie, `request.ts` её читает:

  ```ts
  // Example — NOT in the template: per-user time zone from a cookie.
  // cookies() is a request-time API: EVERY page under [locale] becomes dynamic.
  import { cookies } from 'next/headers'

  function isTimeZone(value: string | undefined): value is string {
    if (!value) return false
    try {
      new Intl.DateTimeFormat('en', { timeZone: value })
      return true
    } catch {
      return false
    }
  }

  // inside getRequestConfig:
  const tz = (await cookies()).get('tz')?.value
  // ...
  timeZone: isTimeZone(tz) ? tz : 'Europe/Kyiv',
  ```

  Цена большая: `cookies()` в `getRequestConfig` вызывается при рендере каждой страницы, и весь сайт уходит из статического рендера в динамический (Next.js docs, `cookies`: «Using it in a layout or page will opt a route into dynamic rendering»). На копии шаблона с этим кодом `next build` пометил `ƒ` все маршруты под `[locale]`, включая OG-картинки. При первом визите cookie ещё нет, так что сработает fallback. Значение валидируй: битый пояс в `Intl` бросает `RangeError`.
- **Пояс пользователя на клиенте, SSG сохраняется.** Нужное время форматируешь в маленьком островке после гидрации:

  ```tsx
  'use client'
  // Example — NOT in the template: visitor's time zone on a static page.
  import { useFormatter } from 'next-intl'
  import { useSyncExternalStore } from 'react'

  const subscribe = () => () => {}
  const getBrowserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone
  const getServerTimeZone = () => undefined

  export function LocalTime({ date }: { date: Date }) {
    const format = useFormatter()
    // Server render and hydration use the global zone, then React re-renders
    // with the browser's zone — no hydration mismatch.
    const timeZone = useSyncExternalStore(subscribe, getBrowserTimeZone, getServerTimeZone)
    return <time dateTime={date.toISOString()}>{format.dateTime(date, 'withTime', { timeZone })}</time>
  }
  ```

  `timeZone: undefined` в `overrides` означает «взять глобальный». Минус варианта — один кадр со временем по `Europe/Kyiv`. Если это мешает, рендери плейсхолдер, пока пояс не известен.

Прочитать текущий пояс можно через `useTimeZone()` / `await getTimeZone()`.

## Перенос в свой проект

1. Объяви `formats` в `request.ts` с `satisfies Formats`, экспортируй их и подключи `Formats: typeof formats` в `AppConfig` ([01-setup.md](./01-setup.md)).
2. Имена выбирай осознанно. `short`/`long`/`currency`/`percent` перекрывают ICU-стили в сообщениях, а `dateTime`-форматы действуют и на `{x, time, …}`. Время держи в отдельном формате.
3. Задай `timeZone` явно, иначе HTML будет зависеть от машины сборки.
4. `now: new Date()` оставляй, если на статических страницах есть клиентские островки с `useNow`. На сервере относительное время считай от явной опорной даты, а не от `now`. С Cache Components `now` убери.
5. Форматируй на сервере (`getFormatter`). `useFormatter` — для островков, которым действительно нужен клиент.
6. В тестах сравнивай строки с нормализацией пробелов. После обновления Node перепроверь ожидаемые строки. Как устроены e2e-проверки, описано в [14-testing.md](./14-testing.md).
