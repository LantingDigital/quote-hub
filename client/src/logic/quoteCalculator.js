/*
 * The "Brain" of the quote calculator.
 * This file contains all the business logic for calculating a quote.
 *
 * V2: Ported from petes-holiday-lighting/quoteCalculator.js
 * This logic is designed to work with the data structure from config.json.
 * It requires the 'date-fns' library to be installed.
 *
 * MODIFIED:
 * - FIX (USER REQ 1.3): The "empty" return object for invalid
 * choices now includes `features: []` to prevent client-side crash
 * when accessing `calculatedFees.features.map`.
 * - FEAT (TASK 2.1.1): Updated `generatePaymentSchedule` to read
 * `discountDurationMonths` and stop applying discounts after the
 * specified number of months.
 * - [FIX (TASK 2.2.2)]:** Removed old `discountDuration` variable
 * and corrected `isDiscountActive` logic to use `durationInMonths`.
 * This fixes the unit test failure.
 * - **[FIX 5 (TASK 2.2.2)]:** Corrected variable scope and TYPO.
 * `tierDiscountVal` is now correctly `tierMonthlyDiscountVal`.
 */

/**
 * Helper to get a discount amount.
 * @param {number} subtotal - The subtotal to apply discount to.
 * @param {number} discountUsd - A flat USD discount.
 * @param {number} discountPct - A percentage discount.
 * @returns {number} The calculated discount amount.
 */
function getDiscountAmount(subtotal, discountUsd, discountPct) {
  if (discountUsd > 0) {
    return discountUsd;
  } else if (discountPct > 0) {
    if (subtotal === 0) return 0;
    return subtotal * (discountPct / 100.0);
  }
  return 0;
}

/**
 * Main function to calculate a "Project Buyout" quote.
 * @param {object} lockedVars - The quote-specific document (e.g., hours, buffer, discounts).
 * @param {object} config - The main config document (e.g., base_rates, models).
 * @returns {object} An object with all the final calculated values.
 */
export function calculateProject(lockedVars, config) {
  const baseRates = config.base_rates;
  const modelConfig = config.models.project;
  const exemptions = lockedVars.exemptions || [];

  const hours = lockedVars.hours || 0;
  const buffer = lockedVars.buffer / 100.0 || 0;
  const hourlyRate = baseRates.hourly_rate || 0;

  const subtotal = hours * hourlyRate * (1 + buffer);

  let discountVal = 0;
  if (!exemptions.includes('project')) {
    discountVal = getDiscountAmount(
      subtotal,
      lockedVars.discountUsd,
      lockedVars.discountPct
    );
  }
  const finalTotal = subtotal - discountVal;

  return {
    name: modelConfig.display_name,
    subtotal: subtotal,
    discountApplied: discountVal,
    totalCost: finalTotal,
    // Add other fields for consistency
    setupFee: finalTotal,
    totalActiveMonthly: 0,
    amortizationTerm: 0,
    tierMonthly: 0,
    amortizedMonthly: 0,
    features: [], // --- ADDED for safety ---
  };
}

/**
 * Main function to calculate a "Subscription" quote.
 * @param {object} lockedVars - The quote-specific document (e.g., hours, buffer, discounts).
 * @param {object} clientChoices - The client's selected tier, plan, and term.
 * @param {object} config - The main config document (e.g., base_rates, models).
 * @returns {object} An object with all the final calculated values.
 */
