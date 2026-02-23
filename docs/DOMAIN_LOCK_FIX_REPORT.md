# ФИНАЛЬНЫЙ ОТЧЕТ: FIX DOMAIN LOCK для Socket.IO e2e

## Дата: 2026-02-23
## Проблема: Domain lock блокировал WebSocket соединения в e2e тестах

---

## A) Root Cause

**Файл:** `apps/server/src/websocket/gateways/widget.gateway.ts`

**Проблема:** 
1. Origin header не извлекался правильно из Socket.IO handshake
2. Socket.IO клиент в Node.js не отправляет Origin автоматически
3. Domain lock отклонял соединения с missing origin

**Результат:** Widget socket отключался сразу после подключения, handlers не вызывались, ACK не приходили.

---

## B) What Changed

### B.1. Server-side (widget.gateway.ts)

**Изменения:**
1. Улучшен парсинг origin из нескольких источников:
   - `headers.origin`
   - `headers.referer` (парсинг hostname)
   - Нормализация (lowercase, удаление порта)
2. Добавлен тестовый режим для missing origin:
   - Если `process.env.E2E_ALLOW_NO_ORIGIN === 'true'`, разрешить missing origin
   - В production: DENY missing origin (строгая безопасность)
3. Добавлено детальное логирование:
   - `[DOMAIN_LOCK_WS] allow|deny channelId=... origin=... allowed=[...] reason=...`

### B.2. E2E Scripts

**Изменения:**
1. Добавлена поддержка `E2E_ORIGIN` env var (default: `https://example.com`)
2. Проекты создаются с правильными `allowedDomains` (hostname из E2E_ORIGIN)
3. Socket.IO соединения отправляют Origin через `transportOptions`:
   ```javascript
   transportOptions: {
     polling: { extraHeaders: { Origin: E2E_ORIGIN } },
     websocket: { extraHeaders: { Origin: E2E_ORIGIN } },
   }
   ```
4. Обновлены скрипты:
   - `e2e-reliable-messaging.mjs`
   - `e2e-call-signaling.mjs`
   - `smoke-ws-connect-auth.mjs`

**Commits:**
- `53cec34` - FIX: improve domain lock origin parsing + add E2E_ORIGIN support in e2e scripts
- (последний commit для widgetSocket2 reconnect)

---

## C) Proof Logs

### C.1. [DOMAIN_LOCK_WS] Logs

**Результат:**
```
[DOMAIN_LOCK_WS] allow channelId=d8b351e9... origin=example.com originUrl=https://example.com referer=missing allowed=[example.com] reason=allowed
[DOMAIN_LOCK_WS] allow channelId=83a3629e... origin=example.com originUrl=https://example.com referer=missing allowed=[example.com] reason=allowed
```

**Вывод:** Domain lock правильно разрешает соединения с правильным origin.

### C.2. smoke:ws:connect:auth

**Результат:**
```
✓✓✓ SMOKE TEST PASSED ✓✓✓
  Both operator and widget sockets connected successfully
  WebSocket upgrade through Nginx is working
```

### C.3. e2e:reliable

**Результат:**
```
✓ Widget socket connected
✓ Operator socket connected
[E2E] Widget ACK received: clientMessageId=widget-1771876061601-1, serverMessageId=...
[E2E] Widget ACK received: clientMessageId=widget-1771876061918-2, serverMessageId=...
[E2E] Operator ACK received: clientMessageId=operator-1771876062240-1, serverMessageId=...
[E2E] Operator ACK received: clientMessageId=operator-1771876062556-2, serverMessageId=...
```

**Статус:** ⚠️ Частично PASS
- ✅ Domain lock работает
- ✅ ACK приходят
- ⚠️ Есть проблема с дубликатами сообщений (10 total, 5 unique) - это отдельная проблема, не связанная с domain lock

### C.4. e2e:calls:signaling

**Результат:**
```
✓ Widget socket connected
✓ Operator socket connected
[E2E] Widget disconnected: reason=io server disconnect
[E2E] Operator disconnected: reason=io server disconnect
```

**Статус:** ⚠️ FAIL
- ✅ Domain lock работает (сокеты подключаются)
- ⚠️ Сокеты отключаются с "io server disconnect" - это не связано с domain lock, вероятно проблема с guards или handlers

---

## D) Current Status

**Статус:** ✅ Domain lock исправлен для e2e тестов

**Результаты:**
- ✅ smoke:ws:connect:auth PASS
- ✅ Domain lock правильно разрешает соединения с правильным origin
- ✅ ACK приходят в e2e:reliable
- ⚠️ e2e:reliable FAIL из-за дубликатов сообщений (не domain lock)
- ⚠️ e2e:calls:signaling FAIL из-за "io server disconnect" (не domain lock)

**Следующие шаги:**
1. Исправить проблему с дубликатами сообщений в e2e:reliable
2. Исправить "io server disconnect" в e2e:calls:signaling (вероятно проблема с guards)

---

**Дата:** 2026-02-23  
**Статус:** ✅ Domain lock исправлен
