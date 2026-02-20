# STEP 00: Создание структуры монорепо

## Что сделано

### 1. Структура директорий

```
online.siteaccess.ru/
├── apps/
│   ├── server/          # NestJS backend
│   ├── widget/          # Vanilla JS widget (Vite)
│   └── operator-web/     # React + Vite operator app
├── packages/
│   └── sdk/             # Shared SDK
├── infra/
│   └── nginx/           # Nginx конфигурации
└── docs/                # Документация
```

### 2. pnpm Workspace

- `package.json` в корне с workspace конфигурацией
- `pnpm-workspace.yaml` с определением пакетов
- `.npmrc` с настройками hoisting

### 3. Базовые package.json

Созданы для каждого приложения/пакета:
- `apps/server/package.json` - NestJS скрипты
- `apps/widget/package.json` - Vite скрипты
- `apps/operator-web/package.json` - React + Vite скрипты
- `packages/sdk/package.json` - Shared SDK

### 4. Скрипты в корневом package.json

- `pnpm dev` - запуск всех приложений параллельно
- `pnpm dev:server` - только backend
- `pnpm dev:widget` - только widget
- `pnpm dev:operator` - только operator
- `pnpm build` - сборка всех приложений
- `pnpm lint` - линтинг всех приложений
- `pnpm test` - тесты всех приложений
- `pnpm typecheck` - проверка типов
- `pnpm clean` - очистка

### 5. Документация

- `docs/ARCHITECTURE.md` - архитектура системы
- `docs/STEP_00.md` - этот файл

## Как проверить

### 1. Проверить структуру

```bash
ssh root@89.169.39.244
cd /var/www/online.siteaccess.ru
find . -type f -name 'package.json' | sort
```

**Ожидаемый результат**:
```
./apps/operator-web/package.json
./apps/server/package.json
./apps/widget/package.json
./package.json
./packages/sdk/package.json
```

### 2. Проверить pnpm workspace

```bash
cd /var/www/online.siteaccess.ru
cat pnpm-workspace.yaml
```

**Ожидаемый результат**:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 3. Проверить корневой package.json

```bash
cd /var/www/online.siteaccess.ru
cat package.json | grep -A 5 '"scripts"'
```

**Ожидаемый результат**: Должны быть скрипты `dev`, `build`, `lint`, `test`, `typecheck`, `clean`

### 4. Проверить package.json приложений

```bash
cd /var/www/online.siteaccess.ru
cat apps/server/package.json | head -10
cat apps/widget/package.json | head -10
cat apps/operator-web/package.json | head -10
cat packages/sdk/package.json | head -10
```

**Ожидаемый результат**: Все файлы должны быть валидным JSON с полями `name`, `version`, `scripts`

### 5. Проверить документацию

```bash
cd /var/www/online.siteaccess.ru
ls -la docs/
cat docs/ARCHITECTURE.md | head -20
```

**Ожидаемый результат**: 
- `ARCHITECTURE.md` существует
- `STEP_00.md` существует
- Оба файла содержат текст

### 6. Проверить Git статус

```bash
cd /var/www/online.siteaccess.ru
git status
git log --oneline
```

**Ожидаемый результат**: 
- Все новые файлы должны быть видны в `git status`
- Можно сделать коммит

## Следующие шаги (STEP 01)

1. Установить зависимости (pnpm install)
2. Настроить TypeScript конфигурации
3. Создать базовые файлы для каждого приложения
4. Настроить линтеры (ESLint)
5. Создать .env.example файлы

## Примечания

- Бизнес-логика еще не реализована
- Только каркас репозитория
- Все секреты будут в .env (не в git)
