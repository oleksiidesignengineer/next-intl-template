# ICU-сообщения

next-intl разбирает каждую строку перевода как [ICU MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/). Формы множественного числа, выбор по значению, форматирование чисел и дат и разметка описываются в самом сообщении, а не в `if` внутри компонента. Переводчик может поменять порядок слов или формы, не трогая код.

Где посмотреть вживую: [/demo/plurals](../src/app/[locale]/demo/plurals/page.tsx) — серверная часть и клиентский островок [PluralsPlayground](../src/app/[locale]/demo/plurals/_components/PluralsPlayground.tsx), ошибки формы в namespace `contact.errors` и `blog.publishedOn` в [en.json](../src/shared/i18n/messages/en.json).

> Как сообщения попадают в компоненты и как типизируются аргументы — [03-translations.md](./03-translations.md). Глобальные форматы и `useFormatter` — [05-formatting.md](./05-formatting.md).

## Шпаргалка

| Конструкция | В сообщении | Вызов |
|---|---|---|
| Подстановка | `Hello, {name}!` | `t('greeting', { name })` |
| Множественное число | `{count, plural, =0 {no items} one {# item} other {# items}}` | `t('items', { count })` |
| Порядковое число | `{step, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} step` | `t('step', { step })` |
| Выбор по значению | `{role, select, admin {Administrator} editor {Editor} other {User}}` | `t('role', { role })` |
| Число | `{n, number}`, `{n, number, percent}`, `{n, number, ::compact-short}` | `t('key', { n })` |
| Дата и время | `{d, date, long}`, `{d, time, short}`, `{d, date, ::yyyyMMMd}` | `t('key', { d: new Date() })` |
| Разметка | `I agree to the <link>terms</link>` | `t.rich(…)` / `t.markup(…)` |

Сообщения шаблона из [en.json](../src/shared/i18n/messages/en.json):

```json
"items": "{count, plural, =0 {no items} one {# item} other {# items}}",
"greeting": "Hello, {name}!",
"terms": "I agree to the <link>terms</link> and <strong>privacy policy</strong>",
"role": "{role, select, admin {Administrator} editor {Editor} other {User}}",
"step": "{step, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} step",
"downloads": "{count, number, ::compact-short} {count, plural, one {download} other {downloads}}",
```

Четыре правила, которые стоит знать до первого сообщения:

- **`other` обязателен** в `plural`, `selectordinal` и `select`. Без него сообщение не форматируется вообще, для любого значения: вместо текста будет ключ и ошибка `INVALID_MESSAGE`.
- **`#` внутри `plural`/`selectordinal`** — это значение, отформатированное как число по правилам локали: `1,000 items` в en, `1 000 элементов` в ru. Вне plural `#` — обычный символ.
- **`=N` приоритетнее категорий.** `=0 {no items}` срабатывает раньше `other` (en) или `many` (ru). Отдельной категории `zero` в en/ru/uk нет, поэтому `=0` — единственный способ задать фразу для нуля.
- **Конструкция задаёт тип аргумента.** `{n, plural}` требует число, `{d, date}` — `Date`, `{name}` — строку. При включённой типизации ([03-translations.md](./03-translations.md), раздел «Строгие ICU-аргументы») ошибка ловится на компиляции.

## Плюралы: en / ru / uk

Категории задаёт CLDR, а next-intl берёт их из `Intl.PluralRules` конкретной локали:

| Локаль | Категории | Какие числа куда попадают |
|---|---|---|
| en | `one`, `other` | `one`: 1; `other`: всё остальное, включая 0 и дробные |
| ru, uk | `one`, `few`, `many`, `other` | `one`: 1, 21, 101 (но не 11); `few`: 2–4, 22–24 (но не 12–14); `many`: 0, 5–20, 25–30, 111; `other`: дробные (1,5) |

**В ru и uk пиши все четыре категории.** Сообщения шаблона:

```json
"items": "{count, plural, =0 {нет элементов} one {# элемент} few {# элемента} many {# элементов} other {# элемента}}",
```

```json
"items": "{count, plural, =0 {немає елементів} one {# елемент} few {# елементи} many {# елементів} other {# елемента}}",
```

| `count` | 0 | 1 | 2 | 5 | 21 | 1.5 |
|---|---|---|---|---|---|---|
| ru | нет элементов | 1 элемент | 2 элемента | 5 элементов | 21 элемент | 1,5 элемента |
| uk | немає елементів | 1 елемент | 2 елементи | 5 елементів | 21 елемент | 1,5 елемента |

