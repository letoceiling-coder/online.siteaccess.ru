# STEP 05: Widget installation verification + settings

## Что добавлено

### A) Database (Prisma)

Добавлены поля в модель `Channel`:
- `widgetSettings Json?` - настройки виджета (позиция, цвет, приветствие)
- `installVerifiedAt DateTime?` - дата первой верификации установки
- `lastWidgetPingAt DateTime?` - дата последнего ping от виджета
- `lastWidgetPingUrl String?` - URL страницы последнего ping
- `lastWidgetPingUserAgent String?` - User-Agent последнего ping

Миграция: `add_widget_verification_fields`

### B) API: Widget Ping

**POST /api/widget/ping**

Body:
```json
{
  "token": "string",
  "externalId": "string (optional)",
  "pageUrl": "string"
}
```

Headers:
- `Origin: https://site.ru` (проверяется против allowedDomains)
- `User-Agent: ...` (сохраняется)

Response:
```json
{
  "ok": true
}
```

Логика:
- Валидация channel по token
- Проверка Origin против allowedDomains
- Установка `installVerifiedAt` при первом ping (если null)
- Обновление `lastWidgetPingAt/Url/UserAgent` при каждом ping

### C) Widget: автоматический ping

Виджет автоматически отправляет ping при инициализации:
- После чтения `window.SiteAccessChat.token`
- Использует `externalId` из localStorage (`sa_external_id`)
- Отправляет `pageUrl: window.location.href`
- Если ping падает - виджет продолжает работать (silent fail)

### D) Кабинет: статус установки

**GET /api/projects/:id**

Возвращает:
- `installVerifiedAt` - дата первой верификации
- `lastWidgetPingAt` - дата последнего ping
- `lastWidgetPingUrl` - URL последнего ping
- `lastWidgetPingUserAgent` - User-Agent
- `widgetSettings` - текущие настройки

**PUT /api/projects/:id/settings**

Body:
```json
{
  "widgetSettings": {
    "position": "right" | "left",
    "color": "#007bff",
    "greeting": "Hello! How can I help?"
  }
}
```

### E) Проверка установки

1. **Через виджет:**
   - Открыть demo страницу с виджетом
   - Виджет автоматически отправит ping
   - Проверить в кабинете что `installVerifiedAt` установлен

2. **Через curl:**
   ```bash
   curl -i https://online.siteaccess.ru/api/widget/ping \
     -H 'Content-Type: application/json' \
     -H 'Origin: https://online.siteaccess.ru' \
     -d '{"token":"TOKEN","pageUrl":"https://online.siteaccess.ru/demo/demo.html"}'
   ```

3. **Через логи сервера:**
   ```bash
   tail -n 80 /tmp/online-server.log | grep -E '(ping|Ping)'
   ```

## Как проверить

1. Создать проект через кабинет
2. Скопировать token
3. Открыть demo страницу с виджетом
4. Проверить в кабинете статус установки
5. Обновить настройки виджета
6. Проверить что настройки сохранились

## Файлы изменены

- `apps/server/prisma/schema.prisma` - добавлены поля в Channel
- `apps/server/src/widget/widget.controller.ts` - добавлен POST /ping
- `apps/server/src/widget/widget.service.ts` - логика ping
- `apps/server/src/widget/dto/widget-ping.dto.ts` - DTO для ping
- `apps/server/src/projects/projects.controller.ts` - GET /:id, PUT /:id/settings
- `apps/server/src/projects/projects.service.ts` - методы findOne, updateSettings
- `apps/widget/src/index.ts` - автоматический ping при инициализации
