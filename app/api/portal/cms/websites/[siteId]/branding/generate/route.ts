import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { description } = await req.json();
  if (!description || typeof description !== 'string' || description.trim().length < 10) {
    return NextResponse.json({ success: false, message: 'Please provide a brand description (at least 10 characters).' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, message: 'AI service not configured.' }, { status: 503 });
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are a world-class brand designer. Given a brand description, generate a complete brand theme as JSON.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "primaryColor": "#hex",
  "secondaryColor": "#hex",
  "accentColor": "#hex",
  "backgroundColor": "#hex",
  "textColor": "#hex",
  "headingFont": "Google Font Name",
  "bodyFont": "Google Font Name",
  "navBackground": "#hex",
  "navTextColor": "#hex",
  "borderRadius": "Npx",
  "linkColor": "#hex",
  "linkHoverColor": "#hex",
  "buttonStyle": {
    "primaryBg": "#hex",
    "primaryText": "#hex",
    "primaryHoverBg": "#hex",
    "secondaryBg": "#hex",
    "secondaryText": "#hex",
    "secondaryHoverBg": "#hex",
    "borderRadius": "Npx",
    "variant": "filled"
  },
  "darkMode": {
    "primaryColor": "#hex",
    "secondaryColor": "#hex",
    "accentColor": "#hex",
    "backgroundColor": "#hex",
    "textColor": "#hex",
    "navBackground": "#hex",
    "navTextColor": "#hex"
  },
  "typography": {
    "h1": { "font": "Google Font Name", "size": "2.5rem", "weight": "700", "lineHeight": "1.2", "letterSpacing": "-0.02em" },
    "h2": { "font": "Google Font Name", "size": "2rem", "weight": "600", "lineHeight": "1.25", "letterSpacing": "-0.01em" },
    "h3": { "size": "1.5rem", "weight": "600", "lineHeight": "1.3", "letterSpacing": "0" },
    "h4": { "size": "1.25rem", "weight": "600", "lineHeight": "1.35" },
    "p": { "size": "1rem", "weight": "400", "lineHeight": "1.6" },
    "button": { "size": "0.875rem", "weight": "500", "lineHeight": "1.25", "letterSpacing": "0.02em" },
    "nav": { "size": "0.875rem", "weight": "500", "lineHeight": "1.5" }
  },
  "tone": "Brief 1-2 sentence description of the brand personality and visual tone"
}

Guidelines:
- Choose colors that match the brand personality (bold/vibrant for energetic brands, muted/elegant for luxury, etc.)
- Ensure sufficient contrast between background and text colors (WCAG AA minimum)
- Pick Google Fonts that match the brand tone (geometric sans for modern/tech, serif for traditional/luxury, rounded for friendly)
- The headingFont and bodyFont should complement each other
- Dark mode colors should be proper dark variants (dark backgrounds, light text)
- Typography sizes should use rem units
- Border radius: 0 for sharp/corporate, 4-8px for moderate, 12-16px for friendly/rounded, 999px for pill-shaped
- Only include typography entries you want to customize (h1, h2, h3, h4, p, button, nav are most important)`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        { role: 'user', content: `Generate a complete brand theme for this brand:\n\n"${description.trim()}"` },
      ],
      system: systemPrompt,
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON from the response (handle possible markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ success: false, message: 'Failed to generate valid branding.' }, { status: 500 });
    }

    const generated = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ success: true, data: generated });
  } catch (error) {
    console.error('AI branding generation error:', error);
    return NextResponse.json({ success: false, message: 'Failed to generate branding. Please try again.' }, { status: 500 });
  }
}
