import { NextRequest, NextResponse } from 'next/server';
import categoriesData from '@/components/product-designer/static/categories';

// GET /api/product-categories?search=&limit=20&offset=0
//
// Serves the ~98k art-category tags with server-side search + pagination so the
// 5.5M categories.json stays in the SERVER bundle and never ships to the client.
// Previously ArtCategories.tsx (a 'use client' component) imported the JSON
// directly, bundling all 98k tags into that route's browser JS just to render
// 20 at a time. This route keeps the data server-side; the client fetches only
// the slice it displays.

type Tag = { tag: string; count: number };

const ALL_TAGS: Tag[] = categoriesData.tags;

// Pure, testable: filter by case-insensitive substring, then paginate.
export function queryTags(all: Tag[], search: string, offset: number, limit: number) {
  const q = (search || '').toLowerCase();
  const filtered = q ? all.filter((t) => t.tag.toLowerCase().includes(q)) : all;
  return { data: filtered.slice(offset, offset + limit), total: filtered.length };
}

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams.get('search') || '';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20', 10) || 20, 100);
  const offset = Math.max(parseInt(request.nextUrl.searchParams.get('offset') || '0', 10) || 0, 0);

  const { data, total } = queryTags(ALL_TAGS, search, offset, limit);
  return NextResponse.json({ success: true, data, pagination: { total, offset, limit } });
}
