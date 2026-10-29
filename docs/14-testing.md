# Тестирование локализации

Локализацию в шаблоне проверяют четыре слоя. Каждый ловит свой класс ошибок, и ни один не заменяет остальные:

| Слой | Команда | Ловит | Не ловит |
|---|---|---|---|
| Типы | `npm run typecheck` | несуществующие ключи и namespace, неверные ICU-аргументы (`t('items', { count: 'x' })`), params маршрутов (`PageProps`, `LayoutProps`) | всё, что в `ru.json` и `uk.json`: типы строятся только из `en.json` |
| Файлы сообщений | `npm run check:translations` | расхождение ключей и типов значений, пустые строки, битый ICU, потерянные аргументы и их вид (дата, `plural`), ветки `select` и теги, неполные plural-категории | что из этого реально рендерится и попадает на клиент |
| Unit | `npm run test:unit` | matcher proxy, разбор `href` для обёртки `Link` | всё, что зависит от рендера |
| Поведение | `npm run test:e2e` | роутинг, 404, SEO, сообщения на клиенте, гидрацию, формы, LangSwitcher | смысл перевода |

`npm test` запускает сначала unit, потом e2e. Плюс `npm run lint`: ESLint с правилами `eslint-config-next`, FSD-границами импортов и запретом `next/link` и `useRouter`/`usePathname`/`redirect`/`permanentRedirect` из `next/navigation`: они не знают о префиксе локали и `pathnames`.

Типизация сообщений (`createMessagesDeclaration`, `en.d.json.ts`, зачем `next typegen` перед `tsc`) описана в [03-translations.md](./03-translations.md). Здесь — остальные слои и CI.

**Почему в `typecheck` стоит `--incremental false`.** В [tsconfig.json](../tsconfig.json) включён `incremental: true`, и `tsc` хранит результат в `tsconfig.tsbuildinfo`. Проверено на копии шаблона: в `en.json` заменил `{min, plural, …}` на простой `{min}`, `next typegen` перегенерировал `en.d.json.ts`, но `npx tsc --noEmit` с прогретым кешем ошибку `Type 'number' is not assignable to type 'string'` не показал. В обратную сторону то же: исправленная ошибка продолжала висеть. `npm run typecheck` запускает `tsc --noEmit --incremental false`, кеш не читает и в обоих случаях отвечает верно. Проверяй типы через него. Если запускаешь голый `npx tsc --noEmit`, после правки ICU-аргументов в `en.json` удали `tsconfig.tsbuildinfo` (файл в `.gitignore`).

## `check:translations`

[scripts/check-translations.ts](../scripts/check-translations.ts) сверяет каждую локаль с исходной (`routing.defaultLocale`, то есть `en`).

**Для каждой локали, кроме исходной:**

1. **Паритет ключей.** Ключи те же, без пропущенных и лишних.
2. **Паритет типов значений.** Строка остаётся строкой, массив — массивом.
3. **Паритет ICU.** У сообщения те же аргументы, что в `en`, и того же вида: текст, число или дата. Аргумент, который `en` склоняет (`{min, plural, …}`), склоняется и в переводе, если у языка больше одной plural-формы. В переводе есть все ветки `select`, которые есть в `en`: их ключи — значения из кода, их не переводят. Rich-text теги (`<link>…</link>`) те же.

**Для всех локалей, включая исходную:**

4. **Нет пустых строк.** `''` — это значение. Fallback на `defaultLocale` из [request.ts](../src/shared/i18n/request.ts) к нему не применяется, и UI покажет пустое место.
5. **Синтаксис ICU.** Каждое сообщение разбирается `@formatjs/icu-messageformat-parser` с `requiresOtherClause: true`. Ловятся незакрытые скобки и теги, `plural` или `select` без `other`.
6. **Plural-категории CLDR.** В `plural` и `selectordinal` нет категорий, которых у локали не бывает. Если сообщение расписывает хоть одну категорию кроме `other`, оно расписывает все. Для ru и uk это `one`, `few`, `many`, `other`.

