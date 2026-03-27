import { NextRequest, NextResponse } from 'next/server';

const GOOGLE_FONTS_API_KEY = process.env.GOOGLE_FONTS_API_KEY || 'AIzaSyBYzFFZd61s0ERdCWvO7rmkh7ydwEsky2E';
const CACHE_TTL = 60 * 60 * 24; // 24 hours

let cachedFonts: { family: string; category: string; variants: string[]; files: Record<string, string> }[] | null = null;
let cacheTime = 0;

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get('search') || '';
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '30');
  const offset = parseInt(request.nextUrl.searchParams.get('offset') || '0');

  try {
    // Fetch and cache the full font list
    if (!cachedFonts || Date.now() - cacheTime > CACHE_TTL * 1000) {
      const res = await fetch(
        `https://www.googleapis.com/webfonts/v1/webfonts?key=${GOOGLE_FONTS_API_KEY}&sort=popularity`,
        { next: { revalidate: CACHE_TTL } }
      );
      if (!res.ok) {
        return NextResponse.json({ success: false, error: 'Failed to fetch fonts' }, { status: 502 });
      }
      const data = await res.json();
      cachedFonts = data.items.map((f: { family: string; category: string; variants: string[]; files: Record<string, string> }) => ({
        family: f.family,
        category: f.category,
        variants: f.variants,
        files: f.files,
      }));
      cacheTime = Date.now();
    }

    let filtered = cachedFonts!;
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((f) => f.family.toLowerCase().includes(q));
    }

    const total = filtered.length;
    const paginated = filtered.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      data: paginated,
      pagination: { total, offset, limit },
    });
  } catch (error) {
    console.error('Google Fonts API error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch fonts' }, { status: 500 });
  }
}
