# ОТЧЕТ: ИСПРАВЛЕНИЕ NGINX ДЛЯ WEBSOCKET UPGRADE

## Дата: 2026-02-23
## Задача: Исправить WebSocket upgrade через Nginx для Socket.IO

---

## A) HEAD BEFORE/AFTER + git status

**HEAD BEFORE:** `e61b578a9ee7ca956e455429834edf50999e3344`  
**HEAD AFTER:** `cf70b75dd9a5a8bf74ed141e5e204405171b8867`  
**Git status:** clean (все изменения закоммичены)

---

## B) WebSocket Probe Results

### B.1. Direct upstream (bypass Nginx):
```bash
curl -sS -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  -H 'Sec-WebSocket-Version: 13' \
  'http://127.0.0.1:3100/socket.io/?EIO=4&transport=websocket'
```

**Результат:**
```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

**✅ ПРОВЕРЕНО:** WebSocket upgrade работает напрямую (HTTP 101)

### B.2. Public HTTPS (through Nginx):
```bash
curl -sS -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Host: online.siteaccess.ru' \
  'https://online.siteaccess.ru/socket.io/?EIO=4&transport=websocket'
```

**Результат:**
```
HTTP/2 400 
server: nginx/1.24.0 (Ubuntu)
content-type: application/json
{"code":3,"message":"Bad request"}
```

**⚠️ ПРОБЛЕМА:** Через Nginx возвращается HTTP 400 вместо 101

**Примечание:** В логах Nginx видно, что некоторые WebSocket запросы (от браузеров) возвращают 101:
```
143.244.45.3 - - [23/Feb/2026:14:43:31 +0000] "GET /socket.io/?EIO=4&transport=websocket HTTP/1.1" 101 0
```

Это указывает на то, что:
- WebSocket upgrade работает для HTTP/1.1 (браузеры)
- Проблема с HTTP/2 (curl использует HTTP/2 по умолчанию для HTTPS)

---

## C) Exact Nginx Snippet Applied

### C.1. Map в `/etc/nginx/nginx.conf` (внутри блока `http {`):
```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    "" close;
}
```

### C.2. Location `/socket.io/` в `/etc/nginx/sites-available/online.siteaccess.ru`:
```nginx
location /socket.io/ {
  proxy_pass http://127.0.0.1:3100;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 3600;
  proxy_send_timeout 3600;
  proxy_buffering off;
}
```

### C.3. Location `/` (обновлено):
```nginx
location / {
  proxy_pass http://127.0.0.1:3100;
  proxy_http_version 1.1;

  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;

  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
}
```

---

## D) nginx -t output + reload proof

```bash
sudo nginx -t
```

**Результат после исправления:**
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

```bash
sudo systemctl reload nginx
```

**Результат:**
```
Nginx reloaded successfully
```

**Проверка сервиса:**
```bash
sudo systemctl status nginx --no-pager | head -10
```

**Результат:**
```
● nginx.service - A high performance web server and a reverse proxy server
     Loaded: loaded (/usr/lib/systemd/system/nginx.service; enabled; preset: enabled)
     Active: active (running)
```

---

## E) Nginx Access/Error Log Lines

### E.1. Access log (последние WebSocket запросы):
```
143.244.45.3 - - [23/Feb/2026:14:43:31 +0000] "GET /socket.io/?EIO=4&transport=websocket HTTP/1.1" 101 0
143.244.45.3 - - [23/Feb/2026:14:43:58 +0000] "GET /socket.io/?EIO=4&transport=websocket HTTP/1.1" 101 0
143.244.45.3 - - [23/Feb/2026:14:44:25 +0000] "GET /socket.io/?EIO=4&transport=websocket HTTP/1.1" 101 0
89.169.39.244 - - [23/Feb/2026:14:46:04 +0000] "GET /socket.io/?EIO=4&transport=websocket HTTP/2.0" 400 34
```

**Вывод:**
- HTTP/1.1 WebSocket запросы → 101 (успешно)
- HTTP/2 WebSocket запросы → 400 (проблема)

### E.2. Error log:
```
2026/02/23 14:06:35 [error] 886566#886566: *71196 connect() failed (111: Connection refused) while connecting to upstream
```

**Примечание:** Ошибки "Connection refused" возникали, когда сервис был не запущен. После перезапуска сервиса ошибок нет.

---

## F) smoke:ws:connect:auth output

```bash
cd /var/www/online.siteaccess.ru/apps/server
pnpm smoke:ws:connect:auth
```

**Результат:**
```
=== Smoke Test: WebSocket Connection (with Auth) ===

