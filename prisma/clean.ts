import { config } from "dotenv";
config({ path: ".env" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function cleanup() {
  console.log("🔍 Checking for duplicate servers...");
  
  // Find all servers with the name "India Server - CattySMS"
  const servers = await prisma.otpServer.findMany({
    where: { 
      name: "India Server - CattySMS" 
    },
    orderBy: { createdAt: 'asc' },
    include: {
      services: true // Include services to check what needs to be moved
    }
  });
  
  console.log(`📊 Found ${servers.length} servers with name "India Server - CattySMS"`);
  
  if (servers.length <= 1) {
    console.log("✅ No duplicates found! Database is clean.");
    return;
  }
  
  // Keep the first one (oldest), delete others
  const [keep, ...duplicates] = servers;
  console.log(`\n✅ Keeping server:`);
  console.log(`   - ID: ${keep.id}`);
  console.log(`   - Created: ${keep.createdAt}`);
  console.log(`   - Services: ${keep.services.length}`);
  
  console.log(`\n🗑️  Duplicates to clean up:`);
  for (const dup of duplicates) {
    console.log(`   - ID: ${dup.id}`);
    console.log(`     Created: ${dup.createdAt}`);
    console.log(`     Services: ${dup.services.length}`);
    
    // Move services from duplicate to the kept server
    if (dup.services.length > 0) {
      console.log(`     Moving ${dup.services.length} services to kept server...`);
      
      for (const service of dup.services) {
        await prisma.service.update({
          where: { id: service.id },
          data: { serverId: keep.id }
        });
      }
    }
    
    // Delete the duplicate server
    await prisma.otpServer.delete({
      where: { id: dup.id }
    });
    
    console.log(`     ✅ Deleted duplicate server`);
  }
  
  // Verify the kept server now has all services
  const updatedServer = await prisma.otpServer.findUnique({
    where: { id: keep.id },
    include: { services: true }
  });
  
  console.log(`\n📈 Final server status:`);
  console.log(`   - ID: ${keep.id}`);
  console.log(`   - Total services: ${updatedServer?.services.length || 0}`);
  console.log(`\n✅ Cleanup complete!`);
}

cleanup()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error("❌ Error during cleanup:", e instanceof Error ? e.message : String(e));
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
