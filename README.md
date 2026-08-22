# OneS News

Независимый ежедневный дайджест новостей вокруг мира 1С (в первую очередь для разработчиков).

Сайт: [enterprisehub.dev](https://enterprisehub.dev)

Статика: HTML/CSS/JS + JSON по дням. Сбор: Python-скрипт + Gemini Flash.

## Документация

Архитектура, схемы JSON и сбор дня: **[PROJECT.md](PROJECT.md)**

## Локальный просмотр

```powershell
cd d:\Repo\News_OneS
npx --yes serve .
```

Нужен HTTP: `fetch` JSON не работает с `file://`.

## Собрать день

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

Cron на GitHub: секрет репозитория `GEMINI_API_KEY`, workflow `.github/workflows/collect.yml`.

## Дисклеймер

Сайт не принадлежит фирме «1С» и не является её официальным ресурсом.
