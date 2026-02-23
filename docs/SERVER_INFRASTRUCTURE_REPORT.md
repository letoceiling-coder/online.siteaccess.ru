# ОТЧЕТ О КОНФИГУРАЦИИ СЕРВЕРА
## Дата анализа: 2026-02-23
## Сервер: 89.169.39.244

---

## 1. ОБЗОР СЕРВИСОВ

### Активные сервисы:
- **nginx.service** - веб-сервер и reverse proxy (активен)
- **php8.3-fpm.service** - PHP FastCGI Process Manager (активен)
- **pm2-root.service** - PM2 process manager (активен)
- **online-siteaccess.service** - Node.js приложение на порту 3100 (активен)

---

## 2. СПИСОК ВСЕХ ДОМЕНОВ И САЙТОВ

### 2.1. Активные сайты в Nginx:

| Домен | HTTP | HTTPS | Тип | Директория | Порт upstream |
|-------|------|-------|-----|------------|---------------|
| **admin.neeklo.ru** | 80 | 443 | Laravel | `/var/www/admin.neeklo.ru/public` | PHP-FPM |
| **api.siteaccess.ru** | 80 | 443 | Laravel/React | `/var/www/AL/public` | PHP-FPM |
| **auto.siteaccess.ru** | 80 | 443 | Laravel | `/var/www/auto.siteaccess.ru/public` | PHP-FPM |
| **essens-store.ru** | 80 | 443 | Proxy | `/var/www/essens-store.ru/public_html` | `127.0.0.1:8000` |
| **file-to-text.siteaacess.ru** | 80 | 443 | Proxy | `/var/www/messager/chat-hub-design/dist` | `localhost:30000` |
| **insales.siteaccess.ru** | 80→301 | 443 | Proxy | - | `127.0.0.1:8443` |
| **neekloai.ru** | 80 | 443 | Proxy | `/var/www/messager/chat-hub-design/dist` | `localhost:30000` |
| **online.siteaccess.ru** | 80→301 | 443 | Proxy | - | `127.0.0.1:3100` |
| **p-d-a-b.neeklo.ru** | 80 | 443 | Laravel | `/var/www/p-d-a-b.neeklo.ru/public` | PHP-FPM |
| **proffi-center.ru** | 80 | 443 | Laravel | `/var/www/proffi-center/public` | PHP-FPM |
| **trendagent.siteaccess.ru** | 80 | 443 | Laravel | `/var/www/trend-api/backend/public` | PHP-FPM |

### 2.2. Поддомены:

- **www.auto.siteaccess.ru** → `auto.siteaccess.ru`
- **www.essens-store.ru** → `essens-store.ru`
- **www.neekloai.ru** → `neekloai.ru`
- **www.proffi-center.ru** → `proffi-center.ru`
- **anapa.proffi-center.ru** → `proffi-center.ru`
- **stavropol.proffi-center.ru** → `proffi-center.ru`
- **moscow.proffi-center.ru** → `proffi-center.ru`

### 2.3. IP-адрес сервера:

- **89.169.39.244** - default_server на порту 80, проксирует на `localhost:30000`

---

## 3. SSL СЕРТИФИКАТЫ LET'S ENCRYPT

### 3.1. Список всех сертификатов:

| Домен | Тип ключа | Истекает | Статус | Путь к сертификату |
|-------|-----------|----------|--------|-------------------|
| **admin.neeklo.ru** | ECDSA | 2026-05-23 (88 дней) | VALID | `/etc/letsencrypt/live/admin.neeklo.ru/` |
| **api.siteaccess.ru** | ECDSA | 2026-05-09 (75 дней) | VALID | `/etc/letsencrypt/live/api.siteaccess.ru/` |
| **auto.siteaccess.ru** | ECDSA | 2026-05-09 (75 дней) | VALID | `/etc/letsencrypt/live/auto.siteaccess.ru/` |
| **essens-store.ru** | ECDSA | 2026-05-09 (75 дней) | VALID | `/etc/letsencrypt/live/essens-store.ru/` |
| **file-to-text.siteaacess.ru** | ECDSA | 2026-05-09 (75 дней) | VALID | `/etc/letsencrypt/live/file-to-text.siteaacess.ru/` |
| **insales.siteaccess.ru** | ECDSA | 2026-05-09 (75 дней) | VALID | `/etc/letsencrypt/live/insales.siteaccess.ru/` |
| **neekloai.ru** | ECDSA | 2026-05-09 (75 дней) | VALID | `/etc/letsencrypt/live/neekloai.ru/` |
| **online.siteaccess.ru** | ECDSA | 2026-05-21 (86 дней) | VALID | `/etc/letsencrypt/live/online.siteaccess.ru/` |
| **p-d-a-b.neeklo.ru** | ECDSA | 2026-05-09 (75 дней) | VALID | `/etc/letsencrypt/live/p-d-a-b.neeklo.ru/` |
| **parser-auto.siteaccess.ru** | ECDSA | 2026-04-30 (65 дней) | VALID | `/etc/letsencrypt/live/parser-auto.siteaccess.ru/` |
| **proffi-center.ru** | ECDSA | 2026-05-18 (84 дня) | VALID | `/etc/letsencrypt/live/proffi-center.ru/` |
| **trendagent.siteaccess.ru** | ECDSA | 2026-05-11 (76 дней) | VALID | `/etc/letsencrypt/live/trendagent.siteaccess.ru/` |

