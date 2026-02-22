import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const delegates = Object.keys(prisma)
    .filter(k => !k.startsWith('$') && !k.startsWith('_'))
    .sort();
  
  console.log('Prisma delegates:', delegates);
  
  if (typeof prisma.channelMember !== 'undefined') {
    console.log('✅ prisma.channelMember exists');
    console.log('Type:', typeof prisma.channelMember);
  } else {
    console.log('❌ prisma.channelMember does NOT exist');
    process.exit(1);
  }
  
  if (typeof prisma.callRecord !== 'undefined') {
    console.log('✅ prisma.callRecord exists');
  } else {
    console.log('⚠️  prisma.callRecord does NOT exist (may need migration)');
  }
} finally {
  await prisma.$disconnect();
}
