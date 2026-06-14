# next-intl template

Шаблон мультиязычности для Next.js 16 на базе [next-intl](https://next-intl.dev/).

## Что внутри

- **Next.js 16** App Router с `proxy.ts` (бывший middleware)
- **next-intl 4.x** с типобезопасными ключами переводов
- **3 локали**: English (default), Русский, Українська
- **Локализованные URL** (`/about` ↔ `/ru/o-nas` ↔ `/uk/pro-nas`) через `pathnames` mapping
- **ICU сообщения**: plural, select, интерполяция, rich text
- **Глобальные форматы** дат, чисел, валют через `request.ts`
- **SEO**: локализованный `sitemap.xml` с `hreflang`, переводы в metadata

## Структура URL

| Локаль | Home | About | Plurals | Formats |
|---|---|---|---|---|
| `en` (default) | `/` | `/about` | `/demo/plurals` | `/demo/formats` |
| `ru` | `/ru` | `/ru/o-nas` | `/ru/demo/plurals` | `/ru/demo/formats` |
| `uk` | `/uk` | `/uk/pro-nas` | `/uk/demo/plurals` | `/uk/demo/formats` |

## Запуск

```bash
npm install
npm run dev
```

Открой [http://localhost:3000](http://localhost:3000).

## Документация

Подробное руководство — в [docs/](./docs/):

1. [Обзор](./docs/00-overview.md) — что и зачем
2. [Установка и конфигурация](./docs/01-setup.md)
3. [App Router и [locale]](./docs/02-app-router.md)
4. [Переводы (server vs client)](./docs/03-translations.md)
5. [ICU сообщения](./docs/04-icu-messages.md)
6. [Форматирование](./docs/05-formatting.md)
7. [Навигация и language switcher](./docs/06-navigation.md)
8. [Метаданные и SEO](./docs/07-metadata-seo.md)
9. [Локализованные URL (pathnames)](./docs/08-pathnames.md)
10. [Страницы ошибок](./docs/09-error-pages.md)
11. [FAQ и грабли](./docs/10-faq.md)
12. [Динамические роуты](./docs/11-dynamic-routes.md) — `/blog/[slug]` с `generateStaticParams`
13. [Server Actions с переводами](./docs/12-server-actions.md) — `/contact` форма с zod-валидацией
14. [Сохранение локали (cookie + Route Handler)](./docs/13-locale-persistence.md)

## Стек

- Next.js 16.2.6
- React 19.2.4
- next-intl 4.12.0
- TypeScript 5
- Tailwind v4
