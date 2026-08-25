# OneS News

Независимый ежедневный дайджест новостей вокруг мира 1С (в первую очередь для разработчиков).

Сайт: [enterprisehub.dev](https://enterprisehub.dev)

Две страницы: лента (`index.html`) и «Настройки» (`settings.html`). Статика HTML/CSS/JS + JSON по дням. Сбор: `python agent/run.py` (Python **3.12**) и при необходимости Gemini Flash.

Тема, поиск, скрытые источники и отметка «прочитано» хранятся в `localStorage` браузера. Яндекс.Метрика включается только после согласия. Старые адреса `about.html` и `privacy.html` перенаправляют в настройки.

## Документация

Архитектура, схемы JSON и сбор дня: **[PROJECT.md](PROJECT.md)**

Лицензия: **[LICENSE](LICENSE)**

## Локальный просмотр

```powershell
cd d:\Repo\News_OneS
npx --yes serve .
```

Нужен HTTP: `fetch` JSON не работает с `file://`.

## Тесты UI

Playwright (Chromium) гоняет ленту и настройки на фикстурах в `tests/fixtures/`. В GitHub Actions прогон — job `test` в `.github/workflows/pages.yml`: HTML-отчёт кладётся в артефакт, падение блокирует деплой.

```powershell
npm ci
npx playwright install chromium
npm test
```

## Собрать день

Python 3.12 — как в GitHub Actions. Локально подойдёт 3.12+.

1. Ключ: [Google AI Studio](https://aistudio.google.com/apikey) → скопировать `agent/.env.example` в `agent/.env` и вставить `GEMINI_API_KEY`.
2. Источники: [`sources.yaml`](sources.yaml). Дата: [`agent/config.yaml`](agent/config.yaml) (`date_mode: yesterday` по умолчанию).
3. Установить зависимости:

```powershell
pip install -r agent/requirements.txt
```

4. Собрать день:

```powershell
# вчера (по agent/config.yaml, date_mode: yesterday)
python agent/run.py

# конкретный день
python agent/run.py --date 2026-08-17

# диапазон (все включённые источники)
python agent/run.py --from-date 2026-08-01 --to-date 2026-08-21

# только сбор без записи day JSON
python agent/run.py --collect-only
```

Сырые дампы сборщика пишутся в `agent/tmp/` и в git не попадают.

Cron на GitHub: секрет репозитория `GEMINI_API_KEY`, workflow `.github/workflows/collect.yml`.

## Дисклеймер

Сайт не принадлежит фирме «1С» и не является её официальным ресурсом.
