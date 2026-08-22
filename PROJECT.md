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
agent/run.py  (collect.py → raw JSON → Gemini Flash → write_day.py)
    │
    ├─► data/days/YYYY-MM-DD.json
    └─► data/index.json
              │
              ▼
     index.html + js/app.js
              │
              ▼
        GitHub Pages
```

- Вёрстка почти не меняется после запуска.
- Сборщик пишет **только** JSON в `data/` (и при необходимости `sources.yaml` / `agent/config.yaml`).
- Браузер при смене даты загружает один day-файл; фильтры работают уже в памяти.
- Cursor не гоняется по расписанию: ежедневный прогон — GitHub Actions или скрипт на ПК.

---

## 2. Дерево файлов

| Путь | Назначение |
|------|------------|
| `index.html` | Единственная рабочая страница ленты |
| `about.html` | О проекте и дисклеймер |
| `css/styles.css` | Mobile-first стили |
| `js/config.js` | Словари: направления, языки, типы источников |
| `js/app.js` | Загрузка дня, фильтры, рендер |
| `data/index.json` | Список доступных дат |
| `data/days/*.json` | Новости одного дня |
| `sources.yaml` | Источники сборщика по секциям site / telegram / video |
| `agent/config.yaml` | Часовой пояс, режим даты, лимиты, модель |
| `agent/run.py` | Одна команда: сбор → саммари → day JSON |
| `CNAME` | `enterprisehub.dev` для GitHub Pages |
| `.github/workflows/pages.yml` | Деплой статики |
| `.github/workflows/collect.yml` | Ежедневный сбор (06:00 МСК) |
| `PROJECT.md` | Этот документ (для человека и ИИ) |
| `README.md` | Короткий старт |

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
Отдельного поля `default_date` нет.

При добавлении дня робот:

1. Создаёт `data/days/YYYY-MM-DD.json`.
2. Вставляет дату **в начало** массива `dates`.

---

## 4. Схема `data/days/YYYY-MM-DD.json`

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
      "source_name": "Habr",
      "source_type": "site",
      "direction": "development",
      "language": "ru"
    }
  ]
}
```

| Поле item | Тип | Описание |
|-----------|-----|----------|
| `id` | string | Уникален в пределах дня, напр. `{date}-{nnn}` |
| `title` | string | Заголовок |
| `summary` | string | Саммари, не копипаст |
| `url` | string | Ссылка на первоисточник |
| `author` | string | Автор или «Не указан» |
| `source_name` | string | Имя источника |
| `source_type` | enum | см. словари |
| `direction` | enum | см. словари |
| `language` | enum | см. словари |

`date` в файле должен совпадать с именем файла.

---

## 5. Словари

### `source_type` (секции на странице, порядок фиксирован)

| Код | Секция UI |
|-----|-----------|
| `site` | Сайты |
| `telegram` | Telegram |
| `video` | Видеохостинги |
| `other` | Другое |

Пустые секции скрываются.

### `direction`

| Код | Подпись |
|-----|---------|
| `development` | Разработка |
| `analytics` | Аналитика |
| `management` | Управление |
| `releases` | Релизы |
| `devops` | DevOps |
| `community` | Сообщество |

### `language` (сейчас)

| Код | Подпись |
|-----|---------|
| `ru` | Русский |
| `en` | English |

**Расширение языков:** добавить объект в массив `LANGUAGES` в `js/config.js` и упомянуть здесь. Формат day-JSON не меняется.

Актуальные значения для UI дублируются в `js/config.js` — при расхождении править оба места.

---

## 6. Как работает UI

1. `GET data/index.json` → заполнить select дат.
2. Активная дата = `dates[0]` или `?date=YYYY-MM-DD`, если дата есть в `dates`.
3. `GET data/days/{date}.json` → `currentDay` в памяти.
4. Рендер секций по `source_type`.
5. Фильтры «направление» и «язык» **не** делают новых запросов: фильтруют `currentDay.items` и перерисовывают.
6. Смена даты → новый fetch day-файла; фильтры сбрасываются в «все».

Ленту за месяц не делаем.

---

## 7. Контракт для ИИ / робота

**Можно / нужно:**

- создавать/обновлять `data/days/YYYY-MM-DD.json`;
- обновлять `data/index.json` (дата в начало `dates`);
- править `sources.yaml` и `agent/config.yaml`.

**Не трогать без явной просьбы человека:**

- `index.html`, `about.html`, `css/`, `js/` (кроме согласованного расширения словарей);
- деплой-workflow, collect-workflow и `CNAME`.

**Контент:**

- только саммари + ссылка на источник;
- не схлопывать новости разных авторов на одну тему;
- не утверждать связь сайта с фирмой «1С»;
- `language` только из текущего словаря (`ru` | `en`, пока не расширили).

---

## 8. Чеклист нового дня

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

1. Добавить запись в нужную секцию `sources.yaml` (`site` / `telegram` / `video`).
2. Указать `url`, `fetch`, `direction`, `language`, `enabled: true`.
3. `summarize: false` — анонс из RSS/страницы сразу в карточку (как у Habr). `summarize: true` или поле не указано — саммари через Gemini.
4. Для сайта/YouTube — RSS; для публичного Telegram — `https://t.me/s/username` и `fetch: telegram_web`. Infostart — `fetch: infostart` (логика в `agent/collect_infostart.py`). Все включённые источники собирает `python agent/run.py`. Диапазон дат: `python agent/run.py --from-date YYYY-MM-DD --to-date YYYY-MM-DD` (новые карточки источника дописываются, чужие источники в файле дня не затираются).
5. Прогнать `python agent/run.py --collect-only --date ...` и проверить `agent/tmp/raw-*.json`.

---

## 9. Сбор дня (скрипт + дешёвая модель)

ИИ **не** ходит по сайтам. Скрипт забирает заголовок, ссылку, автора и короткий snippet.

- `summarize: false` у источника — snippet (после unescape и обрезки «Читать далее») идёт в `summary` без Gemini.
- `summarize: true` — пакет этих записей уходит в Gemini Flash.

```text
sources.yaml + agent/config.yaml
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

## 10. Деплой

- Хостинг: GitHub Pages из корня репозитория (workflow `.github/workflows/pages.yml`).
- Домен: `enterprisehub.dev` (`CNAME` + DNS у регистратора на IP GitHub Pages).
- После push в `main` сайт обновляется Actions.

Локальный просмотр: любой статический сервер из корня, например `npx --yes serve .`  
(нужен HTTP: `fetch` JSON не работает с `file://`).
