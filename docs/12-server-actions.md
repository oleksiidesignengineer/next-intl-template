# Server Actions с переводами

В шаблоне это форма `/contact`: Server Action, валидация на zod, ошибки на языке страницы, при успехе — inline-сообщение и toast. Форма работает и без JavaScript.

Коротко:

- **Локаль передаётся в action явно.** `next/root-params` в Server Actions не работает, поэтому `getTranslations('ns')` без локали там падает. Page привязывает локаль через `submitContact.bind(null, locale)`, а action вызывает `getTranslations({ locale, namespace })`.
- **`.bind` делается в Server Component.** Если привязать локаль в Client Component, на Next.js 16.4 отправка без JS зависает.
- **Bound-аргумент приходит от клиента**, поэтому action проверяет его через `hasLocale`.
- **Ошибка валидации возвращает введённые значения.** React сбрасывает `<form action>` после каждого action, и без `values` + `defaultValue` ввод бы стирался.
- **Числовые лимиты в сообщениях пишутся через `plural`**, иначе получится «Минимум 2 символов».

Переводы в Server Components и `generateMetadata` описаны в [03-translations.md](./03-translations.md).

## Из чего состоит

| Файл | Роль |
|---|---|
| [src/app/[locale]/contact/page.tsx](../src/app/[locale]/contact/page.tsx) | Server Component, в слайс не входит. Привязывает локаль к action, оборачивает форму в `<ClientMessages>` |
| [src/features/contact/api/actions.ts](../src/features/contact/api/actions.ts) | `'use server'`: `submitContact` и тип `ContactFormState` |
| [src/features/contact/model/schema.ts](../src/features/contact/model/schema.ts) | Фабрика zod-схемы `buildContactSchema(t)` |
| [src/features/contact/ui/ContactForm.tsx](../src/features/contact/ui/ContactForm.tsx) | `'use client'`: `useActionState`, поля, inline-сообщение об успехе, toast |
| [src/features/contact/index.ts](../src/features/contact/index.ts) | Барель слайса: `ContactForm`, `submitContact`, `ContactFormState` |

Слайс `features/contact` состоит из четырёх файлов. `page.tsx` лежит в `app/` и собирает их вместе. `submitContact` экспортируется из бареля, потому что привязку делает page, а не сама форма.

## Локаль передаётся в action явно

### Почему не «из контекста запроса»

Раньше в шаблоне action вызывал `getTranslations('contact.errors')` без локали. Комментарий в коде обещал, что локаль определится автоматически, а прежняя версия этого документа добавляла, что Server Action выполняется «в том же request context, что и страница». Это неверно по двум причинам.

**1. Root params в Server Actions недоступны.** В документации Next.js (`next-root-params.md`): «`next/root-params` can be used in Server Components. It cannot be used in Client Components, Server Actions, or Route Handlers». Без явной локали `getTranslations` попадает в ветку `if (!locale)` в [request.ts](../src/shared/i18n/request.ts) и вызывает `rootParams.locale()`. Отправка формы заканчивается HTTP 500, а в логе сервера появляется:

```
Error: `import('next/root-params').locale()` was used inside a Server Action. This is not supported. Functions from 'next/root-params' can only be called in the context of a route.
```

Ждать, что это починят, не стоит. Поддержку Next.js обещает только для Route Handlers. Остальные ограничения та же страница документации называет постоянными: «Most of these are permanent constraints of how root parameters work. The exception is Route Handlers». Причина в комментарии в исходниках Next: action не привязан к конкретному маршруту, и при вызове из разных root layout значение было бы неоднозначным. Блог next-intl пишет о планах для обоих случаев, но установленный Next говорит иначе. next-intl советует то же, что сделано здесь: «passing an explicit `locale` param at call sites, e.g. via `bind`».

