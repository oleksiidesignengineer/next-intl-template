# Локализованные pathnames

## Когда оправданы

- **Публичные SEO-страницы** — контент-сайт, лендинги, маркетинговые страницы. Пользователи и поисковики получают URL на родном языке, что улучшает кликабельность и ранжирование.
- **Когда поисковики на других языках лучше ранжируют локализованные URL** — например, Яндекс лучше ранжирует `/ru/o-nas` по сравнению с `/ru/about` по русскоязычным запросам.
- **Когда URL — часть бренда** — переводы slug'ов говорят пользователю «этот сайт сделан для тебя».

## Когда НЕ оправданы

- **Внутренние дашборды и админки** — URL видит только залогиненный пользователь, SEO неважен.
- **Когда контент полностью одинаковый** для всех локалей и важна простота поддержки — достаточно менять язык интерфейса, оставляя URL неизменными.
- **Динамические приложения** (SaaS, кабинет пользователя) — там URL обычно содержат ID, и локализовать нечего.

## Принцип: `pathnames` — только для маршрутов с РАЗНЫМИ URL

Это ключевое решение в шаблоне. В `src/shared/i18n/routing.ts`:

```ts
pathnames: {
  '/about': { en: '/about', ru: '/o-nas', uk: '/pro-nas' },
},
```

Только один маршрут — потому что только у него URL отличается между локалями. Страницы `/`, `/demo/plurals`, `/demo/formats` тут НЕТ — их URL одинаковый для всех локалей, и next-intl просто добавляет префикс локали (`/ru`, `/uk`) в рантайме без всякой карты.

Если бы мы перечислили все страницы:

```ts
// Так делать НЕ нужно
pathnames: {
  '/': '/',
  '/about': { en: '/about', ru: '/o-nas', uk: '/pro-nas' },
  '/demo/plurals': '/demo/plurals',
  '/demo/formats': '/demo/formats',
},
```

это был бы бойлерплейт ради единственной цели — успокоить typed `Link` из `@/shared/i18n/navigation`.

## Как работает Link

**Ключ в `pathnames`** — canonical внутренний путь. Это путь в файловой системе (`src/app/[locale]/about/page.tsx`) и то, что пишется в `<Link href>`.

**Значение** — внешний URL. Строка — одинаковый URL для всех локалей. Объект — отдельный URL для каждой.

`<Link href="/about">` автоматически отрендерит правильный URL:
- локаль `en` → `/about`
- локаль `ru` → `/ru/o-nas`
- локаль `uk` → `/uk/pro-nas`

Нет необходимости знать в компоненте, какая локаль активна.

## Trade-off с типобезопасностью

Когда `pathnames` определён, типизированный `Link` из `@/shared/i18n/navigation` становится строгим: он принимает **только** ключи из `pathnames`. То есть `<Link href="/demo/plurals">` дал бы TypeScript-ошибку, потому что `/demo/plurals` не в карте.

Чтобы не описывать каждый маршрут только ради типов, шаблон использует тонкую обёртку — [`src/shared/ui/Link.tsx`](../src/shared/ui/Link.tsx):

```tsx
import { Link as I18nLink } from '@/shared/i18n/navigation'
import type { ComponentProps } from 'react'

type LinkProps = Omit<ComponentProps<typeof I18nLink>, 'href'> & {
  href: string
}

export default function Link({ href, ...rest }: LinkProps) {
  return <I18nLink href={href as never} {...rest} />
}
```

В компонентах импортируется ОНА:

```tsx
import Link from '@/shared/ui/Link'

<Link href="/about">About</Link>          // → /about | /ru/o-nas | /uk/pro-nas
<Link href="/demo/plurals">Plurals</Link>  // → /demo/plurals | /ru/demo/plurals | ...
```

Каст `href as never` живёт в одном файле. Runtime поведение не меняется — next-intl сам разрулит локаль и `pathnames`-маппинг.

**Что теряется**: compile-time проверка на опечатки. `<Link href="/abuot">` не упадёт на этапе сборки — поломку увидишь только в браузере (404).

**Когда вернуть строгую типизацию** — добавь маршрут в `pathnames` и импортируй `Link` напрямую из `@/shared/i18n/navigation`. Тогда TypeScript будет ругаться на опечатки именно в этом маршруте.

## Динамические сегменты

В шаблоне не реализовано, но паттерн такой:

```ts
pathnames: {
  '/blog/[slug]': {
    en: '/blog/[slug]',
    ru: '/blog/[slug]',
    de: '/artikel/[slug]',
    fr: '/articles/[slug]',
  },
}
```

Использование в компоненте — передаём объект `{ pathname, params }`:

```tsx
<Link href={{ pathname: '/blog/[slug]', params: { slug: 'hello-world' } }}>
  Read more
</Link>
```

Для `locale: 'de'` отрендерится как `/de/artikel/hello-world`.

Динамические маршруты в `pathnames` всегда стоит описывать явно — обёртка `Link` принимает только строки, для объектной формы понадобится прямой импорт из `@/shared/i18n/navigation`.

## Catch-all сегменты

```ts
pathnames: {
  '/categories/[...slug]': {
    en: '/categories/[...slug]',
    de: '/kategorien/[...slug]',
  },
}
```

Использование:

```tsx
<Link href={{ pathname: '/categories/[...slug]', params: { slug: ['electronics', 'phones'] } }}>
  Phones
</Link>
```
