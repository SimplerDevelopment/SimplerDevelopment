import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const [row] = await db.select().from(posts).where(eq(posts.id, 793)).limit(1);
const parsed = JSON.parse(row.content);
console.log('Total blocks:', parsed.blocks.length);
parsed.blocks.forEach((b: any, i: number) => console.log(i, b.id, b.type));
console.log('---products block---');
const products = parsed.blocks.find((b: any) => b.id === 'products');
console.log('products idx:', parsed.blocks.indexOf(products));
console.log(JSON.stringify(products, null, 2));
process.exit(0);