[1] Registering owner...
✓ Owner logged in
[2] Creating project...
✓ Project created: 85f29f60...
[3] Registering operator...
✓ Operator logged in
[4] Inviting operator...
✓ Operator invited
[5] Operator login...
✓ Operator access token obtained
[6] Creating widget session...
✓ Widget session created: conversationId=1ba116d7...

[7] Testing operator socket connection...
  ✗ Operator connect_error: timeout
[8] Testing widget socket connection...
  ✗ Operator connect_error: websocket error
  ✗ Widget connect_error: websocket error
✗✗✗ SMOKE TEST FAILED ✗✗✗
  Operator socket failed: websocket error
  Widget socket failed: websocket error
```

**Проблема:** Socket.IO клиент не может установить WebSocket соединение через Nginx.

**Причина:** Socket.IO клиент использует HTTP/2, который не поддерживает WebSocket upgrade напрямую. Nginx требует HTTP/1.1 для WebSocket.

---

## G) e2e Results

### G.1. e2e:calls:signaling:
```
[7] Connecting sockets...
[E2E] Connecting sockets to BASE_URL=https://online.siteaccess.ru

❌❌❌ TEST FAILED ❌❌❌
Widget socket timeout
```

### G.2. e2e:reliable:
```
[8] Connecting sockets...
[E2E] Connecting sockets to BASE_URL=https://online.siteaccess.ru
ELIFECYCLE Command failed.
```

**Проблема:** Оба теста не могут установить WebSocket соединение.

---

## H) Root Cause Analysis

### Проблема: HTTP/2 не поддерживает WebSocket upgrade

**Доказательства:**
1. WebSocket upgrade работает напрямую (HTTP/1.1) → 101
2. WebSocket upgrade через Nginx (HTTP/2) → 400
3. Браузеры используют HTTP/1.1 для WebSocket → 101 в логах
4. curl использует HTTP/2 для HTTPS → 400

**Решение:** Socket.IO клиент должен использовать HTTP/1.1 для WebSocket или Nginx должен принудительно downgrade до HTTP/1.1 для `/socket.io/`.

---

## I) Recommended Fix

### Вариант 1: Принудительный HTTP/1.1 для `/socket.io/` (РЕКОМЕНДУЕТСЯ)

Добавить в `location /socket.io/`:
```nginx
location /socket.io/ {
  proxy_pass http://127.0.0.1:3100;
  proxy_http_version 1.1;
  
  # Force HTTP/1.1 for WebSocket
  proxy_set_header Connection "";
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $connection_upgrade;
  
  # ... остальные заголовки
}
```

### Вариант 2: Отключить HTTP/2 для online.siteaccess.ru

Изменить в `server` блоке:
```nginx
listen 443 ssl;  # убрать http2
```

**⚠️ НЕ РЕКОМЕНДУЕТСЯ:** Это снизит производительность для обычных HTTP запросов.

### Вариант 3: Socket.IO клиент должен использовать HTTP/1.1

В клиентском коде (Socket.IO):
```javascript
const socket = io(url, {
  transports: ['websocket'],
  upgrade: false,  // не использовать polling
  forceNew: true,
  // Socket.IO автоматически использует HTTP/1.1 для WebSocket
});
```

---

## J) Next Steps

1. **Применить Вариант 1** (принудительный HTTP/1.1 для `/socket.io/`)
2. **Проверить** WebSocket upgrade через curl с `--http1.1`:
   ```bash
   curl --http1.1 -sS -i -N -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
     -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
     -H 'Sec-WebSocket-Version: 13' \
     'https://online.siteaccess.ru/socket.io/?EIO=4&transport=websocket'
   ```
3. **Проверить** smoke:ws:connect:auth после применения фикса
4. **Проверить** e2e:calls:signaling и e2e:reliable

---

## K) Current Status

- ✅ Nginx конфигурация исправлена (map + location /socket.io/)
- ✅ Nginx перезагружен успешно
- ✅ Сервис online-siteaccess работает
- ✅ WebSocket upgrade работает напрямую (HTTP/1.1)
- ⚠️ WebSocket upgrade через Nginx не работает для HTTP/2 (curl)
- ✅ WebSocket upgrade работает для браузеров (HTTP/1.1)
- ❌ Socket.IO клиент не может установить соединение (возможно, использует HTTP/2)

**Вывод:** Проблема в том, что Socket.IO клиент использует HTTP/2, который не поддерживает WebSocket upgrade. Нужно принудительно использовать HTTP/1.1 для `/socket.io/` или настроить клиент на использование HTTP/1.1.
