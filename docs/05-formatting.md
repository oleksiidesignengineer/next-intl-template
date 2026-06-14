# Форматирование

## `useFormatter` / `getFormatter`

Типобезопасные обёртки над стандартными браузерными API:

| Браузерный API | Метод formatter |
|---|---|
| `Intl.DateTimeFormat` | `format.dateTime(date, options)` |
| `Intl.NumberFormat` | `format.number(value, options)` |
| `Intl.RelativeTimeFormat` | `format.relativeTime(date, now)` |
| `Intl.ListFormat` | `format.list(items, options)` |

```tsx
// Server Component
import { getFormatter } from 'next-intl/server'

export default async function Page() {
  const format = await getFormatter()
  return <p>{format.dateTime(new Date(), 'short')}</p>
}
```

```tsx
// Client Component
'use client'
import { useFormatter } from 'next-intl'

export default function Widget() {
  const format = useFormatter()
  return <p>{format.number(99.95, 'currency')}</p>
}
```

## Глобальные `formats` в `request.ts`

В `src/shared/i18n/request.ts` определены именованные шаблоны форматирования:

```ts
formats: {
  dateTime: {
    short: { day: 'numeric', month: 'short', year: 'numeric' },
    long: {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  },
  number: {
    currency: { style: 'currency', currency: 'EUR' },
    percent: { style: 'percent', maximumFractionDigits: 1 },
  },
},
```

Вместо того чтобы каждый раз передавать объект опций, ссылаешься на имя шаблона строкой. Это даёт два преимущества:

- **DRY** — меняешь формат валюты в одном месте (`request.ts`), он применяется везде.
- **Type-safe имена** — `formats` экспортируется из `request.ts` и подключён в `global.d.ts` как `Formats: typeof formats` (`AppConfig['Formats']`). Поэтому TypeScript знает допустимые имена: `format.number(x, 'currency')` проходит, а `format.number(x, 'currancy')` — ошибка компиляции, плюс автокомплит имён.

> Без augment-а `AppConfig['Formats']` имена форматов типизированы как обычный `string` — DRY работает, но проверки опечаток нет. В шаблоне augment включён, поэтому проверка действует.

## Примеры форматирования

Из `src/app/[locale]/demo/formats/page.tsx`:

```tsx
const SAMPLE_DATE = new Date('2026-03-15T18:30:00Z')
const format = useFormatter()
const now = useNow({ updateInterval: 1000 })

format.dateTime(SAMPLE_DATE, 'short')    // "15 Mar 2026" / "15 мар. 2026 г."
format.dateTime(SAMPLE_DATE, 'long')     // "15 March 2026 at 20:30" / "15 марта 2026 г., 20:30"

format.number(1234567.89)                // "1,234,567.89" / "1 234 567,89"
format.number(99.95, 'currency')         // "€99.95" / "99,95 €"
format.number(0.872, 'percent')          // "87.2%" / "87,2 %"

format.relativeTime(SAMPLE_DATE, now)    // "2 months ago" / "2 месяца назад"

format.list(['Apple', 'Pear', 'Orange'], { type: 'conjunction' })
// en: "Apple, Pear, and Orange"
// ru: "Apple, Pear и Orange"
// uk: "Apple, Pear і Orange"
```

`format.list` автоматически использует правильный союз для текущей локали.

## `useNow` и стабильная гидратация

**Проблема** — если вычислять `now` внутри компонента через `new Date()` или `Date.now()`, сервер и клиент получат разные значения. `relativeTime` вычисляется дважды — результаты расходятся → hydration mismatch.

**Решение 1 — `now: new Date()` в `getRequestConfig`** (в шаблоне уже сделано):

```ts
// src/shared/i18n/request.ts
return {
  now: new Date(),
  // ...
}
```

Значение фиксируется на момент render-запроса и одинаково и на сервере, и на клиенте при гидратации.

**Решение 2 — `useNow({ updateInterval })`** для живого обновления на клиенте:

```tsx
// src/app/[locale]/demo/formats/page.tsx
const now = useNow({ updateInterval: 1000 })
// ...
format.relativeTime(SAMPLE_DATE, now)
```

`useNow` возвращает `Date`, который обновляется каждые `updateInterval` миллисекунд. Подходит для счётчиков «N минут назад», которые должны обновляться без перезагрузки страницы. Первое значение совпадает с `now` из `getRequestConfig`, поэтому гидратация не ломается.

## Часовые пояса

В `src/shared/i18n/request.ts` задан глобальный timezone:

```ts
timeZone: 'Europe/Kyiv',
```

Это значение используется по умолчанию для всех вызовов `format.dateTime`. Если нужно переопределить для конкретного вызова:

```ts
format.dateTime(date, {
  timeZone: 'America/New_York',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
```

**Почему важно задать `timeZone` явно** — если не задать, форматирование будет использовать `process.env.TZ` сервера. На разных деплоях (Vercel, Docker, bare metal) это значение отличается, что приведёт к разным результатам форматирования и потенциальному hydration mismatch.

## Принудительная единица для `relativeTime`

По умолчанию `format.relativeTime(date, now)` выбирает наиболее подходящую единицу: «5 минут назад», «2 часа назад», «3 дня назад». Иногда хочется зафиксировать единицу — например, всегда в днях для блог-индекса:

```tsx
// Всегда «N дней назад», независимо от точной разницы
format.relativeTime(post.publishedAt, { now, unit: 'day' })
```

Поддерживаемые единицы — `'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'`.

Также есть `format.dateTimeRange(start, end, options)` для интервалов («20 мар 09:00 – 17:00») — полезно для бронирований и событий.
