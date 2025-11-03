/*
client/src/logic/quoteCalculator.test.js
---
NEW FILE:
- Implements Task 2 of Phase 2.2 (Audit).
- Uses Jest to create unit tests for the core business logic.
- Mocks config data, quote data, and client choices.
- Tests `calculateSubscription` for correct fee calculation.
- Tests `generatePaymentSchedule` for:
    1. Correct setup fee.
    2. Correct monthly payments (discounted).
    3. Correct "full rate" payments after discount duration expires.
    4. Correct "perpetual" discount logic when duration is 0.
*/

// Import the functions to be tested
import {
  calculateSubscription,
  generatePaymentSchedule,
} from './quoteCalculator';

// Mock the date-fns library
// This ensures our tests run in a consistent "time"
const mockDateFns = {
  addMonths: (date, num) =>
    new Date(date.getFullYear(), date.getMonth() + num, 1),
  startOfMonth: (date) => new Date(date.getFullYear(), date.getMonth(), 1),
  // --- [THE FIX] ---
  // The simple `new Date(dateStr)` mock was the bug.
  // `new Date('2025-01')` is ambiguous and can parse as Dec 31st 2024
  // in certain timezones, causing an off-by-one error.
  // This new mock explicitly handles the 'yyyy-MM' format.
  parse: (dateStr, formatStr) => {
    if (formatStr === 'yyyy-MM') {
      const [year, month] = dateStr.split('-').map(Number);
      return new Date(year, month - 1, 1); // month is 0-indexed
    }
    return new Date(dateStr);
  },
  // --- END FIX ---
  isValid: () => true,
  getMonth: (date) => date.getMonth(), // 0-indexed
  format: (date, formatStr) => {
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    if (formatStr === 'MMM yyyy') {
      const year = date.getFullYear();
      const monthName = date.toLocaleString('default', { month: 'short' });
      return `${monthName} ${year}`;
    }
    return `${date.getFullYear()}-${month}`;
  },
  isAfter: (date1, date2) => date1 > date2,
  isBefore: (date1, date2) => date1 < date2,
  // This must be 0-indexed (e.g., Jan vs Jan = 0)
  differenceInCalendarMonths: (date1, date2) => {
    return (
      (date1.getFullYear() - date2.getFullYear()) * 12 +
      (date1.getMonth() - date2.getMonth())
    );
  },
  addYears: (date, num) =>
    new Date(date.getFullYear() + num, date.getMonth(), 1),
  isSameDay: (date1, date2) => date1.getTime() === date2.getTime(),
};

// --- MOCK DATA ---
// This is a simplified version of our config/main document
const mockConfigData = {
  base_rates: {
    hourly_rate: 100,
  },
  models: {
    subscription: {
      display_name: 'Subscription',
      tiers: {
        growth: {
          name: 'Growth',
          monthly_rate: 150,
          features_list: ['Feature 1', 'Feature 2'],
        },
      },
      payment_options: {
        split_pay: {
          name: 'Split Pay',
          setup_fee_percent_of_build: 50,
        },
      },
    },
  },
};

// This is a mock quote document
const mockLockedVars = {
  hours: 100, // 100 hours * $100/hr = $10,000
  buffer: 20, // $10,000 * 1.2 = $12,000 total build cost
  discountPct: 10, // 10% discount
  discountUsd: 0,
  discountDurationMonths: 12, // Discount lasts for 12 months
  amortStartMonth: '2025-01',
  paymentScheduleYears: 2,
  billingSchedule: 'standard',
};

// This is the client's selection
const mockClientChoices = {
  tier: 'growth',
  paymentPlan: 'split_pay',
  amortizationTerm: 24, // 24 months
};

// --- JEST TESTS ---

