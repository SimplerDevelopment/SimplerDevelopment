import Link from 'next/link';
import { db } from '@/lib/db';
import { posts, categories, tags } from '@/lib/db/schema';
import { count, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';

async function getDashboardStats() {
  const [totalPosts] = await db.select({ count: count() }).from(posts);
  const [publishedPosts] = await db
    .select({ count: count() })
    .from(posts)
    .where(eq(posts.published, true));
  const [totalCategories] = await db.select({ count: count() }).from(categories);
  const [totalTags] = await db.select({ count: count() }).from(tags);

  return {
    totalPosts: totalPosts.count,
    publishedPosts: publishedPosts.count,
    draftPosts: totalPosts.count - publishedPosts.count,
    totalCategories: totalCategories.count,
    totalTags: totalTags.count,
  };
}

export default async function AdminDashboard() {
  const session = await auth();
  const stats = await getDashboardStats();

  const statCards = [
    {
      title: 'Total Posts',
      value: stats.totalPosts,
      color: 'bg-blue-500',
      href: '/admin/posts',
    },
    {
      title: 'Published Posts',
      value: stats.publishedPosts,
      color: 'bg-green-500',
      href: '/admin/posts?filter=published',
    },
    {
      title: 'Draft Posts',
      value: stats.draftPosts,
      color: 'bg-yellow-500',
      href: '/admin/posts?filter=draft',
    },
    {
      title: 'Categories',
      value: stats.totalCategories,
      color: 'bg-purple-500',
      href: '/admin/categories',
    },
    {
      title: 'Tags',
      value: stats.totalTags,
      color: 'bg-pink-500',
      href: '/admin/tags',
    },
  ];

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="mt-2 text-muted-foreground">
            Welcome to your content management system
          </p>
        </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {statCards.map((stat) => (
              <Link
                key={stat.title}
                href={stat.href}
                className="block bg-card border border-border overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  <div className="flex items-center">
                    <div className={`flex-shrink-0 ${stat.color} rounded-md p-3`}>
                      <svg
                        className="h-6 w-6 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-muted-foreground truncate">
                          {stat.title}
                        </dt>
                        <dd className="text-3xl font-semibold text-foreground">
                          {stat.value}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="bg-card border border-border shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">
              Quick Actions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link
                href="/admin/posts/new"
                className="flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary/90"
              >
                Create New Post
              </Link>
              <Link
                href="/admin/categories"
                className="flex items-center justify-center px-4 py-3 border border-border text-sm font-medium rounded-md text-foreground bg-card hover:bg-accent"
              >
                Manage Categories
              </Link>
              <Link
                href="/admin/tags"
                className="flex items-center justify-center px-4 py-3 border border-border text-sm font-medium rounded-md text-foreground bg-card hover:bg-accent"
              >
                Manage Tags
              </Link>
            </div>
          </div>
        </div>
    </main>
  );
}
