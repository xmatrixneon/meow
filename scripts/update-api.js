const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("\n=== Updating API Credentials ===\n");

  const NEW_API_URL = "https://cattysms.shop";
  const NEW_API_KEY = "maya";

  // Find existing API credential
  const existingApi = await prisma.apiCredential.findFirst({
    include: {
      servers: true,
    },
  });

  if (existingApi) {
    console.log("Existing API found:", {
      id: existingApi.id,
      name: existingApi.name,
      apiUrl: existingApi.apiUrl,
      apiKey: existingApi.apiKey ? existingApi.apiKey.substring(0, 8) + "..." : "NOT SET",
      serversCount: existingApi.servers.length,
    });

    // Update the existing API credential
    const updated = await prisma.apiCredential.update({
      where: { id: existingApi.id },
      data: {
        apiUrl: NEW_API_URL,
        apiKey: NEW_API_KEY,
        isActive: true,
      },
    });

    console.log("\nAPI Credential updated successfully!");
    console.log({
      id: updated.id,
      apiUrl: updated.apiUrl,
      apiKey: updated.apiKey,
    });

    // Show associated servers
    if (existingApi.servers.length > 0) {
      console.log("\nAssociated servers:");
      existingApi.servers.forEach((server, i) => {
        console.log(`  [${i + 1}] ${server.name} (${server.countryCode}) - ${server.isActive ? 'ACTIVE' : 'INACTIVE'}`);
      });
    }
  } else {
    console.log("No existing API found. Creating new one...");

    // Create new API credential
    const created = await prisma.apiCredential.create({
      data: {
        name: "CattySMS",
        apiUrl: NEW_API_URL,
        apiKey: NEW_API_KEY,
        isActive: true,
      },
    });

    console.log("\nNew API Credential created!");
    console.log({
      id: created.id,
      name: created.name,
      apiUrl: created.apiUrl,
      apiKey: created.apiKey,
    });
  }

  console.log("\n=== Verifying Update ===\n");
  const verifyApi = await prisma.apiCredential.findFirst({
    where: { apiUrl: NEW_API_URL },
  });

  if (verifyApi) {
    console.log("✓ API credentials verified:");
    console.log(`  URL: ${verifyApi.apiUrl}`);
    console.log(`  Key: ${verifyApi.apiKey}`);
  } else {
    console.log("✗ Verification failed!");
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
