# Сохранение выбора локали (cookie + Route Handler)

## Проблема

`localeDetection: true` в `routing.ts` работает **только при первом заходе**. Proxy (`src/proxy.ts`) смотрит на заголовок `Accept-Language` и редиректит на подходящую локаль. Но если пользователь вручную выбрал русский, закрыл вкладку и открыл сайт снова — браузер снова шлёт `Accept-Language: en-US`, и middleware опять редиректит на английский. Выбор потерян.

## Решение: cookie `NEXT_LOCALE`

Proxy next-intl читает cookie `NEXT_LOCALE` **перед** `Accept-Language`. Если cookie есть — уважает её значение, редиректит не нужен.

**Хорошая новость**: cookie выставляется автоматически самим proxy, когда пользователь переходит между локалями через `<Link>` или `router.replace`. В шаблоне это делает `LangSwitcher`:

```tsx
// src/features/locale-switch/ui/LangSwitcher.tsx
router.replace({ pathname, params, query }, { locale: next })
```

Proxy перехватывает навигацию, видит смену локали, выставляет `Set-Cookie: NEXT_LOCALE=ru` в ответе. **Никакого дополнительного кода не нужно** — следующий визит уважает выбор.

## Когда нужен Route Handler `/api/locale`

Есть сценарии, где UI-навигации нет, но cookie нужно выставить:

**После login**: пользователь авторизовался, в его профиле в БД `preferredLocale: 'ru'`. Нужно синхронизировать cookie с профилем:
```ts
await fetch('/api/locale', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ locale: user.preferredLocale }),
})
router.refresh()
```

**Settings-страница**: пользователь меняет язык в настройках профиля, не переходя на новый URL. Route Handler + `router.refresh()` показывает новый язык на той же странице без перезагрузки.

**Мобильное приложение в WebView**: устанавливает локаль системно через endpoint, не через UI-навигацию.

**Внешний клиент**: SDK, Postman, тестовый скрипт — всё, что шлёт HTTP, но не ходит через React-навигацию.

## Разбор `src/app/api/locale/route.ts`

> **Контракт endpoint:** `/api/locale` только **ставит cookie** `NEXT_LOCALE` и НЕ перерисовывает текущую страницу. Так как страницы статически пререндерятся по локали, после успешного ответа клиент должен вызвать `router.refresh()` (или сделать полную навигацию), чтобы UI переключился. Ответ — `{ ok: true, locale }`. Подробнее — раздел «Revalidation после изменения cookie» ниже.

```ts
import { hasLocale } from 'next-intl'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_NAME, routing } from '@/shared/i18n/routing'

export async function POST(request: Request) {
  // 0. Same-origin guard — отклоняем cross-origin POST.
  //    Origin парсим защищённо: битый Origin → 403, а не 500 из new URL().
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  let originHost: string | null = null
  try {
    originHost = origin ? new URL(origin).host : null
  } catch {
    originHost = null
  }
  if (!originHost || !host || originHost !== host) {
    return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 })
  }

  // 1. Чтение JSON-body с защитой от malformed
  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // 2. Валидация locale через hasLocale (сужает unknown до Locale)
  const locale = (payload as { locale?: unknown })?.locale

  if (!hasLocale(routing.locales, locale)) {
    return NextResponse.json(
      { error: 'Invalid locale', allowed: routing.locales },
      { status: 400 }
    )
  }

  // 3. Выставление cookie
  const store = await cookies()
  store.set(LOCALE_COOKIE_NAME, locale, {
    maxAge: LOCALE_COOKIE_MAX_AGE, // 1 год, константа из routing.ts
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })

  return NextResponse.json({ ok: true, locale })
}
```

**Никогда не доверяй input снаружи** — `hasLocale(routing.locales, locale)` отсекает произвольные значения и одновременно сужает тип `locale` до `Locale`.

### Защита от CSRF

Route Handler меняет состояние сессии (cookie). Без проверки origin злонамеренный сайт может через `fetch('https://victim.com/api/locale', { method: 'POST', body: ... })` переключить локаль у любого посетителя.

Импакт здесь невелик (просто язык не тот), но для **любого** state-changing endpoint это must-have. В шаблоне реализована минимальная same-origin проверка:

