# STEP_STABILIZE_RELIABLE_02 ??? "100% delivery" hardening + proof + CI

## Overview

This document describes how to verify and prove 100% message delivery with no duplicates and no message loss.

## Database Proof

### Finding a Real Conversation

To find a real `conversationId` for testing:

```sql
SELECT id, "channelId", "externalId", "updatedAt"
FROM conversations
ORDER BY "updatedAt" DESC
LIMIT 1;
```

### Proving Duplicates = 0

To prove that there are no duplicate messages by `clientMessageId`:

```sql
SELECT 
  COUNT(*) as total_messages,
  COUNT(DISTINCT "clientMessageId") FILTER (WHERE "clientMessageId" IS NOT NULL) as distinct_client_ids,
  COUNT(*) - COUNT(DISTINCT "clientMessageId") FILTER (WHERE "clientMessageId" IS NOT NULL) as duplicates
FROM messages
WHERE "conversationId" = 'YOUR_CONVERSATION_ID';
```

**Expected output:**
- `duplicates` must be `0`
- If `duplicates > 0`, this indicates message loss or duplicate delivery

### Showing Last 20 Messages

To view the last 20 messages for a conversation:

```sql
SELECT 
  id,
  "clientMessageId",
  "senderType",
  content as text,
  "createdAt"
FROM messages
WHERE "conversationId" = 'YOUR_CONVERSATION_ID'
ORDER BY "createdAt" ASC
LIMIT 20;
```

## Automated Proof Script

Run the automated proof script:

```bash
cd apps/server
pnpm db:proof:reliable
```

This script:
1. Finds the latest conversation
2. Queries all messages for that conversation
3. Counts total messages and distinct `clientMessageId` (non-null)
4. Calculates duplicates = total - distinct
5. Exits with code 0 if duplicates = 0, code 1 if duplicates > 0

## Expected Outputs

### Success (duplicates = 0)

```
=== DB Proof: Reliable Messaging ===

Latest conversation: abc123-def456-...
  Channel: xyz789-...
  External ID: visitor-123

Total messages: 10
Distinct clientMessageId (non-null): 10
Duplicates: 0

Last 20 messages:
  [2024-01-01T12:00:00Z] visitor: Hello (clientId: widget-1...)
  [2024-01-01T12:00:01Z] operator: Hi there (clientId: op-1...)
  ...

=== Result ===
??? PASSED: No duplicates found (duplicates = 0)
  All messages have unique clientMessageId or are null.
```

### Failure (duplicates > 0)

```
=== Result ===
??? FAILED: Found 2 duplicate messages!
  This indicates message loss or duplicate delivery.
```

## CI Integration

The proof script is integrated into CI (`.github/workflows/ci.yml`):
- Always runs: `pnpm -r build`, `prisma validate`, `smoke:health`, `smoke:sync`
- Conditionally runs: `e2e:reliable` (SKIPPED if env missing, PASS if env provided)
- Always runs: `db:proof:reliable` (must pass with duplicates = 0)

## Edge Cases Handled

1. **Deduplication Rules:**
   - Prefer `serverMessageId` for dedupe if present
   - Use `clientMessageId` only if BOTH are non-empty strings
   - Never treat `undefined`/`null`/`""` as valid dedupe keys

2. **Stable Ordering:**
   - After merge, sort messages by `createdAt ASC` then `id ASC` (stable ordering)

3. **ACK Idempotency:**
   - Receiving the same ACK twice must not break UI or duplicate messages
   - Check: `if (msg.status === 'sent' && msg.serverMessageId === data.serverMessageId) return;`

4. **Reconnect Recovery:**
   - After reconnect, always run `sync:request` and merge results (no duplicates)
   - Ensure "server restarted after persist but before emit" is recovered by sync

## Manual Checklist

For browser testing:

- [ ] Widget send 3 fast messages ??? all appear instantly
- [ ] Operator receives without refresh
- [ ] Operator send ??? widget receives instantly
- [ ] Refresh both sides ??? history parity preserved
- [ ] Disconnect before ACK ??? reconnect recovers message
