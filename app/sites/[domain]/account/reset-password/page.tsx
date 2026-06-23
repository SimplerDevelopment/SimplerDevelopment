'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCustomerAuth } from '@/components/storefront/account/CustomerAuthContext';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { siteId } = useCustomerAuth();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!token) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <span className="material-icons text-4xl text-red-400 mb-4 block">error_outline</span>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Reset Link</h1>
        <p className="text-gray-500 text-sm mb-6">This password reset link is invalid or has expired.</p>
        <Link href="/account/login" className="text-gray-900 font-medium hover:underline">Back to Sign In</Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <span className="material-icons text-4xl text-green-500 mb-4 block">check_circle</span>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Password Reset</h1>
        <p className="text-gray-500 text-sm mb-6">Your password has been successfully reset. You can now sign in with your new password.</p>
        <Link href="/account/login"
          className="inline-block bg-gray-900 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-gray-800 transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/storefront/${siteId}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset-password', token, password }),
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(true);
      } else {
        setError(data.message || 'Failed to reset password. The link may have expired.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Reset Your Password</h1>
      <p className="text-gray-500 text-center text-sm mb-8">Enter your new password below.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
          <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            placeholder="Minimum 8 characters" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
          <input type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            placeholder="Re-enter your password" />
        </div>
        <button type="submit" disabled={submitting}
          className="w-full bg-gray-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors">
          {submitting ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Remember your password? <Link href="/account/login" className="text-gray-900 font-medium hover:underline">Sign in</Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><span className="material-icons animate-spin text-3xl text-gray-400">autorenew</span></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
