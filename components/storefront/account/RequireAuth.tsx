'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from './CustomerAuthContext';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { customer, loading } = useCustomerAuth();
  const router = useRouter();

  // Navigation is a side effect — never during render (StrictMode double
  // render would push twice and React warns about render-phase updates).
  useEffect(() => {
    if (!loading && !customer) router.push('/account/login');
  }, [loading, customer, router]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="material-icons animate-spin text-3xl text-gray-400">autorenew</span>
      </div>
    );
  }

  if (!customer) return null;

  return <>{children}</>;
}