**2. Action — это отдельный POST, и он проходит через proxy.** Даже до перехода на root params локаль action бралась не со страницы, а из заголовка, который proxy ставит на этот POST. Сценарий, проверенный в Playwright: пользователь открыл `/contact` на английском, в другой вкладке переключился на русский (cookie `NEXT_LOCALE=ru`) и отправил форму. POST на `/contact` получил 307 на `/ru/contact`, и на английской странице показались русские ошибки. С явной локалью ошибки остаются на языке страницы, которую видит пользователь.

Остаётся один край — тот же сценарий без JS. Браузер сам идёт за 307, и сервер рендерит `/ru/contact`: страница русская, а ошибки английские, на bound-локали `en`. Это проверено на production-сборке. Редирект бывает только у POST на страницу дефолтной локали без префикса (`as-needed`). Префиксный `/ru/contact` с cookie `uk` proxy не трогает, и ошибки приходят по-русски.

### Как это сделано

Page привязывает локаль ([contact/page.tsx](../src/app/[locale]/contact/page.tsx)):

```tsx
export default async function ContactPage() {
  const locale = await getLocale()
```

```tsx
<ClientMessages namespaces={['contactForm']}>
  {/* Server Actions can't read next/root-params, so the locale is bound
      here, on the server, and the action translates its errors with it. */}
  <ContactForm action={submitContact.bind(null, locale)} />
</ClientMessages>
```

Action принимает её первым аргументом и проверяет ([actions.ts](../src/features/contact/api/actions.ts)):

```ts
export async function submitContact(
  requestedLocale: string,
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const locale = hasLocale(routing.locales, requestedLocale)
    ? requestedLocale
    : routing.defaultLocale
  const t = await getTranslations({ locale, namespace: 'contact.errors' })
```

Форма получает уже привязанный action пропом и о локали не знает:

```tsx
action: (state: ContactFormState, formData: FormData) => Promise<ContactFormState>
```

Явный `locale` проходит в `getRequestConfig` аргументом и перекрывает root param. Сообщения грузятся для этой локали, `formats`, `timeZone` и `onError` берутся из того же `request.ts`. Так же работает `getFormatter({ locale })`, если action форматирует даты или числа.

В самой странице и в её `generateMetadata` локаль не нужна: там root params доступны, и `getTranslations('contact')` работает без аргументов.

### Почему `.bind` в Server Component, а не в форме

В документации Next.js написано: «`bind` works in both Server and Client Components and supports progressive enhancement». При миграции сначала так и сделали: `useLocale()` и `submitContact.bind(null, locale)` внутри `ContactForm`. С JS форма работала. Но отправка **без JS** на Next.js 16.4 вешала сервер: запрос не завершался, процесс `next-server` держал 100% CPU и после того, как клиент оборвал соединение. С `useMemo(() => submitContact.bind(...), [locale])` было то же самое. Симптом воспроизводился стабильно, причина в исходниках Next не установлена. next-intl тут ни при чём: зависание остаётся и с захардкоженной локалью вместо `useLocale()`, и с action без next-intl и zod. На минимальном приложении без next-intl условие сузилось до связки `.bind` в Client Component + `useActionState`: `.bind` в клиенте без `useActionState` и `.bind` в Server Component отвечают за ~27 мс. Та же связка виснет на Next.js 15.5.28 и 16.5.0-canary.31.

Привязка в Server Component этой проблемы не имеет, и e2e-тест без JS это проверяет ([14-testing.md](./14-testing.md)). Плюс форма становится проще: она получает готовый action и не зависит от `useLocale`.

Альтернатива из той же документации Next — скрытое поле `<input type="hidden" name="locale" value={locale} />`. Проверка в action нужна точно такая же.

### Почему обязательна проверка `hasLocale`

Bound-аргументы проходят через клиент. В пререндеренном HTML `/ru/contact` локаль лежит открытым текстом в служебном поле формы:

```html
<input type="hidden" name="$ACTION_1:1" value="[&quot;ru&quot;,{&quot;status&quot;:&quot;idle&quot;}]"/>
```

