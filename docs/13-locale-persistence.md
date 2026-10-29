# Запоминание выбранной локали: cookie `NEXT_LOCALE`

Коротко:

- При префиксной маршрутизации язык задаёт URL. Cookie влияет только на URL без префикса: при `as-needed` это `/`, `/about`, `/blog` и т.д.
- Cookie в шаблоне сессионная, как по умолчанию в next-intl. Долгий `maxAge` включается явно (opt-in).
- Писать cookie в коде приложения не нужно: её ставят proxy (на document-запросах) и навигация next-intl (на клиенте).
- Исключение — смена языка на сервере, например после логина. Там нужны Server Action, `cookies().set()` и `redirect({ href, locale })`.
- Route Handler `/api/locale` удалён.
- Если перед приложением стоит CDN, proxy должен выполняться до кеша.

Все ответы proxy ниже сняты curl с production-сборки шаблона.

## Где cookie влияет на язык, а где нет

Proxy выбирает локаль в таком порядке: префикс в URL → cookie → `Accept-Language` → `defaultLocale`. Cookie и `Accept-Language` участвуют, только пока `localeDetection: true`.

| Запрос | Ответ |
|---|---|
| `/` + `Accept-Language: ru` | 307 → `/ru` |
| `/` + `Cookie: NEXT_LOCALE=uk` | 307 → `/uk` |
| `/about` + `Cookie: NEXT_LOCALE=ru` | 307 → `/ru/o-nas` |
| `/ru` + `Cookie: NEXT_LOCALE=uk` (document) | 200, страница на русском, `Set-Cookie: NEXT_LOCALE=ru` |
| `/en/about` + `Cookie: NEXT_LOCALE=ru` (document) | 307 → `/about`, `Set-Cookie: NEXT_LOCALE=en` |

Отсюда главное: **язык меняется переходом на URL другой локали, а не записью cookie.** Страницы `/ru/*` пререндерены на русском, и на первом же document-запросе proxy вернёт cookie к значению из префикса. Схема «записать cookie и вызвать `router.refresh()`» на префиксных URL не работает. Она осмысленна только при `localePrefix: 'never'` ([08-pathnames.md](./08-pathnames.md)).

## Почему cookie сессионная

В [src/shared/i18n/routing.ts](../src/shared/i18n/routing.ts) `localeCookie` не задан, поэтому действуют дефолты next-intl: имя `NEXT_LOCALE`, `SameSite=Lax`, без `Max-Age`. Документация next-intl объясняет: «To be compliant out of the box, `next-intl` does not set the `max-age` value of the cookie, making it a session cookie that expires when a browser is closed».

Это важно потому, что proxy ставит cookie и тем, кто ничего не выбирал. В `syncCookie` два условия: cookie есть, но не совпадает с локалью запроса, или cookie нет, а локаль запроса не совпадает с лучшим совпадением по `Accept-Language`. Второе условие срабатывает и у тех, кто язык не выбирал. Проверено:

- открыл присланную ссылку `/ru/o-nas` из английского браузера → `Set-Cookie: NEXT_LOCALE=ru`;
- запрос вообще без `Accept-Language` (боты, curl) → `/` отдаёт `Set-Cookie: NEXT_LOCALE=en`.

Годовая cookie в таких случаях хранила бы предпочтение, которое пользователь не выражал. По ePrivacy/GDPR это, скорее всего, вопрос согласия (оценка, не юридическая консультация). Требования различаются по регионам, и next-intl прямо советует проверять их самостоятельно.

**Цена сессионной cookie при `as-needed`.** После перезапуска браузера выбор дефолтной локали забывается: `/about` с `Accept-Language: ru` снова уводит на `/ru/o-nas`. Выбор остальных локалей держится в самом URL (закладки, история), поэтому на них это почти не влияет.

**Как включить долгую cookie** (opt-in, комментарий об этом есть в `routing.ts`):

```ts
// Example
localeCookie: { maxAge: 60 * 60 * 24 * 365 },
```

С ней, вероятно, понадобится cookie-баннер или согласие. Документация next-intl отдельно советует увеличивать `maxAge` при `localePrefix: 'never'`: там cookie — единственное место, где хранится выбор. При `as-needed` пользы от неё меньше, а юридическая цена та же.

