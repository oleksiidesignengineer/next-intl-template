# Манифест переноса i18n

Этот шаблон — референс для добавления next-intl локализации в другой
Next.js проект. Документ перечисляет, что копировать и куда.

Шаблон построен по Feature-Sliced Design (см. [FSD_GUIDE.md](./FSD_GUIDE.md)).
i18n-инфраструктура сосредоточена в `shared/`-сегментах — её легко перенести.

## Портируемое i18n-ядро (копировать)

| Что | Путь в шаблоне | Назначение |
|-----|----------------|------------|
| Конфиг роутинга | `src/shared/i18n/routing.ts` | locales, defaultLocale, localePrefix, pathnames |
| Request config | `src/shared/i18n/request.ts` | getRequestConfig, formats, onError, getMessageFallback |
| Навигация | `src/shared/i18n/navigation.ts` | типизированные Link / useRouter / redirect / getPathname |
| Сообщения | `src/shared/i18n/messages/` | переводы `{en,ru,uk}.json` |
| Имена локалей | `src/shared/config/locales.ts` | `LOCALE_NATIVE_NAMES` через `Intl.DisplayNames` |
| SEO-хелперы | `src/shared/seo/` | hreflang alternates, `og:locale` маппинг |
| Link-обёртка | `src/shared/ui/Link.tsx` | `Link` с `href: string` (см. docs/08-pathnames.md) |
| Proxy (middleware) | `src/proxy.ts` | next-intl middleware, корень `src/` |
| Типы | `src/global.d.ts` | `declare module 'next-intl'` — AppConfig |
| Плагин | `next.config.ts` | `createNextIntlPlugin('./src/shared/i18n/request.ts')` |
| Паттерн layout | `src/app/[locale]/layout.tsx` | `NextIntlClientProvider` + `setRequestLocale` + `pickNamespaces` |
| Свитчер языка | `src/features/locale-switch/` | feature-слайс — пример UI-переключателя |

## Демо-контент (НЕ копировать)

Существует только чтобы упражнять i18n-паттерны — в реальный проект не нужен:

- `src/entities/post/` — хардкод-данные блога
- `src/features/contact/` — демо-форма (Server Action + zod)
- `src/widgets/site-header/` — демо-шапка
- `src/app/[locale]/{about,blog,contact,demo}/` — демо-страницы

## Размещение в проекте без FSD

Если целевой проект не на FSD — `shared/i18n/` кладётся в его инфраструктурный
слой (`lib/`, `core/`, `app/lib/` — что используется в проекте). Соответствия:

| Шаблон (FSD) | Проект без FSD |
|---|---|
| `src/shared/i18n/` | `<infra>/i18n/` |
| `src/shared/config/locales.ts` | `<infra>/i18n/locales.ts` |
| `src/shared/seo/` | `<infra>/seo/` |
| `src/shared/ui/Link.tsx` | `<ui>/Link.tsx` |
| `src/proxy.ts`, `src/global.d.ts` | без изменений — корень `src/` |

## Чек-лист добавления локализации

1. Установить `next-intl`.
2. Скопировать `shared/i18n/` — адаптировать список локалей в `routing.ts`.
3. Скопировать `proxy.ts`, `global.d.ts`; добавить плагин в `next.config.ts`.
4. Обернуть публичные маршруты в сегмент `[locale]`; добавить
   `[locale]/layout.tsx` с `NextIntlClientProvider` + `setRequestLocale`.
5. Создать `messages/<locale>.json` под контент проекта.
6. Точечно перенести SEO-хелперы, `Link`-обёртку, свитчер языка — если нужны.

Пошаговые детали по каждому пункту — в `docs/01-setup.md` …
`docs/13-locale-persistence.md`.
