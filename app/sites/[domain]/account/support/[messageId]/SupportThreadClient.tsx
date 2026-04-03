'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useCustomerAuth } from '@/components/storefront/account/CustomerAuthContext';
import { RequireAuth } from '@/components/storefront/account/RequireAuth';
import { AccountLayout } from '@/components/storefront/account/AccountLayout';

interface Reply {
  id: number;
  body: string;
  fromStaff: boolean;
  staffName?: string;
  createdAt: string;
}

interface SupportThread {
  id: number;
  subject: string;
  category: string;
  status: string;
  body: string;
  createdAt: string;
  replies: Reply[];
}

const statusColor: Record<string, string> = {
  open: 'bg-blue-100 text-blue-800',
  replied: 'bg-green-100 text-green-800',
  resolved: 'bg-gray-100 text-gray-700',
};

export function SupportThreadClient({ siteId, domain, messageId }: { siteId: number; domain: string; messageId: string }) {
  const { token, customer } = useCustomerAuth();
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyBody, setReplyBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    fetchThread();
  }, [siteId, token, messageId]);

  const fetchThread = () => {
    if (!token) return;
    fetch(`/api/storefront/${siteId}/account/support/${messageId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(res => { if (res.success) setThread(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (thread) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [thread]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !replyBody.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/storefront/${siteId}/account/support/${messageId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ body: replyBody }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyBody('');
        fetchThread();
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
          <Link href="/account/support" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
            <span className="material-icons" style={{ fontSize: '18px' }}>arrow_back</span>
            Back to support
          </Link>

          {loading ? (
            <div className="text-center py-12">
              <span className="material-icons text-gray-300 animate-spin" style={{ fontSize: '32px' }}>progress_activity</span>
            </div>
          ) : !thread ? (
            <div className="border border-gray-200 rounded-xl p-12 text-center">
              <span className="material-icons text-gray-300" style={{ fontSize: '48px' }}>error_outline</span>
              <p className="text-sm text-gray-500 mt-3">Message not found.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Thread header */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{thread.subject}</h1>
                  <p className="text-sm text-gray-500 mt-1">
                    {thread.category} -- Opened {new Date(thread.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${statusColor[thread.status] ?? 'bg-gray-100 text-gray-700'}`}>
                  {thread.status}
                </span>
              </div>

              {/* Messages */}
              <div className="space-y-4">
                {/* Original message */}
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center flex-shrink-0">
                    <span className="material-icons text-white" style={{ fontSize: '16px' }}>person</span>
                  </div>
                  <div className="flex-1 border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-gray-900">
                        {customer?.firstName ?? 'You'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(thread.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </p>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{thread.body}</p>
                  </div>
                </div>

                {/* Replies */}
                {thread.replies.map(reply => (
                  <div key={reply.id} className="flex gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${reply.fromStaff ? 'bg-blue-100' : 'bg-gray-900'}`}>
                      <span className={`material-icons ${reply.fromStaff ? 'text-blue-700' : 'text-white'}`} style={{ fontSize: '16px' }}>
                        {reply.fromStaff ? 'support_agent' : 'person'}
                      </span>
                    </div>
                    <div className={`flex-1 border rounded-xl p-4 ${reply.fromStaff ? 'border-blue-200 bg-blue-50/50' : 'border-gray-200'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-gray-900">
                          {reply.fromStaff ? (reply.staffName ?? 'Support Team') : (customer?.firstName ?? 'You')}
                        </p>
                        <p className="text-xs text-gray-400">
                          {new Date(reply.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{reply.body}</p>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Reply form */}
              {thread.status !== 'resolved' && (
                <form onSubmit={handleReply} className="border border-gray-200 rounded-xl p-4 space-y-3">
                  <textarea
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="Write a reply..."
                    required
                  />
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={submitting || !replyBody.trim()}
                      className="inline-flex items-center gap-2 px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                    >
                      <span className="material-icons" style={{ fontSize: '16px' }}>send</span>
                      {submitting ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </form>
              )}

              {thread.status === 'resolved' && (
                <div className="border border-gray-200 rounded-xl p-4 text-center">
                  <span className="material-icons text-gray-300" style={{ fontSize: '24px' }}>check_circle</span>
                  <p className="text-sm text-gray-500 mt-1">This conversation has been resolved.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </AccountLayout>
    </RequireAuth>
  );
}