**Примечание:** Сертификат `proffi-center.ru` покрывает также поддомены: `anapa.proffi-center.ru`, `stavropol.proffi-center.ru`, `moscow.proffi-center.ru`, `www.proffi-center.ru`

---

## 4. ДИРЕКТОРИИ САЙТОВ

### 4.1. Основные директории в `/var/www/`:

| Директория | Владелец | Назначение | Связанный домен |
|------------|----------|------------|-----------------|
| `/var/www/admin.neeklo.ru/` | www-data | Laravel приложение | admin.neeklo.ru |
| `/var/www/AL/` | www-data | Laravel/React приложение | api.siteaccess.ru |
| `/var/www/auto.siteaccess.ru/` | www-data | Laravel приложение | auto.siteaccess.ru |
| `/var/www/essens-store.ru/` | www-data | Статический сайт | essens-store.ru |
| `/var/www/messager/` | root | Chat hub design | neekloai.ru, file-to-text.siteaacess.ru |
| `/var/www/online.siteaccess.ru/` | www-data | **Node.js приложение** | **online.siteaccess.ru** |
| `/var/www/p-d-a-b.neeklo.ru/` | www-data | Laravel приложение | p-d-a-b.neeklo.ru |
| `/var/www/proffi-center/` | root | Laravel приложение | proffi-center.ru |
| `/var/www/trend-api/` | root | Laravel API | trendagent.siteaccess.ru |
| `/var/www/_letsencrypt/` | www-data | Let's Encrypt challenges | - |
| `/var/www/html/` | root | Default web root | - |

### 4.2. Дополнительные директории:

- `/var/www/ai-hub-backend/` - Backend приложение
- `/var/www/image-to-text-bot/` - Telegram бот
- `/var/www/messenger/` - Messenger приложение
- `/var/www/parser-traidagent/` - Парсер
- `/var/www/tesseract-api/` - Tesseract API (порт 8080)

---

## 5. КОНФИГУРАЦИЯ NGINX

### 5.1. Файлы конфигурации:

Все активные конфигурации находятся в `/etc/nginx/sites-enabled/`:

1. `00-default-443-reject.conf` - Блокировка незащищенных HTTPS соединений
2. `admin.neeklo.ru` → `/etc/nginx/sites-available/admin.neeklo.ru`
3. `api.siteaccess.ru` → `/etc/nginx/sites-available/api.siteaccess.ru`
4. `auto.siteaccess.ru` → `/etc/nginx/sites-available/auto.siteaccess.ru`
5. `essens-store.ru` → `/etc/nginx/sites-available/essens-store.ru`
6. `messager` → `/etc/nginx/sites-available/messager`
7. `messenger` - статический файл (не симлинк)
8. **`online.siteaccess.ru`** → `/etc/nginx/sites-available/online.siteaccess.ru` **← ВАЖНО**
9. `p-d-a-b.neeklo.ru` → `/etc/nginx/sites-available/p-d-a-b.neeklo.ru`
10. `proffi-center.ru` → `/etc/nginx/sites-available/proffi-center.ru`
11. `telegram-bot` → `/etc/nginx/sites-available/telegram-bot`
12. `tesseract-api` → `/etc/nginx/sites-available/tesseract-api`
13. `trendagent.siteaccess.ru` → `/etc/nginx/sites-available/trendagent.siteaccess.ru`

### 5.2. Конфигурация online.siteaccess.ru:

**Файл:** `/etc/nginx/sites-available/online.siteaccess.ru`

```nginx
# HTTP → HTTPS redirect
server {
  listen 80;
  server_name online.siteaccess.ru;

  location ^~ /.well-known/acme-challenge/ {
    root /var/www/_letsencrypt;
    default_type text/plain;
    try_files $uri =404;
  }

  return 301 https://$host$request_uri;
}

# HTTPS
server {
  listen 443 ssl http2;
  server_name online.siteaccess.ru;

  ssl_certificate     /etc/letsencrypt/live/online.siteaccess.ru/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/online.siteaccess.ru/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection upgrade;  # ⚠️ ПРОБЛЕМА: должно быть "Upgrade"
  }
}
```

**⚠️ КРИТИЧЕСКАЯ ПРОБЛЕМА:**
- `Connection upgrade` должно быть `Connection "Upgrade"` (заглавная U, в кавычках)
- Отсутствует отдельный `location /socket.io/` для WebSocket

---

## 6. ПОРТЫ И UPSTREAM СЕРВИСЫ

### 6.1. Используемые порты:

| Порт | Протокол | Назначение | Сервис |
|------|----------|------------|--------|
| **80** | HTTP | Nginx (все сайты) | nginx |
| **443** | HTTPS | Nginx SSL (все сайты) | nginx |
| **30000** | HTTP | Chat hub backend | PM2/Node.js |
| **3100** | HTTP | **online.siteaccess.ru** | **online-siteaccess.service** |
| **8000** | HTTP | Essens store backend | PM2/Node.js |
| **8080** | HTTP | Tesseract API | PM2/Node.js |
| **8088** | HTTP | Admin backend | PM2/Node.js |
| **8443** | HTTPS | Insales webhook | PM2/Node.js |