```ts
const origin = request.headers.get('origin')
const host = request.headers.get('host')
let originHost: string | null = null
try {
  originHost = origin ? new URL(origin).host : null
} catch {
  originHost = null
}
if (!originHost || !host || originHost !== host) {
  return NextResponse.json({ error: 'Cross-origin request rejected' }, { status: 403 })
}
```

Отсутствие `Origin` header трактуется как подозрительный запрос — современные браузеры всегда его шлют на POST. Для production-проектов добавь сверху CSRF-токен (например, в form action) или используй `next-safe-action` библиотеку.

### Связь имени cookie между routing.ts и Route Handler

next-intl proxy читает cookie с именем, заданным в `routing.localeCookie.name`. Route Handler должен ставить cookie с тем же именем — иначе proxy её не подхватит, и весь endpoint работает молча мимо.

Шаблон экспортирует из `routing.ts` константы `LOCALE_COOKIE_NAME` и `LOCALE_COOKIE_MAX_AGE` и импортирует их везде, где ставится cookie:

```ts
// routing.ts
export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 год

// api/locale/route.ts
import { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_NAME } from '@/shared/i18n/routing'
store.set(LOCALE_COOKIE_NAME, locale, { maxAge: LOCALE_COOKIE_MAX_AGE, ... })
```

Меняешь имя или срок — все места обновятся согласованно (single source of truth).

### Почему `sameSite: 'lax'`

`lax` разрешает cookie при top-level навигации (переход по ссылке), но блокирует при cross-site sub-запросах (iframe, `<img>`). Это баланс между безопасностью и удобством: cookie не пропадёт при обычном редиректе со стороннего сайта.

### Почему `path: '/'`

Cookie должна быть видна на всех страницах сайта. Без явного `path: '/'` cookie привяжется к `/api/locale` и middleware её не увидит.

### Почему `secure: production-only`

На `http://localhost` dev-сервер не использует HTTPS — cookie без флага `secure` работает нормально. На production без HTTPS `secure`-cookie вообще не должна устанавливаться (да и сайт без HTTPS сегодня не должен существовать).

## Пример вызова из клиента

```ts
// Выставить cookie и применить
await fetch('/api/locale', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ locale: 'ru' }),
})

// Применить без перехода на другой URL:
router.refresh()

// Или перейти на новый URL с нужной локалью:
router.push('/', { locale: 'ru' })
```

`router.refresh()` запрашивает текущую страницу заново — Server Components рендерятся с новой cookie, которую уже видит middleware.

### Revalidation после изменения cookie

После `POST /api/locale` cookie выставлена, но **текущая страница уже отрендерена** со старой локалью. Чтобы новая локаль применилась без полной перезагрузки, клиент должен вызвать `router.refresh()` (или сделать полную навигацию).

Пример клиентского хелпера:

```tsx
'use client'
import { useRouter } from '@/shared/i18n/navigation'

async function setLocale(locale: string) {
  const response = await fetch('/api/locale', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale }),
  })
  if (!response.ok) throw new Error('Failed to set locale')
  router.refresh()   // перерендерить серверные сегменты с новой cookie
}
```

Если страница использует `revalidatePath` или `revalidateTag` кэш — инвалидируй их в самом Route Handler после `cookies.set`, чтобы новые данные пришли с правильной локалью.

## Альтернатива: прямо из Server Action

Если смена локали происходит после login (Server Action), вызывать собственный HTTP-endpoint не нужно — `cookies()` доступен напрямую:

```ts
'use server'
import { cookies } from 'next/headers'
import { redirect } from '@/shared/i18n/navigation'
import { LOCALE_COOKIE_MAX_AGE, LOCALE_COOKIE_NAME } from '@/shared/i18n/routing'

export async function loginAction(formData: FormData) {
  const user = await authenticate(formData)

  // Выставляем locale из профиля пользователя
  const store = await cookies()
  store.set(LOCALE_COOKIE_NAME, user.preferredLocale, {
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })

  // redirect берём из @/shared/i18n/navigation (правило AGENTS.md), локаль — явно
  redirect({ href: '/', locale: user.preferredLocale })
}
```

**Когда что**:
- **Server Action** — когда логика уже на сервере (login, settings save). Нет лишнего HTTP-запроса.
- **Route Handler** — когда нужен HTTP endpoint для внешних клиентов (мобильное приложение, WebView, SDK).

Подробнее про Server Actions с переводами — в [12-server-actions.md](./12-server-actions.md).