**Классический баг** — скопировать структуру en в ru:

```json
"items": "{count, plural, one {# товар} other {# товаров}}"
```

На `3` получится «3 товаров», на `21` — случайно верное «21 товар». `npm run check:translations` такое не пропустит: если сообщение указывает хоть одну категорию кроме `other`, оно обязано указать все категории своей локали. Категории, которых у локали нет, тоже ошибка. Вывод скрипта для обоих случаев: сообщение выше и `one` в ru-`selectordinal` (прогон на копии словарей с внесёнными ошибками):

```
✗ 2 translation problem(s):
  - ru: plurals.items — {count, plural} is missing few, many (CLDR for ru: one, few, many, other)
  - ru: plurals.step — {step, selectordinal} has categories one that ru doesn't use (CLDR: other)
```

Почему ошибки формы — `{min, plural, …}`, а не просто `{min}`:

```json
"messageTooShort": "{min, plural, one {Минимум # символ} few {Минимум # символа} many {Минимум # символов} other {Минимум # символа}}",
```

Во-первых, форма слова: «Минимум 10 символов», но «Минимум 2 символа». Во-вторых, тип: простой `{min}` типизируется как `string`, а схема передаёт число ([schema.ts](../src/features/contact/model/schema.ts)). Если в ru/uk заменить `{min, plural, …}` на простой `{min}`, а в en оставить plural, `check:translations` сообщит `{min} is not declined: en uses {min, plural, …} and ru has 4 plural forms`.

### Переменные внутри веток

Именованные аргументы подставляются внутри веток `plural`/`select` — это валидный ICU:

```json
"purchase": "{count, plural, one {{name} купил # товар} few {{name} купил # товара} many {{name} купил # товаров} other {{name} купил # товара}}"
```

```ts
t('purchase', { name: 'Alex', count: 1 })   // "Alex купил 1 товар"
t('purchase', { name: 'Alex', count: 3 })   // "Alex купил 3 товара"
t('purchase', { name: 'Alex', count: 5 })   // "Alex купил 5 товаров"
t('purchase', { name: 'Alex', count: 21 })  // "Alex купил 21 товар"
t('purchase', { name: 'Alex', count: 1.5 }) // "Alex купил 1,5 товара"
```

Это пример, такого ключа в шаблоне нет. Держи всю фразу внутри ветки, а не только слово: в других языках от числа может зависеть и глагол, и порядок слов.

## `selectordinal`: порядковые числа

Порядковые категории — отдельный набор CLDR, он не совпадает с `plural`:

| Локаль | Категории | Распределение |
|---|---|---|
| en | `one`, `two`, `few`, `other` | 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd, 23rd |
| ru | `other` | одна форма на все числа |
| uk | `few`, `other` | `few`: 3, 23, 33… (но не 13); `other`: всё остальное |

Сообщения шаблона, по одной строке из en, ru и uk ([page.tsx](../src/app/[locale]/demo/plurals/page.tsx) рендерит их на сервере):

```json
"step": "{step, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} step",
```

```json
"step": "{step, selectordinal, other {#-й}} шаг",
```

```json
"step": "{step, selectordinal, other {#-й}} крок",
```

Для `[1, 2, 3, 4, 11, 22]` en даёт `1st step · 2nd step · 3rd step · 4th step · 11th step · 22nd step`, ru — `1-й шаг · 2-й шаг · … · 22-й шаг`.

- **en:** не обрабатывай 11–13 вручную через `=11`, CLDR уже относит их к `other`.
- **uk:** у «крок» мужской род, и сокращение «-й» одинаково для всех чисел, поэтому хватает `other`. Категория `few` нужна, когда сокращённая форма зависит от числа. Если добавишь `few`, проверка потребует и `other` — это полный набор для uk.
- **ru:** категорий кроме `other` нет. `one`/`few` в ru-ordinal — ошибка `check:translations`.

## Числа и даты внутри сообщений

### Встроенные стили и скелетоны

