# Server Actions с переводами

В Next.js 16 + React 19 submit-формы обрабатываются через Server Actions (`'use server'`). Это основной способ для серверной обработки данных в App Router — никакого отдельного API-роута не нужно. В шаблоне — страница `/contact`.

Для переводов в Server Components и `generateMetadata` см. [03-translations.md](./03-translations.md).

## Архитектура

Фича `contact` — это FSD-слайс из четырёх файлов:

| Файл | Роль |
|---|---|
| `src/app/[locale]/contact/page.tsx` | Server Component. `generateMetadata`, рендерит `<ContactForm />` |
| `src/features/contact/ui/ContactForm.tsx` | Client Component. `useActionState`, `useRef`, `useEffect`, форма |
| `src/features/contact/api/actions.ts` | `'use server'` модуль. Экспортирует функцию `submitContact` |
| `src/features/contact/model/schema.ts` | Фабрика zod-схемы `buildContactSchema(t)` (вызывается из action) |
| `src/features/contact/index.ts` | Барель слайса (`export { ContactForm }`) |

Разделение обязательно: Server Action должен находиться в `'use server'`-файле, а форма с хуками — в `'use client'`-компоненте. Server Component (`page.tsx`) клеит их вместе. Zod-схема вынесена в `model/schema.ts` отдельной фабрикой, потому что ей нужен `t` (доступен только в request-scope).

## Server Action: получение `t` внутри action

```ts
'use server'

export async function submitContact(
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  // Server Actions run in request context, so getTranslations resolves
  // the active locale automatically — no need to call getLocale() first.
  const t = await getTranslations('contact.errors')
  const schema = buildContactSchema(t) // фабрика из model/schema.ts
  // ...
}
```

- `getTranslations('contact.errors')` — async, определяет локаль автоматически из request context. Вызывать `getLocale()` отдельно **не нужно** — Server Actions выполняются в том же request context, что и страница.
- Схему собираем фабрикой `buildContactSchema(t)` (файл `model/schema.ts`): её нельзя построить на module-load, потому что `t` доступен только внутри запроса.

`namespace: 'contact.errors'` позволяет писать `t('emailRequired')` вместо `t('contact.errors.emailRequired')`.

## zod-схема с переводёнными сообщениями

Фабрика живёт в `src/features/contact/model/schema.ts` и принимает `t` параметром:

```ts
export function buildContactSchema(t: ContactErrorsT) {
  return z.object({
    email: z
      .string()
      .min(1, t('emailRequired'))
      .email(t('emailInvalid')),
    message: z
      .string()
      .min(MESSAGE_MIN, t('messageTooShort', { min: MESSAGE_MIN }))
      .max(MESSAGE_MAX, t('messageTooLong', { max: MESSAGE_MAX })),
  })
}
```

ICU-интерполяция работает внутри zod-сообщений: `t('messageTooShort', { min: 10 })` → «Минимум 10 символов» (ru) / «Message must be at least 10 characters» (en). Сообщения валидации автоматически на языке пользователя.

`schema.safeParse()` возвращает `success: false` с `error.issues`. Action собирает из них `fieldErrors` per field и возвращает `{ status: 'error', fieldErrors }`.

## Тип `ContactFormState`

```ts
export type ContactFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error'
      fieldErrors?: { email?: string; message?: string }
      formError?: string
    }
```

Discriminated union: клиент проверяет `state.status` и TypeScript сужает тип в каждой ветке. `fieldErrors` — per-field ошибки от zod. `formError` — общая ошибка (catch-all, например ошибка сети).

## Клиент: `useActionState` + toast

```tsx
'use client'

const INITIAL_STATE: ContactFormState = { status: 'idle' }

export function ContactForm() {
  const t = useTranslations('contact')
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction, pending] = useActionState(submitContact, INITIAL_STATE)

  useEffect(() => {
    if (state.status === 'success') {
      toast.success(t('successToast'))
      formRef.current?.reset()
    }
  }, [state, t])

  // ...
  return (
    <form ref={formRef} action={formAction} noValidate>
      {/* поля */}
      <button type="submit" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
```

- `useActionState(submitContact, INITIAL_STATE)` — React пробрасывает `formData` в action и обновляет `state` ответом.
- `<form action={formAction}>` — стандартный HTML-атрибут, React 19 умеет принимать здесь Server Action.
- `pending` — `true` пока action выполняется. Используется для `disabled` на кнопке.
- `useEffect` ловит `state.status === 'success'` → показывает toast + сбрасывает форму через `formRef.current?.reset()`.

### Почему toast в `useEffect`, а не в action

Action работает на сервере. Он не может вызывать клиентский UI (sonner, alert и т.д.). Мы передаём успех через `state`, а клиент реагирует на него в `useEffect`. Это стандартный паттерн для side effects в ответ на Server Action.

## `<Toaster />` в `[locale]/layout.tsx`

```tsx
// src/app/[locale]/layout.tsx
return (
  <html lang={locale}>
    <body>
      <NextIntlClientProvider messages={clientMessages}>
        <SiteHeader />
        <main>{children}</main>
        <Toaster position="top-right" richColors />
      </NextIntlClientProvider>
    </body>
  </html>
)
```

`<Toaster />` стоит внутри `NextIntlClientProvider` — так все страницы шаблона получают одно глобальное место для toast-уведомлений. Размещение в locale layout (а не в root layout) гарантирует, что он доступен только на страницах с локалью, где работает i18n.

> Провайдер получает отфильтрованный `clientMessages` (см. [03-translations.md](./03-translations.md)). Чтобы `useTranslations('contact')` в `ContactForm` работал, namespace `'contact'` должен быть в `CLIENT_NAMESPACES` — в шаблоне он уже добавлен.

## Расширения

### Реальный side effect

В `actions.ts` замени:
```ts
await new Promise((resolve) => setTimeout(resolve, 500))
```
На реальную логику:
```ts
await sendEmail({ to: 'admin@example.com', ...parsed.data })
// или
await db.contactRequests.create({ data: parsed.data })
// или
await queue.add('contact', parsed.data)
```

Action выполняется на сервере, поэтому секреты (API ключи, строки подключения к БД) не попадают в клиентский бандл.

### Защита от спама

- **Rate limiting**: в `proxy.ts` (middleware) проверять частоту запросов к `/contact` по IP через Upstash, Redis и т.д.
- **Капча**: добавить hCaptcha или Cloudflare Turnstile на форму, проверять токен в action перед валидацией.

### Optimistic UI

Если action меняет видимый стейт (список, счётчик), `useOptimistic` из React 19 позволяет мгновенно показать предполагаемое состояние не дожидаясь ответа сервера.

## API Route Handler vs Server Action

| Сценарий | Что использовать |
|---|---|
| Submit формы внутри React | Server Action |
| Внешний клиент (мобильное приложение, webhook) | Route Handler |
| SSR fetch из другого сервиса | Route Handler |
| Мутация после login, с редиректом | Server Action |

`getTranslations` работает в обоих вариантах — API Route Handler тоже может возвращать переводённые сообщения об ошибках. Пример Route Handler — в [13-locale-persistence.md](./13-locale-persistence.md).