**`localeCookie: false`** ставь только вместе с `localeDetection: false`. Иначе при `as-needed` пользователь с «чужим» `Accept-Language` не сможет остаться на дефолтной локали ([08-pathnames.md](./08-pathnames.md#прочие-опции-кратко)).

## Кто и когда ставит cookie

**1. Proxy — только на document-запросах** (с next-intl 4.13.3). Prefetch, RSC-запросы при soft-навигации и ревалидация cookie не трогают. Проверено: тот же `/ru/o-nas` с `Sec-Fetch-Dest: empty` отвечает без `Set-Cookie`. Запрос вообще без `Sec-Fetch-Dest` (curl, боты, старые клиенты) proxy считает document-запросом (`if (secFetchDest != null && secFetchDest !== 'document') return`). Поэтому голый curl на `/` в замере выше получил `Set-Cookie`. Комментарий в исходнике next-intl (`middleware/syncCookie.js`):

> Only document requests indicate that the user is actually navigating to a page—in contrast to background requests of the client-side router like prefetches and cache revalidations. […] Locale switches via a soft navigation update the cookie on the client side.

Поменял в `routing.localeCookie` имя или атрибуты — proxy возьмёт их оттуда же.

**2. Клиентская навигация next-intl** пишет `document.cookie` с атрибутами из `routing.localeCookie`. Это делают:
- `useRouter().push/replace/prefetch` с опцией `locale`, отличной от текущей, — перед навигацией;
- `<Link locale>` с другой локалью — по клику.

`path` равен `basePath` или `/`. На клиенте `basePath` next-intl берёт из env, который задаёт `createNextIntlPlugin`, поэтому плагин в [next.config.ts](../next.config.ts) нужен и для этого. LangSwitcher работает через этот механизм, а e2e проверяет, что после переключения cookie равна `ru` ([tests/e2e/i18n.spec.ts](../tests/e2e/i18n.spec.ts)).

**3. Не ставят cookie:**
- `next/link` и `useRouter` из `next/navigation`;
- `fetch`;
- серверный `redirect` из `@/shared/i18n/navigation`: в его серверной сборке кода для cookie нет.

Cookie остаётся со старым языком, и следующий заход на `/` уведёт на него. Поэтому внутренние переходы идут только через API из [06-navigation.md](./06-navigation.md).

## После логина: язык из профиля

Типичная задача: в профиле хранится `preferredLocale`, и после входа пользователь должен попасть на свой язык. Пример (в шаблоне такого action нет):

```ts
// Example
'use server'

import { hasLocale } from 'next-intl'
import { cookies } from 'next/headers'

import { redirect } from '@/shared/i18n/navigation'
import { routing } from '@/shared/i18n/routing'

export async function signIn(formData: FormData) {
  const user = await authenticate(formData) // your auth
  const locale = hasLocale(routing.locales, user.preferredLocale)
    ? user.preferredLocale
    : routing.defaultLocale

  // Same name and attributes as next-intl's own cookie (defaults: NEXT_LOCALE,
  // SameSite=Lax, no Max-Age). Mirror any routing.localeCookie overrides here.
  const store = await cookies()
  store.set('NEXT_LOCALE', locale, { sameSite: 'lax' })

  // '/' is not in `pathnames`, so the typed href needs a cast (docs/08)
  redirect({ href: '/' as never, locale })
}
```

**Зачем cookie руками.** При включённом JS `redirect` из Server Action не порождает document-запрос. Next сам запрашивает целевую страницу на сервере RSC-запросом с заголовками браузера (`Sec-Fetch-Dest: empty`) и отдаёт её в ответе action. Proxy считает такой запрос фоновым и cookie не синхронизирует, а серверный `redirect` next-intl её не трогает. Без `store.set` пользователь со старой cookie `ru`, которому нужен `en`, снова увидит русскую страницу. Проверено настоящим action (сниппет выше) в Chromium, Firefox и WebKit на production-сборке: старт с `/ru/...` с cookie `ru`, цель — `en`.

| Вариант action | JS включён | Без JS |
|---|---|---|
| как в примере, со `store.set` | `/`, страница английская, cookie `en` | то же |
| без `store.set` | адрес `/`, а страница русская (`lang="ru"`); после перезагрузки — `/ru` | `/ru` |
| без `store.set`, `forcePrefix: true` | адрес `/en`, а страница русская | `/`, английская |

Механика видна по RSC-запросам, которые сервер делает за action: `/` + `Cookie: NEXT_LOCALE=ru` → 307 `/ru`, а `/en` → 307 `/` без `Set-Cookie`. Без JS ответ action — 303, браузер идёт по нему document-запросом, и на `/en` proxy сам переписывает cookie. Поэтому `forcePrefix` выручает только без JS, а с JS — нет. Вариант со `store.set` работает в обоих режимах. С JS Next подставляет cookie, поставленные action, во внутренний запрос к целевой странице (в `next/dist/server/app-render/action-handler.js`: «responseCookies always take precedence»). Без JS браузер сохраняет `Set-Cookie` из 303 до перехода.

**Атрибуты должны совпадать с `routing.localeCookie`.**
- Если разойдутся `path` или `domain`, получатся две разные cookie с одним именем. `cookies().set()` по умолчанию ставит `Path=/` (документация Next: «The only option with a default value is `path`»). При `basePath` передай `path: basePath`, как делает next-intl.
- Если разойдутся `maxAge` или `secure`, cookie останется одна, но её срок жизни и флаги будут зависеть от того, кто записал её последним: action или proxy/клиент. Включил их в `routing.ts` — добавь и сюда. А лучше вынеси объект с атрибутами в константу рядом с `routing` и используй его в обоих местах.

Ещё три детали:
- **Локаль в action передаётся явно**, root params в Server Actions недоступны ([12-server-actions.md](./12-server-actions.md)). `preferredLocale` из БД всё равно валидируй через `hasLocale`.
- **`redirect` вызывай вне `try/catch`**: он бросает исключение.
- **Смена языка в настройках профиля** делается тем же приёмом: сохранить в БД, поставить cookie, сделать `redirect` на ту же страницу в новой локали.

## Почему удалён `/api/locale`

В шаблоне был Route Handler `POST /api/locale`, который ставил cookie. Удалён по четырём причинам:

1. **Избыточен.** При префиксной маршрутизации next-intl сам ставит cookie на клиенте и в proxy.
2. **Обещанный сценарий не работал.** «POST cookie + `router.refresh()` показывает новый язык» ломался на префиксных URL: `/ru` с `Cookie: NEXT_LOCALE=uk` отдаёт русскую страницу и переписывает cookie обратно.
3. **Самописная проверка Origin была неполной.** Она сравнивала `Origin` только с `Host`, поэтому за reverse proxy, который меняет `Host`, давала ложный 403. В Server Actions проверка встроена (документация Next, `serverActions`): «Next.js compares the host in a request's `Origin` header against the app's own host, taken from `x-forwarded-host` or `host`, and rejects the action when the two differ».
4. **Атрибуты cookie расходились с proxy.** Handler в production ставил `Secure`, а proxy нет. Общие константы покрывали только имя и `maxAge`, а `secure` handler добавлял сам.

HTTP-эндпоинт имеет смысл, только если локаль меняет клиент вне React-навигации и без префиксов в URL: нативное приложение или WebView при `localePrefix: 'never'`. Тогда нужно:
- валидировать локаль через `hasLocale`;
- проверять `Origin` против `x-forwarded-host ?? host` (или использовать токен);
- задать политику для запросов без `Origin`;
- ставить атрибуты cookie ровно как в `routing.localeCookie`.

## CDN и кеширование

Ответ на URL без префикса зависит от заголовков, которых нет в ключе кеша. Вот что отдаёт production-сборка на `/` без cookie и `Accept-Language` (выборка заголовков):

```
HTTP/1.1 200 OK
set-cookie: NEXT_LOCALE=en; Path=/; SameSite=lax
Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch, Accept-Encoding
Cache-Control: s-maxage=31536000
```

Тот же `/` с `Accept-Language: ru` отдаёт 307 → `/ru`, с `Cookie: NEXT_LOCALE=uk` — 307 → `/uk`. У редиректов proxy нет `Cache-Control`. В `Vary` нет ни `Cookie`, ни `Accept-Language`.

**Правильная схема — proxy до кеша.** Документация Next.js ([CDN Caching](https://nextjs.org/docs/app/guides/cdn-caching)): «`proxy.js` should run before the CDN cache so it remains the source of truth for auth, redirects, and rewrites. If your deployment places `proxy.js` behind the CDN, configure the cache layer to bypass caching for routes that depend on `proxy.js` decisions». Vercel работает именно так: Routing Middleware «runs globally before the cache» ([документация Vercel](https://vercel.com/docs/routing-middleware)). У `next start` без внешнего CDN кеш Next тоже стоит после proxy.

**Что ломается, если CDN стоит перед приложением и кеширует по URL** (Cloudflare, CloudFront, nginx `proxy_cache` и т.п.):

- Закешированный 200 для `/` (`s-maxage` на год) раздаётся всем. Detection по cookie и `Accept-Language` на URL без префикса перестаёт работать: пользователь, выбравший `uk`, получает английскую главную.
- Если правило «cache everything» закеширует 307 от proxy, всех уведёт на одну локаль. По HTTP-спецификации (RFC 9110, §15.1) 307 без `Cache-Control` эвристически не кешируется, но агрессивные правила CDN это обходят.
- Ответы с `Set-Cookie` разные CDN обрабатывают по-разному: одни не кешируют, другие вырезают заголовок или кешируют вместе с ним. Проверь это в документации своего CDN.

**Варианты, если proxy за CDN:**

1. **Не кешировать в общем кеше URL без префикса** (при `as-needed` это все страницы дефолтной локали) или включить в ключ кеша значение `NEXT_LOCALE` и нормализованный язык из `Accept-Language`. Ответы proxy с 307 не кешировать.
2. **Сделать ответы однозначными по URL.** Вариант первый — `localePrefix: 'always'`: страницы всегда с префиксом, а без префикса идут только 307. Вариант второй — `localeDetection: false` вместе с `localeCookie: false`: URL без префикса всегда отдаёт дефолтную локаль. Плата — префикс у основного рынка или потеря автоопределения языка. Компромиссы описаны в [08-pathnames.md](./08-pathnames.md#localeprefix-as-needed-always-never).

Префиксные страницы тоже иногда несут `Set-Cookie`: `/ru/o-nas` из английского браузера отдаёт `Set-Cookie: NEXT_LOCALE=ru` вместе с `s-maxage`. Повторная раздача этой cookie согласована с URL, поэтому сама по себе безвредна, но правило для `Set-Cookie` на CDN всё равно должно быть осознанным.

Чек-лист перед продакшном — в [15-production-checklist.md](./15-production-checklist.md), тесты — в [14-testing.md](./14-testing.md).
