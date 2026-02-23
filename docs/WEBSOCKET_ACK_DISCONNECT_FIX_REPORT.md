# ФИНАЛЬНЫЙ ОТЧЕТ: FIX ACK + IO SERVER DISCONNECT

## Дата: 2026-02-23
## Проблемы: ACK missing в e2e:reliable, io server disconnect в e2e:calls:signaling

---

## A) Which Handler Lacked Return

**Файл:** `apps/server/src/websocket/gateways/widget.gateway.ts` и `operator.gateway.ts`

**Проблема:** Метод `handleMessage` не возвращал значение для ACK. В Socket.IO, чтобы отправить ACK, handler должен вернуть объект, который будет отправлен клиенту как ответ.

**Исправление:**
- Изменен `handleMessage` в обоих gateway, чтобы возвращать ACK объект:
  ```typescript
  return {
    clientMessageId,
    serverMessageId: message.id,
    conversationId: message.conversationId,
    createdAt: message.createdAt.toISOString(),
  };
  ```
- Также добавлен `client.emit('message:ack', ackPayload)` для обратной совместимости

---

## B) Which Guard Caused Disconnect (if any)

**Файл:** `apps/server/src/websocket/middleware/operator-auth.middleware.ts` и `widget-auth.middleware.ts`

**Проблема:** Guards выбрасывали исключения (`throw new UnauthorizedException` или `throw new WsException`), что вызывало disconnect сокета.

**Исправление:**
- Заменены все `throw` на `return false` в guards
- Добавлено логирование `[GUARD TRACE]` для диагностики
- Guards теперь возвращают `false` вместо выбрасывания исключений, что позволяет Socket.IO обработать отказ более gracefully

---

## C) Commit Hash

**Результат:** (будет показан в выводе команды)

---

## D) Passing Outputs

### D.1. smoke:ws:connect:auth

**Результат:** (будет показан в выводе команды)

**Ожидается:** PASS

### D.2. e2e:reliable

**Результат:** (будет показан в выводе команды)

**Ожидается:** PASS (ACK должны приходить)

### D.3. e2e:calls:signaling

**Результат:** (будет показан в выводе команды)

**Ожидается:** PASS (не должно быть "io server disconnect")

---

## E) TRACE Logs

**Результат:** (будет показан в выводе команды)

**Ожидается:** Логи `[TRACE]` для всех handlers и `[GUARD TRACE]` для guards

---

## F) Current Status

**Статус:** ⚠️ Частично исправлено

**Результаты:**
- ✅ Guards исправлены (возвращают false вместо throw)
- ✅ Handlers возвращают ACK объекты
- ✅ Добавлено логирование TRACE
- ⚠️ **НОВАЯ ПРОБЛЕМА:** Widget socket отключается из-за domain lock (`Connection rejected: domain not allowed`)
- ⚠️ Handler `message:send` не вызывается, потому что сокет отключен до отправки сообщения

**Root Cause:**
В логах видно:
```
[WARN] [WidgetGateway] [WS_TRACE] [WIDGET] Connection rejected: domain not allowed, clientId=ts2vRaD3nY0_DynzAAAP
```

Это означает, что:
1. Widget socket подключается
2. Но затем отключается из-за domain lock (origin не разрешен)
3. Поэтому когда отправляется `message:send`, сокет уже отключен
4. Handler не вызывается, потому что сокет не подключен

**Следующие шаги:**
1. Исправить domain lock логику для e2e тестов (разрешить отсутствие origin или добавить специальный флаг)
2. Или исправить e2e скрипт, чтобы передавать правильный Origin header
3. Проверить, что channel имеет правильные allowedDomains

---

**Дата:** 2026-02-23  
**Статус:** ⚠️ Требуется исправление domain lock для e2e тестов
