# ICU Messages

next-intl использует [ICU Message Format](https://unicode-org.github.io/icu/userguide/format_parse/messages/) для всех строк переводов. Это позволяет описывать plural, select и форматирование прямо в JSON без логики в компонентах.

## Базовый синтаксис ICU

| Конструкция | Пример ICU | Использование |
|---|---|---|
| Переменная | `Hello, {name}!` | `t('greeting', { name: 'Alex' })` |
| Plural | `{count, plural, =0 {no items} one {# item} other {# items}}` | `t('items', { count: 5 })` |
| Select | `{role, select, admin {Admin} editor {Editor} other {User}}` | `t('role', { role: 'admin' })` |
| Число | `{count, number}` | `t('count', { count: 1234.5 })` |
| Число с форматом | `{count, number, percent}` | `t('share', { count: 0.5 })` |
| Дата | `{date, date, short}` | `t('signed', { date: new Date() })` |

Знак `#` внутри `plural` заменяется на само значение `count`.

Из реального `en.json` в шаблоне:

```json
{
  "plurals": {
    "items": "{count, plural, =0 {no items} one {# item} other {# items}}",
    "greeting": "Hello, {name}!",
    "role": "{role, select, admin {Administrator} editor {Editor} other {User}}"
  }
}
```

## Плюралы для en / ru / uk

Разные локали используют разные категории множественного числа по правилам CLDR.

| Локаль | one | few | many | other | Правило |
|---|---|---|---|---|---|
| en | `1 item` | — | — | `2 items` | `one` для 1, `other` для всех остальных |
| ru | `1 элемент` | `2 элемента` | `5 элементов` | `2.5 элемента` | `one` для 1, 21, 31…; `few` для 2-4, 22-24…; `many` для 0, 5-20, 11-19…; `other` для дробных |
| uk | (те же категории, что у ru) | (те же) | (те же) | (те же) | те же правила |

Пример строки для ru:

```json
{
  "plurals": {
    "items": "{count, plural, =0 {нет элементов} one {# элемент} few {# элемента} many {# элементов} other {# элемента}}"
  }
}
```

Используй `=0 {no items}` для специальной формы «ноль» — она отличается от `many` и даёт контроль над фразой типа «нет результатов».

## `t.rich()` для HTML-тегов в переводах

Если перевод содержит inline-разметку (ссылки, `<strong>`, `<em>`), нельзя просто вставить HTML-строку — это небезопасно и не работает в React. Используй `t.rich()`.

Из `en.json`:

```json
{
  "plurals": {
    "terms": "I agree to the <link>terms</link> and <strong>privacy policy</strong>"
  }
}
```

Из `src/app/[locale]/demo/plurals/page.tsx`:

```tsx
{t.rich('terms', {
  link: (chunks) => (
    <Link href="/about" className="text-blue-600 underline">
      {chunks}
    </Link>
  ),
  strong: (chunks) => <strong>{chunks}</strong>,
})}
```

Каждый тег в строке перевода (`<link>`, `<strong>`) — это ключ в объекте второго аргумента. Функция получает `chunks` (содержимое тега) и возвращает React-узел. Это позволяет переводчику менять расположение ссылки внутри фразы без изменения кода.

В next-intl нет компонента `<Trans />` (в отличие от `react-i18next`). `t.rich()` — единственный способ встраивать React-узлы в переводы.

## `t.raw()` и `t.markup()`

**`t.raw()`** — возвращает значение из JSON как есть, без обработки. Нужно, когда значение — массив или объект, а не строка:

```json
{
  "features": ["Plurals", "Formats", "Type safety"]
}
```

```ts
const features = t.raw('features') as string[]
features.map((f) => <li key={f}>{f}</li>)
```

**`t.markup()`** — возвращает строку с HTML-тегами (без React-узлов). Подходит для email-шаблонов или server-side HTML, где React не нужен:

```ts
const html = t.markup('terms', {
  link: (chunks) => `<a href="/about">${chunks}</a>`,
  strong: (chunks) => `<b>${chunks}</b>`,
})
// html = 'I agree to the <a href="/about">terms</a> and <b>privacy policy</b>'
```

## Грабли

### Апостроф `'` нужно экранировать удвоением

ICU интерпретирует одинарную кавычку `'` как начало literal-блока (всё до следующей `'` воспринимается буквально, без подстановок). Чтобы получить апостроф в тексте, пиши `''`:

```json
{
  "message": "What''s new?"
}
```

Результат: `What's new?`. Важная деталь: одиночная `'` начинает literal-блок только если стоит **прямо перед спецсимволом ICU** (`{`, `}`, `#`). В обычной прозе (`What's new?`) апостроф безопасен и ничего не ломает. Но рядом со `{...}` он съест подстановку — поэтому в строках с переменными надёжнее всегда удваивать: `''`.

### Переменные внутри `plural` / `select` интерполируются

Распространённое заблуждение: будто `{name}` не работает внутри `plural`/`select`. Работает — именованные аргументы свободно подставляются в ветвях, это валидный ICU:

```json
{
  "items": "{count, plural, one {{name} купил # товар} other {{name} купил # товаров}}"
}
```

```tsx
t('items', { name: 'Alex', count: 3 }) // "Alex купил 3 товаров"
```

`#` подставляет текущее значение `count`. Разбивать на два ключа можно из стилистических соображений, но это не обязательно и не «фикс» несуществующего бага:

```tsx
<span>{name} {t('items', { count })}</span>
```

### `selectordinal` — порядковые числительные

Для «1st / 2nd / 3rd» есть `selectordinal` (категории порядковых числительных, отдельные от `plural` и зависящие от локали):

```json
{
  "rank": "{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} place"
}
```

```tsx
t('rank', { place: 2 }) // "2nd place" (en)
```

Категории берутся из `Intl.PluralRules(locale, { type: 'ordinal' })` и различаются по языкам: для `en` это `one/two/few/other`, для `ru`/`uk` чаще достаточно `other`.

### Экранирование фигурных скобок

Чтобы вывести буквальные `{` или `}`, оберни их в одинарные кавычки: `'{'`, `'}'`. Запись `{{...}}` экранированием **не** является — двойные скобки в ICU не имеют особого смысла и приведут к ошибке парсинга:

```json
{
  "literal": "Use '{' and '}' for placeholders"
}
```
