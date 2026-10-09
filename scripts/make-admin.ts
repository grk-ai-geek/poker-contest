// Usage: npm run make-admin -- someone@example.com
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: npm run make-admin -- <email>");
    process.exit(1);
  }
  const { db } = await import("../src/lib/db");
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}. Sign up first, then run this again.`);
    process.exit(1);
  }
  await db.user.update({ where: { email }, data: { role: "ADMIN" } });
  console.log(`${user.displayName} (${email}) is now an admin. Log out and back in to refresh your session.`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
