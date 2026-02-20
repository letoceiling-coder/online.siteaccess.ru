# STEP 02B: Operator Web UI (DEV) served on domain

## Описание

Operator Web UI - веб-приложение для операторов, работающее на домене `https://online.siteaccess.ru/operator/`.

## Требования

- NestJS server с настроенной статической раздачей
- OPERATOR_DEV_TOKEN в `apps/server/.env` (НЕ в git)
- PostgreSQL и Redis запущены

## Установка и сборка

### 1. Установить зависимости

```bash
cd /var/www/online.siteaccess.ru
pnpm -C apps/operator-web install
```

### 2. Собрать operator-web

```bash
pnpm -C apps/operator-web build
```

Результат будет в `apps/operator-web/dist/`

### 3. Пересобрать server (если нужно)

```bash
cd /var/www/online.siteaccess.ru/apps/server
pnpm build
```

## Настройка

### OPERATOR_DEV_TOKEN

Добавить в `apps/server/.env` (НЕ коммитить):

```bash
OPERATOR_DEV_TOKEN=your-dev-token-here
```

## Проверка

### 1. Проверить доступность

```bash
curl -I https://online.siteaccess.ru/operator/
```

Должен вернуть HTTP 200.

### 2. Тестовый сценарий

1. **Создать канал:**
   ```bash
   curl -X POST https://online.siteaccess.ru/api/channels \
     -H 'Content-Type: application/json' \
     -d '{"name":"Demo"}'
   ```
   Сохранить `id` и `token`.

2. **Установить домены:**
   ```bash
   curl -X PUT https://online.siteaccess.ru/api/channels/CHANNEL_ID/domains \
     -H 'Content-Type: application/json' \
     -d '{"domains":["online.siteaccess.ru"]}'
   ```

3. **Открыть demo виджет:**
   - Перейти на `https://online.siteaccess.ru/demo/demo.html?token=CHANNEL_TOKEN`
   - Отправить сообщение через виджет

4. **Открыть operator web:**
   - Перейти на `https://online.siteaccess.ru/operator/`
   - Ввести Channel ID и OPERATOR_DEV_TOKEN
   - Нажать Connect
   - Выбрать беседу
   - Отправить ответ
   - Проверить, что ответ пришёл в виджет

## Структура

- `apps/operator-web/src/App.tsx` - основной компонент
- `apps/operator-web/src/App.css` - стили
- `apps/operator-web/vite.config.ts` - конфигурация Vite (base: '/operator/')
- `apps/server/src/app.module.ts` - ServeStaticModule для `/operator/`

## API Endpoints

- `GET /api/operator/dev/conversations?channelId=...` - список бесед
- `GET /api/operator/dev/messages?conversationId=...&limit=50` - сообщения беседы

## WebSocket

- Namespace: `/operator`
- Auth: `{ devToken: OPERATOR_DEV_TOKEN, channelId }`
- Events:
  - `message:send` - отправить сообщение
  - `message:new` - новое сообщение
  - `presence:update` - обновление онлайн посетителей