Список локалей берётся из `routing.locales`, поэтому новая локаль попадает в проверку сама. Скрипт выходит с кодом 1 при любой проблеме, и CI на этом останавливается.

### Как выглядят ошибки

Вывод на копии сообщений с шестью намеренными поломками. В ru: plural только с `one`/`other`, `{name}` переименован в `{nam}`. В uk: удалён ключ, незакрытая скобка, лишняя категория `two`, потерян тег `<link>`:

```
✗ 7 translation problem(s):
  - ru: contact.errors.messageTooShort — {min, plural} is missing few, many (CLDR for ru: one, few, many, other)
  - ru: plurals.greeting — missing argument {name}
  - ru: plurals.greeting — unknown argument {nam}
  - uk: contactForm.submit — missing (present in en)
  - uk: contact.errors.emailInvalid — invalid ICU: EXPECT_ARGUMENT_CLOSING_BRACE
  - uk: contact.errors.messageTooLong — {max, plural} has categories two that uk doesn't use (CLDR: one, few, many, other)
  - uk: plurals.terms — missing tag <link>
```

Остальные проверки, отдельными прогонами: в ru `{date, date, long}` заменили на `{date}`, из `select` убрали ветку, `{min, plural, …}` заменили на простой `{min}`; в `en` оставили пустую строку:

```
  - ru: blog.publishedOn — {date} takes a text, en passes a date
  - ru: plurals.role — {role, select} is missing the "editor" branch
  - ru: contact.errors.messageTooShort — {min} is not declined: en uses {min, plural, …} and ru has 4 plural forms
  - en: contactForm.submit — empty string (the default-locale fallback does not apply to it)
```

Без ошибок:

```
✓ en, ru, uk: keys, ICU syntax, arguments, tags and plural categories in sync with en
```

### Детали, которые стоит знать

- **Категории берутся из `Intl.PluralRules` того Node, на котором идёт проверка.** Это CLDR из ICU, встроенного в Node. Держи локально ту же мажорную версию Node, что в CI: там `node-version: 24` ([ci.yml](../.github/workflows/ci.yml)), а `engines.node` в [package.json](../package.json) требует `>=24`.
- **Сообщение только с `other`** (`{count, plural, other {# items}}`) проходит: оно корректно для любой локали. Ошибкой считается только неполный набор.
- **Точные совпадения `=0`, `=1`** — не категории CLDR, их скрипт не проверяет и не требует.
- **Простой `{x}` вместо `plural` — ошибка, если у языка больше одной plural-формы.** `Минимум {min} символов` в ru скрипт поймает (вывод выше). Без этой проверки склонение пропало бы молча: типы строятся по `en.json`, а e2e-тест формы при `min = 10` видит совпадающий текст «Минимум 10 символов». Для языка с одной формой (`ja`, `zh`: только `other`) такой перевод проходит. Простой `{x}` там, где `en` передаёт число без склонения (`{n, number}`), тоже разрешён: сообщение просто печатает значение. Дату скрипт проверяет строго: `{date}` вместо `{date, date, long}` он поймает.
- **Лишняя ветка `select`** в переводе ошибкой не считается: сверяются только ветки из `en`.

### Чего скрипт не проверяет