Любой может отправить POST с другим значением. Без проверки строка уйдёт в ``import(`./messages/${locale}.json`)`` в `request.ts`. Бандлер ограничивает такой импорт файлами из `messages/`, так что чужие файлы не прочитать, но неизвестная локаль даёт 500 вместо ответа формы. Шаблон в этом случае откатывается на `defaultLocale`: форма отвечает, просто по-английски.

То же правило действует для любой локали «снаружи»: из bound-аргумента, скрытого поля, БД, query или заголовка.

## zod-схема с переведёнными сообщениями

### Фабрика схемы

[schema.ts](../src/features/contact/model/schema.ts):

```ts
export function buildContactSchema(t: ContactErrorsT) {
  return z.object({
    email: z
      .string()
      .min(1, t('emailRequired'))
      .pipe(z.email(t('emailInvalid'))),
    message: z
      .string()
      .min(MESSAGE_MIN, t('messageTooShort', { min: MESSAGE_MIN }))
      .max(MESSAGE_MAX, t('messageTooLong', { max: MESSAGE_MAX })),
  })
}
```

- **Почему фабрика.** Сообщениям нужен `t`, а он появляется только внутри запроса, после `await getTranslations(...)`. На уровне модуля его нет, поэтому схема собирается заново при каждом вызове action.
- **`ContactErrorsT`** выводится из `getTranslations`: `Awaited<ReturnType<typeof getTranslations<'contact.errors'>>>`. Ключи и ICU-аргументы `t` внутри фабрики проверяются по `en.json` ([03-translations.md](./03-translations.md)).
- **`z.email()` вместо `z.string().email()`.** В zod 4 метод `.email()` у строки помечен ``@deprecated Use `z.email()` instead.``
- **Почему `.pipe`, а не цепочка.** Проверки внутри одной схемы zod выполняет все. Для пустой строки цепочка `.min(1).email()` даёт сразу две ошибки: `too_small` и `invalid_format`. `.pipe` запускает `z.email()`, только если `.min(1)` прошла. Пустое поле получает «Введи email», а `bad` получает «Введи корректный email».
- **Лимиты считаются в code points** (с zod 4.5). Шесть эмодзи `😀` — это 6 символов для `.min()` и `.max()`, хотя `'😀'.repeat(6).length === 12`. Если хранилище ограничивает длину в байтах или UTF-16 units, проверяй этот лимит отдельно.

Action берёт первую ошибку каждого поля. `z.flattenError` группирует сообщения по полям, и они уже переведены:

```ts
const parsed = buildContactSchema(t).safeParse(values)

if (!parsed.success) {
  // First message per field; the messages are already translated.
  const { fieldErrors } = z.flattenError(parsed.error)
  return {
    status: 'error',
    fieldErrors: { email: fieldErrors.email?.[0], message: fieldErrors.message?.[0] },
    values,
  }
}
```

### Альтернатива из документации next-intl: схема без локали

