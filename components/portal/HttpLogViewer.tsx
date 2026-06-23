'use client';

import { useCallback, useEffect, useState } from 'react';

interface HttpLog {
  id: number;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userAgent: string | null;
  ip: string | null;
  country: string | null;
  createdAt: string;
}

function statusColor(code: number) {
  if (code >= 500) return 'text-red-400';
  if (code >= 400) return 'text-amber-400';
  if (code >= 300) return 'text-blue-400';
  if (code >= 200) return 'text-green-400';
  return 'text-[#c9d1d9]';
}

function methodColor(method: string) {
  switch (method) {
    case 'GET': return 'text-green-400';
    case 'POST': return 'text-blue-400';
    case 'PUT': case 'PATCH': return 'text-amber-400';
    case 'DELETE': return 'text-red-400';
    default: return 'text-[#c9d1d9]';
  }
}

export default function HttpLogViewer({ siteId }: { siteId: number }) {
  const [logs, setLogs] = useState<HttpLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filter, setFilter] = useState<'all' | 'errors'>('all');

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/portal/websites/${siteId}/logs?limit=100`);
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
        setError('');
      } else {
        setError(json.message);
      }
    } catch {
      setError('Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const filteredLogs = filter === 'errors'
    ? logs.filter((l) => l.statusCode >= 400)
    : logs;

  const errorCount = logs.filter((l) => l.statusCode >= 400).length;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="material-icons text-muted-foreground text-lg">monitoring</span>
          <h3 className="font-semibold text-sm text-foreground">HTTP Logs</h3>
        </div>
        <div className="flex items-center gap-2">
          {errorCount > 0 && (
            <button
              onClick={() => setFilter(filter === 'errors' ? 'all' : 'errors')}
              className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-md transition-colors ${
                filter === 'errors'
                  ? 'bg-red-500/10 text-red-600'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-sm">error</span>
              {errorCount}
            </button>
          )}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors ${
              autoRefresh
                ? 'bg-green-500/10 text-green-600'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className={`material-icons text-sm ${autoRefresh ? 'animate-spin' : ''}`}>
              {autoRefresh ? 'sync' : 'sync_disabled'}
            </span>
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <span className={`material-icons text-sm ${loading ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>
      </div>

      {error && <p className="px-5 py-3 text-sm text-red-600">{error}</p>}

      {loading && logs.length === 0 ? (
        <div className="px-5 py-8 flex items-center justify-center text-muted-foreground">
          <span className="material-icons animate-spin text-lg mr-2">refresh</span>
          <span className="text-sm">Loading...</span>
        </div>
      ) : filteredLogs.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-muted-foreground">
          {filter === 'errors' ? 'No errors.' : 'No HTTP requests logged yet. Logs will appear once your site receives traffic.'}
        </p>
      ) : (
        <div className="bg-[#0d1117] max-h-96 overflow-y-auto">
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-[#161b22] text-[#8b949e]">
              <tr>
                <th className="px-3 py-2 text-left">Time</th>
                <th className="px-3 py-2 text-left">Method</th>
                <th className="px-3 py-2 text-left">Path</th>
                <th className="px-3 py-2 text-right">Status</th>
                <th className="px-3 py-2 text-right">Duration</th>
                <th className="px-3 py-2 text-left">Country</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262d]">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-[#161b22] transition-colors">
                  <td className="px-3 py-1.5 text-[#8b949e] whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleTimeString()}
                  </td>
                  <td className={`px-3 py-1.5 font-semibold ${methodColor(log.method)}`}>
                    {log.method}
                  </td>
                  <td className="px-3 py-1.5 text-[#c9d1d9] max-w-xs truncate" title={log.path}>
                    {log.path}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-semibold ${statusColor(log.statusCode)}`}>
                    {log.statusCode}
                  </td>
                  <td className="px-3 py-1.5 text-right text-[#8b949e]">
                    {log.duration > 0 ? `${log.duration}ms` : '-'}
                  </td>
                  <td className="px-3 py-1.5 text-[#8b949e]">
                    {log.country || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
