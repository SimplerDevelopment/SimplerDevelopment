import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function seedCreditPackages() {
  try {
    const { db } = await import('../lib/db');
    const { aiCreditPackages } = await import('../lib/db/schema');

    // Clear existing packages
    await db.delete(aiCreditPackages);

    await db.insert(aiCreditPackages).values([
      {
        name: '100K Token Pack',
        tokens: 100_000,
        price: 500, // $5.00
        active: true,
      },
      {
        name: '500K Token Pack',
        tokens: 500_000,
        price: 2000, // $20.00
        active: true,
      },
      {
        name: '1M Token Pack',
        tokens: 1_000_000,
        price: 3500, // $35.00
        active: true,
      },
    ]);

    console.log('Credit packages seeded:');
    console.log('   100K tokens  $5');
    console.log('   500K tokens  $20');
    console.log('   1M tokens    $35');
    console.log('   Pay-as-you-go: $0.05/1K tokens (auto-billed)');

  } catch (error) {
    console.error('Error seeding credit packages:', error);
  }
  process.exit(0);
}

seedCreditPackages();
