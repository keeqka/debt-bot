# Финансы — Telegram Mini App

AI-мониторинг личных финансов для двух пользователей. Полное ТЗ: [.lavish/finance-mini-app-tz.html](.lavish/finance-mini-app-tz.html) (открывается как обычная HTML-страница).

## Структура репозитория

```
app/         React + TypeScript + shadcn/ui фронтенд (Telegram Mini App)
supabase/    Postgres-схема, RLS, Edge Functions, pg_cron (бэкенд)
```

## Текущее состояние

Фронтенд полностью кликабелен уже сейчас — **без единого ключа** — в демо-режиме на моковых данных (`app/src/lib/mock-data.ts`). Как только появятся ключи Supabase, приложение само переключится на реальный бэкенд (см. `isBackendConfigured` в `app/src/lib/env.ts`) — код для обеих веток уже написан в `app/src/lib/api.ts`.

Бэкенд (`supabase/`) полностью реализован — миграции, RLS-политики, все 10 Edge Functions из ТЗ §7-§9 — но не задеплоен, т.к. ждёт ключей.

## Быстрый старт (фронтенд, демо-режим)

```bash
cd app
npm install
npm run dev
```

Откроется на `http://localhost:5173` — работает как обычный сайт (без Telegram), можно листать все экраны и добавлять расходы/доходы (данные живут в памяти вкладки).

## Когда появятся ключи

### 1. Supabase-проект

1. Создать проект на [supabase.com](https://supabase.com) (free tier).
2. Установить [Supabase CLI](https://supabase.com/docs/guides/cli), затем:
   ```bash
   supabase login
   supabase link --project-ref <PROJECT_REF>
   supabase db push          # применит миграции из supabase/migrations
   ```
3. Задеплоить функции:
   ```bash
   supabase functions deploy
   ```
4. Секреты функций:
   ```bash
   supabase secrets set \
     TELEGRAM_BOT_TOKEN=... \
     ANTHROPIC_API_KEY=... \
     SESSION_JWT_SECRET=...   `# значение JWT Secret из Settings → API — но имя секрета НЕ SUPABASE_JWT_SECRET: Supabase запрещает секретам функций префикс SUPABASE_` \
     CRON_SECRET=...          `# любая случайная строка, придумать самим` \
     TELEGRAM_ALLOWED_USER_IDS=111111111,222222222  `# Telegram user id обоих пользователей`
   ```
5. В `supabase/migrations/0002_cron.sql` заменить `<PROJECT_REF>` и `<CRON_SECRET>` на реальные значения и выполнить эти два `select cron.schedule(...)` в SQL Editor дашборда (файл написан заранее, но не может содержать секрет — см. комментарий в файле).

### 2. Telegram-бот

1. `@BotFather` → `/newbot` → сохранить токен (это `TELEGRAM_BOT_TOKEN` выше).
2. `/newapp` → указать URL задеплоенного фронтенда (шаг 3 ниже) — это и есть Mini App.
3. Настроить вебхук на `telegram-webhook`:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<PROJECT_REF>.supabase.co/functions/v1/telegram-webhook" \
     -d "secret_token=<CRON_SECRET>"
   ```
4. Оба пользователя должны написать боту `/start` хотя бы раз — иначе Telegram не даст слать им еженедельные/ежемесячные сводки (ТЗ §8).

### 3. Хостинг фронтенда

1. `app/.env.example` → скопировать в `app/.env.local`, заполнить `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` (Settings → API в дашборде Supabase).
2. Задеплоить `app/` на Cloudflare Pages или Vercel (build command `npm run build`, output `dist`).
3. Обновить Mini App URL у бота, если он отличается от того, что указали в `/newapp`.

## Деплой через CI/CD

Всё описанное выше можно (и стоит) автоматизировать через GitHub Actions — три workflow уже лежат в `.github/workflows/`:

| Файл | Когда запускается | Что делает |
|---|---|---|
| `ci.yml` | каждый push/PR | lint + typecheck + build фронтенда. Секреты не нужны — работает сразу |
| `deploy-backend.yml` | push в `main`, если менялось `supabase/**` | `supabase db push` (миграции) + синхронизирует секреты функций + `supabase functions deploy` |
| `deploy-frontend.yml` | push в `main`, если менялось `app/**` | собирает фронтенд и деплоит на Cloudflare Pages |

Чтобы включить деплой-workflow, добавьте в **Settings → Secrets and variables → Actions** репозитория:

**Для `deploy-backend.yml`:**
- `SUPABASE_ACCESS_TOKEN` — [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
- `SUPABASE_PROJECT_REF` — из URL проекта или Settings → General
- `SUPABASE_DB_PASSWORD` — пароль Postgres, заданный при создании проекта
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`, `ANTHROPIC_API_KEY`, `SUPABASE_JWT_SECRET`, `CRON_SECRET` — те же значения, что и в шаге 1.4 выше. Имя GitHub-секрета остаётся `SUPABASE_JWT_SECRET` для удобства — воркфлоу сам прокидывает его в Supabase уже под именем `SESSION_JWT_SECRET` (см. комментарий в `deploy-backend.yml`)

**Для `deploy-frontend.yml`:**
- `CLOUDFLARE_API_TOKEN` — [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens), шаблон «Edit Cloudflare Pages»
- `CLOUDFLARE_ACCOUNT_ID` — в правом сайдбаре любой страницы дашборда Cloudflare
- `CLOUDFLARE_PAGES_PROJECT` — имя Pages-проекта (создать один раз в дашборде CF)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — те же значения, что и в `app/.env.local`

Без этих секретов деплой-workflow просто упадёт на первом шаге — `ci.yml` при этом продолжит работать и без них, так что можно спокойно пушить код уже сейчас и добавить секреты позже.

**Альтернатива для фронтенда**: вместо `deploy-frontend.yml` можно просто подключить репозиторий напрямую в дашборде Cloudflare Pages (Git-интеграция) — вообще без YAML и секретов в GitHub. В этом случае `deploy-frontend.yml` можно удалить или отключить.

## Модель авторизации

Ровно 2 пользователя, оба захардкожены в `TELEGRAM_ALLOWED_USER_IDS`. Открытие Mini App → фронтенд шлёт Telegram `initData` в `auth-telegram` → функция проверяет HMAC-подпись и whitelist → выдаёт JWT (см. ТЗ §2). Третьему Telegram-аккаунту доступ не даётся.

## Подробности

Все решения по спорным местам (общий бюджет на двоих, avalanche-стратегии, курируемый справочник банков РК и т.д.) задокументированы в самом ТЗ, раздел 16.
