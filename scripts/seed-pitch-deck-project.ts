import 'dotenv/config';
import { db } from '../lib/db';
import { clients, users, projects, kanbanColumns, kanbanCards } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  // Find client@example.com's client record
  const [user] = await db.select().from(users).where(eq(users.email, 'client@example.com')).limit(1);
  if (!user) { console.error('client@example.com not found'); process.exit(1); }

  const [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) { console.error('No client record for client@example.com'); process.exit(1); }

  // Create the project
  const [project] = await db.insert(projects).values({
    name: 'Pitch Deck Builder v2',
    description: 'Next iteration of the AI pitch deck builder — branding tools, CMS improvements, export capabilities, and collaboration features.',
    clientId: client.id,
    status: 'active',
    startDate: new Date(),
  }).returning();
  console.log(`Created project: ${project.name} (ID: ${project.id})`);

  // Create kanban columns
  const columnDefs = [
    { name: 'Backlog', order: 0, color: '#6b7280' },
    { name: 'To Do', order: 1, color: '#3b82f6' },
    { name: 'In Progress', order: 2, color: '#f59e0b' },
    { name: 'Done', order: 3, color: '#22c55e' },
  ];

  const cols: Record<string, number> = {};
  for (const def of columnDefs) {
    const [col] = await db.insert(kanbanColumns).values({
      projectId: project.id,
      name: def.name,
      order: def.order,
      color: def.color,
    }).returning();
    cols[def.name] = col.id;
    console.log(`  Column: ${def.name} (ID: ${col.id})`);
  }

  // Define all cards
  const cards = [
    // ── Branding & Identity ──
    {
      column: 'To Do', priority: 'high', order: 0,
      title: 'Brand context input panel',
      description: 'Add a dedicated branding section where users can enter company name, tagline, industry, mission statement, and target audience. This context should be injected into all AI generation prompts for more relevant content.',
    },
    {
      column: 'To Do', priority: 'high', order: 1,
      title: 'Logo upload and placement',
      description: 'The theme.logo field exists in the schema but has no UI. Add logo upload (via S3), preview in theme panel, and render the logo on cover slides and as a watermark on all other slides. Support PNG/SVG with transparent backgrounds.',
    },
    {
      column: 'To Do', priority: 'medium', order: 2,
      title: 'Brand material upload (PDF/images)',
      description: 'Allow users to upload existing brand guidelines, mood boards, or marketing materials (PDF, images). Extract colors, fonts, and style cues using AI vision to auto-populate the theme. Store uploads in S3 linked to the deck.',
    },
    {
      column: 'To Do', priority: 'medium', order: 3,
      title: 'Brand kit presets and saved themes',
      description: 'Let users save their current theme as a reusable "brand kit" and apply it to other decks. Include 5-10 built-in professional theme presets (e.g., Corporate Blue, Startup Bold, Minimalist).',
    },

    // ── Slide CMS Improvements ──
    {
      column: 'To Do', priority: 'high', order: 4,
      title: 'Drag-and-drop slide reordering',
      description: 'Replace the move up/down buttons with drag-and-drop reordering in the slide sidebar. Use @dnd-kit (already in the project for kanban). Show ghost preview while dragging.',
    },
    {
      column: 'To Do', priority: 'high', order: 5,
      title: 'Slide duplication',
      description: 'Add a "Duplicate" button on each slide that creates an exact copy with a new ID, inserted below the current slide. Essential for creating variations.',
    },
    {
      column: 'To Do', priority: 'medium', order: 6,
      title: 'Image upload for slides',
      description: 'The slide schema has an `image` field but no upload UI. Add image upload per slide (hero images, backgrounds, product screenshots). Upload to S3, render in the presentation with configurable position (background, left/right split, inline).',
    },
    {
      column: 'To Do', priority: 'medium', order: 7,
      title: 'Speaker notes editor and presenter view',
      description: 'The `notes` field exists on slides but is unused. Add a notes textarea below each slide in the editor. Create a presenter view (separate window) showing current slide, next slide preview, notes, and a timer.',
    },
    {
      column: 'To Do', priority: 'low', order: 8,
      title: 'Rich text editing for slide content',
      description: 'Replace plain text inputs with a lightweight rich text editor (bold, italic, links, lists) for headline, body, and bullet fields. Render formatted text in the presentation.',
    },
    {
      column: 'To Do', priority: 'low', order: 9,
      title: 'Slide type help tooltips',
      description: 'Add contextual help icons next to the slide type selector explaining what each type is best for, with thumbnail previews of the layout.',
    },

    // ── AI & Generation ──
    {
      column: 'To Do', priority: 'high', order: 10,
      title: 'AI branding prompt — generate theme from description',
      description: 'Add a "Describe your brand" textarea that feeds into AI to generate a complete theme (colors, fonts, slide tone). Example: "We\'re a modern fintech startup targeting millennials, bold and energetic." Should produce appropriate colors and font choices.',
    },
    {
      column: 'To Do', priority: 'medium', order: 11,
      title: 'Regenerate individual slides with context',
      description: 'When regenerating a single slide, include the full deck context (other slides, theme, brand info) so AI produces content that flows with the rest of the deck instead of being isolated.',
    },
    {
      column: 'To Do', priority: 'medium', order: 12,
      title: 'AI slide suggestions — "What slide should come next?"',
      description: 'After the last slide, show an AI-powered suggestion: "Based on your deck, consider adding a [Testimonial / Metrics / Team] slide." One-click to generate and append.',
    },
    {
      column: 'To Do', priority: 'low', order: 13,
      title: 'Batch AI operations — regenerate selected slides',
      description: 'Allow selecting multiple slides and regenerating them as a batch with a single prompt. Useful for rewriting tone across the deck (e.g., "make all slides more formal").',
    },

    // ── Export & Sharing ──
    {
      column: 'Backlog', priority: 'high', order: 0,
      title: 'PDF export',
      description: 'Export the deck as a PDF with one slide per page at 16:9 ratio. Use Puppeteer or a headless browser to render each slide as the presentation viewer shows them. Include all theme styling, fonts, and colors.',
    },
    {
      column: 'Backlog', priority: 'medium', order: 1,
      title: 'Password-protected sharing links',
      description: 'Add an option to publish a deck with a password. Visitors to the public URL are prompted for a password before viewing. Store hashed password on the deck record.',
    },
    {
      column: 'Backlog', priority: 'medium', order: 2,
      title: 'View analytics for published decks',
      description: 'Track views, time spent per slide, and completion rate for published decks. Show a simple analytics dashboard on the deck detail page.',
    },
    {
      column: 'Backlog', priority: 'low', order: 3,
      title: 'PowerPoint (.pptx) export',
      description: 'Export to PowerPoint format using a library like pptxgenjs. Map slide types to PowerPoint layouts, apply theme colors. Users can then edit in PowerPoint/Google Slides.',
    },

    // ── UX Polish ──
    {
      column: 'Backlog', priority: 'medium', order: 4,
      title: 'Live preview as you edit',
      description: 'Currently the preview only updates on save. Make the center preview update in real-time as the user types in the edit panel (debounced, no save required).',
    },
    {
      column: 'Backlog', priority: 'medium', order: 5,
      title: 'Undo/redo in editor',
      description: 'Add a local undo/redo stack (Cmd+Z / Cmd+Shift+Z) for slide edits, separate from version history. Track individual field changes for granular undo.',
    },
    {
      column: 'Backlog', priority: 'low', order: 6,
      title: 'Keyboard shortcuts',
      description: 'Add keyboard shortcuts: Cmd+S (save), Cmd+D (duplicate slide), Cmd+Shift+G (generate), Delete (delete slide), arrow keys (navigate slides). Show shortcut hints in tooltips.',
    },
    {
      column: 'Backlog', priority: 'low', order: 7,
      title: 'Slide templates library',
      description: 'Allow users to save individual slides as reusable templates. Include 10-15 built-in templates per slide type. Templates panel in the "Add Slide" flow.',
    },
    {
      column: 'Backlog', priority: 'low', order: 8,
      title: 'Dark/light mode toggle for presentations',
      description: 'Currently all presentations use dark backgrounds. Add a light mode option in the theme panel that switches to white backgrounds with dark text. AI should respect the chosen mode.',
    },
  ];

  // Insert all cards
  for (const card of cards) {
    await db.insert(kanbanCards).values({
      columnId: cols[card.column],
      projectId: project.id,
      title: card.title,
      description: card.description,
      priority: card.priority,
      order: card.order,
    });
  }

  console.log(`\nCreated ${cards.length} cards across ${columnDefs.length} columns`);
  console.log(`\nProject visible at: /portal/projects/${project.id}`);
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
