# STEP 03: Portal auth + dashboard + install script

## Описание

User Portal - веб-приложение для пользователей с маркетингом, авторизацией, дашбордом и страницей установки виджета.

## Структура

- **Marketing** (`/`) - главная страница
- **Login** (`/app/login`) - вход
- **Register** (`/app/register`) - регистрация
- **Dashboard** (`/app`) - кабинет пользователя (protected)
- **Install Page** (`/app/project/:id/install`) - страница установки виджета (protected)

## Требования

- NestJS server с настроенной статической раздачей
- PostgreSQL и Redis запущены
- USER_JWT_SECRET в `apps/server/.env` (можно использовать JWT_SECRET на MVP)

## Установка и сборка

### 1. Установить зависимости

```bash
cd /var/www/online.siteaccess.ru
pnpm -C apps/portal install
pnpm -C apps/server install
```

### 2. Миграция базы данных

```bash
cd /var/www/online.siteaccess.ru/apps/server
pnpm prisma migrate deploy
```

### 3. Собрать portal

```bash
pnpm -C apps/portal build
```

### 4. Пересобрать server

```bash
cd /var/www/online.siteaccess.ru/apps/server
pnpm build
```

## Настройка

### USER_JWT_SECRET

Добавить в `apps/server/.env` (НЕ коммитить):

```bash
USER_JWT_SECRET=your-user-jwt-secret-here
```

Если не указан, будет использован `JWT_SECRET`.

## API Endpoints

### Auth

- `POST /api/auth/register` - регистрация
  ```json
  { "email": "user@example.com", "password": "password123" }
  ```

- `POST /api/auth/login` - вход
  ```json
  { "email": "user@example.com", "password": "password123" }
  ```
  Response: `{ accessToken, user: { id, email } }`

- `GET /api/me` - текущий пользователь (требует Bearer token)

### Projects

- `POST /api/projects` - создать проект (требует Bearer token)
  ```json
  { "name": "My Website", "domains": ["example.com", "www.example.com"] }
  ```
  Response: `{ id, name, token }` (token показан только один раз)

- `GET /api/projects` - список проектов пользователя (требует Bearer token)

- `PUT /api/projects/:id/domains` - обновить домены (требует Bearer token)
  ```json
  { "domains": ["example.com", "www.example.com"] }
  ```

- `GET /api/projects/:id/install` - данные для установки (требует Bearer token)
  Response: `{ scriptTag, configSnippet, docsMarkdownShort }`

## Проверка

### 1. Проверить доступность

```bash
curl -I https://online.siteaccess.ru/
curl -I https://online.siteaccess.ru/app/login
```

### 2. Тестовый сценарий

1. **Открыть маркетинг:**
   - Перейти на `https://online.siteaccess.ru/`
   - Должна открыться главная страница

2. **Регистрация:**
   - Перейти на `https://online.siteaccess.ru/app/register`
   - Создать аккаунт

3. **Создать проект:**
   - В дашборде создать проект
   - Сохранить token (показан только один раз)

4. **Установка:**
   - Перейти на страницу установки
   - Скопировать код для вставки

## Структура файлов

- `apps/portal/src/pages/Marketing.tsx` - главная страница
- `apps/portal/src/pages/Login.tsx` - вход
- `apps/portal/src/pages/Register.tsx` - регистрация
- `apps/portal/src/pages/Dashboard.tsx` - кабинет
- `apps/portal/src/pages/InstallPage.tsx` - установка
- `apps/server/src/auth/` - модуль авторизации
- `apps/server/src/projects/` - модуль проектов

## Примечания

- Token показывается только один раз при создании проекта
- Для MVP используется общий JWT_SECRET, но рекомендуется отдельный USER_JWT_SECRET
- Пароли хешируются через bcrypt
- Portal раздается как SPA с fallback на index.html
