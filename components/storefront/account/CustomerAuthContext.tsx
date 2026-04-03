'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

interface Customer {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  orderCount: number;
  totalSpent: number;
  createdAt: string | null;
}

interface CustomerAuthState {
  siteId: number;
  customer: Customer | null;
  loading: boolean;
  token: string | null;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (data: { email: string; password: string; firstName?: string; lastName?: string }) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthState | null>(null);

export function useCustomerAuth() {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}

function storageKey(siteId: number) {
  return `customer_token_${siteId}`;
}

export function CustomerAuthProvider({ siteId, children }: { siteId: number; children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const api = useCallback(async (action: string, data?: Record<string, unknown>) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const t = token ?? (typeof window !== 'undefined' ? localStorage.getItem(storageKey(siteId)) : null);
    if (t) headers['Authorization'] = `Bearer ${t}`;

    const res = await fetch(`/api/storefront/${siteId}/auth`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...data }),
    });
    return res.json();
  }, [siteId, token]);

  const refreshCustomer = useCallback(async () => {
    const t = typeof window !== 'undefined' ? localStorage.getItem(storageKey(siteId)) : null;
    if (!t) { setLoading(false); return; }

    const res = await fetch(`/api/storefront/${siteId}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
      body: JSON.stringify({ action: 'me' }),
    });
    const data = await res.json();
    if (data.success) {
      setCustomer(data.data);
      setToken(t);
    } else {
      localStorage.removeItem(storageKey(siteId));
      setToken(null);
      setCustomer(null);
    }
    setLoading(false);
  }, [siteId]);

  useEffect(() => { refreshCustomer(); }, [refreshCustomer]);

  const login = async (email: string, password: string) => {
    const data = await api('login', { email, password });
    if (data.success) {
      localStorage.setItem(storageKey(siteId), data.data.token);
      setToken(data.data.token);
      setCustomer(data.data.customer);
    }
    return { success: data.success, message: data.message };
  };

  const register = async (regData: { email: string; password: string; firstName?: string; lastName?: string }) => {
    const data = await api('register', regData);
    if (data.success) {
      localStorage.setItem(storageKey(siteId), data.data.token);
      setToken(data.data.token);
      setCustomer(data.data.customer);
    }
    return { success: data.success, message: data.message };
  };

  const logout = async () => {
    await api('logout');
    localStorage.removeItem(storageKey(siteId));
    setToken(null);
    setCustomer(null);
  };

  return (
    <CustomerAuthContext.Provider value={{ siteId, customer, loading, token, login, register, logout, refreshCustomer }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}
