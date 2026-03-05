import { config } from "dotenv";
config({ path: ".env" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding services...");

  // First, check if we have a server to attach services to
  let server = await prisma.otpServer.findFirst({
    where: { name: "India Server - CattySMS" }
  });

  if (!server) {
    console.log("Creating India server...");
    // We need to create a server first
    // Check if we have an API credential
    let apiCredential = await prisma.apiCredential.findFirst({
      where: { name: "5SIM" }
    });

    if (!apiCredential) {
      console.log("Creating 5SIM API credential...");
      apiCredential = await prisma.apiCredential.create({
        data: {
          name: "5SIM",
          apiUrl: "https://5sim.net",
          apiKey: "dummy-key-needs-to-be-configured",
          isActive: true
        }
      });
    }

    server = await prisma.otpServer.create({
      data: {
        name: "India Server - CattySMS",
        countryCode: "22",
        countryIso: "IN",
        countryName: "India",
        apiId: apiCredential.id,
        isActive: true
      }
    });
  }

  console.log(`Using server: ${server.name} (${server.id})`);

  // Define services to seed
  const services = [
    { code: "airtel", name: "Airtel", basePrice: 5 },
    { code: "bigbasket", name: "BigBasket", basePrice: 5 },
    { code: "myntra", name: "MyNtra", basePrice: 8 },
    { code: "jiomart", name: "JioMart", basePrice: 6 },
    { code: "swiggy", name: "Swiggy", basePrice: 10 },
    { code: "delhivery", name: "Delhivery", basePrice: 7 },
    { code: "amazon", name: "Amazon", basePrice: 12 },
    { code: "flipkart", name: "Flipkart", basePrice: 10 },
    { code: "zomato", name: "Zomato", basePrice: 8 },
    { code: "paytm", name: "Paytm", basePrice: 6 },
    { code: "phonepe", name: "PhonePe", basePrice: 6 },
    { code: "google", name: "Google", basePrice: 15 },
    { code: "facebook", name: "Facebook", basePrice: 12 },
    { code: "instagram", name: "Instagram", basePrice: 10 },
    { code: "whatsapp", name: "WhatsApp", basePrice: 8 },
    { code: "telegram", name: "Telegram", basePrice: 8 },
    { code: "twitter", name: "Twitter", basePrice: 10 },
    { code: "gmail", name: "Gmail", basePrice: 12 },
    { code: "outlook", name: "Outlook", basePrice: 10 },
    { code: "yahoo", name: "Yahoo", basePrice: 8 },
  ];

  let createdCount = 0;
  let updatedCount = 0;

  for (const serviceData of services) {
    try {
      const existing = await prisma.service.findFirst({
        where: {
          code: serviceData.code,
          serverId: server.id
        }
      });

      if (existing) {
        // Update existing service
        await prisma.service.update({
          where: { id: existing.id },
          data: {
            name: serviceData.name,
            basePrice: serviceData.basePrice,
            isActive: true
          }
        });
        updatedCount++;
        console.log(`Updated: ${serviceData.name} (${serviceData.code}) - ₹${serviceData.basePrice}`);
      } else {
        // Create new service
        await prisma.service.create({
          data: {
            code: serviceData.code,
            name: serviceData.name,
            serverId: server.id,
            basePrice: serviceData.basePrice,
            isActive: true
          }
        });
        createdCount++;
        console.log(`Created: ${serviceData.name} (${serviceData.code}) - ₹${serviceData.basePrice}`);
      }
    } catch (error) {
      // Safely handle unknown error type
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error processing ${serviceData.name}:`, errorMessage);
    }
  }

  console.log(`\nSeed completed: ${createdCount} created, ${updatedCount} updated`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
