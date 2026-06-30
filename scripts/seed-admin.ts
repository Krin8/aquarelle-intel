import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/db';

async function main() {
  const email = 'navneetbavineni@gmail.com';
  const password = 'SuperAdminPassword123!';
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      status: 'approved',
      role: 'Super Administrator',
      fullName: 'Navneet Bavineni',
    },
    create: {
      email,
      passwordHash,
      status: 'approved',
      role: 'Super Administrator',
      fullName: 'Navneet Bavineni',
      department: 'IT / Administration',
      jobTitle: 'Super Administrator',
    }
  });

  console.log(`✅ Super Administrator seeded successfully.`);
  console.log(`Email: ${user.email}`);
  console.log(`Password: ${password}`);
  console.log(`Status: ${user.status}`);
  console.log(`Role: ${user.role}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