next-intl предлагает другой путь ([Server Actions, Metadata & Route Handlers](https://next-intl.dev/docs/environments/actions-metadata-route-handlers)). Схема не знает про переводы, а сообщения подставляются при разборе через contextual error map:

```ts
// Example: locale-agnostic schema + per-parse error map (zod 4)
const contactSchema = z.object({
  email: z.string().min(1).pipe(z.email()),
  message: z.string().min(10).max(1000),
})

const parsed = contactSchema.safeParse(values, {
  error(issue) {
    switch (issue.code) {
      case 'too_small':
        return issue.path?.[0] === 'email'
          ? t('emailRequired')
          : t('messageTooShort', { min: Number(issue.minimum) })
      case 'too_big':
        return t('messageTooLong', { max: Number(issue.maximum) })
      case 'invalid_format':
        return t('emailInvalid')
    }
  },
})
```

Пример проверен на zod 4.6.7: типы сходятся под `strict`, `issue.path` в error map доступен, коды маппятся в нужные ключи. Сравнение с фабрикой:

| | Фабрика `buildContactSchema(t)` | Схема без локали + error map |
|---|---|---|
| Где сообщения | рядом с каждым правилом | в одной функции по `issue.code` |
| Схема на клиенте | нет: ей нужен серверный `t` | да, ту же схему можно взять для клиентской валидации |
| Пересоздание | на каждый вызов action | один раз на модуль |
| Параметры правил | константы передаются в `t` явно | берутся из `issue.minimum` / `issue.maximum` |
| Что не замаплено | — | падает в английский текст zod по умолчанию, например `Invalid input: expected string, received number` |

Для общей карты ошибок на много схем next-intl показывает хелпер `getValidationErrorMap()` с namespace `Validation`. В документации он вызывает `getTranslations('Validation')` без локали. С `next/root-params` внутри Server Action такой вызов упадёт, поэтому передай хелперу `locale` и вызывай `getTranslations({ locale, namespace: 'Validation' })`. Шаблон оставил фабрику: для одной формы она нагляднее, и каждое сообщение видно рядом со своим правилом. Если схема нужна и на клиенте или форм много, бери error map и не забудь default-ветку для незамапленных кодов.

## Числа в сообщениях об ошибках: только через `plural`

Лимит подставляется в текст, поэтому сообщение должно склоняться. [ru.json](../src/shared/i18n/messages/ru.json):

```json
"messageTooShort": "{min, plural, one {Минимум # символ} few {Минимум # символа} many {Минимум # символов} other {Минимум # символа}}",
```

С простым аргументом `{min}` грамматика верна только при удачном значении константы. При `MESSAGE_MIN = 2` получилось бы «Минимум 2 символов», а в английском — «at least 1 characters». Что даёт `plural`:

| `min` | en | ru | uk |
|---|---|---|---|
| 1 | at least 1 character | Минимум 1 символ | Мінімум 1 символ |
| 2 | at least 2 characters | Минимум 2 символа | Мінімум 2 символи |
| 5 | at least 5 characters | Минимум 5 символов | Мінімум 5 символів |
| 21 | at least 21 characters | Минимум 21 символ | Мінімум 21 символ |
| 1000 | at least 1,000 characters | Минимум 1 000 символов | Мінімум 1 000 символів |

Ещё два плюса:

- `#` форматирует число по локали (`1,000` / `1 000`), а простой `{max}` вывел бы `1000`.
- Строгая типизация сообщений выводит `min` как `number`. Простой `{min}` типизировался бы как строка, и `t('messageTooShort', { min: MESSAGE_MIN })` не прошёл бы `tsc`.

Полноту категорий для каждой локали (ru и uk: `one`, `few`, `many`, `other`) проверяет `npm run check:translations`. Простой `{min}` вместо `plural` в переводе он тоже ловит: `{min} is not declined: en uses {min, plural, …} and ru has 4 plural forms` ([scripts/check-translations.ts](../scripts/check-translations.ts)). Синтаксис plural описан в [04-icu-messages.md](./04-icu-messages.md).

## Состояние формы и сохранение ввода

```ts
type ContactValues = z.input<ReturnType<typeof buildContactSchema>>

export type ContactFormState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error'
      fieldErrors?: Partial<Record<keyof ContactValues, string>>
      formError?: string
      // Echoed back so the form can keep what the user typed: React resets a
      // <form action> after EVERY submission, including failed ones.
      values: ContactValues
    }
```

- `fieldErrors` — ошибки zod по полям, `formError` — общая ошибка (упал side effect).
- `values` — введённые данные, возвращаются в любой ветке `error`. Тип `ContactValues` выводится из схемы через `z.input`, отдельно его описывать не нужно.

**Зачем `values`.** React 19 сбрасывает форму, переданную в `<form action>`, после **каждого** action. Сброс ставится в очередь безусловно и не зависит от результата. Запрос на opt-out ([react/react#29034](https://github.com/react/react/issues/29034)) пока открыт. Без `values` ошибка валидации стирала бы всё, что ввёл пользователь. e2e-тест «shows translated errors and keeps what the user typed» это ловит: если убрать `defaultValue`, поле `Email` после отправки оказывается пустым.

Форма восстанавливает значения через `defaultValue` ([ContactForm.tsx](../src/features/contact/ui/ContactForm.tsx)):

```tsx
// React resets the form after every action; defaultValue restores the
// submitted values on error, and an empty form after success.
const values = state.status === 'error' ? state.values : undefined
```

```tsx
<input
  id="email"
  name="email"
  type="email"
  defaultValue={values?.email}
```

После успеха `values` равно `undefined`, и автоматический сброс сам очищает форму. Ручной `formRef.current?.reset()` больше не нужен. Тот же механизм работает без JS: сервер рендерит страницу с состоянием action, и `defaultValue` попадает прямо в HTML.

Пароли, токены и прочие секреты в `values` не возвращай. Ответ action уходит клиенту в RSC payload.

## Клиент: `useActionState` и toast

```tsx
export function ContactForm({ action }: Props) {
  const t = useTranslations('contactForm')
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE)

  useEffect(() => {
    if (state.status === 'success') toast.success(t('successToast'))
  }, [state, t])
```

- `pending` блокирует кнопку и меняет её текст на «Отправляем…».
- Ошибки полей связаны с инпутами через `aria-invalid` и `aria-describedby` и объявляются как `role="alert"`.
- **Toast — в `useEffect`, а не в action.** Action выполняется на сервере и не может вызвать клиентский UI. Успех передаётся через `state`, клиент на него реагирует. Каждый ответ action — новый объект, поэтому повторная успешная отправка снова покажет toast. Рядом форма рендерит `<p role="status">` с тем же текстом: он есть и в серверном HTML, поэтому успех виден и без JS.
- **`useTranslations('contactForm')` работает, потому что page оборачивает форму в `<ClientMessages namespaces={['contactForm']}>`.** Корневой layout отдаёт клиенту только namespace `error` ([03-translations.md](./03-translations.md)). Если забыть обёртку, next-intl на клиенте пишет `MISSING_MESSAGE` в консоль, и e2e-фикстура валит тест.
- **Строки формы вынесены в отдельный namespace `contactForm`**: подписи, плейсхолдеры, кнопка, toast. Namespace `contact` (заголовок, вступление, `errors`) нужен только на сервере. Ошибки action возвращает уже переведёнными, поэтому `contact.errors` на клиент не уходит. e2e проверяет, что `/ru/contact` отдаёт клиенту `contactForm`, но не `contact`.

`<Toaster />` стоит в корневом layout [src/app/[locale]/layout.tsx](../src/app/[locale]/layout.tsx), один на всё приложение:

```tsx
<Toaster position="top-right" richColors containerAriaLabel={t('notifications')} />
```

Подпись landmark-региона уведомлений переводится на сервере (`getTranslations('common')`) и уходит пропом. Без неё на `/ru` и `/uk` регион назывался бы английским «Notifications». Переведённую строку передаём пропом, поэтому namespace `common` на клиент не попадает. Направление текста sonner берёт из `<html dir>` сам.

**Смена языка при показанной ошибке.** next-intl предупреждает: сообщение из action может остаться на старом языке, если пользователь переключил локаль. По документации next-intl, с сегментом `[locale]` это решается автоматически: смена языка — это навигация на URL другой локали. Если локаль не в маршруте, сбрасывай состояние формы через `key={locale}`.

## Без JavaScript

Форма работает до гидрации и с выключенным JS. React рендерит её как обычную HTML-форму:

```html
<form ... action="" encType="multipart/form-data" method="POST">
```

Служебные скрытые поля `$ACTION_*` содержат id action и bound-аргументы. POST уходит на текущий URL (`/uk/contact`), сервер выполняет action и рендерит страницу заново с его состоянием. Ошибки приходят на языке страницы, введённые значения сохраняются через `defaultValue`. e2e-тесты с `javaScriptEnabled: false` проверяют текст ошибки на языке страницы и inline-сообщение об успехе. Сохранение ввода без JS они не проверяют: это проверено вручную на production-сборке, в HTML ответа поле приходит с `value="bad"`.

`noValidate` на форме отключает встроенную проверку браузера: её подсказки показываются на языке браузера, а не страницы. С `noValidate` все ошибки приходят с сервера, на языке страницы, одинаково с JS и без.

Чего без JS нет:

- **toast** — он рендерится только на клиенте. Успех без JS подтверждает inline-сообщение `<p role="status">` из `state.status === 'success'`: оно попадает в серверный HTML. Это проверяет e2e-тест «success is confirmed inline (no toast without JS)»;
- **`pending`** — кнопка не блокируется, и повторную отправку ничто не останавливает.

## Route Handlers

Root params там тоже недоступны: поддержка в Next.js только запланирована («Support for this API in Route Handlers is planned for a future version of Next.js» — из текста ошибки). Кроме того, matcher в [src/proxy.ts](../src/proxy.ts) исключает `/api`, так что proxy не согласует для таких запросов локаль. `getTranslations('ns')` без явной локали в Route Handler падает с 500, так же как в Server Action.

Локаль передаёт клиент: в query, теле запроса, через cookie `NEXT_LOCALE` или `Accept-Language`. Её нужно проверить и передать явно. Пример по документации next-intl:

```ts
// Example: app/api/hello/route.ts
import { NextResponse } from 'next/server'
import { hasLocale } from 'next-intl'
import { getTranslations } from 'next-intl/server'

import { routing } from '@/shared/i18n/routing'

export async function GET(request: Request) {
  const locale = new URL(request.url).searchParams.get('locale')
  if (!hasLocale(routing.locales, locale)) {
    return NextResponse.json({ error: 'Invalid locale' }, { status: 400 })
  }
  const t = await getTranslations({ locale, namespace: 'contact' })
  return NextResponse.json({ title: t('title') })
}
```

Когда что выбирать:

| Сценарий | Что использовать |
|---|---|
| Форма или мутация из своего UI | Server Action |
| Внешний клиент: мобильное приложение, webhook, другой сервис | Route Handler |
| Смена языка пользователя после логина | Server Action + `cookies().set()` + `redirect({ href, locale })`, см. [13-locale-persistence.md](./13-locale-persistence.md) |

## Что добавить в реальном проекте

- **Side effect.** Замени `await new Promise((resolve) => setTimeout(resolve, 500))` в `actions.ts` на отправку письма, запись в БД или постановку задачи в очередь. Action выполняется на сервере, поэтому ключи и строки подключения в бандл не попадут.
- **Авторизацию — внутри каждого action.** Документация Next.js: «you should still treat Server Actions as reachable via direct POST requests and verify authentication and authorization inside each one».
- **Защиту от спама** (rate limit, капча вроде Turnstile или hCaptcha) — тоже в action, до валидации. Сообщения об отказе переводятся тем же `t`.
- **Сохранение языка пользователя** при логине или в профиле — [13-locale-persistence.md](./13-locale-persistence.md).

## Как перенести в свой проект

1. Сигнатура action: `(locale: string, prevState, formData)`. Первая строка — `hasLocale(routing.locales, locale) ? locale : routing.defaultLocale` (или ошибка, если для тебя так правильнее).
2. Внутри action — только `getTranslations({ locale, namespace })` и `getFormatter({ locale })`. Без явной локали action упадёт на `next/root-params`.
3. Привязка — в Server Component: `<Form action={action.bind(null, await getLocale())} />`. Клиентская форма принимает action пропом.
4. Сообщения валидации — фабрикой схемы или error map. Числа в них — через `plural` с полным набором категорий каждой локали.
5. В ветке ошибки возвращай введённые значения и рендери их через `defaultValue`.
6. Оберни форму в `<ClientMessages namespaces={[...]}>` с namespace, который она читает на клиенте.
7. Добавь e2e: ошибки на языке страницы, сохранение ввода, успешная отправка, отправка без JS ([14-testing.md](./14-testing.md)).
