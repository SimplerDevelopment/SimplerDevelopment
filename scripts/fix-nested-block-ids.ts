#!/usr/bin/env tsx

/**
 * Migration Script: Fix Missing IDs in Nested Blocks
 *
 * This script adds IDs to:
 * - Columns that are missing IDs
 * - Nested blocks inside columns that are missing IDs
 * - Tabs that are missing IDs
 * - Nested blocks inside tabs that are missing IDs
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import * as dotenv from 'dotenv';
import { posts } from '../lib/db/schema';
import { Block } from '../types/blocks';

dotenv.config({ path: '.env.local' });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const connectionString = process.env.DATABASE_URL;
const client = postgres(connectionString);
const db = drizzle(client);

function generateId(prefix: string, index: number): string {
  return `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
}

function fixNestedBlockIds(blocks: Block[]): { blocks: Block[], modified: boolean } {
  let modified = false;

  const fixedBlocks = blocks.map((block, blockIndex) => {
    // Handle columns blocks
    if (block.type === 'columns') {
      const fixedColumns = block.columns.map((column, colIndex) => {
        // Ensure column has an ID
        let columnId = column.id;
        if (!columnId || columnId.startsWith('col-temp-')) {
          columnId = generateId('col', colIndex);
          modified = true;
          console.log(`  - Generated column ID: ${columnId}`);
        }

        // Ensure all nested blocks in this column have IDs
        const fixedNestedBlocks = column.blocks.map((nestedBlock, nestedIndex) => {
          if (!nestedBlock.id) {
            const newId = generateId('block', nestedIndex);
            modified = true;
            console.log(`  - Generated nested block ID: ${newId} (type: ${nestedBlock.type})`);
            return { ...nestedBlock, id: newId };
          }
          return nestedBlock;
        });

        return {
          ...column,
          id: columnId,
          blocks: fixedNestedBlocks,
        };
      });

      return {
        ...block,
        columns: fixedColumns,
      };
    }

    // Handle tabs blocks
    if (block.type === 'tabs') {
      const fixedTabs = block.tabs.map((tab, tabIndex) => {
        // Ensure tab has an ID
        let tabId = tab.id;
        if (!tabId || tabId.startsWith('tab-temp-')) {
          tabId = generateId('tab', tabIndex);
          modified = true;
          console.log(`  - Generated tab ID: ${tabId}`);
        }

        // Ensure all nested blocks in this tab have IDs
        const fixedNestedBlocks = tab.blocks.map((nestedBlock, nestedIndex) => {
          if (!nestedBlock.id) {
            const newId = generateId('block', nestedIndex);
            modified = true;
            console.log(`  - Generated nested block ID: ${newId} (type: ${nestedBlock.type})`);
            return { ...nestedBlock, id: newId };
          }
          return nestedBlock;
        });

        return {
          ...tab,
          id: tabId,
          blocks: fixedNestedBlocks,
        };
      });

      return {
        ...block,
        tabs: fixedTabs,
      };
    }

    return block;
  });

  return { blocks: fixedBlocks, modified };
}

async function main() {
  console.log('Starting migration: Fix missing IDs in nested blocks\n');

  try {
    // Fetch all posts
    const allPosts = await db.select().from(posts);
    console.log(`Found ${allPosts.length} posts to check\n`);

    let totalUpdated = 0;

    for (const post of allPosts) {
      try {
        // Parse content as JSON
        const content = JSON.parse(post.content);

        // Check if content has the new format with blocks and version
        let blocks: Block[];
        let hasNewFormat = false;

        if (content.blocks && Array.isArray(content.blocks)) {
          blocks = content.blocks;
          hasNewFormat = true;
        } else if (Array.isArray(content)) {
          blocks = content;
        } else {
          console.log(`  ⊘ Skipping post #${post.id} - unrecognized content format\n`);
          continue;
        }

        console.log(`Checking post #${post.id}: "${post.title}"`);

        // Fix nested block IDs
        const { blocks: fixedBlocks, modified } = fixNestedBlockIds(blocks);

        if (modified) {
          // Reconstruct content in the same format it was received
          const updatedContent = hasNewFormat
            ? JSON.stringify({ ...content, blocks: fixedBlocks })
            : JSON.stringify(fixedBlocks);

          // Update the post with fixed blocks
          await db
            .update(posts)
            .set({
              content: updatedContent,
              updatedAt: new Date(),
            })
            .where(eq(posts.id, post.id));

          console.log(`  ✓ Updated post #${post.id}\n`);
          totalUpdated++;
        } else {
          console.log(`  ✓ No changes needed\n`);
        }
      } catch (error) {
        console.error(`  ✗ Error processing post #${post.id}:`, error);
        console.log('');
      }
    }

    console.log(`\nMigration complete!`);
    console.log(`Posts updated: ${totalUpdated} / ${allPosts.length}`);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
