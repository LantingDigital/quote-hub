/*
automated-hiring-funnel/client/src/pages/ApplicantForm.js
---
MODIFIED:
- Renamed to QuoteCalculator.js (as per context.txt)
- TASK (Plan Step 2): Changed status update on submit
  from 'Submitted' to 'Approved' to align with new lifecycle.
*/

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, functions } from '../firebase'; // Assuming 'functions' export for HttpsCallable
import { httpsCallable } from 'firebase/functions';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle, AlertCircle, ShieldCheck, Send } from 'lucide-react';
import {
  calculateSubscription,
  calculateProject,
  generatePaymentSchedule,
} from '../logic/quoteCalculator';

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

// --- Helper UI Components (Unchanged) ---

const OptionCard = ({ title, description, selected, onClick }) => (
  <motion.div
    onClick={onClick}
    className={`p-4 border rounded-lg cursor-pointer transition-all duration-200 ${
      selected
        ? 'bg-blue-600 border-blue-700 text-white shadow-lg'
        : 'bg-white border-gray-300 hover:border-gray-400 hover:shadow-md'
    }`}
    whileTap={{ scale: 0.98 }}
  >
    <h4 className="text-lg font-semibold">{title}</h4>
    <p className={`text-sm ${selected ? 'text-blue-100' : 'text-gray-600'}`}>
      {description}
    </p>
  </motion.div>
);

const PriceDisplay = ({ label, value, size = 'large' }) => (
  <div className="py-4 px-6 bg-gray-50 rounded-lg">
    <div className="text-sm font-medium text-gray-500">{label}</div>
    <div
      className={`font-bold text-gray-900 ${
        size === 'large' ? 'text-4xl' : 'text-2xl'
      }`}
    >
      {value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
      })}
    </div>
  </div>
);

