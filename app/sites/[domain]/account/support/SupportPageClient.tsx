'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCustomerAuth } from '@/components/storefront/account/CustomerAuthContext';
import { RequireAuth } from '@/components/storefront/account/RequireAuth';
import { AccountLayout } from '@/components/storefront/account/AccountLayout';

interface SupportMessage {
  id: number;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
  lastReplyAt?: string;
}

const statusColor: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  replied: 'bg-green-100 text-green-800',
  resolved: 'bg-gray-100 text-gray-700',
};

const categories = [
  { value: 'order', label: 'Order Issue' },
  { value: 'product', label: 'Product Question' },
  { value: 'shipping', label: 'Shipping & Delivery' },
  { value: 'return', label: 'Returns & Refunds' },
  { value: 'account', label: 'Account Help' },
  { value: 'other', label: 'Other' },
];

export function SupportPageClient({ siteId, domain }: { siteId: number; domain: string }) {
  const { token } = useCustomerAuth();
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ subject: '', category: 'order', body: '' });

  useEffect(() => {
    if (!token) return;
    fetchMessages();
  }, [siteId, token]);

  const fetchMessages = () => {
    if (!token) return;
    fetch(`/api/storefront/${siteId}/account/support`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(res => { if (res.success) setMessages(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !form.subject.trim() || !form.body.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/storefront/${siteId}/account/support`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        setForm({ subject: '', category: 'order', body: '' });
        setShowForm(false);
        fetchMessages();
      }
    } catch {
      // silently fail
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <RequireAuth>
      <AccountLayout siteId={siteId} domain={domain}>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Support</h1>
              <p className="text-gray-500 text-sm mt-1">Get help with your orders and account.</p>
            </div>
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors"
            >
              <span className="material-icons" style={{ fontSize: '18px' }}>{showForm ? 'close' : 'add'}</span>
              {showForm ? 'Cancel' : 'New Message'}
            </button>
          </div>

          {/* New message form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="border border-gray-200 rounded-xl p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Subject</label>
                <input
                  type="text"
                  value={form.subject}
                  onChange={e => setForm(prev => ({ ...prev, subject: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Brief description of your issue"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">Message</label>
                <textarea
                  value={form.body}
                  onChange={e => setForm(prev => ({ ...prev, body: e.target.value }))}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  placeholder="Describe your issue in detail..."
                  required
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </form>
          )}

          {/* Messages list */}
          {loading ? (
            <div className="text-center py-12">
              <span className="material-icons text-gray-300 animate-spin" style={{ fontSize: '32px' }}>progress_activity</span>
            </div>
          ) : messages.length === 0 && !showForm ? (
            <div className="border border-gray-200 rounded-xl p-12 text-center">
              <span className="material-icons text-gray-300" style={{ fontSize: '48px' }}>support_agent</span>
              <p className="text-sm text-gray-500 mt-3">No support messages yet.</p>
              <button
                onClick={() => setShowForm(true)}
                className="inline-block mt-4 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
              >
                Contact Support
              </button>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="divide-y divide-gray-200">
                {messages.map(msg => (
                  <Link
                    key={msg.id}
                    href={`/account/support/${msg.id}`}
                    className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors"
                  >
                    <span className="material-icons text-gray-400" style={{ fontSize: '20px' }}>
                      {msg.status === 'resolved' ? 'check_circle' : 'chat_bubble_outline'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{msg.subject}</p>
                      <p className="text-xs text-gray-500">
                        {categories.find(c => c.value === msg.category)?.label ?? msg.category}
                        {' -- '}
                        {new Date(msg.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[msg.status] ?? 'bg-gray-100 text-gray-700'}`}>
                      {msg.status}
                    </span>
                    <span className="material-icons text-gray-400" style={{ fontSize: '18px' }}>chevron_right</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </AccountLayout>
    </RequireAuth>
  );
}
