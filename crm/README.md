# Satori CRM

CRM живёт в том же репозитории, что и сайт, но запускается отдельным Node-процессом. Основной сайт не нужно переносить или переписывать.

## Что уже работает

- единая воронка: Новый запрос → Расчёт → Согласовано → В производстве → Готово → Доставка → Завершено;
- заказы и заявки с сайта автоматически появляются в CRM;
- клиенты автоматически собираются из заказов и заявок сайта;
- ручное добавление клиентов и проектов;
- сумма проекта, сколько оплачено и остаток;
- задачи со сроками и привязкой к проекту;
- drag & drop карточек между этапами на компьютере;
- смена этапа через карточку проекта на телефоне;
- единый пароль с текущей админкой Satori (`ADMIN_PASSWORD`);
- адаптивная мобильная версия с safe-area для iPhone;
- установка CRM на экран телефона как PWA;
- Web Push уведомления о новых заказах и заявках, даже когда CRM закрыта;
- WhatsApp и Telegram в карточке клиента;
- быстрые шаблоны сообщений и история отправок;
- Telegram-уведомления владельцу о новых заказах/заявках;
- входящие webhook endpoints WhatsApp и Telegram.

## Данные

CRM использует существующие данные сайта:

- `server/data/orders.json` — заказы интернет-магазина;
- `server/data/leads.json` — заявки с сайта.

Собственные данные создаются в `crm/data/`:

- `crm.json` — клиенты, ручные проекты, задачи и этапы;
- `push-subscriptions.json` — подписанные устройства;
- `vapid.json` — серверная пара ключей Web Push;
- `communications.json` — история сообщений WhatsApp/Telegram, обработанных CRM.

Все JSON-файлы в `crm/data/` исключены из git. На сервере эту папку нужно включить в резервное копирование. Особенно важно не удалять `vapid.json`: при смене VAPID-ключей телефоны придётся подписывать на push заново.

## Установка зависимостей

У сайта и CRM разные наборы runtime-зависимостей. Из корня репозитория:

```bash
npm install
npm --prefix crm install
```

CRM использует пакет `web-push` для стандартного Web Push без OneSignal/Firebase. Для WhatsApp и Telegram дополнительных npm-пакетов не требуется — используются официальные HTTPS API.

## Локальный запуск

```bash
ADMIN_PASSWORD='ваш-пароль' CRM_PORT=3010 node crm/server.js
```

Если в корне уже есть заполненный `.env`, достаточно:

```bash
node crm/server.js
```

CRM откроется на `http://localhost:3010`.

## PWA и push-уведомления

В production CRM должна открываться по HTTPS. Service Worker и Web Push не должны запускаться на обычном HTTP, кроме localhost.

Рекомендуемый адрес:

`https://crm.satorilabural.ru`

После входа в CRM появляются кнопки «На экран» и «Уведомления».

### iPhone / iPad

Для iOS/iPadOS push работает у Home Screen web app (iOS/iPadOS 16.4+):

1. Открыть CRM в Safari.
2. «Поделиться» → «На экран Домой».
3. Запустить Satori CRM с появившейся иконки.
4. Нажать «Уведомления» и разрешить их.

### Android / desktop

Можно использовать кнопку «На экран» / стандартную команду браузера «Установить приложение», затем нажать «Уведомления».

После успешной подписки CRM отправляет тестовый push. Дальше сервер примерно раз в 10 секунд проверяет `orders.json` и `leads.json`. Новая запись вызывает push «Новый заказ Satori» или «Новая заявка Satori». Открытая вкладка для получения уведомления не нужна.

Необязательные переменные `.env`:

```bash
CRM_PUSH_POLL_MS=10000
CRM_VAPID_SUBJECT=https://satorilabural.ru
```

`CRM_PUSH_POLL_MS` не может быть меньше 5000 мс.

## WhatsApp

Без API-ключей кнопка WhatsApp уже работает в карточке клиента: CRM открывает `wa.me` с подготовленным текстом. После подключения официального Meta WhatsApp Cloud API сообщение отправляется прямо из CRM.

Переменные `.env`:

```bash
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_GRAPH_VERSION=v26.0
WHATSAPP_WEBHOOK_VERIFY_TOKEN=придуманный_секрет
```

Webhook для Meta:

```text
https://crm.satorilabural.ru/api/integrations/whatsapp/webhook
```

GET этого адреса используется Meta для проверки webhook, POST — для входящих сообщений. Входящие сообщения сохраняются в `crm/data/communications.json`.

Для production рекомендуется дополнительно задать и проверять подпись Meta App Secret на входящих webhook-запросах.

## Telegram

Без Bot API CRM может открыть чат клиента по `@username` / `t.me/...`. Если клиент уже написал нашему боту и CRM получила его числовой `chat_id` через webhook, следующие сообщения можно отправлять прямо из CRM.

Переменные `.env`:

```bash
TELEGRAM_BOT_TOKEN=...
TELEGRAM_OWNER_CHAT_ID=...
TELEGRAM_WEBHOOK_SECRET=случайный_секрет
```

`TELEGRAM_OWNER_CHAT_ID` нужен для автоматических уведомлений владельцу о новых заказах и заявках.

Webhook Telegram:

```text
https://crm.satorilabural.ru/api/integrations/telegram/webhook
```

При установке webhook через Telegram Bot API нужно передать тот же `TELEGRAM_WEBHOOK_SECRET` как `secret_token`, чтобы Telegram присылал заголовок `X-Telegram-Bot-Api-Secret-Token`.

После настройки в CRM нажать «Связь» → «Отправить тест в Telegram».

## Интерфейс сообщений

В карточке клиента появляются две кнопки:

- `WhatsApp` — сообщение или переход в чат;
- `Telegram` — сообщение через бота, если известен `chat_id`, иначе переход в Telegram.

Доступны шаблоны:

- первичный ответ;
- расчёт готов;
- заказ готов.

Все сообщения, отправленные через API или полученные webhook-ом, показываются в истории клиента.

## Сервер

Рекомендуемая схема:

- `satorilabural.ru` → текущий сайт;
- `crm.satorilabural.ru` → `127.0.0.1:3010`;
- CRM-процесс держать через PM2 или systemd.

Пример для PM2:

```bash
npm --prefix crm install --omit=dev
pm2 start crm/server.js --name satori-crm
pm2 save
```

Пример Nginx с SSL лежит в `crm/nginx-crm.conf.example`.

## Безопасность

CRM не имеет публичного API рабочих данных: endpoints клиентов, проектов, задач, push-подписок и ручной отправки сообщений защищены bearer-токеном после проверки `ADMIN_PASSWORD`. Сам пароль, API-токены, VAPID-ключи и push-подписки в репозиторий добавлять нельзя.

Публичными остаются только webhook endpoints, которые необходимы Meta/Telegram. WhatsApp использует verification token при подписке webhook; Telegram webhook проверяет `X-Telegram-Bot-Api-Secret-Token`, если задан `TELEGRAM_WEBHOOK_SECRET`.

Для следующего этапа стоит заменить файловое хранение на PostgreSQL и добавить постоянные пользовательские сессии, если CRM начнут использовать несколько сотрудников.