### 6.2. PHP-FPM:

- Используется для Laravel приложений через `fastcgi_pass`
- Сервис: `php8.3-fpm.service`

---

## 7. ВАЖНЫЕ ЗАМЕЧАНИЯ ДЛЯ БЕЗОПАСНОСТИ

### 7.1. При изменении конфигурации online.siteaccess.ru:

1. **НЕ ТРОГАТЬ** другие конфигурации в `/etc/nginx/sites-enabled/`
2. **НЕ ИЗМЕНЯТЬ** сертификаты других доменов
3. **НЕ МЕНЯТЬ** порты других сервисов (30000, 8000, 8080, 8088, 8443)
4. **НЕ УДАЛЯТЬ** директории других сайтов
5. **ПРОВЕРЯТЬ** синтаксис перед применением: `sudo nginx -t`

### 7.2. Рекомендуемые изменения для online.siteaccess.ru:

```nginx
# Добавить ПЕРЕД location /:
location /socket.io/ {
  proxy_pass http://127.0.0.1:3100;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "Upgrade";  # ← ИСПРАВЛЕНО
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 3600;
  proxy_send_timeout 3600;
  proxy_buffering off;
}

# Исправить в location /:
location / {
  ...
  proxy_set_header Connection "Upgrade";  # ← ИСПРАВЛЕНО (было: upgrade)
}
```

### 7.3. Порядок применения изменений:

1. Редактировать `/etc/nginx/sites-available/online.siteaccess.ru`
2. Проверить: `sudo nginx -t`
3. Применить: `sudo systemctl reload nginx`
4. Проверить сервис: `sudo systemctl status online-siteaccess`
5. Проверить доступность: `curl https://online.siteaccess.ru/health`

---

## 8. СТРУКТУРА ПРОЕКТА online.siteaccess.ru

### 8.1. Директория проекта:

```
/var/www/online.siteaccess.ru/
├── apps/
│   ├── server/          # NestJS backend (порт 3100)
│   ├── widget/          # Widget frontend
│   ├── operator-web/    # Operator frontend
│   └── portal/          # Portal frontend
├── packages/
│   └── sdk/             # Shared SDK
├── prisma/
│   └── schema.prisma    # Database schema
└── scripts/
    └── deploy.sh        # Deployment script
```

### 8.2. Systemd сервис:

- **Имя:** `online-siteaccess.service`
- **Файл:** `/etc/systemd/system/online-siteaccess.service`
- **Команда запуска:** `/usr/bin/node /var/www/online.siteaccess.ru/apps/server/dist/main.js`
- **Рабочая директория:** `/var/www/online.siteaccess.ru/apps/server`
- **Порт:** 3100
- **Статус:** active (running)

---

## 9. КРИТИЧЕСКИЕ ЗАВИСИМОСТИ

### 9.1. Сервисы, которые НЕЛЬЗЯ останавливать:

- `nginx.service` - все сайты перестанут работать
- `php8.3-fpm.service` - все Laravel сайты перестанут работать
- `online-siteaccess.service` - только online.siteaccess.ru

### 9.2. Порты, которые НЕЛЬЗЯ менять:

- **3100** - online.siteaccess.ru (если изменить, нужно обновить nginx config)
- **30000** - neekloai.ru, file-to-text.siteaacess.ru
- **8000** - essens-store.ru
- **8080** - tesseract-api
- **8088** - admin.neeklo.ru
- **8443** - insales.siteaccess.ru

---

## 10. ЧЕКЛИСТ ПЕРЕД ИЗМЕНЕНИЯМИ

- [ ] Проверить, что изменения касаются ТОЛЬКО `online.siteaccess.ru`
- [ ] Убедиться, что не затрагиваются другие конфигурации nginx
- [ ] Проверить синтаксис: `sudo nginx -t`
- [ ] Сделать backup конфигурации: `sudo cp /etc/nginx/sites-available/online.siteaccess.ru /etc/nginx/sites-available/online.siteaccess.ru.backup`
- [ ] Применить изменения: `sudo systemctl reload nginx`
- [ ] Проверить статус сервиса: `sudo systemctl status online-siteaccess`
- [ ] Проверить доступность: `curl https://online.siteaccess.ru/health`
- [ ] Проверить WebSocket: `curl https://online.siteaccess.ru/socket.io/?EIO=4&transport=polling`

---

## 11. КОНТАКТЫ И ДОПОЛНИТЕЛЬНАЯ ИНФОРМАЦИЯ

- **Сервер:** 89.169.39.244
- **Операционная система:** Ubuntu (судя по nginx версии)
- **Nginx версия:** 1.24.0
- **PHP версия:** 8.3
- **Node.js:** используется для online.siteaccess.ru и других сервисов

---

**Дата создания отчета:** 2026-02-23  
**Последнее обновление:** 2026-02-23
