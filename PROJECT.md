# OneS News — устройство проекта

Независимый ежедневный дайджест публичных материалов вокруг мира 1С (в первую очередь для разработчиков).

**Сайт не принадлежит фирме «1С», не является её официальным ресурсом и не использует её эмблемы.**

Домен: `enterprisehub.dev`  
Стек: статический HTML/CSS/JS + JSON по дням на GitHub Pages. Без фреймворков и без серверной сборки контента.

---

## 1. Архитектура

```text
sources.yaml + agent/config.yaml
    │
    ▼
agent/run.py  (каталог источников → collect.py → raw JSON → Gemini Flash → write_day.py)
    │
    ├─► data/sources.json
    ├─► data/days/YYYY-MM-DD.json
    └─► data/index.json
              │
              ▼
     index.html + js/theme.js + js/consent.js + js/config.js + js/app.js
     about.html + js/theme.js + js/consent.js + js/config.js + js/about.js
     privacy.html + js/theme.js + js/consent.js
              │
              ▼
        GitHub Pages
```

- Вёрстка почти не меняется после запуска.
- Сборщик пишет **только** JSON в `data/` (и при необходимости `sources.yaml` / `agent/config.yaml`).
- Браузер при смене даты загружает один day-файл; фильтры, поиск и «прочитано» работают уже в памяти.
- Cursor не гоняется по расписанию: ежедневный прогон — GitHub Actions или скрипт на ПК.
- `agent/` на сайт не попадает: публичный набор файлов задаёт `.github/workflows/pages.yml`.

---

## 2. Дерево файлов

| Путь | Назначение |
|------|------------|
| `index.html` | Лента: дата, источник, поиск, карточки дня |
| `about.html` | О проекте, дисклеймер и список источников |
| `privacy.html` | Что хранится в браузере и согласие на Метрику |
| `css/styles.css` | Mobile-first стили |
| `js/config.js` | Словари: языки, типы источников |
| `js/theme.js` | Светлая / тёмная тема (`localStorage`) |
| `js/consent.js` | Баннер согласия; Яндекс.Метрика только после «Принять» |
| `js/app.js` | Загрузка дня, фильтры, поиск, рендер |
| `js/about.js` | Список источников на «О проекте» |
| `package.json` | Playwright: `npm test` |
| `playwright.config.js` | Chromium, локальный `serve`, HTML-отчёт |
| `tests/` | E2E UI-тесты и фикстуры JSON |
| `favicon.svg` | Иконка вкладки |
| `apple-touch-icon.png` | Иконка на домашнем экране iOS |
| `data/index.json` | Список доступных дат |
| `data/sources.json` | Публичный каталог включённых источников |
| `data/days/*.json` | Новости одного дня |
| `sources.yaml` | Источники сборщика по секциям site / telegram / video (браузер не читает) |
| `agent/config.yaml` | Часовой пояс, режим даты, лимиты, модель |
| `agent/run.py` | Одна команда: сбор → саммари → day JSON |
| `agent/collect.py` | RSS, Telegram `/s/`, диспетчер Infostart |
| `agent/collect_infostart.py` | Каталоги Infostart + RSS |
| `agent/common.py` | Пути, конфиг, дата, сниппеты |
| `agent/summarize.py` | Пакет саммари через Gemini |
| `agent/write_day.py` | day JSON, `index.json`, `sources.json` |
| `agent/prompts/summarize.md` | Системный промпт Gemini |
| `agent/requirements.txt` | Зависимости Python 3.12 |
| `agent/.env.example` | Шаблон `GEMINI_API_KEY` |
| `agent/cron/run.ps1` | Локальный запуск по расписанию Windows |
| `CNAME` | `enterprisehub.dev` для GitHub Pages |
| `.github/workflows/pages.yml` | Тесты Playwright, затем деплой статики (белый список файлов) |
| `.github/workflows/collect.yml` | Ежедневный сбор (06:00 МСК) |
| `LICENSE` | Условия использования |
| `PROJECT.md` | Этот документ (для человека и ИИ) |
| `README.md` | Короткий старт |

`agent/tmp/` — сырые дампы сборщика (`raw-*.json` и отладка). В git не входит (см. `.gitignore`).

---

## 3. Схема `data/index.json`

```json
{
  "site": "OneS News",
  "dates": ["2026-08-16", "2026-08-15"]
}
```

| Поле | Тип | Правило |
|------|-----|---------|
| `site` | string | Имя сайта |
| `dates` | string[] | Даты `YYYY-MM-DD`, **новые сверху**. Должна существовать `data/days/{date}.json` |

**Дата по умолчанию в UI = `dates[0]`.**  
Отдельного поля `default_date` нет. Лента читает только этот файл, не listing каталога `data/days/`.

При добавлении дня робот:

