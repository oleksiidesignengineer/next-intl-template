import { type BlogPost } from '../model/types'

export const blogPosts: BlogPost[] = [
  {
    slug: 'hello-world',
    publishedAt: '2026-04-12T10:00:00Z',
    translations: {
      en: {
        title: 'Hello, world!',
        excerpt: 'A first post showing how dynamic routes work in this template.',
        body: 'This page is statically generated for every locale at build time via generateStaticParams. The slug is the same across locales, but the URL gets the locale prefix automatically.\n\nThe content you see here is hardcoded in src/entities/post/api/posts.ts — in a real project you would fetch it from a CMS (Sanity, Strapi, Contentful) or a database, passing the active locale to filter translations.',
      },
      ru: {
        title: 'Привет, мир!',
        excerpt: 'Первый пост, демонстрирующий работу динамических роутов в шаблоне.',
        body: 'Эта страница статически генерируется для каждой локали на этапе build через generateStaticParams. Slug одинаковый для всех локалей, но URL автоматически получает префикс локали.\n\nКонтент, который ты видишь, захардкожен в src/entities/post/api/posts.ts — в реальном проекте ты бы получал его из CMS (Sanity, Strapi, Contentful) или базы данных, передавая активную локаль для выбора переводов.',
      },
      uk: {
        title: 'Привіт, світ!',
        excerpt: 'Перший пост, що демонструє роботу динамічних роутів у шаблоні.',
        body: 'Ця сторінка статично генерується для кожної локалі на етапі build через generateStaticParams. Slug однаковий для всіх локалей, але URL автоматично отримує префікс локалі.\n\nКонтент, який ти бачиш, захардкоджений у src/entities/post/api/posts.ts — у реальному проєкті ти б отримував його з CMS (Sanity, Strapi, Contentful) або бази даних, передаючи активну локаль для вибору перекладів.',
      },
    },
  },
  {
    slug: 'next-intl-tips',
    publishedAt: '2026-04-28T14:30:00Z',
    translations: {
      en: {
        title: 'Three next-intl tips you might miss',
        excerpt: 'useNow for stable hydration, formats in request.ts, and the pathnames trade-off.',
        body: 'Tip 1: useNow({ updateInterval: 1000 }) keeps relative time fresh on the client while staying hydration-safe.\n\nTip 2: Define formats centrally in src/shared/i18n/request.ts so format.dateTime(d, "short") works everywhere with one source of truth.\n\nTip 3: Keep pathnames minimal — only routes whose URL truly differs per locale. The Link wrapper at src/shared/ui/Link.tsx makes this scale.',
      },
      ru: {
        title: 'Три приёма next-intl, которые легко пропустить',
        excerpt: 'useNow для стабильной гидратации, formats в request.ts и trade-off pathnames.',
        body: 'Приём 1: useNow({ updateInterval: 1000 }) держит относительное время свежим на клиенте, не ломая гидратацию.\n\nПриём 2: задавай форматы в src/shared/i18n/request.ts централизованно, чтобы format.dateTime(d, "short") работал везде с единой точкой правды.\n\nПриём 3: держи pathnames минимальным — только маршруты, чьи URL реально отличаются по локалям. Обёртка Link в src/shared/ui/Link.tsx делает это масштабируемым.',
      },
      uk: {
        title: 'Три прийоми next-intl, які легко пропустити',
        excerpt: 'useNow для стабільної гідратації, formats у request.ts і trade-off pathnames.',
        body: 'Прийом 1: useNow({ updateInterval: 1000 }) тримає відносний час свіжим на клієнті, не ламаючи гідратацію.\n\nПрийом 2: задавай формати в src/shared/i18n/request.ts централізовано, щоб format.dateTime(d, "short") працював усюди з єдиною точкою правди.\n\nПрийом 3: тримай pathnames мінімальним — лише маршрути, чиї URL дійсно відрізняються за локалями. Обгортка Link у src/shared/ui/Link.tsx робить це масштабованим.',
      },
    },
  },
  {
    slug: 'i18n-best-practices',
    publishedAt: '2026-05-10T09:15:00Z',
    translations: {
      en: {
        title: 'i18n best practices for production',
        excerpt: 'Translation parity, fallback strategy, locale persistence — what to set up before launch.',
        body: 'Run npm run check:translations in CI to catch missing keys before they ship.\n\nFor user-set locale preference, use POST /api/locale to persist the choice in a cookie that the next-intl proxy respects.\n\nKeep en.json (or your default locale) as the single source of truth — let TypeScript derive the Messages type from it.',
      },
      ru: {
        title: 'Best practices i18n для продакшена',
        excerpt: 'Паритет переводов, стратегия fallback, сохранение локали — что настроить до релиза.',
        body: 'Запускай npm run check:translations в CI, чтобы ловить пропавшие ключи до того, как они уедут в прод.\n\nДля пользовательского выбора локали используй POST /api/locale — он сохраняет выбор в cookie, которую уважает proxy next-intl.\n\nДержи en.json (или твой defaultLocale) единственной точкой правды — пусть TypeScript выводит из него тип Messages.',
      },
      uk: {
        title: 'Best practices i18n для продакшну',
        excerpt: 'Паритет перекладів, стратегія fallback, збереження локалі — що налаштувати до релізу.',
        body: 'Запускай npm run check:translations у CI, щоб ловити зниклі ключі до того, як вони поїдуть у прод.\n\nДля вибору локалі користувачем використовуй POST /api/locale — він зберігає вибір у cookie, яку поважає proxy next-intl.\n\nТримай en.json (або твій defaultLocale) єдиною точкою правди — нехай TypeScript виводить з нього тип Messages.',
      },
    },
  },
]

export function getAllPosts(): BlogPost[] {
  return [...blogPosts].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug)
}
