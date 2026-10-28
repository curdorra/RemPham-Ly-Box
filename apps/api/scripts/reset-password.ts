/** Usage: npm run reset-password -w @ott/api -- someone@example.com  (asks for the new password, hidden) */
import "dotenv/config";
import { createInterface } from "node:readline";
import { signupSchema } from "@ott/shared";
import { prisma } from "../src/lib/db.js";
import { hashPassword } from "../src/lib/auth.js";

const email = process.argv[2]?.toLowerCase();
if (!email) {
  console.error("Usage: npm run reset-password -- <email>");
  process.exit(1);
}

// One buffered reader for both prompts; typed characters aren't echoed.
const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
(rl as any)._writeToOutput = () => {};
const lines = rl[Symbol.asyncIterator]();
const askHidden = async (question: string) => {
  process.stdout.write(question);
  const { value } = await lines.next();
  process.stdout.write("\n");
  return (value ?? "") as string;
};

const password = await askHidden("New password: ");
const repeat = await askHidden("Repeat it: ");
rl.close();
if (repeat !== password) {
  console.error("Passwords don't match.");
  process.exit(1);
}
const check = signupSchema.shape.password.safeParse(password);
if (!check.success) {
  console.error(check.error.issues[0]?.message);
  process.exit(1);
}

const res = await prisma.user.updateMany({ where: { email }, data: { passwordHash: await hashPassword(password) } });
console.log(res.count ? `Password changed for ${email}.` : `No user with email ${email}.`);
await prisma.$disconnect();
