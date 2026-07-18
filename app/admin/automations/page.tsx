'use client';

import { useState, useEffect } from 'react';

interface AutomationRule {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  executionCount: number;
  lastExecutedAt: string | null;
  source: string;
  productScope: string | null;
  createdAt: string;
  company: string | null;
  clientName: string;
}

interface AutomationLog {
  id: number;
  triggerEvent: string;
  status: string;
  duration: number | null;
  errorMessage: string | null;
  createdAt: string;
  ruleName: string;
  company: string | null;
  clientName: string;
}

interface Stats {
  totalRules: number;
  enabledRules: number;
  totalExecutions: number;
  failedCount: number;
}

function sourceBadge(source: string) {
  const colors: Record<string, string> = {
    nlp: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    settings: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    manual: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[source] ?? colors.manual}`}>
      {source}
    </span>
  );
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    partial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? colors.failed}`}>
      {status}
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AdminAutomationsPage() {
  const [tab, setTab] = useState<'rules' | 'logs'>('rules');
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [stats, setStats] = useState<Stats>({ totalRules: 0, enabledRules: 0, totalExecutions: 0, failedCount: 0 });
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilter, setLogFilter] = useState('all');
  const [toggling, setToggling] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/portal/automations')
      .then(r => r.json())
      .then(d => {
        setRules(d.data ?? []);
        setStats(d.stats ?? { totalRules: 0, enabledRules: 0, totalExecutions: 0, failedCount: 0 });
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (tab !== 'logs') return;
    setLogsLoading(true);
    const params = logFilter !== 'all' ? `?status=${logFilter}` : '';
    fetch(`/api/admin/portal/automations/logs${params}`)
      .then(r => r.json())
      .then(d => { setLogs(d.data ?? []); setLogsLoading(false); });
  }, [tab, logFilter]);

  async function toggleRule(id: number, enabled: boolean) {
    setToggling(id);
    const res = await fetch('/api/admin/portal/automations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled: !enabled }),
    });
    const data = await res.json();
    if (data.success) {
      setRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !enabled } : r));
      setStats(prev => ({
        ...prev,
        enabledRules: prev.enabledRules + (enabled ? -1 : 1),
      }));
    }
    setToggling(null);
  }

  const statCards = [
    { label: 'Total Rules', value: stats.totalRules, icon: 'rule' },
    { label: 'Active Rules', value: stats.enabledRules, icon: 'toggle_on' },
    { label: 'Total Executions', value: stats.totalExecutions, icon: 'play_circle' },
    { label: 'Failed Runs', value: stats.failedCount, icon: 'error_outline' },
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Automations</h1>
          <p className="text-muted-foreground mt-1">Manage automation rules and view execution logs.</p>
        </div>
        <div className="flex items-center gap-2">
          {(['rules', 'logs'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
              }`}
            >
              {t === 'rules' ? 'Rules' : 'Logs'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'rules' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map(c => (
              <div key={c.label} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <span className="material-icons text-2xl text-muted-foreground">{c.icon}</span>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{c.value}</p>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <span className="material-icons animate-spin text-3xl">autorenew</span>
              <p className="mt-2">Loading rules...</p>
            </div>
          ) : rules.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <span className="material-icons text-5xl text-muted-foreground">smart_toy</span>
              <h3 className="mt-4 font-semibold text-foreground">No automation rules</h3>
              <p className="text-muted-foreground mt-1 text-sm">Rules will appear here once clients create automations.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Source</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Executions</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Run</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rules.map(rule => (
                    <tr key={rule.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{rule.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{rule.company ?? rule.clientName}</td>
                      <td className="px-4 py-3">{sourceBadge(rule.source)}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleRule(rule.id, rule.enabled)}
                          disabled={toggling === rule.id}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                            rule.enabled
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }`}
                        >
                          <span className="material-icons text-sm">
                            {toggling === rule.id ? 'autorenew' : rule.enabled ? 'toggle_on' : 'toggle_off'}
                          </span>
                          {rule.enabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{rule.executionCount}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(rule.lastExecutedAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate" title={rule.description ?? ''}>
                        {rule.description ?? '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'logs' && (
        <>
          <div className="flex items-center gap-2">
            {['all', 'success', 'partial', 'failed'].map(s => (
              <button
                key={s}
                onClick={() => setLogFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  logFilter === s ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {logsLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <span className="material-icons animate-spin text-3xl">autorenew</span>
              <p className="mt-2">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-12 text-center">
              <span className="material-icons text-5xl text-muted-foreground">receipt_long</span>
              <h3 className="mt-4 font-semibold text-foreground">No logs found</h3>
              <p className="text-muted-foreground mt-1 text-sm">Execution logs will appear here after automations run.</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Rule Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Client</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Trigger Event</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Duration</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map(log => (
                    <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{formatDate(log.createdAt)}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{log.ruleName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{log.company ?? log.clientName}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{log.triggerEvent}</td>
                      <td className="px-4 py-3">{statusBadge(log.status)}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{log.duration != null ? `${log.duration}ms` : '--'}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate" title={log.errorMessage ?? ''}>
                        {log.errorMessage ?? '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
