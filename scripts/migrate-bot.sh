#!/usr/bin/env bash
# Переносит настройки Hlow Flow со старого бота на нового, чтобы не заполнять BotFather заново:
# имя, About, Description, меню команд (для default и ru), кнопка меню → мини-апп, вебхук.
# НЕ переносится (Bot API не умеет): Description Picture, Botpic — загрузи руками в BotFather
# (файл аватарки лежит в архиве дизайна: avatars/bot-1b.png).
# Токены и CRON_SECRET вводятся скрыто и никуда не сохраняются.
set -euo pipefail

APP_URL="${APP_URL:-https://bot.hlowflow.app}"
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/app/.env.local"
SUPABASE_URL="$(grep -E '^VITE_SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2- | tr -d '"' | sed 's#/*$##')"
[ -n "$SUPABASE_URL" ] || { echo "Не нашёл VITE_SUPABASE_URL в $ENV_FILE"; exit 1; }
WEBHOOK_URL="$SUPABASE_URL/functions/v1/telegram-webhook"

read -rsp "Токен СТАРОГО бота: " OLD; echo
read -rsp "Токен НОВОГО бота: " NEW; echo
read -rsp "CRON_SECRET (secret_token вебхука): " SECRET; echo

api() { # api TOKEN METHOD [curl args...]
  local token="$1" method="$2"; shift 2
  curl -fsS "https://api.telegram.org/bot${token}/${method}" "$@"
}
field() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'].get('$1','') if isinstance(d['result'],dict) else '')"; }

echo "Старый бот: $(api "$OLD" getMe | python3 -c "import sys,json; print('@'+json.load(sys.stdin)['result']['username'])")"
echo "Новый бот:  $(api "$NEW" getMe | python3 -c "import sys,json; print('@'+json.load(sys.stdin)['result']['username'])")"

for LANG_CODE in "" ru; do
  L="language_code=$LANG_CODE"
  NAME="$(api "$OLD" getMyName -d "$L" | field name)"
  SHORT="$(api "$OLD" getMyShortDescription -d "$L" | field short_description)"
  DESC="$(api "$OLD" getMyDescription -d "$L" | field description)"
  [ -n "$NAME" ]  && api "$NEW" setMyName -d "$L" --data-urlencode "name=$NAME" >/dev/null && echo "[${LANG_CODE:-default}] имя: $NAME"
  [ -n "$SHORT" ] && api "$NEW" setMyShortDescription -d "$L" --data-urlencode "short_description=$SHORT" >/dev/null && echo "[${LANG_CODE:-default}] about: ок"
  [ -n "$DESC" ]  && api "$NEW" setMyDescription -d "$L" --data-urlencode "description=$DESC" >/dev/null && echo "[${LANG_CODE:-default}] description: ок"
  CMDS="$(api "$OLD" getMyCommands -d "$L" | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['result']))")"
  if [ "$CMDS" != "[]" ]; then
    api "$NEW" setMyCommands -d "$L" --data-urlencode "commands=$CMDS" >/dev/null && echo "[${LANG_CODE:-default}] команды: ок"
  fi
done

api "$NEW" setChatMenuButton \
  --data-urlencode "menu_button={\"type\":\"web_app\",\"text\":\"Открыть\",\"web_app\":{\"url\":\"$APP_URL\"}}" >/dev/null
echo "кнопка меню → $APP_URL"

# Те же типы апдейтов, что слушал старый вебхук (нужны, например, pre_checkout_query для Stars).
ALLOWED="$(api "$OLD" getWebhookInfo | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['result'].get('allowed_updates') or ['message','callback_query','pre_checkout_query']))")"
api "$NEW" setWebhook \
  --data-urlencode "url=$WEBHOOK_URL" \
  --data-urlencode "secret_token=$SECRET" \
  --data-urlencode "allowed_updates=$ALLOWED" >/dev/null
echo "вебхук нового бота → $WEBHOOK_URL"

read -rp "Снять вебхук со старого бота, чтобы он не слал апдейты в приложение? [y/N] " ANS
if [[ "$ANS" =~ ^[Yy]$ ]]; then
  api "$OLD" deleteWebhook >/dev/null && echo "вебхук старого бота снят"
fi

echo
echo "Готово. Осталось: Botpic и Description Picture в BotFather, токен нового бота в GitHub Secrets (TELEGRAM_BOT_TOKEN), BOT_USERNAME в коде."