export function calculateSubscription(lockedVars, clientChoices, config) {
  const baseRates = config.base_rates;
  const modelConfig = config.models.subscription;

  const tierKey = clientChoices.tier; // e.g., "growth"
  const paymentKey = clientChoices.paymentPlan; // e.g., "split_pay"
  const amortizationTerm = clientChoices.amortizationTerm; // e.g., 12

  // Return empty if config isn't loaded
  if (!modelConfig || !baseRates) {
    return {
      name: 'Loading...',
      setupFee: 0,
      amortizedMonthly: 0,
      tierMonthly: 0,
      totalActiveMonthly: 0,
      amortizationTerm: 0,
      buyoutPrice: 0,
      features: [], // --- MODIFIED (USER REQ 1.3) ---
    };
  }

  const tierConfig = modelConfig.tiers[tierKey];
  const paymentConfig = modelConfig.payment_options[paymentKey];

  // If choices are invalid (e.g., on first load), return empty
  if (!tierConfig || !paymentConfig || !amortizationTerm) {
    return {
      name: 'Select options',
      setupFee: 0,
      amortizedMonthly: 0,
      tierMonthly: 0,
      totalActiveMonthly: 0,
      amortizationTerm: 0,
      buyoutPrice: 0,
      features: [], // --- MODIFIED (USER REQ 1.3) ---
    };
  }

  const exemptions = lockedVars.exemptions || [];
  const hours = lockedVars.hours || 0;
  const buffer = lockedVars.buffer / 100.0 || 0;
  const hourlyRate = baseRates.hourly_rate || 0;

  // --- 1. Build Cost (Use lockedVars) ---
  const totalBuildCost = hours * hourlyRate * (1 + buffer);

  // --- 2. Buyout Price ---
  const isSetupExempt = exemptions.includes('setup');
  const isAmortExempt = exemptions.includes('amortized');
  let buildDiscountVal = 0;
  if (!isSetupExempt && !isAmortExempt) {
    buildDiscountVal = getDiscountAmount(
      totalBuildCost,
      lockedVars.discountUsd,
      lockedVars.discountPct
    );
  }
  const finalBuildCostForBuyout = totalBuildCost - buildDiscountVal;

  // --- 3. Setup Fee ---
  const setupFeePercent = paymentConfig.setup_fee_percent_of_build;
  const setupFeeSubtotal = totalBuildCost * (setupFeePercent / 100.0);
  let setupDiscountVal = 0;
  if (!isSetupExempt) {
    setupDiscountVal = getDiscountAmount(
      setupFeeSubtotal,
      lockedVars.discountUsd,
      lockedVars.discountPct
    );
  }
  const finalSetupFee = setupFeeSubtotal - setupDiscountVal;

  // --- 4. Monthly Payments ---
  const remainingBuildCost = totalBuildCost - setupFeeSubtotal;
  const amortizedMonthlySubtotal =
    amortizationTerm > 0 ? remainingBuildCost / amortizationTerm : 0;
  const tierMonthlySubtotal = tierConfig.monthly_rate;

  // --- [FIX 5 (TASK 2.2.2)] ---
  // Declare variables in the outer scope
  let amortizedDiscountVal = 0;
  let tierMonthlyDiscountVal = 0; // <-- This was the missing declaration in Attempt 5

  if (!isAmortExempt) {
    // Assign value inside the block
    amortizedDiscountVal = getDiscountAmount(
      amortizedMonthlySubtotal,
      lockedVars.discountUsd,
      lockedVars.discountPct
    );
  }

  if (!exemptions.includes('tier')) {
    // Assign value inside the block
    tierMonthlyDiscountVal = getDiscountAmount(
      tierMonthlySubtotal,
      lockedVars.discountUsd,
      lockedVars.discountPct
    );
  }
  // --- END FIX ---

  const finalAmortizedMonthly = amortizedMonthlySubtotal - amortizedDiscountVal;
  // --- [THE FIX] ---
  const finalTierMonthly = tierMonthlySubtotal - tierMonthlyDiscountVal; // <-- Use correct variable
  // --- END FIX ---

  // Return a clean object with all the calculated fees
  return {
    name: `${modelConfig.display_name} - ${tierConfig.name} Tier`,
    setupFee: finalSetupFee,
    amortizedMonthly: finalAmortizedMonthly,
    tierMonthly: finalTierMonthly,
    totalActiveMonthly: finalAmortizedMonthly + finalTierMonthly,
    amortizedMonthlyDiscountVal: amortizedDiscountVal,
    tierMonthlyDiscountVal: tierMonthlyDiscountVal, // <-- **THIS WAS THE FIX**
    amortizationTerm: amortizationTerm,
    buyoutPrice: finalBuildCostForBuyout,
    // Also pass through descriptions
    tierName: tierConfig.name,
    tierDescription: tierConfig.description,
    planName: paymentConfig.name,
    planDescription: paymentConfig.description,
    features: Array.isArray(tierConfig.features_list)
      ? tierConfig.features_list
      : [],
  };
}

/**
 * Generates a payment schedule for the subscription model.
 * NOTE: This function requires 'date-fns' to work.
 *
 * @param {object} lockedVars - The quote-specific document.
 * @param {object} calculatedFees - The output from calculateSubscription.
 * @param {object} dateFns - The date-fns library functions { addMonths, startOfMonth, parse, isValid, ... }
 * @returns {object} An object containing the schedule array and total cost.
 */
