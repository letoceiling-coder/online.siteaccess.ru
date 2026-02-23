# ФИНАЛЬНЫЙ ОТЧЕТ: FIX Duplicates + "io server disconnect"

## Дата: 2026-02-23
## Проблемы: Дубликаты сообщений в e2e:reliable, "io server disconnect" в e2e:calls:signaling

---

## A) Root Cause Summary

### A.1. Duplicates (e2e:reliable)

**Root Cause:** 
1. **Server-side:** Widget sockets присоединялись к `channel:${channelId}` комнате, что приводило к двойной доставке сообщений от оператора (из channel и conversation комнат)
2. **Test-side:** Тест неправильно проверял дубликаты - объединял widgetHistory и operatorHistory, которые должны содержать одинаковые сообщения (одна беседа)

**Fix:**
1. Widget sockets больше НЕ присоединяются к channel room (только conversation room)
2. Исправлена проверка дубликатов в тесте - проверка внутри каждого массива отдельно

### A.2. "io server disconnect" (e2e:calls:signaling)

**Root Cause:** 
Оператор отключается из-за отсутствия токена в handshake: `[AUTH_DISCONNECT] ns=operator socketId=... reason=no_token tokenSource=handshake`

**Status:** ⚠️ Требуется проверка передачи токена в e2e-call-signaling.mjs

---

## B) What Changed

### B.1. Server-side (widget.gateway.ts)

**Изменения:**
1. Widget sockets больше НЕ присоединяются к `channel:${channelId}` комнате
2. Добавлено логирование комнат (при `DEBUG_WS=1`)
3. Добавлено логирование эмиссии сообщений (при `DEBUG_WS=1`)
4. Добавлено отслеживание последнего события для диагностики disconnect

### B.2. Server-side (widget-auth.middleware.ts)

**Изменения:**
1. Widget sockets больше НЕ присоединяются к `channel:${channelId}` комнате в guard
2. Добавлено логирование комнат (при `DEBUG_WS=1`)

### B.3. Server-side (operator.gateway.ts)

**Изменения:**
1. Добавлено логирование комнат (при `DEBUG_WS=1`)
2. Добавлено отслеживание последнего события для диагностики disconnect
3. Улучшено логирование disconnect с причиной и контекстом

### B.4. E2E Scripts

**Изменения:**
1. Исправлена проверка дубликатов в `e2e-reliable-messaging.mjs` - проверка внутри каждого массива отдельно
2. Исправлена ошибка `uniqueClientIds is not defined`

**Commits:**
- `be60352` - FIX: prevent duplicate messages (widget not join channel room) + add disconnect diagnostics
- `fc3794d` - FIX: correct duplicate check in e2e:reliable (check within each history, not across)
- (последний commit для исправления undefined)

---

## C) Proof Logs

### C.1. e2e:reliable

**Результат:**
```
✓ No duplicates: widgetHistory=5 unique, operatorHistory=5 unique
✓✓✓ ALL TESTS PASSED ✓✓✓
```

**Статус:** ✅ PASS (после исправления undefined)

### C.2. e2e:calls:signaling

**Результат:**
```
[E2E] Widget connected: socketId=...
[E2E] Operator connected: socketId=...
[E2E] Widget disconnected: reason=io server disconnect
[E2E] Operator disconnected: reason=io server disconnect
```

**Server Logs:**
```
[AUTH_DISCONNECT] ns=operator socketId=... reason=no_token tokenSource=handshake
[DISCONNECT] ns=widget socketId=... reason=unknown lastEvent=unknown authed=false
```

**Статус:** ⚠️ FAIL
- Проблема: оператор отключается из-за отсутствия токена в handshake
- Требуется: проверить передачу токена в e2e-call-signaling.mjs

---

## D) Current Status

**Статус:** ✅ Дубликаты исправлены, ⚠️ "io server disconnect" требует проверки передачи токена

**Результаты:**
- ✅ e2e:reliable PASS (после исправления undefined)
- ✅ Widget sockets не присоединяются к channel room
- ✅ Проверка дубликатов исправлена
- ⚠️ e2e:calls:signaling FAIL - оператор отключается из-за отсутствия токена

**Следующие шаги:**
1. Проверить, почему токен оператора не доходит до сервера в e2e-call-signaling
2. Убедиться, что токен передается правильно в `auth: { token: operatorAccessToken }`

---

**Дата:** 2026-02-23  
**Статус:** ✅ Дубликаты исправлены, ⚠️ Требуется проверка передачи токена оператора
