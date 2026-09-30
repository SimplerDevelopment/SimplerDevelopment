/**
 * PUX-208 (design doc screen 72): two numbers, not one. Outstanding is the
 * liability still on active certificates; redeemed is what has been spent —
 * initial minus remaining on anything that was ever active. Both come from
 * the columns gift_certificates already carries (cents).
 */
export function giftTotals(certs: { status: string; initialAmount: number; remainingAmount: number }[]) {
  let outstanding = 0; let redeemed = 0;
  for (const c of certs) {
    if (c.status === 'active') outstanding += c.remainingAmount;
    if (c.status === 'active' || c.status === 'fully_redeemed') redeemed += c.initialAmount - c.remainingAmount;
  }
  return { issued: certs.length, outstanding, redeemed };
}
