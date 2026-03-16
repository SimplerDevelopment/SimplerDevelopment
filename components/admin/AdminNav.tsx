'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';

interface AdminNavProps {
  user?: {
    name?: string | null;
    email?: string | null;
  };
}

export default function AdminNav({ user }: AdminNavProps) {
  const pathname = usePathname();

  const postsSubPaths = ['/admin/posts', '/admin/post-types', '/admin/categories', '/admin/tags'];
  const isPostsActive = postsSubPaths.some(path => pathname.startsWith(path));

  const [isPostsExpanded, setIsPostsExpanded] = useState(isPostsActive);

  useEffect(() => {
    setIsPostsExpanded(isPostsActive);
  }, [isPostsActive]);

  const navItems = [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/users', label: 'Users' },
  ];

  const postsSubItems = [
    { href: '/admin/posts', label: 'Posts' },
    { href: '/admin/post-types', label: 'Post Types' },
    { href: '/admin/categories', label: 'Categories' },
    { href: '/admin/tags', label: 'Tags' },
  ];

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-gray-900">CMS</h1>
            </div>
            <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    pathname === item.href
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {item.label}
                </Link>
              ))}

              <div className="relative">
                <button
                  onClick={() => setIsPostsExpanded(!isPostsExpanded)}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    isPostsActive
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  Posts
                  <svg
                    className={`ml-1 h-4 w-4 transition-transform ${isPostsExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {isPostsExpanded && (
                  <div className="absolute left-0 top-full mt-2 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-10">
                    <div className="py-1">
                      {postsSubItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`block px-4 py-2 text-sm ${
                            pathname.startsWith(item.href)
                              ? 'bg-blue-50 text-blue-700 font-medium'
                              : 'text-gray-700 hover:bg-gray-100'
                          }`}
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-700">{user?.email}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/admin/login' })}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
