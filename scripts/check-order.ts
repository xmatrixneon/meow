import { config } from 'dotenv';
config({ path: '.env' });
import { PrismaClient } from '../app/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function checkOrder(orderId: string) {
  const order = await prisma.activeNumber.findFirst({
    where: { orderId },
    include: { service: { include: { server: { include: { api: true } } } } },
  });

  console.log('=== ORDER DETAILS ===');
  if (order) {
    console.log('Order ID:', order.orderId);
    console.log('Phone Number:', order.phoneNumber);
    console.log('Status:', order.status);
    console.log('Active Status:', order.activeStatus);
    console.log('User ID:', order.userId);

    // Get the user's telegramId (API key)
    const user = await prisma.user.findUnique({
      where: { id: order.userId },
      select: { telegramId: true, telegramUsername: true, isAdmin: true },
    });
    console.log('Telegram ID (API Key for this order):', user?.telegramId);
    console.log('Username:', user?.telegramUsername);
    console.log('Is Admin:', user?.isAdmin);

    console.log('Service:', order.service?.name);
    console.log('Server:', order.service?.server?.name);
    console.log('SMS Content:', JSON.stringify(order.smsContent, null, 2));
    console.log('Created At:', order.createdAt);
    console.log('Expires At:', order.expiresAt);
    console.log('Number ID (external):', order.numberId);

    // List all users with their telegramId for API testing
    console.log('\n=== USERS FOR API TESTING ===');
    const users = await prisma.user.findMany({
      select: {
        id: true,
        telegramId: true,
        telegramUsername: true,
        isAdmin: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    users.forEach(u => {
      console.log(`  ${u.telegramId} (${u.telegramUsername || 'no username'})${u.isAdmin ? ' [ADMIN]' : ''}`);
    });
  } else {
    console.log('NOT FOUND');
  }
}

const orderId = process.argv[2] || 'cgY8466NfEPlyIdy';
checkOrder(orderId).then(() => {
  prisma.$disconnect();
  pool.end();
}).catch(err => {
  console.error('Error:', err);
  prisma.$disconnect();
  pool.end();
  process.exit(1);
});
