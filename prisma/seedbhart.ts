import { config } from "dotenv";
config({ path: ".env" });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding BharatPe configuration...");

  const settings = await prisma.settings.upsert({
    where: { id: "1" },
    update: {
      upiId: "BHARATPE.8V0Y0C8A7B91024@fbpe",
      bharatpeQrImage: "https://i.ibb.co/d4KQzjbj/IMG-20260224-185009.jpg",
      bharatpeMerchantId: "57113736",
      bharatpeToken: "edaa0bb278e54a23899c1cfeb6e937ef",
      minRechargeAmount: 10,
    },
    create: {
      id: "1",
      upiId: "BHARATPE.8V0Y0C8A7B91024@fbpe",
      bharatpeQrImage: "https://i.ibb.co/d4KQzjbj/IMG-20260224-185009.jpg",
      bharatpeMerchantId: "57113736",
      bharatpeToken: "edaa0bb278e54a23899c1cfeb6e937ef",
      minRechargeAmount: 10,
    },
  });

  console.log("BharatPe configuration seeded:", {
    upiId: settings.upiId,
    bharatpeQrImage: settings.bharatpeQrImage,
    bharatpeMerchantId: settings.bharatpeMerchantId,
    minRechargeAmount: settings.minRechargeAmount,
  });
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
