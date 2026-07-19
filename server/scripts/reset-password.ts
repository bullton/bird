import 'dotenv/config';
import { db, schema } from '../src/db/client.js';
import { eq } from 'drizzle-orm';
import { hashPassword } from '../src/utils/password.js';

async function main() {
  const [, , username, newPassword] = process.argv;

  if (!username || !newPassword) {
    console.error('Usage: npm run reset-password -- <username> <new_password>');
    console.error('Example: npm run reset-password -- admin newSecret123');
    process.exit(1);
  }

  if (newPassword.length < 6) {
    console.error('Password must be at least 6 characters.');
    process.exit(1);
  }

  const user = db.select().from(schema.users).where(eq(schema.users.username, username)).get();

  if (!user) {
    console.error(`User "${username}" not found.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(newPassword);
  db.update(schema.users)
    .set({ passwordHash, mustChangePassword: 0 })
    .where(eq(schema.users.id, user.id))
    .run();

  console.log(`✓ Password for "${username}" has been reset.`);
  console.log(`  Role: ${user.role}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});