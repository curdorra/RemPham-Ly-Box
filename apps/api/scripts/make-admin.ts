/** Usage: npm run make-admin -w @ott/api -- someone@example.com */
import "dotenv/config";
import { prisma } from "../src/lib/db.js";

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error("Usage: npm run make-admin -- <email>");
  process.exit(1);
}
const res = await prisma.user.updateMany({ where: { email }, data: { role: "ADMIN" } });
console.log(res.count ? `${email} is now an admin.` : `No user with email ${email}. Sign up first.`);
await prisma.$disconnect();
