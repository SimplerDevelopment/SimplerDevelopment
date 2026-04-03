'use client';

import { useState, useEffect } from 'react';
import { useCustomerAuth } from '@/components/storefront/account/CustomerAuthContext';
import { RequireAuth } from '@/components/storefront/account/RequireAuth';
import { AccountLayout } from '@/components/storefront/account/AccountLayout';

interface Address {
  id: number;
  label?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  isDefault: boolean;
}

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addresses: Address[];
}

const emptyAddress = { label: '', line1: '', line2: '', city: '', state: '', zip: '', country: 'US' };

export function ProfileClient({ siteId, domain }: { siteId: number; domain: string }) {
  const { token, refreshCustomer } = useCustomerAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  // Profile form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  // Address form
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [addressForm, setAddressForm] = useState(emptyAddress);
  const [savingAddress, setSavingAddress] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchProfile();
  }, [siteId, token]);

  const fetchProfile = () => {
    if (!token) return;
    fetch(`/api/storefront/${siteId}/account`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          const d = res.data;
          setProfile(d);
          setFirstName(d.firstName ?? '');
          setLastName(d.lastName ?? '');
          setPhone(d.phone ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setSuccess('');
    try {
      const res = await fetch(`/api/storefront/${siteId}/account`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ firstName, lastName, phone }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess('Profile updated successfully.');
        if (refreshCustomer) refreshCustomer();
      }
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const openAddressForm = (addr?: Address) => {
    if (addr) {
      setEditingAddressId(addr.id);
      setAddressForm({
        label: addr.label ?? '',
        line1: addr.line1,
        line2: addr.line2 ?? '',
        city: addr.city,
        state: addr.state,
        zip: addr.zip,
        country: addr.country,
      });
    } else {
      setEditingAddressId(null);
      setAddressForm({ ...emptyAddress });
    }
    setShowAddressForm(true);
  };

  const handleAddressSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSavingAddress(true);
    try {
      const url = editingAddressId
        ? `/api/storefront/${siteId}/account/addresses/${editingAddressId}`
        : `/api/storefront/${siteId}/account/addresses`;
      const method = editingAddressId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(addressForm),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddressForm(false);
        setEditingAddressId(null);
        fetchProfile();
      }
    } catch {
      // silently fail
    } finally {
      setSavingAddress(false);
    }
  };

  const deleteAddress = async (id: number) => {
    if (!token || !confirm('Remove this address?')) return;
    try {
      const res = await fetch(`/api/storefront/${siteId}/account/addresses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) fetchProfile();
    } catch {
      // silently fail
    }
  };

  return (
    <RequireAuth>
      <AccountLayout siteId={siteId} domain={domain}>
        <div className="space-y-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
            <p className="text-gray-500 text-sm mt-1">Manage your personal information and addresses.</p>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <span className="material-icons text-gray-300 animate-spin" style={{ fontSize: '32px' }}>progress_activity</span>
            </div>
          ) : (
            <>
              {/* Personal info */}
              <form onSubmit={handleProfileSave} className="border border-gray-200 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span className="material-icons text-gray-400" style={{ fontSize: '20px' }}>person</span>
                  Personal Information
                </h2>

                {success && (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                    <span className="material-icons" style={{ fontSize: '18px' }}>check_circle</span>
                    {success}
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Email</label>
                  <input
                    type="email"
                    value={profile?.email ?? ''}
                    disabled
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-400 bg-gray-50"
                  />
                  <p className="text-xs text-gray-400 mt-1">Email cannot be changed. Contact support if you need to update it.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>

              {/* Address book */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <span className="material-icons text-gray-400" style={{ fontSize: '20px' }}>location_on</span>
                    Address Book
                  </h2>
                  <button
                    onClick={() => openAddressForm()}
                    className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
                  >
                    <span className="material-icons" style={{ fontSize: '18px' }}>add</span>
                    Add Address
                  </button>
                </div>

                {/* Address form */}
                {showAddressForm && (
                  <form onSubmit={handleAddressSave} className="p-5 border-b border-gray-200 space-y-4 bg-gray-50/50">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">Label (optional)</label>
                      <input
                        type="text"
                        value={addressForm.label}
                        onChange={e => setAddressForm(prev => ({ ...prev, label: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        placeholder="e.g. Home, Office"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">Address Line 1</label>
                      <input
                        type="text"
                        value={addressForm.line1}
                        onChange={e => setAddressForm(prev => ({ ...prev, line1: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">Address Line 2 (optional)</label>
                      <input
                        type="text"
                        value={addressForm.line2}
                        onChange={e => setAddressForm(prev => ({ ...prev, line2: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                      />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-gray-900 mb-1">City</label>
                        <input
                          type="text"
                          value={addressForm.city}
                          onChange={e => setAddressForm(prev => ({ ...prev, city: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-1">State</label>
                        <input
                          type="text"
                          value={addressForm.state}
                          onChange={e => setAddressForm(prev => ({ ...prev, state: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-1">ZIP</label>
                        <input
                          type="text"
                          value={addressForm.zip}
                          onChange={e => setAddressForm(prev => ({ ...prev, zip: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 mb-1">Country</label>
                        <input
                          type="text"
                          value={addressForm.country}
                          onChange={e => setAddressForm(prev => ({ ...prev, country: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                          required
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => { setShowAddressForm(false); setEditingAddressId(null); }}
                        className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingAddress}
                        className="px-5 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                      >
                        {savingAddress ? 'Saving...' : (editingAddressId ? 'Update Address' : 'Add Address')}
                      </button>
                    </div>
                  </form>
                )}

                {/* Address list */}
                {(!profile?.addresses || profile.addresses.length === 0) && !showAddressForm ? (
                  <div className="p-8 text-center">
                    <span className="material-icons text-gray-300" style={{ fontSize: '48px' }}>location_off</span>
                    <p className="text-sm text-gray-500 mt-2">No saved addresses.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {profile?.addresses?.map(addr => (
                      <div key={addr.id} className="px-5 py-4 flex items-start gap-4">
                        <span className="material-icons text-gray-400 mt-0.5" style={{ fontSize: '20px' }}>location_on</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-900">{addr.label || 'Address'}</p>
                            {addr.isDefault && (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full font-medium">Default</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">{addr.line1}{addr.line2 ? `, ${addr.line2}` : ''}</p>
                          <p className="text-sm text-gray-500">{addr.city}, {addr.state} {addr.zip}, {addr.country}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openAddressForm(addr)}
                            className="p-1.5 text-gray-400 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-colors"
                            title="Edit address"
                          >
                            <span className="material-icons" style={{ fontSize: '18px' }}>edit</span>
                          </button>
                          <button
                            onClick={() => deleteAddress(addr.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                            title="Delete address"
                          >
                            <span className="material-icons" style={{ fontSize: '18px' }}>delete</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </AccountLayout>
    </RequireAuth>
  );
}
