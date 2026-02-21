import { PrismaClient } from '@prisma/client';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const prisma = new PrismaClient();

console.log('=== Prisma Client Debug ===');
console.log('process.cwd():', process.cwd());
try {
  const prismaPath = require.resolve('@prisma/client');
  console.log('require.resolve("@prisma/client"):', prismaPath);
} catch (e) {
  console.log('require.resolve("@prisma/client"): ERROR -', e.message);
}
console.log('');
console.log('Object.keys(prisma):');
const keys = Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$'));
console.log(keys.slice(0, 20).join(', '), '... (showing first 20)');
console.log('');
console.log('typeof prisma.channelMember:', typeof prisma.channelMember);
console.log('prisma.channelMember exists:', 'channelMember' in prisma);
if (prisma.channelMember) {
  console.log('✅ prisma.channelMember EXISTS');
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(prisma.channelMember)).filter(m => !m.startsWith('_'));
  console.log('prisma.channelMember methods:', methods.slice(0, 10).join(', '));
} else {
  console.log('❌ prisma.channelMember is UNDEFINED');
}
console.log('');
console.log('Checking other models for comparison:');
console.log('typeof prisma.user:', typeof prisma.user);
console.log('typeof prisma.channel:', typeof prisma.channel);
console.log('typeof prisma.visitor:', typeof prisma.visitor);
console.log('typeof prisma.conversation:', typeof prisma.conversation);

await prisma.$disconnect();