1. Создаёт `data/days/YYYY-MM-DD.json`.
2. Пересобирает `dates` по файлам в `data/days/` (новые сверху).

---

## 4. Схема `data/sources.json`

Публичный список включённых источников для страницы «О проекте». Пишется в начале `agent/run.py`, независимо от того, нашлись ли новости за день. Cron (`.github/workflows/collect.yml`) коммитит этот файл вместе с `data/days/` и `data/index.json`.

```json
{
  "sources": [
    {
      "name": "Habr 1C",
      "home": "https://habr.com/ru/hubs/1c/",
      "source_type": "site",
      "language": "ru"
    }
  ]
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `name` | string | Имя источника |
| `home` | string | Публичная страница (не RSS) |
| `source_type` | enum | см. словари |
| `language` | enum | см. словари |

В каталог попадают только `enabled: true` с заполненным `home`. RSS-адрес (`url`) сюда не пишется.

---

## 5. Схема `data/days/YYYY-MM-DD.json`

```json
{
  "date": "2026-08-16",
  "title": "Дайджест за 16 августа 2026",
  "items": [
    {
      "id": "2026-08-16-001",
      "title": "Заголовок",
      "summary": "2–4 предложения саммари",
      "url": "https://example.com/article",
      "author": "Автор или Не указан",
      "source_name": "Habr 1C",
      "source_type": "site",
      "topics": ["бизнес-анализ", "ERP"],
      "language": "ru"
    }
  ]
}
```

| Поле item | Тип | Описание |
|-----------|-----|----------|
| `id` | string | Уникален в пределах дня, напр. `{date}-{nnn}` |
| `title` | string | Заголовок |
| `summary` | string | Саммари, не копипаст. Может быть пустым (короткий пост Telegram, текст уже в заголовке) |
| `url` | string | Ссылка на первоисточник |
| `author` | string | Автор или «Не указан» |
| `source_name` | string | Имя источника (`name` из `sources.yaml`). По нему фильтр и плашка на карточке. |
| `source_type` | enum | см. словари |
| `topics` | string[] | Метки первоисточника (у Хабра — RSS `<category>`). Только справка на карточке, в фильтр не входят. Пусто, если меток нет. |
| `language` | enum | см. словари |

`date` в файле должен совпадать с именем файла.

---

## 6. Словари

### `source_type` (секции на странице, порядок фиксирован)

| Код | Секция UI |
|-----|-----------|
| `site` | Сайты |
| `telegram` | Telegram |
| `video` | Видеохостинги |
| `other` | Другое |

Пустые секции скрываются.

### `language` (сейчас)

| Код | Подпись |
|-----|---------|
| `ru` | Русский |
| `en` | English |

**Расширение языков:** добавить объект `{ code, label }` в массив `LANGUAGES` в `js/config.js` и упомянуть здесь. Формат day-JSON не меняется.

Актуальные значения для UI дублируются в `js/config.js` — при расхождении править оба места.

---

## 7. Как работает UI

1. `GET data/index.json` → список дат для календаря (`dates`, новые сверху).
2. Активная дата = `dates[0]` или `?date=YYYY-MM-DD`, если дата есть в `dates`.
3. `GET data/days/{date}.json` → `currentDay` в памяти.
4. Рендер секций по `source_type`.
5. Фильтры «источник» и «язык» **не** делают новых запросов: фильтруют `currentDay.items` и перерисовывают. Пикер источника строится из уникальных `source_name` этого дня; в раскрытом списке рядом с именем — число карточек. Плашка источника на карточке включает тот же фильтр. Метки `topics` на карточке только для чтения.
6. Поиск по заголовку и саммари (в памяти). Недавние запросы — `localStorage` ключ `ones-search-history`.
7. Клик по ссылке заголовка (и средняя кнопка мыши) помечает карточку прочитанной. Карта id: `ones-read` (до 500 записей, 90 дней).
8. Тема светлая/тёмная: `js/theme.js`, ключ `ones-theme` (иначе системная preference). Скрипт в `<head>` ставит тему до отрисовки, чтобы не мигала.
9. Смена даты → новый fetch day-файла; фильтры и строка поиска сбрасываются.

`about.html`: `GET data/sources.json` → группировка по `language`, внутри — по `source_type`. Пустые языки и типы скрываются.

Яндекс.Метрика не вшита в HTML. `js/consent.js` показывает баннер, пока нет выбора в `ones-consent`. Счётчик грузится только после «Принять» (без Вебвизора и ecommerce). «Отклонить» оставляет сайт рабочим. На `privacy.html` выбор можно сменить.

Ленту за месяц не делаем.

---

## 8. Контракт для ИИ / робота

**Можно / нужно:**

- создавать/обновлять `data/days/YYYY-MM-DD.json`;
- обновлять `data/index.json` (даты по файлам в `data/days/`, новые сверху);
- обновлять `data/sources.json` из включённых записей `sources.yaml`;
- править `sources.yaml` и `agent/config.yaml`.

Workflow `.github/workflows/collect.yml` коммитит `data/days/`, `data/index.json` и `data/sources.json`.

**Не трогать без явной просьбы человека:**

- `index.html`, `about.html`, `privacy.html`, `css/`, `js/` (кроме согласованного расширения словарей языков/типов);
- деплой-workflow, collect-workflow и `CNAME`.

**Контент:**

- только саммари + ссылка на источник;
- не схлопывать новости разных авторов на одну тему;
- не утверждать связь сайта с фирмой «1С»;
- `language` только из текущего словаря (`ru` | `en`, пока не расширили).

---

## 9. Чеклист нового дня

Обычный путь — скрипт:

```powershell
python agent/run.py
python agent/run.py --date 2026-08-17
```

Если за дату ничего не нашлось, файл дня **не** создаётся.

Ручной путь:

1. Записать `data/days/YYYY-MM-DD.json` по схеме.
2. В `data/index.json` вставить дату первой в `dates`.
3. Проверить локально и запушить.

### Чеклист нового источника

1. Добавить запись в нужную секцию `sources.yaml` (`site` / `telegram` / `video`). Для YouTube можно скопировать отключённый шаблон `Example YouTube` в секции `video` (`enabled: false`) и подставить `channel_id`.
2. Указать `url`, `home`, `fetch`, `language`, `enabled: true`. `home` — публичная страница источника (для «О проекте»), не RSS. Фильтр ленты берёт `name`.
3. `summarize: false` — анонс из RSS/страницы сразу в карточку (как у Habr). `summarize: true` или поле не указано — саммари через Gemini.
4. Для сайта/YouTube — RSS; для публичного Telegram — `https://t.me/s/username` и `fetch: telegram_web` (скрипт листает `?before=`, берёт только оригинальные посты канала без чужих репостов). Заголовок — первая строка или предложение, до 100 символов; текст карточки — до `snippet_chars` (600), без дубля если весь пост уже в заголовке. Infostart — `fetch: infostart` (логика в `agent/collect_infostart.py`). Все включённые источники собирает `python agent/run.py`. Диапазон дат: `python agent/run.py --from-date YYYY-MM-DD --to-date YYYY-MM-DD` (новые карточки источника дописываются, чужие источники в файле дня не затираются).
5. Прогнать `python agent/run.py --collect-only --date ...` и проверить `agent/tmp/raw-*.json`. Каталог `data/sources.json` обновляется в начале прогона даже без новостей за день.