export function generatePaymentSchedule(
  lockedVars,
  calculatedFees,
  dateFns
) {
  // Check if date-fns is provided
  if (!dateFns || typeof dateFns.addMonths !== 'function') {
    console.error('date-fns library is required for generatePaymentSchedule');
    return {
      schedule: [
        { date: 'Error', amount: 0, notes: 'Missing date library' },
      ],
      totalCost: 0,
    };
  }

  const {
    addMonths,
    startOfMonth,
    parse,
    isValid,
    getMonth,
    format,
    isAfter,
    isBefore,
    differenceInCalendarMonths,
    addYears,
    isSameDay,
  } = dateFns;

  const schedule = [];

  // --- **[THE FIX]**: Correctly destructure `discountDurationMonths` ---
  const {
    discountUsd,
    discountPct,
    discountDurationMonths, // Use this one
  } = lockedVars;
  // --- END FIX ---

  const {
    setupFee,
    amortizedMonthly,
    tierMonthly,
    amortizedMonthlyDiscountVal,
    tierMonthlyDiscountVal,
    amortizationTerm,
  } = calculatedFees;

  // --- 1. Helper Functions to parse dates ---
  // This is the clean, correct version of this function
  const parseYyyyMmToDate = (dateStr, defaultOffsetMonths = 1) => {
    const current = new Date();
    // 1st of current month + offset
    const defaultDate = addMonths(startOfMonth(current), defaultOffsetMonths);

    if (dateStr) {
      try {
        // 'yyyy-MM' format, assumes 1st of the month
        const parsedDate = parse(dateStr, 'yyyy-MM', new Date());
        if (isValid(parsedDate)) {
          return parsedDate;
        }
      } catch (e) {
        // Fallback to default
      }
    }
    return defaultDate;
  };

  // This is the clean, correct version of this function
  const parseDateRangeString = (rangeStr) => {
    if (!rangeStr || !rangeStr.includes(':')) {
      return [null, 'Invalid Range', null, null];
    }
    const [startStr, endStr] = rangeStr.split(':');
    const startDt = parseYyyyMmToDate(startStr, 0);
    const endDt = parseYyyyMmToDate(endStr, 0);

    if (!isValid(startDt) || !isValid(endDt)) {
      return [null, 'Invalid Range', null, null];
    }

    const startDesc = format(startDt, 'MMM yyyy');
    const endDesc = format(endDt, 'MMM yyyy');
    const desc = `${startDesc} - ${endDesc}`;

    const monthList = [];
    let currentDt = startDt;
    while (currentDt <= endDt) {
      monthList.push(getMonth(currentDt) + 1); // getMonth() is 0-indexed
      currentDt = addMonths(currentDt, 1);
    }
    return [monthList, desc, startDt, endDt];
  };

  // --- 2. Parse all dates from lockedVars ---
  const amortStartObj = parseYyyyMmToDate(lockedVars.amortStartMonth, 1);
  const [yr1Months, yr1Desc, yr1StartDt] = parseDateRangeString(
    lockedVars.yr1SeasonalRange
  );
  let [yr2Months, yr2Desc] = parseDateRangeString(
    lockedVars.yr2SeasonalRange
  );
  let yr2RulesStartDt = parseYyyyMmToDate(lockedVars.yr2StartDate, 0);

  // Default Y2 logic
  if (
    lockedVars.billingSchedule === 'seasonal' &&
    !lockedVars.yr2SeasonalRange
  ) {
    yr2Months = yr1Months;
    yr2Desc = yr1Desc;
    if (!lockedVars.yr2StartDate && yr1StartDt) {
      yr2RulesStartDt = addYears(yr1StartDt, 1);
    }
  }
  if (yr2Months === null) yr2Months = [];

  // --- 3. Add Setup Fee ---
  let allPaymentsTotal = 0;
  let yearTotal = 0;
  let fiscalYearCounter = 1;

  if (setupFee > 0) {
    schedule.push({
      date: 'Due Today',
      amount: setupFee,
      notes: 'Setup Fee (Build Cost Down Payment)',
    });
  }

  // --- 4. Loop through months ---
  const firstPaymentDate = amortStartObj;
  // Start loop from 1st of *next* month
  let paymentDate = addMonths(startOfMonth(new Date()), 1);
  // --- MODIFIED (USER REQ 3): Use paymentScheduleYears ---
  const maxMonthsToShow =
    (parseInt(lockedVars.paymentScheduleYears, 10) || 2) * 12;
  let hasShownYear2Header = false;

  for (let i = 0; i < maxMonthsToShow; i++) {
    // Check for Year 2+ Rules Start
    if (
      yr2RulesStartDt &&
      (isSameDay(paymentDate, yr2RulesStartDt) ||
        isAfter(paymentDate, yr2RulesStartDt)) &&
      !hasShownYear2Header
    ) {
      schedule.push({
        date: '---',
        amount: 0,
        notes: `Year 2+ Schedule (${yr2Desc}) Begins`,
      });
      hasShownYear2Header = true;
    }

    const monthNum = getMonth(paymentDate) + 1; // 1-12
    const monthStr = format(paymentDate, 'MMM yyyy');
    let totalDue = 0;
    const notesList = [];

    // Check if we are in a "gap" month (before billing starts)
    if (isBefore(paymentDate, firstPaymentDate)) {
      totalDue = 0;
      notesList.push('---');
    } else {
      // We are in an active payment period
      const paymentMonthIdx = differenceInCalendarMonths(
        paymentDate,
        firstPaymentDate
      );

      // --- [FIX (TASK 2.2.2)]: Correct logic ---
      const durationInMonths = parseInt(discountDurationMonths, 10) || 0;
      // A duration of 0 means the discount is perpetual.
      const isDiscountActive =
        durationInMonths === 0 || paymentMonthIdx < durationInMonths;
      // --- END FIX ---

      // --- 1. Amortization Payment ---
      let currentAmortPayment = 0;
      if (paymentMonthIdx < amortizationTerm) {
        currentAmortPayment = amortizedMonthly; // This is already the discounted amount

        // --- Fix for Point 3 ---
        if (currentAmortPayment > 0) {
          notesList.push('Build Pmt');
          if (isDiscountActive && amortizedMonthlyDiscountVal > 0) {
            notesList.push('(Discounted)');
          }
        }

        // Check if discount *ends*
        if (!isDiscountActive && amortizedMonthlyDiscountVal > 0) {
          currentAmortPayment += amortizedMonthlyDiscountVal; // Add back discount

          if (
            notesList.indexOf('Build Pmt (Full Rate)') === -1 &&
            notesList.indexOf('Build Pmt') === -1
          ) {
            notesList.push('Build Pmt (Full Rate)');
          } else if (notesList.indexOf('Build Pmt') > -1) {
            notesList[notesList.indexOf('Build Pmt')] = 'Build Pmt (Full Rate)';
          }
        }
      }

      // --- 2. Tier Payment ---
      let currentTierPayment = 0;
      let activeSeasonalMonths = yr1Months;

      if (
        yr2RulesStartDt &&
        (isSameDay(paymentDate, yr2RulesStartDt) ||
          isAfter(paymentDate, yr2RulesStartDt))
      ) {
        activeSeasonalMonths = yr2Months;
      }

      // Determine Tier Payment Amount
      let tierPaymentThisMonth = tierMonthly; // Already discounted
      let tierNote = 'Tier Fee';
      let tierDiscountNote = '';

      if (!isDiscountActive && tierMonthlyDiscountVal > 0) {
        tierPaymentThisMonth += tierMonthlyDiscountVal; // Add back discount
        tierNote = 'Tier Fee (Full Rate)';
      } else if (isDiscountActive && tierMonthlyDiscountVal > 0) {
        tierDiscountNote = '(Discounted)';
      }

      // Determine if Tier is Billed This Month
      if (tierPaymentThisMonth > 0) {
        if (lockedVars.billingSchedule === 'standard') {
          currentTierPayment = tierPaymentThisMonth;
          notesList.push(tierNote);
          if (tierDiscountNote) notesList.push(tierDiscountNote);
        } else if (
          lockedVars.billingSchedule === 'seasonal' &&
          activeSeasonalMonths &&
          activeSeasonalMonths.includes(monthNum)
        ) {
          currentTierPayment = tierPaymentThisMonth;
          notesList.push(`${tierNote} (Seasonal)`);
          if (tierDiscountNote) notesList.push(tierDiscountNote);
        }
      }

      totalDue = currentAmortPayment + currentTierPayment;

      // Add to totals
      yearTotal += totalDue;
      allPaymentsTotal += totalDue;
    }

    // Add row to schedule
    schedule.push({
      date: monthStr,
      amount: totalDue,
      notes: notesList.length > 0 ? notesList.join(' + ') : '---',
    });

    // Add Fiscal Year Summary
    if (
      isSameDay(paymentDate, firstPaymentDate) ||
      isAfter(paymentDate, firstPaymentDate)
    ) {
      const paymentMonthIdx = differenceInCalendarMonths(
        paymentDate,
        firstPaymentDate
      );
      if ((paymentMonthIdx + 1) % 12 === 0 && paymentMonthIdx > 0) {
        schedule.push({
          date: `End of Year ${fiscalYearCounter}`,
          amount: yearTotal,
          notes: `Total for Year ${fiscalYearCounter}`,
        });
        yearTotal = 0;
        fiscalYearCounter++;
      }
    }

    paymentDate = addMonths(paymentDate, 1);
  }

  // Return both the schedule and the total cost (Setup Fee + All Monthly Payments)
  return {
    schedule: schedule,
    totalCost: setupFee + allPaymentsTotal,
  };
}