- **Какие namespace уходят на клиент.** Namespace передаются по страницам через `<ClientMessages>`, и забытый ловит e2e ([ниже](#фикстура-любая-ошибка-в-консоли-валит-тест)).
- **Опечатки и смысловые ошибки в самом `en.json`**, если сообщение остаётся валидным ICU. Сверять не с чем: такое видно только в e2e-тестах, которые проверяют текст, и на ревью. Аргумент, потерянный в `en.json` (например, съеденный апострофом в `'{name}'`), всё же всплывёт: у остальных локалей скрипт сообщит `unknown argument {name}`. Проверено мутацией.
- **Имена форматов внутри сообщений** (`long` в `{date, date, long}`) и смысл перевода.
- **Неиспользуемые ключи.**

### `eloqnt lint` — официальная опция

Документация next-intl советует линтер сообщений [@eloqnt/cli](https://cli.eloqnt.dev): «This tool is purpose-built for `next-intl`, and uses AST-level analysis to catch common issues like missing translations, inconsistent ICU arguments, and more». В официальном `example-app-router` он стоит в скрипте `lint`: `eslint src && prettier src --check && eloqnt lint`. Кроме прочего, он находит неиспользуемые ключи (`orphan-message`).

В шаблон он не добавлен, и на текущей версии шаблона его не запускали. Если подключаешь, проверь, что `orphan-message` скажет о ключах `contact.errors.*`. Их читает `t`, который передаётся в фабрику схемы `buildContactSchema(t)` параметром ([12-server-actions.md](./12-server-actions.md)), и статический анализ может не связать такой `t` с namespace. Это предположение, а не замер. Проверку CLDR-категорий по каждой локали `check:translations` делает в любом случае, так что инструменты можно использовать вместе.

## Unit-тесты

[tests/unit](../tests/unit) — тесты на `node:test` (запуск через `tsx --test`), без браузера и без сборки. `npm run test:unit` можно гонять сразу после `npm ci`.

- **[proxy-matcher.test.ts](../tests/unit/proxy-matcher.test.ts)** проверяет matcher из [src/proxy.ts](../src/proxy.ts). Matcher решает, какие запросы вообще получают обработку локали, и слишком широкое исключение молча ломает страницы дефолтной локали. Тест требует, чтобы proxy срабатывал на страницах, включая `/apiary` и `/api-docs`. И чтобы пропускал `/api`, `/_next`, `/_vercel`, файлы с точкой и `opengraph-image` на любой глубине. Отдельный тест закрепляет компромисс стандартного matcher next-intl: любой путь с точкой, в том числе slug вроде `/blog/v1.2`, идёт мимо proxy, поэтому точки в URL страниц не используй. Next читает `config.matcher` статически, поэтому тест берёт литерал из файла как текст и не импортирует proxy. Проверка идёт через `unstable_doesMiddlewareMatch` из `next/experimental/testing/server`. В документации Next эта функция названа `unstable_doesProxyMatch`, но в установленной версии экспортируется только старое имя.
- **[href.test.ts](../tests/unit/href.test.ts)** проверяет `splitHref` и `toLinkHref` из [src/shared/lib/href.ts](../src/shared/lib/href.ts). Внутренний путь с query или hash разбирается в объект, чтобы обёртка `Link` применила `pathnames`. Якоря (`#faq`), голый query (`?page=2`), внешние и относительные ссылки, `mailto:` и `tel:` остаются строкой. Protocol-relative `//cdn…` обёртка превращает в `https://cdn…`, иначе next-intl добавил бы к нему префикс локали.

## e2e на Playwright

Тесты лежат в [tests/e2e](../tests/e2e), конфиг — [playwright.config.ts](../playwright.config.ts).

### Почему против production-сборки

Тесты гоняются против `next start`, а не `next dev`. Только так проверяется то, что увидит пользователь: пререндеренные страницы (их локаль, `SITE_URL` и `now` зафиксированы при сборке), proxy с реальными редиректами и cookie, настоящая гидрация. В dev всё рендерится по запросу, а `getMessageFallback` из [request.ts](../src/shared/i18n/request.ts) отдаёт `[!namespace.key]` вместо `namespace.key`.

### Запуск локально

```bash
npm run build
npx playwright install   # once: Chromium, Firefox, WebKit
npm run test:e2e
```

- **Три движка.** В [playwright.config.ts](../playwright.config.ts) три проекта: `chromium`, `firefox` и `webkit`. Комментарий в конфиге объясняет зачем: у WebKit и Firefox свои ICU-данные, вывод консоли и поведение fetch, а пользователи Safari — реальные пользователи. Для быстрого локального прогона ограничься одним: `npx playwright test --project=chromium`.
- **Сервер.** Playwright сам запускает `npx next start -p 3100` и ждёт ответа `/about`. Порт меняется переменной `PORT`.
- **Переиспользование.** Уже запущенный сервер Playwright возьмёт, только если задан `PW_REUSE_SERVER=1`. Тогда после каждой пересборки перезапускай свой `next start -p 3100`, иначе тесты пойдут против старой сборки.
- **`SITE_URL` должен совпадать у сборки и тестов.** Статические страницы получают канонический origin при сборке ([src/shared/config/site.ts](../src/shared/config/site.ts)). Тесты берут `SITE_URL` из окружения ([fixtures.ts](../tests/e2e/fixtures.ts)) и сравнивают с ним canonical, hreflang, `og:url`, sitemap и robots. `playwright.config.ts` загружает `.env*` через `loadEnvConfig` из `@next/env` в том же режиме, что `next build`: `.env.production.local`, `.env.local`, `.env.production`, `.env`. Поэтому `SITE_URL` из `.env.local` видят обе стороны. По умолчанию обе берут `http://localhost:3000`. Это канонический origin, а не адрес тестового сервера, поэтому порт и не совпадает с 3100.
- **`VERCEL_PROJECT_PRODUCTION_URL` фикстура не читает.** Если сборка взяла origin из него, передай тестам `SITE_URL=https://<этот домен>` явно.
- **Нейтральный браузер.** `locale: 'en-US'` в конфиге: `Accept-Language` без ru и uk, поэтому `/` отдаёт `en`, пока тест сам не задаст заголовок.

Один файл или группа тестов:

```bash
npx playwright test forms-errors
npx playwright test -g "language switcher"
```

### Что покрыто

66 тестов в четырёх файлах, каждый прогоняется в трёх движках (198 прогонов):

| Файл | Тестов | Что проверяет |
|---|---|---|
| [routing.spec.ts](../tests/e2e/routing.spec.ts) | 19 | `/` редиректит по `Accept-Language`, а нейтральному браузеру (`en-US`) отдаёт `en` без префикса; любой URL без префикса (`/about`) уводит на язык из `Accept-Language` или cookie; cookie `NEXT_LOCALE` важнее `Accept-Language`; proxy ставит сессионную cookie (без `Max-Age`/`Expires`, `Path=/`, `SameSite=lax`) только на document-запросах, а на `Sec-Fetch-Dest: empty` — нет; `/en/blog` → `/blog` (`as-needed`); `<html lang dir>` в каждой локали; локализованные пути `/about`, `/ru/o-nas`, `/uk/pro-nas` и редирект `/ru/about` → `/ru/o-nas`; `Link` сохраняет маппинг пути вместе с query; 404 — неизвестный путь в локали, неизвестный slug, неизвестный первый сегмент (`/xx/about` — 404 дефолтной локали с шапкой), `/api/does-not-exist` (корневая `not-found.tsx`), `/unknown.txt` (`global-not-found.tsx` с `lang="en"`) |
| [seo.spec.ts](../tests/e2e/seo.spec.ts) | 10 | canonical + hreflang для всех локалей и `x-default`; свои OG-теги страницы и `og:image` на `/<locale>/opengraph-image` (200, `image/png`); картинка `en` без редиректа, для неизвестной локали — 404; шаблон `title`; JSON-LD с `inLanguage`; `noindex` у демо и его отсутствие у контентных страниц; sitemap (по `<url>` на страницу × локаль, `x-default`, без `/demo/`); robots.txt; защитные заголовки и отсутствие hreflang в `Link`-заголовке proxy |
| [i18n.spec.ts](../tests/e2e/i18n.spec.ts) | 32 | обход 8 страниц × все локали без ошибок в консоли; какие namespace уходят на клиент (layout — только `error`; `/contact` добавляет `contactForm`, а серверный `contact` не отдаёт); LangSwitcher (серверный рендер с нативными названиями, сохранение локализованного пути, многозначного query и cookie, переход на дефолтную локаль, dynamic params); ICU-демо (plural по CLDR, `selectordinal`, форматы на сервере, относительное время после гидрации) |
| [forms-errors.spec.ts](../tests/e2e/forms-errors.spec.ts) | 5 | форма: переведённые ошибки и сохранение ввода; после успеха — строка `role="status"` в форме, toast, очистка формы и локализованная подпись региона уведомлений; отправка без JS: текст ошибки на языке страницы, сохранённый ввод и подтверждение успеха в той же строке `role="status"`; error boundary на языке страницы и восстановление через `retry` |

Как проверяется, что namespace ушёл на клиент. Сообщения провайдера попадают в HTML внутри RSC payload, где кавычки экранированы. Поэтому тест ищет подстроку вида `\"contactForm\":{\"<первый ключ>\"`. Первый ключ отличает namespace от одноимённого конфига: `formats` — это и namespace демо, и `formats` из `request.ts`, которые провайдер тоже сериализует:

```ts
  const shipped = (html: string, ns: keyof typeof messages) =>
    html.includes(`\\"${ns}\\":{\\"${Object.keys(messages[ns])[0]}\\"`)
```

### Фикстура: любая ошибка в консоли валит тест

Все спеки импортируют `test` из [fixtures.ts](../tests/e2e/fixtures.ts), а не из `@playwright/test`:

```ts
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = []
      page.on('console', (message) => {
        if (message.type() !== 'error') return
        // 404s are judged by the network listener below: the console text and
        // its location differ between Chromium, Firefox and WebKit.
        if (message.text().includes('status of 404')) return
        errors.push(message.text())
      })
      // The 404 of the document itself is expected on 404 pages; a 404 of any
      // other request (prefetch, script, image) is a real error.
      page.on('response', (response) => {
        if (response.status() === 404 && response.request().resourceType() !== 'document') {
          errors.push(`404 ${response.url()}`)
        }
      })
      page.on('pageerror', (error) => errors.push(error.message))
      await use(errors)
      expect(errors, 'console errors').toEqual([])
    },
    { auto: true },
  ],
})
```

`auto: true` включает фикстуру в каждом тесте, даже если тест её не запрашивает. Исключение одно: 404 самого документа на страницах 404. Консольные сообщения о 404 фикстура пропускает, потому что их текст различается между движками, а 404 судит по сетевым ответам: 404 любого запроса, кроме документа (чанка, картинки, prefetch), остаётся ошибкой. Фикстура ловит:

- **сообщения, которые не дошли до клиента.** На клиенте у next-intl `onError` по умолчанию — `console.error`, так что `MISSING_MESSAGE` попадает в консоль. `onError` из `request.ts` сюда не доходит: функции не сериализуются на клиент;
- **расхождения гидрации**, например форматирование дат и чисел, которое на сервере и в браузере дало разный результат;
- **необработанные исключения** на странице.

**Почему это заменило статическую проверку.** Старая проверка regex'ом искала `useTranslations('ns')` в файлах с `'use client'` и сверяла namespace с глобальным списком в layout. Теперь глобального списка нет: каждая страница передаёт свой набор через `<ClientMessages>`. Какой островок под какой обёрткой рендерится, определяет дерево компонентов, и regex этого не видит. Ещё regex пропускал компоненты без `'use client'`, которые становятся клиентскими, потому что их импортирует клиентский модуль. e2e смотрит на результат: страница отрендерилась, и в консоли нет `MISSING_MESSAGE`.

**Ограничение:** фикстура видит только то, что отрендерилось. Ключ, который показывается лишь после действия (ошибка валидации, toast, состояние после клика), проверен, только если тест до него дошёл. Поэтому у формы и error boundary есть отдельные тесты с взаимодействием.

Тест, который вызывает ошибку намеренно ([forms-errors.spec.ts](../tests/e2e/forms-errors.spec.ts)), убирает из массива только эту ошибку. Всё остальное, например `TypeError: retry is not a function` или `MISSING_MESSAGE` из `error.tsx`, остаётся, и фикстура валит тест:

```ts
  // Drop only the intentional demo error (Firefox prints it as just "Error");
  // anything else — e.g. "TypeError: retry is not a function" or a
  // MISSING_MESSAGE from error.tsx — stays and fails the test via the fixture.
  const unexpected = consoleErrors.filter(
    (message) => !message.includes('Demo error thrown on purpose') && message.trim() !== 'Error'
  )
  consoleErrors.splice(0, consoleErrors.length, ...unexpected)
```

## CI

[.github/workflows/ci.yml](../.github/workflows/ci.yml) запускается на push в `main` и на pull request. Job только читает репозиторий: `permissions: contents: read`, checkout с `persist-credentials: false`. `npm ci`, сборка и тесты исполняют сторонний код, и токен с правом записи им не нужен. Node 24, шаги идут от дешёвых к дорогим:

1. `npm ci`
2. `npm run check:translations`
3. `npm run lint`
4. `npm run typecheck` — сначала `next typegen`: типы маршрутов, `next/root-params` и `en.d.json.ts` генерируются и в git не лежат
5. `npm run build`
6. `npx playwright install --with-deps` — Chromium, Firefox и WebKit с системными зависимостями
7. `npm test` — unit, затем e2e
8. артефакт `playwright-report` на 7 дней — при любом исходе, кроме отмены (`if: ${{ !cancelled() }}`), то есть и после прогона, где упавший тест прошёл на повторе

`SITE_URL: https://example.com` задан на уровне job, поэтому сборка и тесты видят одно значение. В CI Playwright запрещает `test.only` (`forbidOnly`), делает один повтор упавшего теста и снимает trace на повторе (`trace: 'on-first-retry'`). Репортер `github` выводит ошибки аннотациями в PR, `html` собирает отчёт для артефакта. Сервер не переиспользуется: `PW_REUSE_SERVER` в CI не задан.

## Как добавить тест

### Новая страница

1. Добавь путь в `PAGES` в [i18n.spec.ts](../tests/e2e/i18n.spec.ts). Обход отрендерит страницу во всех локалях и упадёт на любой ошибке в консоли. Для страницы с локализованным путём укажи канонический: `/ru/about` редиректит на `/ru/o-nas`, и `page.goto` идёт за редиректом.
2. Если на странице есть клиентские островки, допиши в `messages sent to the client` проверку: её namespace уходят на этой странице и не уходят на соседних.
3. Если у страницы локализованный путь, добавь его в кейсы `localized pathnames` ([routing.spec.ts](../tests/e2e/routing.spec.ts)) и в проверку sitemap ([seo.spec.ts](../tests/e2e/seo.spec.ts)).
4. Служебная страница с `noindex` — проверь мету `robots` и отсутствие в sitemap, как у `/demo/*`.
5. Для состояний после действия (ошибки, toast, модалки) напиши тест, который до них доходит, и проверь текст на нелатинской локали.

Пример:

```ts
// Example: tests/e2e/pricing.spec.ts
import { expect, test } from './fixtures'

test('pricing renders localized prices', async ({ page }) => {
  await page.goto('/uk/pricing')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ціни')
  await expect(page.locator('html')).toHaveAttribute('lang', 'uk')
})
```

Тексты в тестах — литералы на конкретном языке. Так тест падает, если на странице показался ключ вместо перевода или текст не той локали.

### Новая локаль

1. `check:translations` и e2e подхватят её сами. Скрипт берёт список из `routing.locales`, а `LOCALES` в [fixtures.ts](../tests/e2e/fixtures.ts) — это тот же `routing.locales`. Обход страниц и тест `<html lang dir>` пройдут по новой локали без правок.
2. Направление текста задай в `TEXT_DIRECTION` ([src/shared/config/locales.ts](../src/shared/config/locales.ts)). Это `Record<Locale, …>`, так что `typecheck` не пропустит локаль без записи. Проверено: с `de` в `routing.locales` он падает на `TEXT_DIRECTION`, а заодно на `OG_LOCALE` и демо-постах, они тоже `Record<Locale, …>`. Тест `<html lang dir>` берёт ожидаемое значение оттуда же.
3. Добавь ожидаемые строки там, где тест завязан на конкретную локаль: локализованные пути, 404, plural-демо.

Остальные шаги добавления локали — в [AGENTS.md](../AGENTS.md) и [15-production-checklist.md](./15-production-checklist.md).
