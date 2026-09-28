// Sanchayapatra slab rates. Kept free of imports: the SP preview runs in the browser.

/**
 * Slab-based rates: a holder's first ৳7.5 lakh across all schemes earns the scheme's rate;
 * anything beyond earns a slightly lower one. One certificate can straddle the slab — with
 * ৳3 lakh already invested, a new ৳7 lakh earns the higher rate on ৳4.5 lakh and the lower
 * rate on ৳2.5 lakh.
 */
const RATE_SLAB_LIMIT = 750000;

export interface SlabSplit {
  /** The part of the principal above the slab, earning `slabRate`. */
  slabAmount: number;
  /** The single rate that earns the same profit as the two parts together. */
  blendedRate: number;
}

/**
 * Splits a new certificate at the slab, given what the holder had already invested. Profit
 * is linear in principal, so the blended rate reproduces the two-rate profit exactly.
 */
export function splitAtSlab(principal: number, investedBefore: number, baseRate: number, slabRate: number): SlabSplit {
  if (principal <= 0) return { slabAmount: 0, blendedRate: baseRate };
  const roomBelow = Math.max(RATE_SLAB_LIMIT - Math.max(investedBefore, 0), 0);
  const slabAmount = Math.max(principal - roomBelow, 0);
  const blended = ((principal - slabAmount) * baseRate + slabAmount * slabRate) / principal;
  return { slabAmount, blendedRate: Number(blended.toFixed(12)) };
}

/** The rate below the slab, recovered from a saved blended rate (for the edit form). */
export function baseRateOf(principal: number, blendedRate: number, slabAmount: number, slabRate: number): number {
  const below = principal - slabAmount;
  if (below <= 0) return slabRate;
  return Number(((principal * blendedRate - slabAmount * slabRate) / below).toFixed(6));
}
