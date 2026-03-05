import { config } from "dotenv";
config({ path: ".env" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding CattySMS API provider...");

  // Check if CattySMS API provider already exists
  let cattySmsApi = await prisma.apiCredential.findFirst({
    where: { name: "CattySMS" }
  });

  if (!cattySmsApi) {
    console.log("Creating CattySMS API provider...");
    cattySmsApi = await prisma.apiCredential.create({
      data: {
        name: "CattySMS",
        apiUrl: "https://cattysms.shop",
        apiKey: "maya", // This should be configured in .env
        isActive: true
      }
    });
    console.log(`Created CattySMS API provider with ID: ${cattySmsApi.id}`);
  } else {
    console.log(`CattySMS API provider already exists with ID: ${cattySmsApi.id}`);
    
    // Update with current values
    await prisma.apiCredential.update({
      where: { id: cattySmsApi.id },
      data: {
        apiUrl: "https://cattysms.shop",
        isActive: true
      }
    });
    console.log("Updated CattySMS API provider");
  }

  // Check if we have an India server using CattySMS
  let indiaServer = await prisma.otpServer.findFirst({
    where: { 
      name: "India Server - CattySMS",
      apiId: cattySmsApi.id
    }
  });

  if (!indiaServer) {
    console.log("Creating India server for CattySMS...");
    indiaServer = await prisma.otpServer.create({
      data: {
        name: "India Server - CattySMS",
        countryCode: "22",
        countryIso: "IN",
        countryName: "India",
        apiId: cattySmsApi.id,
        isActive: true
      }
    });
    console.log(`Created India server with ID: ${indiaServer.id}`);
  } else {
    console.log(`India server already exists with ID: ${indiaServer.id}`);
  }

  console.log("\nSeed completed successfully!");
  console.log(`- API Provider: ${cattySmsApi.name} (${cattySmsApi.apiUrl})`);
  console.log(`- Server: ${indiaServer.name} (${indiaServer.countryCode})`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error("Error during seeding:", e instanceof Error ? e.message : String(e));
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
