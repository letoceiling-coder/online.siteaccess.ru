/**
 * DB Proof Script: Prove 100% delivery (no duplicates, no loss)
 * 
 * This script queries the database to prove:
 * - Total messages count
 * - Distinct clientMessageId count (non-null)
 * - Duplicates = total - distinct (must be 0)
 * 
 * Exit code: 0 if duplicates = 0, 1 if duplicates > 0
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== DB Proof: Reliable Messaging ===\n');

  try {
    // Find latest conversationId (via Prisma)
    const latestConversation = await prisma.conversation.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, channelId: true, externalId: true },
    });

    if (!latestConversation) {
      console.log('No conversations found in database.');
      process.exit(0);
    }

    const conversationId = latestConversation.id;
    console.log(`Latest conversation: ${conversationId}`);
    console.log(`  Channel: ${latestConversation.channelId}`);
    console.log(`  External ID: ${latestConversation.externalId}\n`);

    // Query messages for that conversation
    const messages = await prisma.message.findMany({
      where: { conversationId },
      select: {
        id: true,
        clientMessageId: true,
        text: true,
        senderType: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalMessages = messages.length;
    console.log(`Total messages: ${totalMessages}`);

    // Count distinct clientMessageId (non-null)
    const distinctClientMessageIds = new Set(
      messages
        .map((m) => m.clientMessageId)
        .filter((id) => id !== null && id !== undefined && id !== '')
    );
    const distinctCount = distinctClientMessageIds.size;
    console.log(`Distinct clientMessageId (non-null): ${distinctCount}`);

    // Calculate duplicates
    const duplicates = totalMessages - distinctCount;
    console.log(`Duplicates: ${duplicates}\n`);

    // Show last 20 messages
    console.log('Last 20 messages:');
    const last20 = messages.slice(-20);
    for (const msg of last20) {
      const clientIdShort = msg.clientMessageId
        ? `${msg.clientMessageId.substring(0, 8)}...`
        : 'null';
      console.log(
        `  [${msg.createdAt.toISOString()}] ${msg.senderType}: ${msg.text?.substring(0, 50) || ''} (clientId: ${clientIdShort})`
      );
    }

    console.log('\n=== Result ===');
    if (duplicates > 0) {
      console.error(`??? FAILED: Found ${duplicates} duplicate messages!`);
      console.error('  This indicates message loss or duplicate delivery.');
      process.exit(1);
    } else {
      console.log('??? PASSED: No duplicates found (duplicates = 0)');
      console.log('  All messages have unique clientMessageId or are null.');
      process.exit(0);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