---

## 10. Сбор дня (скрипт + дешёвая модель)

ИИ **не** ходит по сайтам. Скрипт забирает заголовок, ссылку, автора и короткий snippet.

- `summarize: false` у источника — snippet (после unescape и обрезки «Читать далее») идёт в `summary` без Gemini.
- `summarize: true` — пакет этих записей уходит в Gemini Flash.
- `max_items` в `agent/config.yaml` — лимит **на источник**, не на весь день.

```text
sources.yaml + agent/config.yaml
        ↓
run.py сразу пишет data/sources.json (включённые источники с home)
        ↓
collect.py  →  agent/tmp/raw-YYYY-MM-DD.json
        ↓
записи с summarize:true → Gemini; остальные → очищенный snippet
        ↓
write_day.py  →  data/days/YYYY-MM-DD.json + data/index.json
```

Дата:

- `agent/config.yaml`: `timezone`, `date_mode` (`yesterday` | `today` | `explicit`), `explicit_date`
- CLI `--date YYYY-MM-DD` перекрывает файл

Ключ: `GEMINI_API_KEY` в `agent/.env` (локально) или GitHub Secret `GEMINI_API_KEY` (cron).

Расписание: `.github/workflows/collect.yml` в 03:00 UTC (06:00 МСК). Запас на ПК: `agent/cron/run.ps1`.

---

## 11. Деплой

- Хостинг: GitHub Pages. Workflow `.github/workflows/pages.yml` сначала гоняет Playwright, затем копирует в `_site` только публичные файлы (HTML, CSS, JS, `data/`, иконки, README/PROJECT, `CNAME`). `agent/`, `tests/` и `sources.yaml` на сайт не попадают. Падение тестов блокирует деплой; HTML-отчёт — артефакт job `test`.
- Домен: `enterprisehub.dev` (`CNAME` + DNS у регистратора на IP GitHub Pages).
- После push в `main` сайт обновляется Actions.

Локальный просмотр: любой статический сервер из корня, например `npx --yes serve .`  
(нужен HTTP: `fetch` JSON не работает с `file://`).