describe('calculateSubscription', () => {
  it('should calculate all subscription fees correctly', () => {
    /*
     * CALCULATION LOGIC:
     * 1. Total Build Cost: 100 hours * $100/hr * 1.2 buffer = $12,000
     * 2. Setup Fee (50%): $12,000 * 0.5 = $6,000
     * - Discount (10%): $6,000 * 0.1 = $600
     * - Final Setup Fee: $6,000 - $600 = $5,400
     * 3. Remaining Build Cost: $12,000 - $6,000 = $6,000
     * 4. Amortized Monthly (over 24mo): $6,000 / 24 = $250
     * - Discount (10%): $250 * 0.1 = $25
     * - Final Amortized Monthly: $250 - $25 = $225
     * 5. Tier Monthly: $150
     * - Discount (10%): $150 * 0.1 = $15
     * - Final Tier Monthly: $150 - $15 = $135
     * 6. Total Monthly: $225 + $135 = $360
     */
    const fees = calculateSubscription(
      mockLockedVars,
      mockClientChoices,
      mockConfigData
    );

    expect(fees.setupFee).toBe(5400);
    expect(fees.amortizedMonthly).toBe(225);
    expect(fees.tierMonthly).toBe(135);
    expect(fees.totalActiveMonthly).toBe(360);
    expect(fees.amortizedMonthlyDiscountVal).toBe(25);
    expect(fees.tierMonthlyDiscountVal).toBe(15);
  });
});

describe('generatePaymentSchedule', () => {
  // Get the calculated fees first
  const fees = calculateSubscription(
    mockLockedVars,
    mockClientChoices,
    mockConfigData
  );

  // --- MOCK TODAY'S DATE ---
  // We mock 'new Date()' to always be Nov 2024
  // so the 'first payment month' (Jan 2025) is in the future.
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2024-11-01T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should generate a schedule with the correct discount and expiration', () => {
    const { schedule } = generatePaymentSchedule(
      mockLockedVars,
      fees,
      mockDateFns
    );

    // 1. Check Setup Fee
    expect(schedule[0].notes).toBe('Setup Fee (Build Cost Down Payment)');
    expect(schedule[0].amount).toBe(5400);

    // 2. Check a discounted month (Month 1: Jan 2025)
    // Dec 2024 (idx 0) is a gap month ("---")
    // Jan 2025 (idx 1) is the first payment
    const firstPayment = schedule.find((p) => p.date === 'Jan 2025');
    expect(firstPayment.amount).toBe(360); // $225 (amort) + $135 (tier)
    expect(firstPayment.notes).toContain('(Discounted)');

    // 3. Check the *last* discounted month (Month 12: Dec 2025)
    const lastDiscountedPayment = schedule.find((p) => p.date === 'Dec 2025');
    expect(lastDiscountedPayment.amount).toBe(360);
    expect(lastDiscountedPayment.notes).toContain('(Discounted)');

    // 4. Check the *first full-rate* month (Month 13: Jan 2026)
    // Discount duration was 12 months (0-11), so month 13 (idx 12) is full price.
    const firstFullPayment = schedule.find((p) => p.date === 'Jan 2026');
    const fullRate = 250 + 150; // Full amort + full tier
    expect(firstFullPayment.amount).toBe(fullRate);
    expect(firstFullPayment.notes).toContain('Build Pmt (Full Rate)');
    expect(firstFullPayment.notes).toContain('Tier Fee (Full Rate)');
    expect(firstFullPayment.notes).not.toContain('(Discounted)');
  });

  it('should apply discounts perpetually if duration is 0', () => {
    const perpetualDiscountVars = {
      ...mockLockedVars,
      discountDurationMonths: 0, // 0 = perpetual
    };

    const { schedule } = generatePaymentSchedule(
      perpetualDiscountVars,
      fees,
      mockDateFns
    );

    // Check the first payment month (Jan 2025)
    const firstPayment = schedule.find((p) => p.date === 'Jan 2025');
    expect(firstPayment.amount).toBe(360);
    expect(firstPayment.notes).toContain('(Discounted)');

    // Check a month *after* the old expiration (Jan 2026)
    const futurePayment = schedule.find((p) => p.date === 'Jan 2026');
    expect(futurePayment.amount).toBe(360); // Should still be 360
    expect(futurePayment.notes).toContain('(Discounted)');
    expect(futurePayment.notes).not.toContain('Full Rate');
  });
});
