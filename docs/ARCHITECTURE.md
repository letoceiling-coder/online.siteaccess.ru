# Архитектура системы online.siteaccess.ru

## Обзор

Система состоит из трех основных компонентов:
1. **Widget** - виджет чата для встраивания на любой сайт
2. **Operator Web** - веб-приложение для операторов
3. **Server** - NestJS backend с WebSocket (Socket.IO)

## Компоненты

### 1. Widget (apps/widget)

**Технологии**: Vanilla JS, Shadow DOM, Vite

**Особенности**:
- Сборка в UMD + ESM форматы
- Изолированный Shadow DOM (не конфликтует со стилями сайта)
- Легковесный, без фреймворков
- Подключение через один `<script>` тег

**Доменная модель**:
- `channel` - канал (сайт/проект)
- `visitor` - посетитель сайта
- `conversation` - диалог между посетителем и оператором
- `message` - сообщение в диалоге
- `attachment` - вложение (файл, изображение)

### 2. Operator Web (apps/operator-web)

**Технологии**: React + Vite

**Особенности**:
- Веб-интерфейс для операторов
- Управление несколькими каналами
- Список активных диалогов
- История сообщений
- Online presence (статус онлайн/оффлайн)

### 3. Server (apps/server)

**Технологии**: NestJS + PostgreSQL + Redis + Socket.IO

**Особенности**:
- REST API для widget и operator
- WebSocket (Socket.IO) для realtime
- PostgreSQL для хранения данных
- Redis для кэширования и pub/sub

**Доменная модель** (Prisma):
```
Channel -> Visitor -> Conversation -> Message -> Attachment
```

## TURN vs Signaling vs Chat

### TURN (Traversal Using Relays around NAT)

**Что это**: Инфраструктурный сервер для WebRTC (coTURN)

**Назначение**: Помогает установить медиа-соединение между клиентами через NAT/файрволы

**Как используется**:
- Конфигурируется через `iceServers` в WebRTC
- Уже существует на сервере (настраивается отдельно)
- Используется только для видеозвонков (Этап 2)
- Не используется для чата

**⚠️ ВАЖНО: НЕ хранить TURN credentials в git! Используйте переменные окружения.**

**Конфигурация** (пример с placeholders):
```typescript
iceServers: [
  { urls: 'stun:stun.l.google.com:19302' },
  { 
    urls: `turn:${process.env.TURN_SERVER}:3478`,
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL
  }
]
```

**Переменные окружения** (см. `.env.example`):
- `TURN_SERVER` - адрес TURN сервера (например: `turn.example.com` или IP)
- `TURN_USERNAME` - username для TURN аутентификации
- `TURN_CREDENTIAL` - password для TURN аутентификации

### Signaling (WebSocket)

**Что это**: Протокол обмена сигналами для установки WebRTC соединения

**Назначение**: Обмен SDP (Session Description Protocol) и ICE кандидатами

**Как используется**:
- Через Socket.IO события (`call:initiate`, `call:answer`, `call:ice-candidate`)
- Только для видеозвонков (Этап 2)
- Не используется для чата

### Chat (WebSocket)

**Что это**: Текстовые сообщения через WebSocket

**Назначение**: Обмен сообщениями между visitor и operator

**Как используется**:
- Через Socket.IO события (`message:send`, `message:received`)
- Для чата (Этап 1 - MVP)
- Не требует TURN (только WebSocket)

## Поток данных

### Чат (Этап 1)

```
Widget (visitor) <--WebSocket--> Server <--WebSocket--> Operator Web
```

1. Visitor отправляет сообщение через WebSocket
2. Server сохраняет в PostgreSQL
3. Server отправляет через WebSocket operator'у
4. Operator отвечает через WebSocket
5. Server сохраняет и отправляет visitor'у

### Видеозвонок (Этап 2)

```
Widget (visitor) <--WebSocket (signaling)--> Server <--WebSocket (signaling)--> Operator Web
Widget (visitor) <--WebRTC (media)--> TURN <--WebRTC (media)--> Operator Web
```

1. Signaling через WebSocket (SDP, ICE кандидаты)
2. Медиа-данные через WebRTC (P2P или через TURN relay)

## Безопасность

- JWT токены для аутентификации
- **Секреты только в `.env` (не в git)**
- `.env.example` без значений (только ключи)
- HTTPS для production
- **Никогда не коммитить реальные credentials в git**

## Масштабирование

- Redis pub/sub для multi-instance серверов
- PostgreSQL для персистентности
- Socket.IO Redis adapter для синхронизации WebSocket между инстансами
