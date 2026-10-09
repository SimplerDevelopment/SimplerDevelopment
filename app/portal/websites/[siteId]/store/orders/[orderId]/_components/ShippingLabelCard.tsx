'use client';
// Extracted verbatim from ../page.tsx for PUX-187 — the Shipping Label card
// (purchased-label state or rate-shopping state).

import { formatMoney } from '@/lib/utils/money';
import { pBtnPrimary, pBtnGhost, pBtnSoft, pCard, pSectionTitle } from '@/components/portal/portal-ui';
import type { Order, RateQuote, ParcelSummary } from './types';

interface ShippingLabelCardProps {
  order: Order;
  labelError: string;
  rates: RateQuote[] | null;
  parcelSummary: ParcelSummary | null;
  selectedRateId: string;
  setSelectedRateId: (id: string) => void;
  ratesLoading: boolean;
  labelBuying: boolean;
  labelRefunding: boolean;
  computeRates: () => void;
  buyLabel: () => void;
  refundLabel: () => void;
}

export default function ShippingLabelCard({
  order,
  labelError,
  rates,
  parcelSummary,
  selectedRateId,
  setSelectedRateId,
  ratesLoading,
  labelBuying,
  labelRefunding,
  computeRates,
  buyLabel,
  refundLabel,
}: ShippingLabelCardProps) {
  return (
    <div className={`${pCard} p-6 space-y-4`}>
      <h2 className={`${pSectionTitle} flex items-center gap-2`}>
        <span className="material-icons text-lg text-muted-foreground">label</span>
        Shipping Label
      </h2>

      {labelError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <span className="material-icons text-base">error</span>
          {labelError}
        </div>
      )}

      {order.labelUrl ? (
        /* State B — label purchased */
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {order.carrier && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Carrier</p>
                <p className="text-foreground">{order.carrier}</p>
              </div>
            )}
            {order.shippingMethod && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Service</p>
                <p className="text-foreground">{order.shippingMethod}</p>
              </div>
            )}
            {order.trackingNumber && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tracking</p>
                {order.trackingUrl ? (
                  <a
                    href={order.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-mono text-xs"
                  >
                    {order.trackingNumber}
                  </a>
                ) : (
                  <p className="text-foreground font-mono text-xs">{order.trackingNumber}</p>
                )}
              </div>
            )}
            {order.labelPurchasedAt && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Purchased</p>
                <p className="text-foreground">{new Date(order.labelPurchasedAt).toLocaleString()}</p>
              </div>
            )}
            {order.labelCostCents != null && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Label Cost</p>
                <p className="text-foreground">{formatMoney(order.labelCostCents)}</p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 pt-2">
            <a
              href={order.labelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">download</span>
              View Label
            </a>
            <button
              onClick={refundLabel}
              disabled={labelRefunding}
              className={pBtnGhost}
            >
              {labelRefunding ? (
                <span className="material-icons text-base animate-spin">refresh</span>
              ) : (
                <span className="material-icons text-base">cancel</span>
              )}
              Refund Label
            </button>
          </div>
        </div>
      ) : (
        /* State A — no label yet */
        <div className="space-y-4">
          {!rates && (
            <button
              onClick={computeRates}
              disabled={ratesLoading}
              className={pBtnPrimary}
            >
              {ratesLoading ? (
                <span className="material-icons text-base animate-spin">refresh</span>
              ) : (
                <span className="material-icons text-base">calculate</span>
              )}
              Compute Rates
            </button>
          )}

          {rates && parcelSummary && (
            <>
              <div className="text-xs text-muted-foreground bg-muted/30 px-3 py-2 rounded-xl">
                <span className="font-medium">Parcel:</span>{' '}
                {parcelSummary.lengthIn} × {parcelSummary.widthIn} × {parcelSummary.heightIn} in,{' '}
                {parcelSummary.weightOz} oz
              </div>

              {rates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No rates returned for this shipment.</p>
              ) : (
                <div className="space-y-2">
                  {rates.map((r, idx) => {
                    const isCheapest = idx === 0;
                    const checked = selectedRateId === r.id;
                    return (
                      <label
                        key={r.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/40'
                        }`}
                      >
                        <input
                          type="radio"
                          name="rate"
                          value={r.id}
                          checked={checked}
                          onChange={() => setSelectedRateId(r.id)}
                          className="accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">
                              {r.carrier} {r.service}
                            </p>
                            {isCheapest && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                <span className="material-icons text-[10px]">star</span>
                                Best value
                              </span>
                            )}
                          </div>
                          {r.estDeliveryDays != null && (
                            <p className="text-xs text-muted-foreground">
                              Est. {r.estDeliveryDays} day{r.estDeliveryDays === 1 ? '' : 's'}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-foreground tabular-nums">
                          ${(r.amountCents / 100).toFixed(2)}
                        </p>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={buyLabel}
                  disabled={labelBuying || !selectedRateId}
                  className={pBtnPrimary}
                >
                  {labelBuying ? (
                    <span className="material-icons text-base animate-spin">refresh</span>
                  ) : (
                    <span className="material-icons text-base">shopping_cart</span>
                  )}
                  Buy Label
                </button>
                <button
                  onClick={computeRates}
                  disabled={ratesLoading || labelBuying}
                  className={pBtnSoft}
                >
                  <span className="material-icons text-base">refresh</span>
                  Refresh rates
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
