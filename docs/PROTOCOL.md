# WebSocket Protocol

## Namespaces

### /widget
Авторизация через `visitorSessionToken` (JWT) в `auth.token` или `query.token`.

### /operator
Авторизация через:
- DEV режим: header `x-operator-dev-token` (требует `OPERATOR_DEV_TOKEN` в env)
- Production: JWT (TODO)

## Events

### Widget Namespace

#### message:send
Отправить сообщение.

**Payload:**
```json
{
  "conversationId": "uuid",
  "text": "string (1-4000 chars)",
  "clientMessageId": "string (unique)"
}
```

**Response: message:ack**
```json
{
  "clientMessageId": "string",
  "serverMessageId": "uuid",
  "createdAt": "ISO8601"
}
```

**Broadcast: message:new** (для других участников)
```json
{
  "serverMessageId": "uuid",
  "conversationId": "uuid",
  "text": "string",
  "senderType": "visitor" | "operator",
  "createdAt": "ISO8601"
}
```

#### sync:request
Запросить историю сообщений.

**Payload:**
```json
{
  "conversationId": "uuid",
  "afterCreatedAt": "ISO8601 (optional)",
  "limit": "number (1-200, default 50)"
}
```

**Response: sync:response**
```json
{
  "messages": [
    {
      "serverMessageId": "uuid",
      "conversationId": "uuid",
      "text": "string",
      "senderType": "visitor" | "operator",
      "createdAt": "ISO8601"
    }
  ]
}
```

#### presence:heartbeat
Обновить статус онлайн (каждые 30 секунд).

**Payload:** нет

**Broadcast: presence:update** (для операторов)
```json
{
  "channelId": "uuid",
  "onlineVisitors": "number"
}
```

## Rooms

Сокеты автоматически присоединяются к:
- `channel:{channelId}` - для broadcast по каналу
- `conversation:{conversationId}` - для broadcast по конверсации

## Error Events

При ошибке клиент получает:
```json
{
  "message": "error description"
}
```