const ScheduleTable = ({ schedule }) => (
  <div className="mt-6 flow-root">
    <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
      <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                  Date
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Description
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {schedule.map((item, index) => (
                <tr key={index} className={item.notes.startsWith('Total') ? 'bg-gray-50 font-medium' : ''}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                    {item.date}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{item.notes}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
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
      </div>
    </div>
  </div>
);

// --- Main Page Component ---

function QuoteCalculator() {
  const { id: quoteId } = useParams();
  const [quoteData, setQuoteData] = useState(null);
  const [configData, setConfigData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  const [clientChoices, setClientChoices] = useState({
    serviceModel: 'subscription', 
    tier: '', 
    paymentPlan: '', 
    amortizationTerm: 0, 
  });

  // Load all data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        if (!quoteId) {
          setError('No quote ID provided.');
          setIsLoading(false);
          return;
        }

        // 1. Fetch the quote document
        const quoteRef = doc(db, 'quotes', quoteId);
        const quoteSnap = await getDoc(quoteRef);
        if (!quoteSnap.exists()) {
          setError('Quote not found.');
          setIsLoading(false);
          return;
        }
        const quote = quoteSnap.data();
        
        // --- CHECK STATUS ---
        // If quote is already approved or further, show success screen
        if (quote.status === 'Approved' || quote.status === 'Contract Generated') {
          setSubmissionSuccess(true);
          setIsLoading(false);
          return;
        }
        // If quote is not "Sent", show an error (client shouldn't have this link)
        if (quote.status !== 'Sent') {
           setError('This quote is not yet active. Please contact us if you believe this is an error.');
           setIsLoading(false);
           return;
        }
        // --- End Check ---
        
        setQuoteData(quote);

        // 2. Fetch the main config
        const configRef = doc(db, 'config', 'main');
        const configSnap = await getDoc(configRef);
        if (!configSnap.exists()) {
          setError('Business configuration not found.');
          setIsLoading(false);
          return;
        }
        const config = configSnap.data();
        setConfigData(config);

        // 3. Set default client choices based on loaded config
        const defaultTerm = config.models.subscription.amortization_terms?.[0] || 12;
        
        setClientChoices((prev) => ({
          ...prev,
          serviceModel: quote.serviceModel || 'subscription',
          tier: Object.keys(config.models.subscription.tiers)[0] || '',
          paymentPlan: Object.keys(config.models.subscription.payment_options)[0] || '',
          amortizationTerm: defaultTerm,
        }));

      } catch (err) {
        console.error("Error loading data:", err);
        setError(err.message);
      }
      setIsLoading(false);
    };
    loadData();
  }, [quoteId]);

  // Recalculate fees whenever choices change
  const calculatedFees = useMemo(() => {
    if (!quoteData || !configData) return null;

    if (clientChoices.serviceModel === 'project') {
      return calculateProject(quoteData, configData);
    }
    
    return calculateSubscription(quoteData, clientChoices, configData);

  }, [quoteData, configData, clientChoices]);

  // Regenerate schedule whenever fees change
  const { schedule, totalCost } = useMemo(() => {
    if (!calculatedFees || !quoteData) return { schedule: [], totalCost: 0 };

    if (clientChoices.serviceModel === 'project') {
      return { 
        schedule: [{ date: "Due on Start", notes: "Project Buyout Cost", amount: calculatedFees.totalCost }],
        totalCost: calculatedFees.totalCost
      };
    }
    
    return generatePaymentSchedule(quoteData, calculatedFees, dateFns);

  }, [quoteData, calculatedFees, clientChoices.serviceModel]);

  const handleSubmitQuote = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      // 1. Update the quote doc with the final selections and new status
      await updateDoc(doc(db, 'quotes', quoteId), {
        status: 'Approved', // <-- TASK (Plan Step 2) CHANGE
        selectedServiceModel: clientChoices.serviceModel,
        selectedTier: clientChoices.tier,
        selectedPaymentPlan: clientChoices.paymentPlan,
        selectedAmortizationTerm: clientChoices.amortizationTerm,
        finalSetupFee: calculatedFees.setupFee,
        finalMonthlyFee: calculatedFees.totalActiveMonthly,
        finalTotalCost: totalCost,
        lastSubmittedAt: new Date(), 
      });
      
      setSubmissionSuccess(true);
      
    } catch (err) {
      console.error("Error submitting quote:", err);
      setError(err.message);
      setIsSubmitting(false); 
    }
  };
  

  // --- Render Logic ---

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="mt-4 text-xl font-semibold text-gray-800">Error</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submissionSuccess) {
     return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-8 bg-white shadow-xl rounded-lg text-center max-w-lg"
        >
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
          <h2 className="mt-6 text-2xl font-bold text-gray-900">Thank You!</h2>
          <p className="mt-2 text-gray-600">
            Your quote selections have been submitted for approval. We are reviewing your
            details and will be in touch shortly with your finalized
            contract documents.
          </p>
        </motion.div>
      </div>
    );
  }

  if (!quoteData || !configData || !calculatedFees) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  // --- Main Calculator UI ---
  const { models } = configData;
  const { subscription } = models;
  
  const tierOrder = ["foundation", "growth", "accelerator"];
  const paymentPlanOrder = ["flex_start", "split_pay", "full_buyout"];
  const amortizationTerms = subscription.amortization_terms || [12, 18, 24];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8"
    >
      {/* --- Header --- */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900">
          Hi, {quoteData.clientContactName || 'Valued Client'}
        </h1>
        <p className="mt-2 text-lg text-gray-600">
          Here is your interactive quote for "{quoteData.projectTitle}". Please select your preferred options to
          see your project pricing.
        </p>
      </div>

      {/* --- Main Grid Layout (Controls + Summary) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        
        {/* --- Column 1: Controls --- */}
        <div className="lg:col-span-1 p-6 bg-white rounded-lg shadow-lg space-y-6 sticky top-8 max-h-[90vh] overflow-y-auto">
          {/* --- 1. Service Model --- */}
          <fieldset>
            <legend className="text-lg font-semibold text-gray-900">Service Model</legend>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <OptionCard
                title={models.subscription.display_name}
                description="Pay monthly"
                selected={clientChoices.serviceModel === 'subscription'}
                onClick={() => setClientChoices({ ...clientChoices, serviceModel: 'subscription' })}
              />
              <OptionCard
                title={models.project.display_name}
                description="Pay once"
                selected={clientChoices.serviceModel === 'project'}
                onClick={() => setClientChoices({ ...clientChoices, serviceModel: 'project' })}
              />
            </div>
          </fieldset>
          
          <AnimatePresence>
            {clientChoices.serviceModel === 'subscription' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-6 overflow-hidden"
              >
                {/* --- 2. Subscription Tier --- */}
                <fieldset>
                  <legend className="text-lg font-semibold text-gray-900">Subscription Tier</legend>
                  <div className="mt-4 space-y-3">
                    {tierOrder.map((key) => {
                      const tier = subscription.tiers[key];
                      if (!tier) return null;
                      return (
                        <OptionCard
                          key={key}
                          title={tier.name}
                          description={tier.description}
                          selected={clientChoices.tier === key}
                          onClick={() => setClientChoices({ ...clientChoices, tier: key })}
                        />
                      );
                    })}
                  </div>
                </fieldset>

                {/* --- 3. Payment Plan --- */}
                <fieldset>
                  <legend className="text-lg font-semibold text-gray-900">Payment Plan</legend>
                  <div className="mt-4 space-y-3">
                    {paymentPlanOrder.map((key) => {
                      const plan = subscription.payment_options[key];
                      if (!plan) return null;
                      return (
                        <OptionCard
                          key={key}
                          title={plan.name}
                          description={plan.description}
                          selected={clientChoices.paymentPlan === key}
                          onClick={() => setClientChoices({ ...clientChoices, paymentPlan: key })}
                        />
                      );
                    })}
                  </div>
                </fieldset>

                {/* --- 4. Amortization Term --- */}
                <AnimatePresence>
                  {clientChoices.paymentPlan !== 'full_buyout' && (
                    <motion.fieldset
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <label htmlFor="amortizationTerm" className="text-lg font-semibold text-gray-900">
                        Build Cost Term
                      </label>
                      <select
                        id="amortizationTerm"
                        name="amortizationTerm"
                        className="mt-2 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        value={clientChoices.amortizationTerm}
                        onChange={(e) => 
                          setClientChoices({ 
                            ...clientChoices, 
                            amortizationTerm: parseInt(e.target.value, 10) 
                          })
                        }
                      >
                        {amortizationTerms.map(term => (
                          <option key={term} value={term}>{term} Months</option>
                        ))}
                      </select>
                    </motion.fieldset>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* --- Column 2: Summary & Schedule (Unchanged) --- */}
        <div className="lg:col-span-2 space-y-6">
          {/* --- Summary Card --- */}
          <div className="p-6 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900">
              Your Quote: {calculatedFees.name}
            </h2>
            <p className="mt-2 text-gray-600">
              {clientChoices.serviceModel === 'subscription' 
                ? calculatedFees.planDescription 
                : models.project.description
              }
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              <PriceDisplay
                label="Due Today"
                value={calculatedFees.setupFee}
              />
              <PriceDisplay
                label="Total Monthly"
                value={calculatedFees.totalActiveMonthly}
              />
              <PriceDisplay
                label={clientChoices.serviceModel === 'subscription' ? 'Buyout Price' : 'Total Project Cost'}
                value={clientChoices.serviceModel === 'subscription' ? calculatedFees.buyoutPrice : calculatedFees.totalCost}
                size="small"
              />
            </div>

             {/* Features List */}
            {clientChoices.serviceModel === 'subscription' && calculatedFees.tierName && (
              <div className="mt-6">
                <h4 className="text-md font-semibold text-gray-800">Features included in {calculatedFees.tierName}:</h4>
                <ul className="mt-2 space-y-1 list-disc list-inside text-gray-600">
                  {(calculatedFees.features || []).map((feature, i) => (
                    <li key={i}>{feature.replace(/\*\*(.*?)\*\*/g, '$1')}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* --- Schedule Card --- */}
          <div className="p-6 bg-white rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold text-gray-900">
              Payment Schedule
            </h2>
            <p className="mt-2 text-gray-600">
              Here is a projection of your payments over the next {quoteData.paymentScheduleYears || 2} years.
            </p>
            <ScheduleTable schedule={schedule} />
          </div>

          {/* --- SUBMIT CARD --- */}
          <div className="p-6 bg-blue-50 rounded-lg shadow-lg border border-blue-200">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <ShieldCheck className="h-8 w-8 text-blue-500" />
              </div>
              <div className="ml-4 flex-1">
                <h2 className="text-2xl font-bold text-gray-900">
                  Ready to proceed?
                </h2>
                <p className="mt-2 text-gray-700">
                  By clicking "Submit Quote", you are submitting your selections
                  for final review. We will then prepare your
                  final contract documents.
                </p>
                <button
                  onClick={handleSubmitQuote}
                  disabled={isSubmitting}
                  className="mt-6 inline-flex items-center justify-center px-6 py-3 text-base font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5 mr-2" />
                  )}
                  {isSubmitting ? 'Submitting...' : 'Submit Quote'}
                </button>
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </motion.div>
  );
}

export default QuoteCalculator;
