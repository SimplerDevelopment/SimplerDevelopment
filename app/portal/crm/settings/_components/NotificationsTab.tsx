'use client';

import { useState, useEffect, useRef } from 'react';

interface NotifPref { notificationType: string; delivery: 'instant' | 'digest_daily' | 'off' }

export default function NotificationsTab() {
  const [notifPrefs, setNotifPrefs] = useState<NotifPref[]>([]);
  const [notifLoaded, setNotifLoaded] = useState(false);
  const notifFetchingRef = useRef(false);
  const [notifSaving, setNotifSaving] = useState<string | null>(null); // notificationType being saved

  useEffect(() => {
    if (!notifLoaded && !notifFetchingRef.current) {
      notifFetchingRef.current = true;
      fetch('/api/portal/crm/notification-preferences')
        .then(r => r.json())
        .then(d => {
          setNotifPrefs(d.data ?? []);
          setNotifLoaded(true);
          notifFetchingRef.current = false;
        })
        .catch(() => { notifFetchingRef.current = false; });
    }
  }, [notifLoaded]);

  async function updateNotifPref(notificationType: string, delivery: 'instant' | 'digest_daily' | 'off') {
    setNotifSaving(notificationType);
    setNotifPrefs(prev =>
      prev.map(p => p.notificationType === notificationType ? { ...p, delivery } : p)
    );
    await fetch('/api/portal/crm/notification-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: [{ notificationType, delivery }] }),
    });
    setNotifSaving(null);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-6">
      <div>
        <h3 className="font-semibold text-foreground text-lg">Notification Preferences</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Control how you receive CRM notifications — instantly, as a daily digest, or not at all.
        </p>
      </div>

      {!notifLoaded && (
        <div className="flex items-center justify-center py-10">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      )}

      {notifLoaded && notifPrefs.length > 0 && (
        <div className="divide-y divide-border">
          {notifPrefs.map(pref => {
            const label = pref.notificationType
              .replace(/_/g, ' ')
              .replace(/\b\w/g, c => c.toUpperCase());
            const isSaving = notifSaving === pref.notificationType;
            return (
              <div key={pref.notificationType} className="flex items-center justify-between py-3 gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground font-mono">{pref.notificationType}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isSaving && (
                    <span className="material-icons animate-spin text-primary text-sm mr-1">refresh</span>
                  )}
                  {(['instant', 'digest_daily', 'off'] as const).map(opt => (
                    <button
                      key={opt}
                      disabled={isSaving}
                      onClick={() => updateNotifPref(pref.notificationType, opt)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors border ${
                        pref.delivery === opt
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary hover:text-primary'
                      }`}
                    >
                      {opt === 'instant' ? 'Instant' : opt === 'digest_daily' ? 'Daily Digest' : 'Off'}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
