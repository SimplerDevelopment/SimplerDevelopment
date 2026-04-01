'use client';

import { useEffect, useState, useRef, use } from 'react';

interface ContractClause {
  id: string;
  title: string;
  content: string;
  required: boolean;
}

interface LineItem {
  id: string;
  description: string;
  details?: string;
  quantity: number;
  unitPrice: number;
  optional?: boolean;
}

interface Fee {
  label: string;
  type: 'flat' | 'percent';
  amount: number;
}

interface SignerInfo {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  signedAt: string | null;
}

interface ContractData {
  title: string;
  summary: string | null;
  clauses: ContractClause[];
  lineItems: LineItem[];
  fees: Fee[];
  currency: string;
  accentColor: string;
  logoUrl: string | null;
  footerText: string | null;
  status: string;
  companyName: string;
  signer: SignerInfo;
  allSigners: SignerInfo[];
}

function formatCents(cents: number): string {
  return '$' + (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ContractSigningPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [contract, setContract] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Signing state
  const [sigName, setSigName] = useState('');
  const [sigData, setSigData] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [acceptedClauses, setAcceptedClauses] = useState<Set<string>>(new Set());

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    fetch(`/api/contracts/${token}`)
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setContract(res.data);
          if (res.data.signer.status === 'signed') setSigned(true);
          if (res.data.signer.status === 'declined') setDeclined(true);
        } else {
          setError(res.message || 'Contract not found');
        }
      })
      .catch(() => setError('Failed to load contract'))
      .finally(() => setLoading(false));
  }, [token]);

  // Canvas drawing handlers
  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    isDrawingRef.current = true;
    lastPosRef.current = getCanvasPos(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    const pos = getCanvasPos(e);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPosRef.current = pos;
  };

  const stopDrawing = () => { isDrawingRef.current = false; };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
    setSigData('');
  };

  const saveSignature = () => {
    if (!canvasRef.current) return;
    setSigData(canvasRef.current.toDataURL('image/png'));
  };

  const handleSign = async () => {
    if (!sigName.trim() || !sigData) return;

    // Check required clauses
    const requiredClauses = contract?.clauses.filter(c => c.required) || [];
    const allAccepted = requiredClauses.every(c => acceptedClauses.has(c.id));
    if (!allAccepted) {
      alert('Please accept all required clauses before signing.');
      return;
    }

    setSigning(true);
    try {
      const res = await fetch(`/api/contracts/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sign', signatureName: sigName, signatureData: sigData }),
      });
      const data = await res.json();
      if (data.success) {
        setSigned(true);
        // Reload to show updated status
        const reload = await fetch(`/api/contracts/${token}`);
        const reloadData = await reload.json();
        if (reloadData.success) setContract(reloadData.data);
      }
    } finally { setSigning(false); }
  };

  const handleDecline = async () => {
    const res = await fetch(`/api/contracts/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decline', reason: declineReason }),
    });
    const data = await res.json();
    if (data.success) {
      setDeclined(true);
      setShowDecline(false);
    }
  };

  const toggleClause = (id: string) => {
    setAcceptedClauses(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin text-4xl text-gray-400">&#9696;</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Contract Not Found</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!contract) return null;

  const subtotal = contract.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  let total = subtotal;
  for (const fee of contract.fees) {
    if (fee.type === 'flat') total += fee.amount;
    else total += Math.round(subtotal * fee.amount / 10000);
  }

  const accent = contract.accentColor || '#2563eb';
  const canSign = !signed && !declined && contract.signer.status !== 'signed' && contract.signer.status !== 'declined';

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Status banners */}
        {signed && (
          <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-center font-medium">
            You have signed this contract.
          </div>
        )}
        {declined && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-center font-medium">
            You have declined this contract.
          </div>
        )}
        {contract.status === 'fully_executed' && (
          <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-center font-medium">
            This contract is fully executed. All parties have signed.
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-6">
          <div className="p-8 border-b border-gray-100" style={{ borderBottomColor: accent }}>
            {contract.logoUrl && (
              <img src={contract.logoUrl} alt="" className="h-10 mb-4" />
            )}
            <p className="text-sm text-gray-500 mb-1">{contract.companyName}</p>
            <h1 className="text-2xl font-bold text-gray-900">{contract.title}</h1>
            {contract.summary && <p className="text-gray-600 mt-2">{contract.summary}</p>}
          </div>

          {/* Signers status */}
          <div className="p-6 bg-gray-50 border-b border-gray-100">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Signers</h3>
            <div className="space-y-2">
              {contract.allSigners.map(s => (
                <div key={s.id} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-800">{s.name}</span>
                    <span className="text-xs text-gray-500 ml-2">({s.role})</span>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    s.status === 'signed' ? 'bg-green-100 text-green-700'
                    : s.status === 'declined' ? 'bg-red-100 text-red-700'
                    : s.status === 'viewed' ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-500'
                  }`}>
                    {s.status === 'signed' ? 'Signed' : s.status === 'declined' ? 'Declined' : s.status === 'viewed' ? 'Viewed' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Clauses */}
          {contract.clauses.length > 0 && (
            <div className="p-8 space-y-6">
              {contract.clauses.map((clause, i) => (
                <div key={clause.id} className="border-b border-gray-100 pb-6 last:border-0 last:pb-0">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {i + 1}. {clause.title}
                  </h3>
                  <div className="text-gray-700 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: clause.content }} />
                  {clause.required && canSign && (
                    <label className="flex items-center gap-2 mt-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={acceptedClauses.has(clause.id)}
                        onChange={() => toggleClause(clause.id)}
                        className="w-4 h-4 rounded"
                        style={{ accentColor: accent }}
                      />
                      <span className="text-sm text-gray-600">I accept this clause</span>
                    </label>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pricing */}
          {contract.lineItems.length > 0 && (
            <div className="p-8 border-t border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="pb-2 font-medium text-gray-500">Item</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Qty</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Price</th>
                    <th className="pb-2 font-medium text-gray-500 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {contract.lineItems.map(item => (
                    <tr key={item.id} className="border-b border-gray-50">
                      <td className="py-2 text-gray-800">{item.description}</td>
                      <td className="py-2 text-gray-600 text-right">{item.quantity}</td>
                      <td className="py-2 text-gray-600 text-right">{formatCents(item.unitPrice)}</td>
                      <td className="py-2 text-gray-800 text-right font-medium">{formatCents(item.quantity * item.unitPrice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {contract.fees.map((fee, i) => (
                    <tr key={i}>
                      <td colSpan={3} className="pt-2 text-gray-600 text-right">{fee.label}</td>
                      <td className="pt-2 text-right font-medium">
                        {fee.type === 'flat' ? formatCents(fee.amount) : `${(fee.amount / 100).toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-gray-200">
                    <td colSpan={3} className="pt-3 text-right font-semibold text-gray-900">Total</td>
                    <td className="pt-3 text-right font-bold text-lg" style={{ color: accent }}>{formatCents(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Signature section */}
          {canSign && (
            <div className="p-8 border-t border-gray-100 space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Sign Contract</h3>

              <div>
                <label className="text-sm font-medium text-gray-700">Full Legal Name</label>
                <input
                  value={sigName}
                  onChange={e => setSigName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Signature</label>
                <div className="mt-1 border border-gray-300 rounded-lg overflow-hidden bg-white">
                  <canvas
                    ref={canvasRef}
                    width={600}
                    height={200}
                    style={{ width: '100%', height: 150, cursor: 'crosshair', touchAction: 'none' }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                <div className="flex gap-3 mt-2">
                  <button onClick={clearCanvas} className="text-xs text-gray-500 hover:text-gray-700">Clear</button>
                  <button onClick={saveSignature} className="text-xs font-medium" style={{ color: accent }}>
                    Use This Signature
                  </button>
                </div>
                {sigData && <p className="text-xs text-green-600 mt-1">Signature captured</p>}
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={handleSign}
                  disabled={signing || !sigName.trim() || !sigData}
                  className="px-6 py-3 rounded-lg text-white font-medium text-sm disabled:opacity-50"
                  style={{ backgroundColor: accent }}
                >
                  {signing ? 'Signing...' : 'Sign Contract'}
                </button>
                <button
                  onClick={() => setShowDecline(true)}
                  className="px-4 py-3 text-sm text-gray-500 hover:text-red-600"
                >
                  Decline
                </button>
              </div>

              <p className="text-xs text-gray-400">
                By signing, you agree to be bound by the terms of this contract.
                Your signature, name, IP address, and timestamp will be recorded.
              </p>
            </div>
          )}

          {/* Footer */}
          {contract.footerText && (
            <div className="p-6 bg-gray-50 border-t border-gray-100 text-center text-xs text-gray-400">
              {contract.footerText}
            </div>
          )}
        </div>

        {/* Decline modal */}
        {showDecline && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4">
              <h3 className="text-lg font-semibold">Decline Contract</h3>
              <p className="text-sm text-gray-600">Are you sure you want to decline this contract?</p>
              <textarea
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                placeholder="Reason for declining (optional)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500/40"
              />
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowDecline(false)} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
                <button onClick={handleDecline} className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700">
                  Decline Contract
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
