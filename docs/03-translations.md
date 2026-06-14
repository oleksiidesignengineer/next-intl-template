# Переводы

> Для переводов внутри Server Actions (zod-сообщения валидации, `getLocale()` в action) см. [12-server-actions.md](./12-server-actions.md).

## `useTranslations` vs `getTranslations`

| Контекст | Хук/функция | Импорт | async? |
|---|---|---|---|
| Client Component | `useTranslations` | `'next-intl'` | нет |
| Server Component | `getTranslations` | `'next-intl/server'` | да |
| `generateMetadata` | `getTranslations({ locale, namespace })` | `'next-intl/server'` | да |

Оба возвращают функцию `t`, которая принимает ключ и опционально объект интерполяции. API идентичен — разница только в контексте вызова.

```tsx
// Server Component
import { getTranslations } from 'next-intl/server'

export default async function Page() {
  const t = await getTranslations('home')
  return <h1>{t('title')}</h1>
}
```

```tsx
// Client Component
'use client'
import { useTranslations } from 'next-intl'

export default function Banner() {
  const t = useTranslations('home')
  return <p>{t('description')}</p>
}
```

## Namespace'ы

### Вариант 1 — namespace в хуке (рекомендуемый)

```ts
const t = useTranslations('home')
t('title')         // читает home.title
t('links.about')   // читает home.links.about
```

Это основной способ: TypeScript проверяет все ключи внутри namespace `home`.

### Вариант 2 — без namespace

```ts
const t = useTranslations()
t('home.title')    // читает home.title
t('about.body')    // читает about.body
```

Полезно, когда на одной странице нужны ключи из нескольких namespace'ов. Но теряется удобство автокомплита (TypeScript всё равно всё проверяет, просто ключ длиннее).

## `getTranslations({ locale, namespace })` в `generateMetadata`

```ts
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'about' })
  return {
    title: t('seo.title'),
    description: t('seo.description'),
  }
}
```

В `generateMetadata` `locale` нужно передавать **явно**. На этапе генерации метадаты request context ещё не привязан к компоненту — `setRequestLocale` не вызван. Без явного `locale` next-intl не знает, какую локаль использовать.

## Fallback на defaultLocale

Если ключ есть в `en.json`, но отсутствует в `ru.json`/`uk.json`, шаблон показывает английский текст вместо пути ключа.

Важно: **это НЕ дефолт next-intl.** Сам next-intl грузит только активную локаль и для пропавшего ключа отрендерил бы путь (`home.newKey`), без перехода на английский. Fallback включён вручную в `request.ts` — функция `loadMessages` глубоким merge накладывает словарь активной локали поверх `defaultLocale`:

```ts
// упрощённо, src/shared/i18n/request.ts
const messages =
  locale === routing.defaultLocale
    ? current
    : deepMerge(defaultMessages, current) // ключи current перекрывают; отсутствующие берутся из en
```

Поэтому:

- ключ, забытый в `ru.json`, но присутствующий в `en.json`, показывается на английском — **без** ошибки и без missing-warning (после merge ключ уже существует);
- `getMessageFallback` / `onError` (см. [01-setup.md](./01-setup.md)) срабатывают, только когда ключа нет И в активной локали, И в дефолтной — тогда в dev виден маркер `[!ns.key]`, а в prod рендерится путь ключа.

Не нужен fallback? Убери merge в `loadMessages` — вернётся дефолтное поведение next-intl (путь ключа для пропавших переводов).

## Типобезопасность

### `src/global.d.ts`

```ts
import type messages from './shared/i18n/messages/en.json'
import type { formats } from './shared/i18n/request'
import type { routing } from './shared/i18n/routing'

declare module 'next-intl' {
  interface AppConfig {
    Messages: typeof messages
    Locale: (typeof routing.locales)[number]
    Formats: typeof formats
  }
}
```

Augmentation модуля `next-intl` сообщает TypeScript структуру сообщений, список допустимых локалей и имена глобальных форматов (`Formats` — см. [05-formatting.md](./05-formatting.md)).

**Почему `(typeof routing.locales)[number]` вместо hardcoded union `'en' | 'ru' | 'uk'`:**

- **Единственный источник правды** — список локалей живёт в `routing.ts` и нигде больше. `global.d.ts` его не дублирует, а ссылается.
- **Автоматическое распространение** — добавляешь новую локаль в `routing.ts`, тип `Locale` обновляется автоматически во всём проекте без дополнительных правок.
- **Молчаливая рассинхронизация невозможна** — hardcoded union легко забыть обновить при добавлении локали; тогда TypeScript не выдаст ошибку, но runtime-поведение будет расходиться с типами.

**Что даёт:**
- Автокомплит ключей в `useTranslations('home')` → `t('title')` — редактор подсказывает только допустимые ключи.
- `useLocale()` возвращает `'en' | 'ru' | 'uk'` вместо `string`.
- Ошибка компиляции при опечатке в namespace или ключе.

**Что НЕ даёт:**
- TypeScript не проверяет, что `ru.json` и `uk.json` содержат **все** ключи из `en.json`. Типы привязаны только к `en.json`. Отсутствующие ключи в других локалях покрываются runtime-fallback на `defaultLocale` (см. выше), но компилятор о расхождении не предупредит.

**Как принудительно проверить совпадение ключей** — в шаблоне есть скрипт `npm run check:translations` (`scripts/check-translations.ts`): он рекурсивно сравнивает ключи `en.json` со всеми остальными файлами локалей и падает с ненулевым exit code при расхождении. Удобно подключить в CI.

## Грабли

**Динамический namespace** — нельзя делать `useTranslations(\`pages.${name}\`)`. TypeScript теряет информацию о типах, потому что не может статически вывести, какой именно namespace будет подставлен. Вместо этого передавай namespace статической строкой:

```ts
// Плохо — типы потеряны
const t = useTranslations(`pages.${name}`)

// Хорошо — каждый namespace явно
const t = useTranslations('pages')
return t(name as keyof typeof messages['pages'])
```

Второй вариант тоже не идеален, но хотя бы позволяет сузить тип вручную.

## Селективная передача сообщений на клиент

По умолчанию `NextIntlClientProvider` без `messages` prop отдаёт на клиент **весь словарь** через server context. Для 100+ namespaces это значит десятки КБ лишнего JS на каждой странице.

Шаблон использует pick-паттерн в `src/app/[locale]/layout.tsx`:

```tsx
const CLIENT_NAMESPACES = [
  'common', 'notFound', 'error',
  'plurals', 'formats', 'contact',
] as const

function pickNamespaces(messages, keys) {
  const result = {}
  for (const key of keys) {
    if (key in messages) result[key] = messages[key]
  }
  return result
}

const allMessages = await getMessages()
const clientMessages = pickNamespaces(allMessages, CLIENT_NAMESPACES)

<NextIntlClientProvider messages={clientMessages}>...
```

**Правило**: добавляешь новый Client Component, использующий `useTranslations('foo')` — добавляешь `'foo'` в `CLIENT_NAMESPACES`. Server Components переводы получают через `getTranslations()` напрямую с сервера, на клиент они не идут.

Альтернатива — `lodash/pick`, но 6 строк своего хелпера избавляют от зависимости.
