# Wazzup ↔ Satori CRM

CRM умеет использовать Wazzup User API v3 как основной транспорт для WhatsApp и, при наличии канала, Telegram.

## Что происходит

1. Входящее сообщение приходит в Wazzup.
2. Wazzup отправляет webhook в `/api/integrations/wazzup/webhook`.
3. CRM сохраняет сообщение в `crm/data/communications.json`.
4. AI-менеджер видит ту же историю разговора и обновляет ТЗ.
5. Ответ из CRM/AI отправляется через Wazzup `POST /v3/message`.
6. Если Wazzup не настроен, старые Meta WhatsApp / Telegram Bot пути остаются резервом.

## Переменные окружения

```env
CRM_PUBLIC_URL=https://crm.satorilabural.ru
WAZZUP_API_KEY=
WAZZUP_WHATSAPP_CHANNEL_ID=
WAZZUP_TELEGRAM_CHANNEL_ID=
WAZZUP_WEBHOOK_SECRET=
WAZZUP_WEBHOOK_URL=https://crm.satorilabural.ru/api/integrations/wazzup/webhook
```

`WAZZUP_WHATSAPP_CHANNEL_ID` и `WAZZUP_TELEGRAM_CHANNEL_ID` необязательны. Если они пустые, CRM выбирает первый активный подходящий канал из `GET /v3/channels`.

Не хранить настоящий API-ключ в GitHub.

## Подключение

После добавления переменных и перезапуска CRM:

1. Открыть CRM.
2. Нажать `Связь`.
3. В блоке Wazzup проверить, что виден активный канал.
4. Нажать `Подключить webhook Wazzup`.
5. Отправить тестовое входящее сообщение на подключённый номер.
6. Проверить, что оно появилось в истории клиента CRM.

Webhook подписывается на сообщения/статусы и изменения каналов. Тестовый POST Wazzup `{ "test": true }` получает HTTP 200.

## AI

Входящие WhatsApp-сообщения из Wazzup попадают в общую историю, поэтому AI-менеджер анализирует их так же, как сообщения из прямого Meta webhook. Обычные AI-ответы после входящего сообщения идут через `sendWhatsAppText`, а при настроенном Wazzup этот метод использует Wazzup первым.

Первое полностью автоматическое холодное сообщение из парсера пока остаётся под существующим защитным правилом AI-менеджера: автоматический cold-start через WhatsApp требует отдельного разрешённого сценария/шаблона. Через карточку CRM первое сообщение можно отправить вручную через Wazzup, а дальнейший диалог AI уже ведёт через общую историю.