- **Числа:** `{n, number}` — формат по умолчанию для локали, `{n, number, percent}` — проценты. Встроенный `currency` без кода валюты падает (`FORMATTING_ERROR: Currency code is required with currency style`, вместо текста — ключ). Валюту задают либо глобальным форматом (так делает шаблон, см. ниже), либо скелетоном `::currency/EUR`.
- **Даты:** стили `short`, `medium`, `long`, `full` для `date` и `time`. В шаблоне `short` и `long` перекрыты глобальными форматами, причём и для `time` ([ниже](#глобальные-форматы-перекрывают-встроенные-стили)).
- **Скелетоны** начинаются с `::` и описывают формат прямо в сообщении, без глобальной конфигурации.

| Скелетон | en | ru | uk |
|---|---|---|---|
| `{n, number, ::compact-short}` (1 500 / 1 200 000) | 1.5K / 1.2M | 1,5 тыс. / 1,2 млн | 1,5 тис. / 1,2 млн |
| `{n, number, ::.##}` (3.14159) | 3.14 | 3,14 | 3,14 |
| `{d, date, ::yyyyMMMd}` (15 марта 2026) | Mar 15, 2026 | 15 мар. 2026 г. | 15 бер. 2026 р. |

В шаблоне скелетон стоит в `downloads`, вместе с `plural` по тому же аргументу:

```json
"downloads": "{count, number, ::compact-short} {count, plural, one {загрузка} few {загрузки} many {загрузок} other {загрузки}}",
```

ru: `1 загрузка · 1,5 тыс. загрузок · 1,2 млн загрузок`. Форма слова выбирается по самому числу (1500 → `many`), а не по сокращённой записи «1,5».

### Глобальные форматы перекрывают встроенные стили

Глобальные форматы из [request.ts](../src/shared/i18n/request.ts) доступны в сообщениях по имени:

```ts
export const formats = {
  dateTime: {
    short: { day: 'numeric', month: 'short', year: 'numeric' },
    long: { day: 'numeric', month: 'long', year: 'numeric' },
    withTime: {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      // 'numeric', not '2-digit': "8:30 PM" in en, "20:30" in ru/uk.
      hour: 'numeric',
      minute: '2-digit',
    },
  },
  number: {
    currency: { style: 'currency', currency: 'EUR' },
    percent: { style: 'percent', maximumFractionDigits: 1 },
  },
} satisfies Formats
```

Если имя совпадает со встроенным ICU-стилем (`short`/`medium`/`long`/`full` у дат, `integer`/`percent`/`currency` у чисел), глобальный формат перекрывает этот стиль внутри сообщений. next-intl документирует обращение к глобальным форматам из сообщений по имени (пример с `{orderDate, date, short}` на странице configuration → formats), но о перекрытии легко забыть. Две детали на страницах configuration, dates-times и numbers не описаны, их видно в исходниках use-intl (`convertFormatsToIntlMessageFormat`) и intl-messageformat (`mergeConfig`):

- **Формат накладывается, а не заменяет.** Поля глобального формата заменяют одноимённые поля встроенного стиля, остальные поля стиля остаются. Форматы шаблона задают те же поля, что встроенные `date`-стили (`day`, `month`, `year`), поэтому для `{d, date, short}` и `{d, date, long}` это полная замена.
- **`dateTime`-форматы действуют и на `date`, и на `time`.** next-intl подставляет один и тот же набор и в `{d, date, …}`, и в `{d, time, …}`. Поэтому в шаблоне `{d, time, short}` выводит дату вместе со временем: встроенные `hour` и `minute` плюс `day`, `month`, `year` из глобального `short`.

Для `d = new Date('2026-03-15T18:30:00Z')` и `timeZone: 'Europe/Kyiv'`:

| Сообщение | Без глобальных форматов | С форматами шаблона |
|---|---|---|
| `{d, date, short}`, en | 3/15/26 | Mar 15, 2026 |
| `{d, date, short}`, ru | 15.03.26 | 15 мар. 2026 г. |
| `{d, date, long}`, ru | 15 марта 2026 г. | 15 марта 2026 г. |
| `{d, time, short}`, en | 8:30 PM | Mar 15, 2026, 8:30 PM |
| `{x, number, percent}`, en, 0.8765 | 88% | 87.7% |
| `{x, number, currency}`, en, 9.5 | ошибка, вместо текста ключ | €9.50 |

В `format.dateTime(date, 'short')` наложения нет: там берётся только глобальный формат, встроенных стилей у `format.*` нет.

`long` в шаблоне совпадает со встроенным ICU-стилем, поэтому `blog.publishedOn` (`Published on {date, date, long}`) выводит только дату: «Published on April 12, 2026», «Опубликовано 12 апреля 2026 г.». Формат со временем заведён под собственным именем `withTime`, и его тоже можно звать из сообщения: `{d, date, withTime}` → «15 марта 2026 г. в 20:30». Правило: встроенное имя переопределяй, только если хочешь изменить его во всём приложении, включая `{d, time, …}`. Для нового варианта заводи своё имя.

**Грабли:** имя формата внутри сообщения не проверяет никто. `Formats` в `AppConfig` типизирует только вызовы `format.*`, а `createMessagesDeclaration` — только тип аргумента. В рантайме неизвестное имя тихо заменяется форматом по умолчанию: `{d, date, nope}` → `3/15/2026`, без ошибки.

Подробнее о форматах, `timeZone` и `now` — [05-formatting.md](./05-formatting.md).

## Разметка: `t.rich` и `t.markup`

### `t.rich` — React-узлы внутри перевода

Теги в сообщении сопоставляются функциям, которые получают содержимое тега (`chunks`) и возвращают React-узел. Пример из [PluralsPlayground](../src/app/[locale]/demo/plurals/_components/PluralsPlayground.tsx):

```tsx
{t.rich('terms', {
  // A query string still gets the localized pathname: /ru/o-nas?ref=terms.
  link: (chunks) => (
    <Link href="/about?ref=terms" className="text-blue-600 underline">
      {chunks}
    </Link>
  ),
  strong: (chunks) => <strong>{chunks}</strong>,
})}
```

- Переводчик может переставить `<link>` в любое место фразы, код не меняется. Теги можно вкладывать друг в друга.
- При строгой типизации нужно передать функции для **всех** тегов сообщения. Забытый `strong` — ошибка компиляции.
- **Атрибуты задаются только в коде.** `href`, `className` в сообщении не пишут. Если URL должен переводиться, вынеси его в отдельный ключ.
- **Самозакрывающийся тег не работает.** Для ICU-парсера `<br/>` — не тег: он тихо выводится как текст `<br/>`, без ошибки. Пиши `Hello,<br></br>how are you?` и `br: () => <br />`.
- Общие теги (`b`, `i`, `br`) удобно держать в одном компоненте `RichText` с render-prop. Этот паттерн описан в документации next-intl, в шаблоне его нет.
- `<Trans>` из react-i18next в next-intl нет, его роль играет `t.rich`. Работает и в Server Components: `getTranslations` возвращает тот же `t`.

### `t.markup` — HTML-строка

`t.markup` возвращает строку, а функции тегов получают и возвращают строки. Это для HTML вне React: письма, RSS, шаблоны для сторонних систем. Пример:

```ts
const html = t.markup('terms', {
  link: (chunks) => `<a href="/about">${chunks}</a>`,
  strong: (chunks) => `<b>${chunks}</b>`,
})
// 'I agree to the <a href="/about">terms</a> and <b>privacy policy</b>'
```

> **`t.markup` ничего не экранирует.** Значения аргументов и `chunks` вставляются как есть: `t.markup('m', { name: '<img src=x onerror=alert(1)>', … })` для `Hi {name}, <b>welcome</b>` вернёт `Hi <img src=x onerror=alert(1)>, <b>welcome</b>`. Всё, что пришло от пользователя, экранируй **до** передачи в `t.markup`, например функцией из пакета `escape-html`. Тогда и `chunks`, в которые попадают подставленные значения, будут безопасны. Обычный `t()` тоже не экранирует, но React экранирует текст при рендере. Риск появляется, только когда строка уходит в HTML как есть: `dangerouslySetInnerHTML`, тело письма, конкатенация шаблона.

## Массивы, необязательные ключи: `t.raw` и `t.has`

### Списки — перечисляй ключи

`t()` для массива или объекта не работает: вместо текста вернётся ключ и ошибка (`INVALID_MESSAGE` для массива, `INSUFFICIENT_PATH` для объекта). Документация next-intl рекомендует хранить пункты отдельными ключами и собирать список в компоненте (пример):

```json
"features": {
  "plurals": "Plurals",
  "formats": "Formats",
  "types": "Type safety"
}
```

```tsx
const t = useTranslations('features')
const KEYS = ['plurals', 'formats', 'types'] as const

return <ul>{KEYS.map((key) => <li key={key}>{t(key)}</li>)}</ul>
```

Каждый пункт проходит через ICU (plural, теги, аргументы), проверяется типами и `check:translations`, работает с precompile.

Если набор пунктов разный по локалям, документация предлагает обходить ключи namespace'а через `Object.keys(useMessages().features)` (на сервере — через `getMessages()`). Учти, что в этом шаблоне `check:translations` требует одинаковых ключей во всех локалях, а fallback-merge и так подмешивает ключи из en.

### `t.raw` — значение как есть

`t.raw('key')` возвращает значение из JSON без ICU-разбора: строку (`Hello {name} <b>x</b>` придёт буквально), массив или объект. Тип результата — `any`.

Законный сценарий — сырой HTML от переводчика или из CMS, и только после санитизации перед `dangerouslySetInnerHTML`. Для списков `t.raw` проигрывает перечислению ключей:

- ICU внутри элементов не обрабатывается;
- нужен каст из `any`;
- `check:translations` считает массив листом и сверяет только тип, а аргументы, теги и plural-категории внутри не проверяет;
- `t.raw` **не поддерживается с `experimental.messages.precompile`** ([03-translations.md](./03-translations.md#опционально-прекомпиляция-сообщений)).

В шаблоне `t.raw` не используется.

### `t.has` — есть ли ключ

`t.has('key')` возвращает `boolean` и нужен для необязательных текстов: показать подсказку, только если она есть. Ключ типизирован, как у `t()`. Поправка на этот шаблон: из-за fallback-merge в `request.ts` любой ключ из `en.json` существует во всех локалях, так что `t.has` отвечает на вопрос «есть ли ключ в словаре», а не «переведён ли он».

## Апострофы и экранирование

Одинарная кавычка `'` в ICU — символ экранирования, но **только перед спецсимволом**: `{`, `}`, `<`, `>` (скобки тегов) и, внутри `plural`/`selectordinal`, `#`. От такой `'` до следующей `'` всё выводится буквально. В остальных местах `'` — обычный символ. `''` всегда даёт один апостроф.

| В сообщении | Результат | Что произошло |
|---|---|---|
| `What's new?` | `What's new?` | безопасно: после `'` обычная буква |
| `It's {name}'s turn` | `It's Alex's turn` | безопасно |
| `'{name}' joined` | `{name} joined` | подстановка превратилась в текст |
| `''{name}'' joined` | `'Alex' joined` | кавычки вокруг значения — удвоением |
| `L'{name}` | `L{name}` | апостроф перед `{` «съел» подстановку |
| `Don'<b>t</b> stop` (`t.markup`) | `Don<b>t</b> stop` | тег не обработан и выведен текстом, апостроф пропал |
| `Don''<b>t</b> stop` (`t.markup`) | `Don'` + обработанный тег `b` | удвоение спасает |
| `'{' and '}'` | `{ and }` | литеральные фигурные скобки |
| `{n, plural, other {'#' is #}}` | `# is 3` | литеральный `#` внутри plural |

- **`{{name}}` — не экранирование**, а синтаксическая ошибка (`INVALID_MESSAGE`).
- **Проще всего обойти проблему типографским апострофом:** `’` (U+2019) или в украинском `ʼ` (U+02BC). Для ICU это обычные символы. В `uk.json` сейчас стоят ASCII-апострофы («Ім'я», «ім'я», «Зв'язатися»). Они безопасны, пока за ними не идёт спецсимвол из списка выше.
- Если апостроф съел аргумент или тег в ru/uk, `check:translations` это поймает: в AST они пропадут, и сверка с en сообщит `missing argument {name}` или `missing tag <link>`. Если баг сидит в самом `en.json`, а переводы правильные, сверка срабатывает с другой стороны: ru и uk получают `unknown argument {name}` и `unknown tag <link>`. Пропавший аргумент заодно ломает `typecheck`: `t('greeting', { name })` перестаёт компилироваться. Пропавший тег типы не ловят, лишняя функция в `t.rich` ошибкой не считается.

## Как проверять сообщения

- **`npm run check:translations`** ([scripts/check-translations.ts](../scripts/check-translations.ts)) проверяет:
  - синтаксис ICU, включая обязательный `other`, и пустые строки;
  - паритет с en: ключи и типы значений, аргументы и их вид (текст, число, дата), ветки `select` и теги;
  - склонение по числу: если en пишет `{n, plural, …}`, перевод в локали с несколькими формами тоже обязан;
  - plural- и selectordinal-категории CLDR для каждой локали.

  Подробнее и про CI — [14-testing.md](./14-testing.md).
- **Типы** (`createMessagesDeclaration`) проверяют аргументы в коде по `en.json` ([03-translations.md](./03-translations.md)).
- **Не проверяет никто:** имена форматов внутри сообщений, смысл перевода и баги в самом `en.json`, которые остаются валидным ICU и не расходятся с ru/uk по аргументам и тегам.
- Официальный example next-intl использует линтер сообщений `@eloqnt/cli`. В шаблон он не добавлен и здесь не проверялся.
