# ФИНАЛЬНЫЙ ОТЧЕТ: FIX 502 ON HTTP POST (REGISTRATION) AFTER NGINX WS FIX

## Дата: 2026-02-23
## Контекст: nginx -t PASS, /health 200, socket.io polling 200, websocket upgrade 101, но POST registration возвращает 502

---

## A) Which Endpoint Was 502

**Эндпоинт:** `POST /api/auth/register`

**Используется в:**
- `smoke:ws:connect:auth` - для регистрации owner
- `e2e:reliable` - для регистрации owner
- `e2e:calls:signaling` - для регистрации owner

---

## B) Local Curl Result + HTTPS Curl Result

### B.1. Local upstream (bypass nginx):
```bash
curl -sS -i -X POST "http://127.0.0.1:3100/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"sev0_test_...@example.com","password":"Passw0rd!","name":"t"}'
```

**Результат:** (будет показан в выводе команды)

**Ожидается:** HTTP 200/201 или 400/409 (валидация/дубликат), НЕ 502

### B.2. Through nginx (HTTPS):
```bash
curl -sS -i -X POST "https://online.siteaccess.ru/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email":"sev0_test_...@example.com","password":"Passw0rd!","name":"t"}'
```

**Результат:** (будет показан в выводе команды)

**Ожидается:** HTTP 200/201 или 400/409, НЕ 502

---

## C) Relevant nginx error.log Lines (20-40 lines)

**Результат:** (будет показан в выводе команды)

**Типичные ошибки:**
- `upstream prematurely closed connection`
- `connect() failed (111: Connection refused)`
- `upstream sent too big header`
- `upstream sent invalid header`

---

## D) Relevant journalctl Lines (50-120 lines)

**Результат:** (будет показан в выводе команды)

**Типичные ошибки:**
- Stack traces
- Unhandled promise rejections
- Prisma errors
- Throttler errors
- Body parser errors
- CORS/Origin errors

---

## E) What Change Was Made (app vs nginx), and Why

**Решение:** (будет определено на основе результатов curl и логов)

**Варианты:**
1. **Node app crash/reset:**
   - Причина: ошибка в коде, отсутствующие env vars, Prisma migration mismatch
   - Исправление: исправление кода, добавление env vars, `prisma migrate deploy`

2. **Nginx proxy mismatch:**
   - Причина: неправильные proxy headers, body size limits, timeouts, buffering
   - Исправление: добавление/исправление proxy настроек в nginx site config

---

## F) Proofs After Fix

### F.1. nginx -t PASS:
**Результат:** (будет показан в выводе команды)

**Ожидается:** `nginx: configuration file /etc/nginx/nginx.conf test is successful`

### F.2. HTTPS registration returns expected 200/201:
**Результат:** (будет показан в выводе команды)

**Ожидается:** HTTP 200/201 или 400/409 (валидация/дубликат)

### F.3. smoke:ws:connect:auth PASS:
**Результат:** (будет показан в выводе команды)

**Ожидается:** Все шаги PASS, включая регистрацию и подключение socket.io

### F.4. e2e:reliable PASS:
**Результат:** (будет показан в выводе команды)

**Ожидается:** Все шаги PASS, включая регистрацию, создание проекта, подключение socket.io, отправку сообщений

### F.5. e2e:calls:signaling PASS:
**Результат:** (будет показан в выводе команды)

**Ожидается:** Все шаги PASS, включая регистрацию, создание проекта, подключение socket.io, signaling call:offer/answer/ice/hangup

---

## G) Current Status

**Статус:** В процессе диагностики

**Следующие шаги:**
1. Проверить статус сервиса `online-siteaccess`
2. Проверить, слушает ли процесс порт 3100
3. Проверить локальный и HTTPS curl для регистрации
4. Проверить логи nginx и journalctl
5. Определить причину 502
6. Применить исправление
7. Проверить все тесты

---

**Дата:** 2026-02-23  
**Статус:** В процессе
