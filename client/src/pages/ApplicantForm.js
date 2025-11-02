/*
automated-hiring-funnel/client/src/pages/ApplicantForm.js
(Renamed to QuoteCalculator.js)
---
MODIFIED:
- (USER REQ) Kept the new layout/styling from user's provided code.
- (USER REQ 1 & 2) Replaced the 'amortTerm' state and 'useMemo'
  logic with the correct logic from our previous functional version.
  This fixes the 'NaN' error by correctly reading the config's
  simple number array (e.g., [12, 24, 36]) to get min/max.
- (USER REQ 2) Ensured slider 'step' is "1" to allow every month.
- (USER REQ 3) Removed the floating submit bar at the bottom.
- (USER REQ 3) Created a new "Finalize Your Quote" section and
  moved the "Submit Quote" button into it, above the "Decline" button.
- (USER REQ 4) Kept the import for '../components/DeclineModal'.
- (USER REQ 5) Kept the functional 2/5/10 year schedule view dropdown.
*/

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
// --- (RUNTIME FIX) Use named imports ---
import {
  calculateProject,
  calculateSubscription,
  generatePaymentSchedule,
} from '../logic/quoteCalculator';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  AlertCircle,
  BarChart2,
  CheckCircle,
  ChevronDown,
  HelpCircle,
  ThumbsDown,
  Smile,
} from 'lucide-react';
import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from '@headlessui/react';
import DeclineModal from '../components/DeclineModal'; // This file is now provided below

// Import all required date-fns functions
import {
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
} from 'date-fns';

// Bundle date-fns functions into an object to pass to the calculator
const dateFns = {
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
};

// --- (FIX 4B) Helper to strip markdown asterisks ---
const cleanText = (text) => {
  if (typeof text !== 'string') return '';
  return text.replace(/\*\*(.*?)\*\*/g, '$1'); // Removes **bold**
};

// --- Helper Components ---
const Section = ({ children, className = '' }) => (
  <motion.div
    className={`bg-white shadow-lg rounded-2xl p-6 sm:p-8 ${className}`}
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
  >
    {children}
  </motion.div>
);

