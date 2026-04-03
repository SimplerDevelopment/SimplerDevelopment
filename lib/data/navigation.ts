import { db } from '@/lib/db';
import { siteNavigation } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

export interface NavItem {
  id: number;
  label: string;
  href: string;
  parentId: number | null;
  sortOrder: number;
  openInNewTab: boolean;
  isButton: boolean;
  description: string | null;
  icon: string | null;
  featuredImage: string | null;
  columnGroup: number | null;
  children: NavItem[];
}

export async function getNavigation(siteId: number): Promise<NavItem[]> {
  const rows = await db
    .select({
      id: siteNavigation.id,
      label: siteNavigation.label,
      href: siteNavigation.href,
      parentId: siteNavigation.parentId,
      sortOrder: siteNavigation.sortOrder,
      openInNewTab: siteNavigation.openInNewTab,
      isButton: siteNavigation.isButton,
      description: siteNavigation.description,
      icon: siteNavigation.icon,
      featuredImage: siteNavigation.featuredImage,
      columnGroup: siteNavigation.columnGroup,
    })
    .from(siteNavigation)
    .where(eq(siteNavigation.websiteId, siteId))
    .orderBy(asc(siteNavigation.sortOrder));

  // Build tree from flat rows
  const itemMap = new Map<number, NavItem>();
  const roots: NavItem[] = [];

  for (const row of rows) {
    itemMap.set(row.id, { ...row, children: [] });
  }

  for (const item of itemMap.values()) {
    if (item.parentId && itemMap.has(item.parentId)) {
      itemMap.get(item.parentId)!.children.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}
