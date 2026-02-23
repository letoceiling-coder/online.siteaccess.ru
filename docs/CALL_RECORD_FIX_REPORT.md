# ФИНАЛЬНЫЙ ОТЧЕТ: FIX "Failed to create call record"

## Дата: 2026-02-24
## Проблема: CallRecord не создается из-за ошибки Prisma P2021 (таблица не существует)

---

## A) Root Cause

**Prisma Error Code:** `P2021` - Table does not exist

**Root Cause:**
1. В миграции `20260222114100_add_call_record_model` создается таблица `calls`
2. В схеме Prisma использовалось `@@map("call_records")` вместо `@@map("calls")`
3. Prisma client пытался обратиться к несуществующей таблице `call_records`

**Дополнительные проблемы:**
- Channel mismatch: conversation.channelId не совпадал с переданным channelId (исправлено - используется conversation.channelId как source of truth)

---

## B) What Changed

### B.1. Prisma Schema (schema.prisma)

**Изменения:**
1. Добавлена модель `CallRecord` с правильными полями
2. Исправлен `@@map("calls")` для соответствия миграции
3. Добавлены обратные связи в `Channel` и `Conversation`

### B.2. CallsService (calls.service.ts)

**Изменения:**
1. Добавлено детальное логирование входных данных: `[CALL_CREATE_INPUT]`
2. Добавлена проверка существования conversation перед созданием
3. Исправлен channel mismatch - используется `conversation.channelId` как source of truth
4. Добавлена проверка существования callId (возврат существующей записи вместо ошибки)
5. Добавлено детальное логирование ошибок Prisma: `[CALL_CREATE_ERROR]` с code, message, meta

### B.3. CallsGateway (calls.gateway.ts)

**Изменения:**
1. Улучшено логирование ошибок создания CallRecord с полным кодом Prisma

**Commits:**
- `3f27776` - DIAG: add detailed Prisma error logging in createCallRecord
- `625ead5` - [DB_CHANGE] add CallRecord model to Prisma schema + fix createCallRecord
- `b50cbc5` - FIX: add callRecords relation to Channel model
- `e73ffba` - FIX: use conversation.channelId as source of truth in createCallRecord
- `f35e13a` - FIX: map CallRecord to 'calls' table (match migration) + improve error logging
- (последний commit для исправления @@map)

---

## C) Proof Logs

### C.1. Prisma Error Code

**Результат:**
```
[CALL_CREATE_ERROR] Failed to create call record: code=P2021, message=...
```

**Вывод:** Таблица не существует (P2021)

### C.2. После исправления @@map

**Ожидается:**
```
[CALL_CREATE_SUCCESS] callId=..., recordId=...
[CALL_TRACE] Call offer forwarded: callId=..., conversationId=...
```

**Статус:** ⚠️ Требуется повторный запуск теста после исправления @@map

---

## D) Current Status

**Статус:** ✅ Root cause найден (P2021), исправление применено

**Результаты:**
- ✅ Prisma error code определен: P2021
- ✅ Root cause: несоответствие @@map в схеме и имени таблицы в миграции
- ✅ Исправлено: `@@map("calls")` соответствует миграции
- ⚠️ Требуется повторный запуск e2e:calls:signaling для подтверждения

**Следующие шаги:**
1. Повторно запустить e2e:calls:signaling после исправления @@map
2. Убедиться, что CallRecord создается успешно
3. Проверить, что call:offer доставляется виджету

---

**Дата:** 2026-02-24  
**Статус:** ✅ Root cause найден и исправлен, требуется подтверждение