const PriceDisplay = ({ label, value, size = 'large' }) => (
  <div className={size === 'large' ? 'text-center' : ''}>
    <div
      className={`font-medium ${
        size === 'large'
          ? 'text-lg text-gray-600'
          : 'text-sm text-gray-500'
      }`}
    >
      {label}
    </div>
    <div
      className={`font-bold text-blue-600 ${
        size === 'large' ? 'text-5xl' : 'text-3xl'
      }`}
    >
      {value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
    </div>
  </div>
);

const Tooltip = ({ text }) => (
  <span className="relative group">
    <HelpCircle className="w-4 h-4 text-gray-400 ml-1 cursor-pointer" />
    <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-48 text-xs bg-gray-800 text-white p-2 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
      {text}
    </span>
  </span>
);

const StyledSelect = ({ id, value, onChange, children, disabled = false }) => (
  <div className="relative">
    <select
      id={id}
      name={id}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="block w-full px-4 py-3 text-base bg-white border border-gray-300 rounded-lg shadow-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
    >
      {children}
    </select>
    <ChevronDown className="w-5 h-5 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
  </div>
);

// --- Main Component ---
export default function QuoteCalculator() {
  const { id: quoteId } = useParams();
  const [quoteData, setQuoteData] = useState(null);
  const [configData, setConfigData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [isDeclined, setIsDeclined] = useState(false);

  const [clientChoices, setClientChoices] = useState({
    tier: '',
    paymentPlan: '',
    amortizationTerm: 0, // --- (FIX 1) Start at 0 or a number ---
  });

  // const [amortTerm, setAmortTerm] = useState(36); // --- (FIX 1) REMOVED. Use clientChoices.
  const [scheduleViewYears, setScheduleViewYears] = useState('10');

  // --- (FIX 1) Correctly parse min/max from config's simple number array ---
  const amortTiers = useMemo(() => {
    // This reads [12, 18, 36]
    const terms = configData?.models?.subscription?.amortization_terms || [12];
    return {
      min: Math.min(...terms),
      max: Math.max(...terms),
    };
  }, [configData]);

  // --- Data Loading ---
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        if (!quoteId) {
          setError('No quote ID provided.');
          setIsLoading(false);
          return;
        }

        const quoteRef = doc(db, 'quotes', quoteId);
        const quoteSnap = await getDoc(quoteRef);
        if (!quoteSnap.exists()) {
          setError('Quote not found.');
          setIsLoading(false);
          return;
        }
        const quote = quoteSnap.data();

        if (quote.status === 'Declined') {
          setIsDeclined(true);
          setIsLoading(false);
          return;
        }

        if (!['Sent', 'Pending Re-send', 'Approved'].includes(quote.status)) {
          setError('This quote is not currently active.');
          setIsLoading(false);
          return;
        }

        setQuoteData(quote);

        const configRef = doc(db, 'config', 'main');
        const configSnap = await getDoc(configRef);
        if (!configSnap.exists()) {
          setError('Business configuration not found.');
          setIsLoading(false);
          return;
        }
        const config = configSnap.data();
        setConfigData(config);

        // --- (FIX 1) Initialize slider correctly from simple number array ---
        const configTerms = config.models.subscription.amortization_terms || [12];
        const defaultTerm = Math.min(...configTerms); // e.g., 12
        const initialTerm = quote.selectedAmortizationTerm || defaultTerm;
        // --- End Fix ---

        setClientChoices({
          tier: quote.selectedTier || 'growth',
          paymentPlan: quote.selectedPaymentPlan || 'split_pay',
          amortizationTerm: parseInt(initialTerm, 10), // Set the number
        });
        // setAmortTerm(parseInt(initialTerm, 10)); // --- (FIX 1) REMOVED
        setScheduleViewYears(String(quote.paymentScheduleYears || 10));
      } catch (err)
 {
        console.error('Error loading data:', err);
        setError('An error occurred while loading the quote.');
      }
      setIsLoading(false);
    };

    loadData();
  }, [quoteId]);

  // --- Calculation ---
  const calculatedFees = useMemo(() => {
    if (!quoteData || !configData) return null;

    // --- (RUNTIME FIX) Remove 'quoteCalcs.' prefix ---
    if (quoteData.serviceModel === 'project') {
      return calculateProject(quoteData, configData);
    }
    if (quoteData.serviceModel === 'subscription') {
      return calculateSubscription(quoteData, clientChoices, configData);
    }
    return null;
  }, [quoteData, configData, clientChoices]);

  // --- Schedule Generation ---
  const { schedule, totalCost } = useMemo(() => {
    if (!calculatedFees || quoteData.serviceModel !== 'subscription') {
      return { schedule: [], totalCost: 0 };
    }
    const quoteDataWithScheduleView = {
      ...quoteData,
      paymentScheduleYears: parseInt(scheduleViewYears, 10),
      discountDurationMonths:
        parseInt(quoteData.discountDurationMonths, 10) || 36,
    };
    // --- (RUNTIME FIX) Remove 'quoteCalcs.' prefix ---
    return generatePaymentSchedule(
      quoteDataWithScheduleView,
      calculatedFees,
      dateFns
    );
  }, [quoteData, calculatedFees, scheduleViewYears]);

  // --- (FIX 1) REMOVED redundant min/max useMemo ---

  // --- Event Handlers ---
  const handleSelectionChange = (e) => {
    const { name, value } = e.target;
    setClientChoices((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // --- (FIX 1) Simplified slider handler ---
  const handleSliderChange = (e) => {
    const value = parseInt(e.target.value, 10);
    setClientChoices((prev) => ({
      ...prev,
      amortizationTerm: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const quoteRef = doc(db, 'quotes', quoteId);
      await updateDoc(quoteRef, {
        selectedTier: clientChoices.tier,
        selectedPaymentPlan: clientChoices.paymentPlan,
        selectedAmortizationTerm: clientChoices.amortizationTerm,
        status: 'Approved',
        approvedAt: new Date(),
      });
      setSubmitSuccess(true);
    } catch (err) {
      console.error('Error submitting quote:', err);
      setError('Failed to submit quote. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleDeclineSubmit = async (reason) => {
    setIsDeclining(true);
    setError(null);
    try {
      const quoteRef = doc(db, 'quotes', quoteId);
      await updateDoc(quoteRef, {
        status: 'Declined',
        declineReason: reason,
        declinedAt: new Date(),
      });
      setShowDeclineModal(false);
      setIsDeclined(true);
    } catch (err) {
      console.error('Error declining quote:', err);
      setError('Failed to update quote. Please try again.');
    }
    setIsDeclining(false);
  };

  // --- Render States ---
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="mt-4 text-xl font-semibold text-gray-800">Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (isDeclined) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center bg-white p-10 rounded-2xl shadow-xl"
        >
          <Smile className="w-16 h-16 text-blue-500 mx-auto" />
          <h2 className="mt-6 text-2xl font-bold text-gray-900">Thank You</h2>
          <p className="mt-2 text-gray-600 max-w-md">
            Your feedback has been received. We appreciate you taking the time
            to review our quote.
          </p>
        </motion.div>
      </div>
    );
  }

  if (submitSuccess) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="text-center bg-white p-10 rounded-2xl shadow-xl"
        >
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          <h2 className="mt-6 text-2xl font-bold text-gray-900">
            Quote Submitted!
          </h2>
          <p className="mt-2 text-gray-600 max-w-md">
            Thank you! We have received your selections and will be in touch
            shortly to discuss the next steps.
          </p>
        </motion.div>
      </div>
    );
  }

  if (!quoteData || !configData || !calculatedFees) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
        <p className="ml-4">Loading calculator...</p>
      </div>
    );
  }

  // --- Config Data for UI ---
  const modelConfig = configData.models[quoteData.serviceModel];
  const subConfig = configData.models.subscription;

  return (
    <>
      {/* --- (FIX 3) Removed pb-32 --- */}
      <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
        <div className="max-w-6xl mx-auto">
          {/* --- Header --- */}
          <Section className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              {quoteData.projectTitle}
            </h1>
            <p className="mt-1 text-lg text-gray-600">
              Interactive Quote for {quoteData.clientContactName}
            </p>
            <div className="mt-4 pt-4 border-t border-gray-200">
              <h2 className="text-xl font-semibold text-gray-800">
                {modelConfig.display_name}
              </h2>
              <p className="mt-1 text-gray-600">{modelConfig.description}</p>
            </div>
          </Section>

          {/* --- Main Grid --- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* --- Left Column: Controls --- */}
            <div className="lg:col-span-1 space-y-6">
              <Section>
                <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                  Customize Your Plan
                  <Tooltip text="Adjust these options to see how they affect your pricing in real-time." />
                </h2>

                {/* --- Tier Selection --- */}
                <div className="mt-6">
                  <label
                    htmlFor="tier"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Service Tier
                  </label>
                  <StyledSelect
                    id="tier"
                    name="tier"
                    value={clientChoices.tier}
                    onChange={handleSelectionChange}
                  >
                    {Object.keys(subConfig.tiers).map((key) => (
                      <option key={key} value={key}>
                        {subConfig.tiers[key].name}
                      </option>
                    ))}
                  </StyledSelect>
                </div>

                {/* --- Payment Plan --- */}
                <div className="mt-4">
                  <label
                    htmlFor="paymentPlan"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Payment Plan
                  </label>
                  <StyledSelect
                    id="paymentPlan"
                    name="paymentPlan"
                    value={clientChoices.paymentPlan}
                    onChange={handleSelectionChange}
                  >
                    {Object.keys(subConfig.payment_options).map((key) => (
                      <option key={key} value={key}>
                        {subConfig.payment_options[key].name}
                      </option>
                    ))}
                  </StyledSelect>
                </div>

                {/* --- (FIX 1 & 2) Amortization Slider --- */}
                <div className="mt-6">
                  <label
                    htmlFor="amortizationTerm"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Build Cost Term
                  </label>
                  <div className="flex items-center justify-between text-gray-600">
                    <span className="text-sm">{amortTiers.min} mo</span>
                    <span className="text-2xl font-bold text-blue-600">
                      {clientChoices.amortizationTerm}
                    </span>
                    <span className="text-sm">{amortTiers.max} mo</span>
                  </div>
                  <input
                    type="range"
                    id="amortizationTerm"
                    name="amortizationTerm"
                    min={amortTiers.min}
                    max={amortTiers.max}
                    step="1" // --- (FIX 2) Set step to 1
                    value={clientChoices.amortizationTerm}
                    onChange={handleSliderChange}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-thumb-blue"
                  />
                </div>
              </Section>

              <Section>
                <h2 className="text-xl font-semibold text-gray-800 flex items-center">
                  View Projections
                </h2>
                <div className="mt-4">
                  <label
                    htmlFor="scheduleViewYears"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Payment Schedule
                  </label>
                  <StyledSelect
                    id="scheduleViewYears"
                    name="scheduleViewYears"
                    value={scheduleViewYears}
                    onChange={(e) => setScheduleViewYears(e.target.value)}
                  >
                    <option value="2">View 2-Year Projection</option>
                    <option value="5">View 5-Year Projection</option>
                    <option value="10">View 10-Year Projection</option>
                  </StyledSelect>
                </div>
              </Section>
            </div>

            {/* --- Right Column: Summary & Details --- */}
            <div className="lg:col-span-2 space-y-6">
              {/* --- Price Summary --- */}
              <Section>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <PriceDisplay
                    label="Due Today"
                    value={calculatedFees.setupFee}
                  />
                  <PriceDisplay
                    label="Total Monthly Fee"
                    value={calculatedFees.totalActiveMonthly}
                  />
                  <PriceDisplay
                    label="Buyout Price"
                    value={calculatedFees.buyoutPrice}
                  />
                </div>
                <div className="mt-6 text-center text-sm text-gray-500">
                  <p>{calculatedFees.planDescription}</p>
                  <p>{calculatedFees.tierDescription}</p>
                </div>
              </Section>

              {/* --- Plan Details --- */}
              <Section>
                <Disclosure defaultOpen>
                  {({ open }) => (
                    <>
                      <DisclosureButton className="flex justify-between items-center w-full text-left">
                        <h2 className="text-xl font-semibold text-gray-800">
                          Plan Details: {calculatedFees.tierName} Tier
                        </h2>
                        <ChevronDown
                          className={`w-6 h-6 text-gray-500 ${
                            open ? 'transform rotate-180' : ''
                          } transition-transform`}
                        />
                      </DisclosureButton>
                      <DisclosurePanel
                        as="div"
                        className="mt-4 pt-4 border-t border-gray-200"
                      >
                        <ul className="space-y-2">
                          {/* --- (FIX 1) Add safety check for features --- */}
                          {(calculatedFees.features || []).map((feature, i) => (
                            <li key={i} className="flex items-center">
                              <CheckCircle className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" />
                              {/* --- (FIX 4B) Cleaned text --- */}
                              <span className="text-gray-700">
                                {cleanText(feature)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </DisclosurePanel>
                    </>
                  )}
                </Disclosure>
              </Section>

              {/* --- Payment Schedule --- */}
              <Section>
                <Disclosure>
                  {({ open }) => (
                    <>
                      <DisclosureButton className="flex justify-between items-center w-full text-left">
                        <h2 className="text-xl font-semibold text-gray-800">
                          Payment Schedule ({scheduleViewYears}-Year View)
                        </h2>
                        <ChevronDown
                          className={`w-6 h-6 text-gray-500 ${
                            open ? 'transform rotate-180' : ''
                          } transition-transform`}
                        />
                      </DisclosureButton>
                      <DisclosurePanel
                        as="div"
                        className="mt-4 pt-4 border-t border-gray-200"
                      >
                        <div className="max-h-96 overflow-y-auto border rounded-lg">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Date
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Description
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Amount
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {schedule.map((item, index) => (
                                <tr
                                  key={index}
                                  className={
                                    item.notes.startsWith('Total')
                                      ? 'bg-gray-100 font-bold'
                                      : 'hover:bg-gray-50'
                                  }
                                >
                                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                                    {item.date}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-500">
                                    {item.notes}
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-700 text-right whitespace-nowBrap">
                                    {item.amount.toLocaleString('en-US', {
                                      style: 'currency',
                                      currency: 'USD',
                                    })}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </DisclosurePanel>
                    </>
                  )}
                </Disclosure>
              </Section>

              {/* --- (FIX 3) New "Finalize" Section --- */}
              <Section>
                <h2 className="text-xl font-semibold text-gray-800">
                  Finalize Your Quote
                </h2>
                <p className="text-gray-600 mt-2 mb-4">
                  Please review your selections. When you are ready,
                  you can submit your quote for approval.
                </p>

                {/* Submit Button */}
                <button
                  type="button"
                  onClick={handleSubmit} // Trigger submit manually
                  disabled={isSubmitting || isDeclining}
                  className="flex items-center justify-center w-full px-8 py-3 text-base font-medium text-white bg-blue-600 border border-transparent rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <BarChart2 className="w-5 h-5 mr-2" />
                  )}
                  {isSubmitting ? 'Submitting...' : 'Submit Quote'}
                </button>

                <div className="mt-4 text-center">
                  <p className="text-sm text-gray-500">
                    Or, if this isn't a good fit:
                  </p>
                  {/* Decline Button */}
                  <button
                    type="button"
                    onClick={() => setShowDeclineModal(true)}
                    disabled={isSubmitting || isDeclining}
                    className="inline-flex items-center justify-center mt-2 px-6 py-2 text-base font-medium text-red-700 bg-red-100 rounded-lg hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-500"
                  >
                    <ThumbsDown className="w-5 h-5 mr-2" />
                    Decline This Quote
                  </button>
                </div>
              </Section>
            </div>
          </div>
          {/* --- End Main Grid --- */}
        </div>

        {/* --- (FIX 3) Floating Submit Bar REMOVED --- */}
      </div>

      <DeclineModal
        isOpen={showDeclineModal}
        onClose={() => setShowDeclineModal(false)}
        onSubmit={handleDeclineSubmit}
        isLoading={isDeclining}
      />
    </>
  );
}
