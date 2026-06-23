#!/usr/bin/env tsx

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import { posts } from '../lib/db/schema';

dotenv.config({ path: '.env.local' });

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
const db = drizzle(client);

async function main() {
  const post = await db.select().from(posts).where(eq(posts.id, 42)).limit(1);

  if (post.length > 0) {
    console.log('Post ID:', post[0].id);
    console.log('Title:', post[0].title);
    console.log('\nContent type:', typeof post[0].content);
    console.log('\nContent preview (first 500 chars):');
    console.log(post[0].content.substring(0, 500));

    try {
      const parsed = JSON.parse(post[0].content);
      console.log('\nParsed successfully!');
      console.log('Type of parsed:', typeof parsed);
      console.log('Is array:', Array.isArray(parsed));
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        console.log('Keys:', Object.keys(parsed));
      }
    } catch (e) {
      console.log('\nFailed to parse as JSON');
    }
  }

  await client.end();
}

main();
