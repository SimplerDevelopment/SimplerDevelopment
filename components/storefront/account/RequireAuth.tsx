'use client';

import { useRouter } from 'next/navigation';
import { useCustomerAuth } from './CustomerAuthContext';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { customer, loading } = useCustomerAuth();
  const router = useRouter();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <span className="material-icons animate-spin text-3xl text-gray-400">autorenew</span>
      </div>
    );
  }

  if (!customer) {
    router.push('/account/login');
    return null;
  }

  return <>{children}</>;
}
