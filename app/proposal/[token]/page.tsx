'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Section {
  id: string;
  type: 'heading' | 'text' | 'image' | 'divider' | 'pricing' | 'terms' | 'signature';
  content: string;
}

interface LineItem {
  id: string;
  description: string;
  details: string;
  qty: number;
  unitPrice: number;
  optional: boolean;
}

interface Fee {
  id: string;
  label: string;
  type: 'flat' | 'percent';
  amount: number;
}

interface Proposal {
  id: number;
  title: string;
  summary: string | null;
  status: string;
  sections: Section[];
  lineItems: LineItem[];
  fees: Fee[];
  currency: string;
  validUntil: string | null;
  signatureName: string | null;
  signedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  accentColor: string;
  logoUrl: string | null;
  coverImageUrl: string | null;
  footerText: string | null;
  sentAt: string | null;
  createdAt: string;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  companyName: string | null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/* ------------------------------------------------------------------ */
/*  Signature Canvas Component                                         */
/* ------------------------------------------------------------------ */

function SignatureCanvas({ onSave, accentColor }: { onSave: (dataUrl: string) => void; accentColor: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  function getPos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    setIsDrawing(true);
    lastPoint.current = getPos(e);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing || !lastPoint.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    lastPoint.current = pos;
    setHasDrawn(true);
  }

  function endDraw() {
    setIsDrawing(false);
    lastPoint.current = null;
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function saveSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/png'));
  }

  return (
    <div className="space-y-3">
      <div className="relative border-2 border-gray-300 rounded-lg bg-white overflow-hidden" style={{ touchAction: 'none' }}>
        <canvas
          ref={canvasRef}
          width={600}
          height={200}
          className="w-full cursor-crosshair"
          style={{ height: '150px' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasDrawn && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-gray-400 text-sm">Draw your signature here</p>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={clearCanvas}
          className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Clear
        </button>
        {hasDrawn && (
          <button
            type="button"
            onClick={saveSignature}
            className="px-3 py-1.5 text-sm text-white rounded-lg transition-colors"
            style={{ backgroundColor: accentColor }}
          >
            Use This Signature
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page Component                                                */
/* ------------------------------------------------------------------ */

export default function PublicProposalPage() {
  const { token } = useParams<{ token: string }>();

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Optional item selection
  const [selectedOptionals, setSelectedOptionals] = useState<Set<string>>(new Set());

  // Signature state
  const [signatureName, setSignatureName] = useState('');
  const [signatureData, setSignatureData] = useState('');
  const [accepting, setAccepting] = useState(false);

  // Decline state
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declining, setDeclining] = useState(false);

  const [actionError, setActionError] = useState('');

  const loadProposal = useCallback(async () => {
    const res = await fetch(`/api/proposals/${token}`);
    const d = await res.json();
    if (!d.success) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setProposal(d.data);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    loadProposal();
  }, [loadProposal]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mb-4" />
          <p className="text-gray-500 text-sm">Loading proposal...</p>
        </div>
      </div>
    );
  }

  if (notFound || !proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Proposal Not Found</h1>
          <p className="text-gray-500 text-sm">This proposal may have been removed or the link is invalid.</p>
        </div>
      </div>
    );
  }

  const accent = proposal.accentColor || '#2563eb';
  const sectionsList: Section[] = Array.isArray(proposal.sections) ? proposal.sections : [];
  const allLineItems: LineItem[] = Array.isArray(proposal.lineItems) ? proposal.lineItems : [];
  const allFees: Fee[] = Array.isArray(proposal.fees) ? proposal.fees : [];

  const requiredItems = allLineItems.filter(li => !li.optional);
  const optionalItems = allLineItems.filter(li => li.optional);

  const requiredSubtotal = requiredItems.reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
  const optionalSubtotal = optionalItems
    .filter(li => selectedOptionals.has(li.id))
    .reduce((sum, li) => sum + li.qty * li.unitPrice, 0);
  const subtotal = requiredSubtotal + optionalSubtotal;

  const computedFees = allFees.map(f => ({
    ...f,
    computed: f.type === 'flat' ? f.amount : Math.round(subtotal * f.amount / 100),
  }));
  const feesTotal = computedFees.reduce((sum, f) => sum + f.computed, 0);
  const grandTotal = subtotal + feesTotal;

  const contactName = [proposal.contactFirstName, proposal.contactLastName].filter(Boolean).join(' ');
  const isExpired = proposal.validUntil && new Date(proposal.validUntil) < new Date();
  const daysLeft = proposal.validUntil ? daysUntil(proposal.validUntil) : null;
  const canAct = proposal.status !== 'accepted' && proposal.status !== 'declined' && proposal.status !== 'expired' && !isExpired;

  function toggleOptional(itemId: string) {
    setSelectedOptionals(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  async function handleAccept() {
    if (!signatureName.trim()) {
      setActionError('Please enter your full name.');
      return;
    }
    if (!signatureData) {
      setActionError('Please draw your signature.');
      return;
    }
    setAccepting(true);
    setActionError('');
    const res = await fetch(`/api/proposals/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'accept', signatureName: signatureName.trim(), signatureData }),
    });
    const d = await res.json();
    setAccepting(false);
    if (!d.success) {
      setActionError(d.message ?? 'Failed to accept proposal.');
      return;
    }
    loadProposal();
  }

  async function handleDecline() {
    setDeclining(true);
    setActionError('');
    const res = await fetch(`/api/proposals/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decline', reason: declineReason.trim() || null }),
    });
    const d = await res.json();
    setDeclining(false);
    if (!d.success) {
      setActionError(d.message ?? 'Failed to decline proposal.');
      return;
    }
    setShowDeclineModal(false);
    loadProposal();
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Status Banners */}
      {proposal.status === 'accepted' && (
        <div className="bg-green-600 text-white">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-2 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              This proposal was accepted on{' '}
              {proposal.acceptedAt ? new Date(proposal.acceptedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
              {proposal.signatureName ? ` by ${proposal.signatureName}` : ''}
            </span>
          </div>
        </div>
      )}
      {proposal.status === 'declined' && (
        <div className="bg-red-600 text-white">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-2 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>
              This proposal was declined on{' '}
              {proposal.declinedAt ? new Date(proposal.declinedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
            </span>
          </div>
        </div>
      )}
      {(proposal.status === 'expired' || isExpired) && proposal.status !== 'accepted' && proposal.status !== 'declined' && (
        <div className="bg-gray-600 text-white">
          <div className="max-w-4xl mx-auto px-6 py-3 flex items-center gap-2 text-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>This proposal has expired.</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Header */}
        <header className="mb-10">
          {proposal.logoUrl && (
            <img src={proposal.logoUrl} alt="Company logo" className="h-12 object-contain mb-6" />
          )}
          {proposal.coverImageUrl && (
            <div className="mb-8 rounded-xl overflow-hidden shadow-sm">
              <img src={proposal.coverImageUrl} alt="Cover" className="w-full h-64 object-cover" />
            </div>
          )}
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4" style={{ color: accent }}>
            {proposal.title}
          </h1>
          {proposal.summary && (
            <p className="text-lg text-gray-600 leading-relaxed mb-4">{proposal.summary}</p>
          )}
          {(contactName || proposal.companyName) && (
            <p className="text-sm text-gray-500">
              Prepared for{' '}
              <span className="font-medium text-gray-700">{contactName}</span>
              {contactName && proposal.companyName ? ' at ' : ''}
              {proposal.companyName && <span className="font-medium text-gray-700">{proposal.companyName}</span>}
            </p>
          )}
          {proposal.validUntil && !isExpired && proposal.status !== 'accepted' && proposal.status !== 'declined' && (
            <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              daysLeft !== null && daysLeft <= 7
                ? 'bg-yellow-100 text-yellow-800'
                : 'bg-gray-100 text-gray-600'
            }`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Valid until {new Date(proposal.validUntil).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              {daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining)`}
            </div>
          )}
        </header>

        {/* Sections */}
        <div className="space-y-8">
          {sectionsList.map(section => (
            <div key={section.id}>
              {section.type === 'heading' && section.content && (
                <h2 className="text-2xl font-bold text-gray-900" style={{ color: accent }}>
                  {section.content}
                </h2>
              )}
              {section.type === 'text' && (
                <div
                  className="prose prose-gray max-w-none text-gray-700 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: section.content }}
                />
              )}
              {section.type === 'image' && section.content && (
                <div className="rounded-xl overflow-hidden shadow-sm">
                  <img src={section.content} alt="" className="w-full" />
                </div>
              )}
              {section.type === 'divider' && (
                <hr className="border-t-2" style={{ borderColor: accent, opacity: 0.2 }} />
              )}
              {section.type === 'pricing' && allLineItems.length > 0 && (
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm">
                  <div className="px-6 py-4 border-b border-gray-200" style={{ backgroundColor: accent + '0a' }}>
                    <h3 className="text-lg font-semibold text-gray-900">Pricing</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
                          <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Price</th>
                          <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requiredItems.map(li => (
                          <tr key={li.id} className="border-b border-gray-100">
                            <td className="px-6 py-4">
                              <div className="font-medium text-gray-900">{li.description}</div>
                              {li.details && <div className="text-sm text-gray-500 mt-0.5">{li.details}</div>}
                            </td>
                            <td className="px-6 py-4 text-right text-gray-700">{li.qty}</td>
                            <td className="px-6 py-4 text-right text-gray-700">{fmtCurrency(li.unitPrice)}</td>
                            <td className="px-6 py-4 text-right font-medium text-gray-900">{fmtCurrency(li.qty * li.unitPrice)}</td>
                          </tr>
                        ))}
                        {optionalItems.length > 0 && (
                          <>
                            <tr>
                              <td colSpan={4} className="px-6 py-3 bg-gray-50">
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Optional Items</span>
                              </td>
                            </tr>
                            {optionalItems.map(li => (
                              <tr key={li.id} className="border-b border-gray-100">
                                <td className="px-6 py-4">
                                  <div className="flex items-start gap-3">
                                    {canAct && (
                                      <input
                                        type="checkbox"
                                        checked={selectedOptionals.has(li.id)}
                                        onChange={() => toggleOptional(li.id)}
                                        className="mt-1 w-4 h-4 rounded border-gray-300 cursor-pointer"
                                        style={{ accentColor: accent }}
                                      />
                                    )}
                                    <div>
                                      <div className="font-medium text-gray-900">{li.description}</div>
                                      {li.details && <div className="text-sm text-gray-500 mt-0.5">{li.details}</div>}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-right text-gray-700">{li.qty}</td>
                                <td className="px-6 py-4 text-right text-gray-700">{fmtCurrency(li.unitPrice)}</td>
                                <td className="px-6 py-4 text-right font-medium text-gray-700">
                                  {selectedOptionals.has(li.id) ? fmtCurrency(li.qty * li.unitPrice) : (
                                    <span className="text-gray-400">{fmtCurrency(li.qty * li.unitPrice)}</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-200">
                          <td colSpan={3} className="px-6 py-3 text-right text-sm text-gray-600">Subtotal</td>
                          <td className="px-6 py-3 text-right font-medium text-gray-900">{fmtCurrency(subtotal)}</td>
                        </tr>
                        {computedFees.map(f => (
                          <tr key={f.id}>
                            <td colSpan={3} className="px-6 py-2 text-right text-sm text-gray-600">
                              {f.label || 'Fee'}{f.type === 'percent' ? ` (${f.amount}%)` : ''}
                            </td>
                            <td className="px-6 py-2 text-right text-gray-900">{fmtCurrency(f.computed)}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-gray-300">
                          <td colSpan={3} className="px-6 py-4 text-right text-base font-bold text-gray-900">Total</td>
                          <td className="px-6 py-4 text-right text-xl font-bold" style={{ color: accent }}>{fmtCurrency(grandTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
              {section.type === 'terms' && section.content && (
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-3">Terms &amp; Conditions</h3>
                  <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{section.content}</div>
                </div>
              )}
              {section.type === 'signature' && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
                  {proposal.status === 'accepted' && proposal.signatureName ? (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Signature</h3>
                      <div className="flex items-center gap-2 text-green-600 text-sm">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Signed by {proposal.signatureName}
                        {proposal.signedAt && (
                          <span className="text-gray-500 ml-1">
                            on {new Date(proposal.signedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : canAct ? (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900">Accept &amp; Sign</h3>
                      <p className="text-sm text-gray-600">
                        By signing below, you agree to the terms outlined in this proposal.
                      </p>

                      {actionError && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {actionError}
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
                        <input
                          value={signatureName}
                          onChange={e => setSignatureName(e.target.value)}
                          placeholder="Enter your full name"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:border-transparent"
                          style={{ '--tw-ring-color': accent } as React.CSSProperties}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">Signature</label>
                        {signatureData ? (
                          <div className="space-y-2">
                            <div className="border border-gray-200 rounded-lg p-2 bg-white">
                              <img src={signatureData} alt="Your signature" className="max-h-24" />
                            </div>
                            <button
                              type="button"
                              onClick={() => setSignatureData('')}
                              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                            >
                              Re-draw signature
                            </button>
                          </div>
                        ) : (
                          <SignatureCanvas onSave={setSignatureData} accentColor={accent} />
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button
                          onClick={handleAccept}
                          disabled={accepting}
                          className="flex-1 py-3 px-6 rounded-lg text-white font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: accent }}
                        >
                          {accepting ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Accepting...
                            </span>
                          ) : (
                            'Accept Proposal'
                          )}
                        </button>
                        <button
                          onClick={() => setShowDeclineModal(true)}
                          className="py-3 px-6 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      {proposal.status === 'declined' ? 'This proposal was declined.' : 'This proposal is no longer available for signing.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* If no signature section exists but proposal can be acted on, show action buttons */}
        {canAct && !sectionsList.some(s => s.type === 'signature') && (
          <div className="mt-10 bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Accept &amp; Sign</h3>
            <p className="text-sm text-gray-600">
              By signing below, you agree to the terms outlined in this proposal.
            </p>

            {actionError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {actionError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
              <input
                value={signatureName}
                onChange={e => setSignatureName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': accent } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Signature</label>
              {signatureData ? (
                <div className="space-y-2">
                  <div className="border border-gray-200 rounded-lg p-2 bg-white">
                    <img src={signatureData} alt="Your signature" className="max-h-24" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignatureData('')}
                    className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    Re-draw signature
                  </button>
                </div>
              ) : (
                <SignatureCanvas onSave={setSignatureData} accentColor={accent} />
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="flex-1 py-3 px-6 rounded-lg text-white font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: accent }}
              >
                {accepting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Accepting...
                  </span>
                ) : (
                  'Accept Proposal'
                )}
              </button>
              <button
                onClick={() => setShowDeclineModal(true)}
                className="py-3 px-6 rounded-lg border border-gray-300 text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {proposal.footerText && (
          <footer className="mt-12 pt-6 border-t border-gray-200">
            <p className="text-sm text-gray-500 italic">{proposal.footerText}</p>
          </footer>
        )}

        {/* Bottom padding */}
        <div className="h-16" />
      </div>

      {/* Decline Modal */}
      {showDeclineModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full shadow-xl space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Decline Proposal</h3>
            <p className="text-sm text-gray-600">
              Are you sure you want to decline this proposal? You can optionally provide a reason.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Reason (optional)</label>
              <textarea
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                rows={3}
                placeholder="Let us know why you are declining..."
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeclineModal(false)}
                className="px-4 py-2.5 text-sm text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDecline}
                disabled={declining}
                className="px-6 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {declining ? 'Declining...' : 'Decline Proposal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
