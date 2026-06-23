'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { slugify } from '@/lib/publishing/slug';

interface PostType {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  icon: string;
  active: boolean;
  createdAt: string;
}

const materialIcons = [
  'article', 'description', 'assignment', 'folder', 'image', 'video_library',
  'music_note', 'calendar_today', 'event', 'shopping_cart', 'store',
  'business', 'home', 'person', 'category', 'apps'
];

export default function PostTypesPage() {
  const { data: session } = useSession();
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPostType, setEditingPostType] = useState<PostType | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    icon: 'article',
    active: true,
  });

  useEffect(() => {
    fetchPostTypes();
  }, []);

  // Handle escape key and prevent body scroll when modal is open
  useEffect(() => {
    if (showForm) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          handleCancel();
        }
      };
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
      };
    }
  }, [showForm]);

  const fetchPostTypes = async () => {
    const response = await fetch('/api/post-types');
    const data = await response.json();
    if (data.success) {
      setPostTypes(data.data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingPostType ? `/api/post-types/${editingPostType.id}` : '/api/post-types';
    const method = editingPostType ? 'PUT' : 'POST';

    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      await fetchPostTypes();
      setFormData({ name: '', slug: '', description: '', icon: 'article', active: true });
      setShowForm(false);
      setEditingPostType(null);
    } else {
      const data = await response.json();
      alert(data.error || 'Failed to save post type');
    }
  };

  const handleEdit = (postType: PostType) => {
    setEditingPostType(postType);
    setFormData({
      name: postType.name,
      slug: postType.slug,
      description: postType.description || '',
      icon: postType.icon,
      active: postType.active,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure? This will delete all custom fields associated with this post type.')) return;
    const response = await fetch(`/api/post-types/${id}`, { method: 'DELETE' });
    if (response.ok) {
      fetchPostTypes();
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingPostType(null);
    setFormData({ name: '', slug: '', description: '', icon: 'article', active: true });
  };


  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-foreground">Post Types</h1>
          <button
            onClick={() => {
              setShowForm(true);
              setEditingPostType(null);
              setFormData({ name: '', slug: '', description: '', icon: 'article', active: true });
            }}
            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
          >
            Add Post Type
          </button>
        </div>

        {showForm && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={handleCancel}
          >
            <div
              className="bg-background border border-border shadow-lg rounded-lg p-6 space-y-4 max-w-3xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-foreground">
                  {editingPostType ? 'Edit Post Type' : 'Add Post Type'}
                </h2>
                <button
                  onClick={handleCancel}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground">Name *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => {
                        setFormData({ ...formData, name: e.target.value });
                        if (!editingPostType) {
                          setFormData({ ...formData, name: e.target.value, slug: slugify(e.target.value) });
                        }
                      }}
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground">Slug *</label>
                    <input
                      type="text"
                      required
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      disabled={!!editingPostType}
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Icon *</label>
                  <div className="grid grid-cols-8 gap-2">
                    {materialIcons.map((iconName) => (
                      <button
                        key={iconName}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: iconName })}
                        className={`p-3 rounded-md border-2 flex items-center justify-center transition-colors ${
                          formData.icon === iconName
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-muted-foreground'
                        }`}
                      >
                        <span className="material-icons text-2xl">{iconName}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="active"
                    checked={formData.active}
                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <label htmlFor="active" className="ml-2 block text-sm text-foreground">
                    Active
                  </label>
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90"
                  >
                    {editingPostType ? 'Update' : 'Create'} Post Type
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="bg-card border border-border shadow overflow-hidden rounded-lg">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Icon
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Slug
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {postTypes.map((postType) => (
                <tr key={postType.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="material-icons text-2xl text-foreground">{postType.icon}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-foreground">{postType.name}</div>
                    {postType.description && (
                      <div className="text-sm text-muted-foreground">{postType.description}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {postType.slug}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        postType.active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {postType.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-2">
                    <Link
                      href={`/admin/post-types/${postType.id}/fields`}
                      className="text-primary hover:text-primary/80"
                    >
                      Fields
                    </Link>
                    <button
                      onClick={() => handleEdit(postType)}
                      className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(postType.id)}
                      className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {postTypes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground">
                    No post types yet. Create your first post type to get started!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
