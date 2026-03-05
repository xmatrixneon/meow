import prisma from "../lib/db";

async function main() {
  console.log("\n=== Checking API Configuration ===\n");

  const apiCredentials = await prisma.apiCredential.findMany({
    include: {
      _count: true,
      servers: {
        include: {
          _count: true,
          services: {
            take: 3,
          },
        },
      },
    },
  });

  if (apiCredentials.length === 0) {
    console.log("No API credentials found in database!");
  } else {
    console.log(`Found ${apiCredentials.length} API credential(s):\n`);
    apiCredentials.forEach((api, i: number) => {
      console.log(`[${i + 1}] ID: ${api.id}`);
      console.log(`    Name: ${api.name}`);
      console.log(`    Active: ${api.isActive}`);
      console.log(`    API URL: ${api.apiUrl}`);
      console.log(`    API Key: ${api.apiKey ? `${api.apiKey.substring(0, 8)}...` : 'NOT SET'}`);
      console.log(`    Servers: ${api.servers.length}`);
      if (api.servers.length > 0 && api.servers[0].services.length > 0) {
        console.log(`    Sample Service: ${api.servers[0].services[0].name} (code: ${api.servers[0].services[0].code})`);
      }
      console.log();
    });
  }

  console.log("\n=== Checking Active Numbers ===\n");
  const activeNumbers = await prisma.activeNumber.findMany({
    where: {
      status: 'PENDING',
    },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });

  if (activeNumbers.length === 0) {
    console.log("No pending numbers found.");
  } else {
    console.log(`Found ${activeNumbers.length} pending number(s):\n`);
    activeNumbers.forEach((num, i: number) => {
      console.log(`[${i + 1}] ID: ${num.id}`);
      console.log(`    Order ID: ${num.orderId}`);
      console.log(`    Phone: ${num.phoneNumber}`);
      console.log(`    Created: ${num.createdAt}`);
      console.log();
    });
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
