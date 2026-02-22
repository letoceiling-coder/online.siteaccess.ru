#!/usr/bin/env node

/**
 * DB proof script: Verify CallRecord creation and status transitions
 * 
 * Checks:
 * - CallRecord is created with correct fields
 * - Status transitions are valid (ringing -> in_call -> ended)
 * - startedAt and endedAt are set correctly
 * 
 * Env vars:
 * - DATABASE_URL: PostgreSQL connection string (required)
 */

import { PrismaClient } from '@prisma/client';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: DATABASE_URL,
    },
  },
});

async function main() {
  console.log('=== DB Proof: Call Records ===\n');

  try {
    // Get last 10 call records
    const calls = await prisma.callRecord.findMany({
      take: 10,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        channel: {
          select: {
            id: true,
            name: true,
          },
        },
        conversation: {
          select: {
            id: true,
            visitorExternalId: true,
          },
        },
      },
    });

    console.log(`Found ${calls.length} call records (last 10)\n`);

    if (calls.length === 0) {
      console.log('⚠️  No call records found. This is OK if no calls have been made yet.');
      process.exit(0);
    }

    // Validate each call record
    let validCount = 0;
    let invalidCount = 0;

    for (const call of calls) {
      const issues: string[] = [];

      // Check required fields
      if (!call.id) issues.push('missing id');
      if (!call.channelId) issues.push('missing channelId');
      if (!call.conversationId) issues.push('missing conversationId');
      if (!call.kind) issues.push('missing kind');
      if (!call.status) issues.push('missing status');
      if (!call.createdByRole) issues.push('missing createdByRole');
      if (!call.createdAt) issues.push('missing createdAt');

      // Validate kind
      if (call.kind !== 'audio' && call.kind !== 'video') {
        issues.push(`invalid kind: ${call.kind}`);
      }

      // Validate status
      const validStatuses = ['ringing', 'connecting', 'in_call', 'ended', 'failed', 'busy'];
      if (!validStatuses.includes(call.status)) {
        issues.push(`invalid status: ${call.status}`);
      }

      // Validate status transitions
      if (call.status === 'in_call' && !call.startedAt) {
        issues.push('status is in_call but startedAt is not set');
      }

      if ((call.status === 'ended' || call.status === 'failed' || call.status === 'busy') && !call.endedAt) {
        issues.push(`status is ${call.status} but endedAt is not set`);
      }

      // Validate timestamps
      if (call.startedAt && call.endedAt && call.startedAt > call.endedAt) {
        issues.push('startedAt is after endedAt');
      }

      if (call.createdAt && call.startedAt && call.createdAt > call.startedAt) {
        issues.push('createdAt is after startedAt');
      }

      if (issues.length === 0) {
        validCount++;
        console.log(`✅ Call ${call.id.substring(0, 8)}...`);
        console.log(`   Status: ${call.status}, Kind: ${call.kind}`);
        console.log(`   Created: ${call.createdAt.toISOString()}`);
        if (call.startedAt) console.log(`   Started: ${call.startedAt.toISOString()}`);
        if (call.endedAt) console.log(`   Ended: ${call.endedAt.toISOString()}`);
        if (call.endedReason) console.log(`   Reason: ${call.endedReason}`);
        console.log('');
      } else {
        invalidCount++;
        console.log(`❌ Call ${call.id.substring(0, 8)}... has issues:`);
        issues.forEach(issue => console.log(`   - ${issue}`));
        console.log('');
      }
    }

    console.log('=== Summary ===');
    console.log(`Valid: ${validCount}`);
    console.log(`Invalid: ${invalidCount}`);

    if (invalidCount > 0) {
      console.log('\n❌❌❌ DB PROOF FAILED ❌❌❌');
      process.exit(1);
    } else {
      console.log('\n✅✅✅ DB PROOF PASSED ✅✅✅');
      process.exit(0);
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
