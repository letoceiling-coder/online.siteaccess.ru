# STEP 06: Production hardening + token hashing

## Что добавлено

### A) Production запуск через systemd

**Unit файл:** `/etc/systemd/system/online-siteaccess.service`

**Команды управления:**
```bash
# Установить и запустить
sudo systemctl daemon-reload
sudo systemctl enable --now online-siteaccess

# Проверить статус
sudo systemctl status online-siteaccess

# Просмотр логов
sudo journalctl -u online-siteaccess -n 50 --no-pager
sudo journalctl -u online-siteaccess -f  # follow mode

# Перезапуск
sudo systemctl restart online-siteaccess

# Остановка
sudo systemctl stop online-siteaccess
```

**Скрипты в package.json:**
- `pnpm build` - сборка проекта
- `pnpm start:prod` - запуск production версии (node dist/main.js)

### B) Расширенный Health Check

**GET /health**

Response:
```json
{
  "ok": true,
  "ts": "2026-02-20T15:00:00.000Z",
  "db": true,
  "redis": true
}
```

Проверяет:
- Подключение к PostgreSQL (SELECT 1)
- Подключение к Redis (PING)
- `ok: true` только если оба сервиса доступны

### C) Rate Limiting

**ThrottlerModule** настроен:
- Глобальный лимит: 100 запросов в минуту
- `/api/auth/register`: 5 запросов в минуту
- `/api/auth/login`: 10 запросов в минуту
- `/api/widget/session`: 20 запросов в минуту
- `/api/widget/ping`: 60 запросов в минуту

### D) Security

**Body size limit:**
- Максимальный размер тела запроса: 1MB
- Применяется глобально через express middleware

**Строгий CORS для /api/widget/*:**
- В production: обязательна проверка `allowedDomains`
- Если `allowedDomains` не заданы в production - ошибка
- В dev режиме: предупреждение, но разрешено

### E) Token Hashing

**Уже реализовано:**
- При создании канала: генерируется token, сохраняется только `tokenHash` (SHA-256)
- Token показывается только один раз при создании
- Поиск канала по token: сравнение hash
- Используется в:
  - `/api/widget/session`
  - `/api/widget/ping`
  - `/api/channels` (создание)

**Безопасность:**
- Token никогда не хранится в БД
- Невозможно восстановить token из hash
- При потере token нужно создать новый канал

## Проверка

1. **Build всех приложений:**
   ```bash
   cd /var/www/online.siteaccess.ru
   pnpm build
   ```

2. **Проверка systemd:**
   ```bash
   sudo systemctl status online-siteaccess
   sudo journalctl -u online-siteaccess -n 50 --no-pager
   ```

3. **Health check:**
   ```bash
   curl https://online.siteaccess.ru/health
   # Должен вернуть: {"ok":true,"ts":"...","db":true,"redis":true}
   ```

4. **Rate limiting:**
   ```bash
   # Быстро отправить 6 запросов на /api/auth/register
   for i in {1..6}; do curl -X POST https://online.siteaccess.ru/api/auth/register -H 'Content-Type: application/json' -d '{"email":"test'$i'@test.com","password":"test123456"}'; done
   # Последний должен вернуть 429 Too Many Requests
   ```

5. **Token hashing:**
   - Создать проект через кабинет
   - Получить token (показывается один раз)
   - Использовать token в виджете
   - Проверить что виджет работает и ping проходит

## Файлы изменены

- `apps/server/package.json` - добавлен `start:prod`, `@nestjs/throttler`
- `apps/server/src/main.ts` - body size limit, CORS
- `apps/server/src/app.module.ts` - ThrottlerModule
- `apps/server/src/health/health.controller.ts` - проверка db/redis
- `apps/server/src/health/health.module.ts` - импорты Prisma/Redis
- `apps/server/src/auth/auth.controller.ts` - rate limits
- `apps/server/src/widget/widget.controller.ts` - rate limits
- `apps/server/src/widget/widget.service.ts` - строгий CORS для production
- `apps/server/online-siteaccess.service` - systemd unit (новый файл)
- `docs/STEP_06.md` - документация (новый файл)

## Миграции

Token hashing уже реализован, миграции не требуются.
