import * as dotenv from 'dotenv';
import { hash } from 'bcryptjs';

// Load env vars before importing db
dotenv.config({ path: '.env.local' });

async function seedAdmin() {
  try {
    const { db } = await import('../lib/db');
    const { users } = await import('../lib/db/schema');

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

    const hashedPassword = await hash(adminPassword, 10);

    await db.insert(users).values({
      name: 'Admin User',
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      active: true,
    });

    console.log('✅ Admin user created successfully!');
    console.log('Email:', adminEmail);
    console.log('Password:', adminPassword);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  }
  process.exit(0);
}

seedAdmin();
