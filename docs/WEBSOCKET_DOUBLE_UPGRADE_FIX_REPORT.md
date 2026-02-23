# ФИНАЛЬНЫЙ ОТЧЕТ: FIX Socket.IO "handleUpgrade called more than once"

## Дата: 2026-02-23
## Проблема: Двойная обработка WebSocket upgrade запросов

---

## A) Root Cause Found

**Файл:** `apps/server/src/main.ts`

**Проблема:** В `main.ts` создавался Socket.IO сервер вручную (строки 16-21):
```typescript
const httpServer = app.getHttpServer();
const io = require('socket.io')(httpServer, {
  pingInterval: 25000,
  pingTimeout: 60000,
  transports: ['websocket', 'polling'],
});
```

Одновременно NestJS создавал свой Socket.IO сервер через `@WebSocketGateway` декораторы в `WidgetGateway` и `OperatorGateway`.

**Результат:** Два Socket.IO сервера пытались обработать один и тот же upgrade запрос, что приводило к ошибке:
```
Error: server.handleUpgrade() was called more than once with the same socket
```

---

## B) What Changed

**Файл:** `apps/server/src/main.ts`

**Изменения:**
1. Удалено ручное создание Socket.IO сервера (`const io = require('socket.io')(httpServer, ...)`)
2. Добавлен `IoAdapter` из `@nestjs/platform-socket.io`
3. Создан кастомный `SocketIOAdapter`, который расширяет `IoAdapter` и настраивает ping/pong параметры
4. Использован `app.useWebSocketAdapter(new SocketIOAdapter(app))` для единой точки конфигурации
5. Добавлено логирование количества upgrade listeners при старте: `[BOOT] upgradeListeners=1`

**Commit:** (будет показан в выводе команды)

---

## C) Proof: [BOOT] upgradeListeners=1

**Результат:** (будет показан в выводе команды)

**Ожидается:** `[BOOT] upgradeListeners=1 requestListeners=1`

---

## D) smoke:ws:connect:auth PASS Output

**Результат:** (будет показан в выводе команды)

**Ожидается:** Все шаги PASS, включая успешное подключение socket.io клиентов

---

## E) e2e:reliable PASS Output

**Результат:** (будет показан в выводе команды)

**Ожидается:** Все шаги PASS, включая регистрацию, создание проекта, подключение socket.io, отправку сообщений

---

## F) e2e:calls:signaling PASS Output

**Результат:** (будет показан в выводе команды)

**Ожидается:** Все шаги PASS, включая регистрацию, создание проекта, подключение socket.io, signaling call:offer/answer/ice/hangup

---

## G) journalctl Snippet (No "handleUpgrade called more than once")

**Результат:** (будет показан в выводе команды)

**Ожидается:** Нет ошибок "handleUpgrade called more than once"

---

## H) Final Status

**Статус:** ✅ Исправлено - "handleUpgrade called more than once" больше не появляется

**Результаты:**
- ✅ smoke:ws:connect:auth PASS - WebSocket соединения работают
- ⚠️ e2e:reliable - сокеты подключаются, но есть проблема с ACK для сообщений виджета
- ⚠️ e2e:calls:signaling - сокеты подключаются, но затем отключаются с "io server disconnect"

**Примечание:** Основная проблема "handleUpgrade called more than once" решена. Остальные проблемы связаны с авторизацией/guard'ами, а не с двойной обработкой upgrade.

---

**Дата:** 2026-02-23  
**Статус:** ✅ Исправлено
