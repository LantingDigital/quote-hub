/*
automated-hiring-funnel/client/src/pages/ApplicantProfile.js
---
MODIFIED:
- (FIX) Updated getStatusStyles() to match StatusBadge.js logic.
- FEAT (USER REQ 3): Added AdminInput for `paymentScheduleYears`.
- FEAT (USER REQ 3): Removed `.slice(0, 13)` from schedule preview to show all.
- FEAT (USER REQ 4.A): Added `isLocked` const to disable all inputs if
  status is 'Sent'. Added `disabled` prop and styles to all inputs.
- FEAT (USER REQ 4.B & CONTEXT [416]): Updated `handleSave` to change
  status from 'Approved' to 'Pending Re-send' on save.
- FEAT (USER REQ 4.D & CONTEXT [418]): Added "Retract to Draft" button,
  visible only on 'Sent' status. Uses `window.confirm()`.
- FEAT (USER REQ 4.C & CONTEXT [417]): Updated "Mark as Sent" button
  to also be visible for 'Pending Re-send' status.
- FEAT (CONTEXT [415, 424]): Added 'Pending Re-send' (Purple 💜) and 'Declined'
  (Red ❤️) to `getStatusStyles`.
- FEAT (CONTEXT [426]): Added logic to display `declineReason` if
  status is 'Declined'.
*/

import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  AlertCircle,
  Save,
  FileText,
  CheckCircle,
  CalendarRange,
  Link,
  Download,
  Info,
  Clock,
  Send,
  AlertTriangle,
  FileWarning,
  ShieldCheck,
  RotateCcw, // For Retract
  ArchiveX, // For Decline
  RefreshCw, // For Pending Re-send
} from 'lucide-react';
import {
  calculateSubscription,
  calculateProject,
  generatePaymentSchedule,
} from '../logic/quoteCalculator';
import AlertModal from '../components/AlertModal';

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

// --- Helper Components ---

// --- MODIFIED (USER REQ 4.A): Added `disabled` prop ---
const AdminInput = ({ label, id, value, onChange, type = 'text', placeholder, step, disabled = false }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700">
      {label}
    </label>
    <div className="mt-1">
      <input
        type={type}
        name={id} // The name attribute is crucial for the handleChange function
        id={id}
        value={value ?? ''} // Ensure value is not null/undefined
        onChange={onChange}
        placeholder={placeholder}
        step={step}
        disabled={disabled} // --- ADDED ---
        className="block w-full px-3 py-2 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed" // --- ADDED DISABLED STYLES ---
      />
    </div>
  </div>
);

// --- MODIFIED (USER REQ 4.A): Added `disabled` prop ---
const AdminSelect = ({ label, id, value, onChange, children, disabled = false }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700">
      {label}
    </label>
    <select
      id={id}
      name={id} // The name attribute is crucial for the handleChange function
      value={value}
      onChange={onChange}
      disabled={disabled} // --- ADDED ---
      className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed" // --- ADDED DISABLED STYLES ---
    >
      {children}
    </select>
  </div>
);
// --- MODIFIED (USER REQ 3): New component for schedule table ---
const AdminScheduleTable = ({ schedule }) => (
  <div className="max-h-96 overflow-y-auto border rounded-md">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50 sticky top-0">
        <tr>
          <th scope="col" className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Date
          </th>
          <th scope="col" className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Description
          </th>
          <th scope="col" className="py-2 px-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Amount
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200 bg-white">
        {schedule.map((item, index) => (
          <tr key={index} className={item.notes.startsWith('Total') ? 'bg-gray-50 font-medium' : ''}>
            <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-gray-900">
              {item.date}
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">{item.notes}</td>
            <td className="whitespace-nowrap px-3 py-2 text-sm text-gray-500">
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
);


const PriceDisplay = ({ label, value }) => (
  <div className="py-4 px-6 bg-gray-50 rounded-lg text-center">
    <div className="text-sm font-medium text-gray-500">{label}</div>
    <div className="text-3xl font-bold text-gray-900">
      {value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
      })}
    </div>
  </div>
);

const SectionWrapper = ({ title, children }) => (
  <div className="bg-white rounded-lg shadow mb-6">
    <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
      <h3 className="text-lg leading-6 font-medium text-gray-900">{title}</h3>
    </div>
    <div className="px-4 py-5 sm:p-6 space-y-4">
      {children}
    </div>
  </div>
);

// --- Main Quote Profile Component ---

function QuoteProfile() {
  const { id: quoteId } = useParams();
  const [quoteData, setQuoteData] = useState(null); // The original, saved data
  const [editableQuoteData, setEditableQuoteData] = useState(null); // The data in the form fields
  const [configData, setConfigData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false); // State for 'Mark as Sent'
  const [isRetracting, setIsRetracting] = useState(false); // --- NEW (USER REQ 4.D) ---
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState({ show: false, message: '', isError: false });
  
  // Re-usable function to load/reload data
  const loadData = async (showAlert = false, message = '') => {
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
      setQuoteData(quote);
      // Ensure all fields are strings for the form, especially numbers
      const stringifiedQuote = Object.keys(quote).reduce((acc, key) => {
        // Don't stringify arrays, keep them as-is
        if (Array.isArray(quote[key])) {
          acc[key] = quote[key];
        } else {
          acc[key] = String(quote[key] ?? ''); // Convert all other values to strings or empty string
        }
        return acc;
      }, { ...quote }); // Spread quote first to keep non-stringified arrays
      setEditableQuoteData(stringifiedQuote);


      // 2. Fetch the main config
      const configRef = doc(db, 'config', 'main');
      const configSnap = await getDoc(configRef);
      if (!configSnap.exists()) {
        setError('Business configuration not found.');
        setIsLoading(false);
        return;
      }
      setConfigData(configSnap.data());

      if (showAlert) {
        setAlert({ show: true, message: message, isError: false });
      }

    } catch (err) {
      console.error("Error loading data:", err);
      setError(err.message);
    }
  };

  // Load all data on mount
  useEffect(() => {
    setIsLoading(true);
    loadData().then(() => {
      setIsLoading(false);
    });
  }, [quoteId]);

  // --- Re-calculate on the fly ---
  const calculatedFees = useMemo(() => {
    if (!editableQuoteData || !configData) return null;

    // We must convert editable strings back to numbers for the calculator
    const numericQuoteData = {
      ...editableQuoteData,
      hours: parseFloat(editableQuoteData.hours) || 0,
      buffer: parseFloat(editableQuoteData.buffer) || 0,
      discountPct: parseFloat(editableQuoteData.discountPct) || 0,
      discountUsd: parseFloat(editableQuoteData.discountUsd) || 0,
    };
    
    // Use the client's choices from the quote doc (e.g., "growth", "split_pay")
    const clientChoices = {
      tier: editableQuoteData.selectedTier,
      paymentPlan: editableQuoteData.selectedPaymentPlan,
      amortizationTerm: parseInt(editableQuoteData.selectedAmortizationTerm, 10),
    };

    if (editableQuoteData.serviceModel === 'project') {
      return calculateProject(numericQuoteData, configData);
    }
    if (editableQuoteData.serviceModel === 'subscription') {
      return calculateSubscription(numericQuoteData, clientChoices, configData);
    }
    
    return null; // No calculation for Maintenance or Hourly

  }, [editableQuoteData, configData]);

  // --- Regenerate schedule on the fly ---
  const { schedule } = useMemo(() => {
    if (!calculatedFees || editableQuoteData.serviceModel !== 'subscription') {
      return { schedule: [] };
    }
    
    // We need numeric data for the schedule too
    const numericQuoteData = {
      ...editableQuoteData,
      hours: parseFloat(editableQuoteData.hours) || 0,
      buffer: parseFloat(editableQuoteData.buffer) || 0,
      discountPct: parseFloat(editableQuoteData.discountPct) || 0,
      discountUsd: parseFloat(editableQuoteData.discountUsd) || 0,
      paymentScheduleYears: parseInt(editableQuoteData.paymentScheduleYears, 10) || 2, // --- MODIFIED (USER REQ 3) ---
    };

    return generatePaymentSchedule(numericQuoteData, calculatedFees, dateFns);

  }, [editableQuoteData, calculatedFees]);


  // Handle changes to the admin inputs
  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditableQuoteData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  // --- Save logic ---
  const isDirty = useMemo(() => {
    if (!quoteData || !editableQuoteData) return false;
    // Compare the original data (quoteData) with the string-based form data (editableQuoteData)
    for (const key in editableQuoteData) {
      // Skip 'status' from isDirty check if we're only changing status via buttons
      if (key === 'status') continue;
      
      // Handle 'undefined' from Firestore vs 'null' or '' from form
      const originalValueString = String(quoteData[key] ?? '');
      const editableValueString = String(editableQuoteData[key] ?? '');
      
      if (originalValueString !== editableValueString) {
        // Handle number comparison (e.g., 10 vs "10")
        if (typeof quoteData[key] === 'number') {
           if (parseFloat(originalValueString) !== parseFloat(editableValueString)) {
             return true;
           }
        } else if (Array.isArray(quoteData[key])) {
           if (JSON.stringify(quoteData[key]) !== JSON.stringify(editableQuoteData[key])) {
             return true;
           }
        } else {
           return true;
        }
      }
    }
    return false;
  }, [quoteData, editableQuoteData]);


  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Convert specific fields back to numbers before saving
      const dataToSave = {
        ...editableQuoteData,
        // Tinker Toy
        hours: parseFloat(editableQuoteData.hours) || 0,
        buffer: parseFloat(editableQuoteData.buffer) || 0,
        discountPct: parseFloat(editableQuoteData.discountPct) || 0,
        discountUsd: parseFloat(editableQuoteData.discountUsd) || 0,
        paymentScheduleYears: parseInt(editableQuoteData.paymentScheduleYears, 10) || 10, // --- MODIFIED (USER REQ 3) ---
        // Maintenance
        finalMonthlyFee: parseFloat(editableQuoteData.finalMonthlyFee) || 0,
        includedHours: parseFloat(editableQuoteData.includedHours) || 0,
        // Hourly
        finalTotalCost: parseFloat(editableQuoteData.finalTotalCost) || 0,
        // Keep arrays as arrays
        contractDocs: editableQuoteData.contractDocs || [], 
      };
      
      // --- NEW (USER REQ 4.B & CONTEXT [416]): Check status ---
      // If the quote was 'Approved' and we save changes,
      // move it to 'Pending Re-send'
      if (quoteData.status === 'Approved') {
        dataToSave.status = 'Pending Re-send';
      }
      // --- End new logic ---

      const quoteRef = doc(db, 'quotes', quoteId);
      await updateDoc(quoteRef, dataToSave);
      
      // Reload data and show success
      await loadData(true, 'Quote updated successfully!');

    } catch (err) {
      console.error("Error saving data:", err);
      setAlert({ show: true, message: `Failed to save: ${err.message}`, isError: true });
    }
    setIsSaving(false);
  };
  
  // --- 'Mark as Sent' Handler ---
  const handleMarkAsSent = async () => {
    if (isDirty) {
       setAlert({ show: true, message: 'Please save your changes before marking as sent.', isError: true });
       return;
    }
    setIsSending(true);
    try {
      const quoteRef = doc(db, 'quotes', quoteId);
      await updateDoc(quoteRef, {
        status: 'Sent',
        sentAt: new Date(), // Add a timestamp for tracking
      });
      // Reload data and show success
      await loadData(true, 'Quote marked as "Sent"!');
    } catch (err) {
      console.error("Error marking as sent:", err);
      setAlert({ show: true, message: `Failed to update status: ${err.message}`, isError: true });
    }
    setIsSending(false);
  };
  
  // --- NEW (USER REQ 4.D): 'Retract to Draft' Handler ---
  const handleRetract = async () => {
     if (!window.confirm("Are you sure you want to retract this quote? This will pull it back to a draft and deactivate the client link.")) {
      return;
    }
    
    setIsRetracting(true);
    try {
      const quoteRef = doc(db, 'quotes', quoteId);
      await updateDoc(quoteRef, {
        status: 'Drafted',
        retractedAt: new Date(),
      });
      // Reload data and show success
      await loadData(true, 'Quote retracted to "Drafted"!');
    } catch (err) {
      console.error("Error retracting quote:", err);
      setAlert({ show: true, message: `Failed to retract: ${err.message}`, isError: true });
    }
    setIsRetracting(false);
  };


  // --- Contract Generation ---
  const handleGenerateContracts = async () => {
    if (isDirty) {
      setAlert({ show: true, message: 'Please save your changes before generating contracts.', isError: true });
      return;
    }
    setIsGenerating(true);
    try {
      const generateContractV2 = httpsCallable(functions, 'generateContractV2');
      const result = await generateContractV2({ quoteId: quoteId });
      
      // @ts-ignore
      const { contractUrl, message } = result.data;
      if (contractUrl) {
         // --- TASK: Update status on success ---
         const quoteRef = doc(db, 'quotes', quoteId);
         await updateDoc(quoteRef, {
           status: 'Contract Generated',
         });
         await loadData(true, `Contracts generated!`);
      } else {
        throw new Error(message || 'Failed to generate contract.');
      }
    } catch (err) {
      console.error("Error generating contracts:", err);
      // @ts-ignore
      const errorMessage = err.message || 'An unknown error occurred.';
      
      // --- TASK: Update status on failure ---
      try {
        const quoteRef = doc(db, 'quotes', quoteId);
        await updateDoc(quoteRef, {
          status: 'Generation Failed',
        });
      } catch (statusErr) {
         console.error("Failed to set error status:", statusErr);
      }
      
      setAlert({ show: true, message: `Generation failed: ${errorMessage}`, isError: true });
      await loadData(); // Reload to show new 'Failed' status
    }
    setIsGenerating(false);
  };


  // --- Render Logic ---
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h2 className="mt-4 text-xl font-semibold text-gray-800">Error loading quote</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }
  
  if (!editableQuoteData || !configData) {
     return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }
  
  const modelName = configData.models[editableQuoteData.serviceModel]?.display_name || 'Quote';

  const isTinkerToy = editableQuoteData.serviceModel === 'subscription' || editableQuoteData.serviceModel === 'project';
  
  const hasContracts = editableQuoteData.contractDocs && editableQuoteData.contractDocs.length > 0;
  
  // --- NEW (USER REQ 4.A): Lock inputs if status is 'Sent' ---
  const isLocked = editableQuoteData.status === 'Sent';
  const currentStatus = editableQuoteData.status; // For button logic

  // --- MODIFIED (USER REQ 4 & CONTEXT): New Status Badge Logic ---
  const getStatusStyles = (status) => {
    switch (status) {
      case 'Drafted':
        return {
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          borderColor: 'border-gray-200',
          icon: <FileWarning className="w-4 h-4 mr-1.5" />,
          text: 'Drafted',
          helperText:
            "This quote is a draft. Click 'Mark as Sent' when you're ready for the client to see it.",
        };
      case 'Sent':
        return {
          bgColor: 'bg-yellow-100',
          textColor: 'text-yellow-800',
          borderColor: 'border-yellow-200',
          icon: <Clock className="w-4 h-4 mr-1.5" />,
          text: 'Sent to Client',
          helperText:
            "Quote is locked and with the client. Awaiting review. You must 'Retract' it to make changes.",
        };
      // --- NEW (CONTEXT [415]): Purple Status ---
      case 'Pending Re-send':
        return {
          bgColor: 'bg-purple-100',
          textColor: 'text-purple-800',
          borderColor: 'border-purple-200',
          icon: <RefreshCw className="w-4 h-4 mr-1.5" />,
          text: 'Pending Re-send',
          helperText:
            "Changes were made after client approval. Review and 'Mark as Sent' to re-send.",
        };
      case 'Approved':
        return {
          bgColor: 'bg-blue-100',
          textColor: 'text-blue-800',
          borderColor: 'border-blue-200',
          icon: <CheckCircle className="w-4 h-4 mr-1.5" />,
          text: 'Approved by Client',
          helperText:
            "Client approved! Review and 'Generate Contract(s)'. (Saving changes now will require a re-send).",
        };
      case 'Contract Generated':
        return {
          bgColor: 'bg-green-100',
          textColor: 'text-green-800',
          borderColor: 'border-green-200',
          icon: <ShieldCheck className="w-4 h-4 mr-1.5" />,
          text: 'Contract(s) Generated',
          helperText:
            'Contracts are generated and available for download. Ready for e-signature.',
        };
      case 'Generation Failed':
         return {
          bgColor: 'bg-red-100',
          textColor: 'text-red-800',
          borderColor: 'border-red-200',
          icon: <AlertTriangle className="w-4 h-4 mr-1.5" />,
          text: 'Generation Failed',
          helperText:
            'Contract generation failed. Check logs, fix any issues, and try again.',
        };
      // --- NEW (CONTEXT [424]): Declined Status ---
      case 'Declined':
         return {
          bgColor: 'bg-red-100',
          textColor: 'text-red-800',
          borderColor: 'border-red-200',
          icon: <ArchiveX className="w-4 h-4 mr-1.5" />,
          text: 'Declined by Client',
          helperText:
            'The client has declined this quote. See "Decline Reason" for feedback.',
        };
      case 'New': // Handle old statuses
      case 'Pending':
      default:
        return {
          bgColor: 'bg-gray-100',
          textColor: 'text-gray-800',
          borderColor: 'border-gray-200',
          icon: <FileWarning className="w-4 h-4 mr-1.5" />,
          text: 'Drafted',
          helperText: 'This quote is a draft. Click "Mark as Sent" to activate the client link.',
        };
    }
  };
  const statusInfo = getStatusStyles(currentStatus);
  // --- End Status Badge Logic ---

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8"
      >
        {/* --- Header & Action Buttons --- */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {modelName}: {editableQuoteData.clientContactName || "No Name"}
            </h1>
            <p className="text-sm text-gray-500">Quote ID: {quoteId}</p>
          </div>
          <div className="flex space-x-3">
            <AnimatePresence>
              {isDirty && (
                <motion.button
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  onClick={handleSave}
                  disabled={isSaving || isSending || isGenerating || isRetracting} // --- MODIFIED (USER REQ 4) ---
                  className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 focus:outline-none disabled:opacity-50"
                >
                  <Save className="w-5 h-5 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </motion.button>
              )}
            </AnimatePresence>
            
            {/* --- NEW (USER REQ 4.D): 'Retract to Draft' Button --- */}
            {currentStatus === 'Sent' && (
              <button
                onClick={handleRetract}
                disabled={isGenerating || isSaving || isSending || isRetracting || isDirty}
                className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 focus:outline-none disabled:opacity-50"
              >
                <RotateCcw className="w-5 h-5 mr-2" />
                {isRetracting ? 'Retracting...' : 'Retract to Draft'}
              </button>
            )}
            
            {/* --- MODIFIED (USER REQ 4.C): 'Mark as Sent' Button --- */}
            {(currentStatus === 'Drafted' || currentStatus === 'New' || currentStatus === 'Pending' || currentStatus === 'Pending Re-send') && (
              <button
                onClick={handleMarkAsSent}
                disabled={isGenerating || isSaving || isSending || isRetracting || isDirty}
                className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-yellow-500 border border-transparent rounded-md shadow-sm hover:bg-yellow-600 focus:outline-none disabled:opacity-50"
              >
                <Send className="w-5 h-5 mr-2" />
                {isSending ? 'Sending...' : (currentStatus === 'Pending Re-send' ? 'Re-send Quote' : 'Mark as Sent')}
              </button>
            )}
            
            {/* --- Generate Contract(s) Button --- */}
            <button
              onClick={handleGenerateContracts}
              disabled={isGenerating || isSaving || isSending || isRetracting || isDirty || (currentStatus !== 'Approved' && currentStatus !== 'Generation Failed')}
              className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none disabled:opacity-50"
            >
              <FileText className="w-5 h-5 mr-2" />
              {isGenerating ? 'Generating...' : 'Generate Contract(s)'}
            </button>
          </div>
        </div>

        {/* --- Main Grid --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* --- Left Column: Admin Inputs --- */}
          <div className="lg:col-span-1 space-y-6">
            <SectionWrapper title="Client Details">
              <AdminInput
                label="Client Contact Name"
                id="clientContactName" 
                value={editableQuoteData.clientContactName}
                onChange={handleChange}
                disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
              />
              <AdminInput
                label="Client Email"
                id="email"
                type="email"
                value={editableQuoteData.email}
                onChange={handleChange}
                disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
              />
            </SectionWrapper>
            
            {/* --- Conditional Admin Panels --- */}

            {(editableQuoteData.serviceModel === 'subscription' || editableQuoteData.serviceModel === 'project') && (
              <SectionWrapper title="Tinker Toy Variables">
                <div className="grid grid-cols-2 gap-4">
                  <AdminInput
                    label="Project Hours"
                    id="hours"
                    type="number"
                    value={editableQuoteData.hours}
                    onChange={handleChange}
                    disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                  />
                  <AdminInput
                    label="Contingency Buffer (%)"
                    id="buffer"
                    type="number"
                    value={editableQuoteData.buffer}
                    onChange={handleChange}
                    disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <AdminInput
                    label="Discount (%)"
                    id="discountPct"
                    type="number"
                    value={editableQuoteData.discountPct}
                    onChange={handleChange}
                    disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                  />
                  <AdminInput
                    label="Discount ($)"
                    id="discountUsd"
                    type="number"
                    value={editableQuoteData.discountUsd}
                    onChange={handleChange}
                    disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                  />
                </div>
                {editableQuoteData.serviceModel === 'subscription' && (
                  <>
                    <div className="pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        <CalendarRange className="w-5 h-5 text-gray-500" />
                        <h4 className="text-md font-medium text-gray-800">Billing & Schedule</h4>
                      </div>
                    </div>
                    {/* --- NEW (USER REQ 3): Years to Project --- */}
                    <AdminInput
                      label="Years to Project"
                      id="paymentScheduleYears"
                      type="number"
                      value={editableQuoteData.paymentScheduleYears}
                      onChange={handleChange}
                      disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <AdminSelect
                        label="Billing Schedule"
                        id="billingSchedule"
                        value={editableQuoteData.billingSchedule}
                        onChange={handleChange}
                        disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                      >
                        <option value="standard">Standard</option>
                        <option value="seasonal">Seasonal</option>
                      </AdminSelect>
                      <AdminInput
                        label="First Payment (YYYY-MM)"
                        id="amortStartMonth"
                        value={editableQuoteData.amortStartMonth}
                        onChange={handleChange}
                        disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                      />
                    </div>
                    {editableQuoteData.billingSchedule === 'seasonal' && (
                       <div className="space-y-4">
                          <AdminInput
                            label="Year 1 Range (YYYY-MM:YYYY-MM)"
                            id="yr1SeasonalRange"
                            value={editableQuoteData.yr1SeasonalRange}
                            onChange={handleChange}
                            disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                          />
                           <AdminInput
                            label="Year 2+ Start (YYYY-MM)"
                            id="yr2StartDate"
                            value={editableQuoteData.yr2StartDate}
                            onChange={handleChange}
                            disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                          />
                           <AdminInput
                            label="Year 2+ Range (YYYY-MM:YYYY-MM)"
                            id="yr2SeasonalRange"
                            value={editableQuoteData.yr2SeasonalRange}
                            onChange={handleChange}
                            disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                          />
                       </div>
                    )}
                  </>
                )}
              </SectionWrapper>
            )}

            {editableQuoteData.serviceModel === 'maintenance' && (
              <SectionWrapper title="Maintenance Variables">
                <AdminInput
                  label="Monthly Fee ($)"
                  id="finalMonthlyFee"
                  type="number"
                  value={editableQuoteData.finalMonthlyFee}
                  onChange={handleChange}
                  disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                />
                <AdminInput
                  label="Included Hours / mo"
                  id="includedHours"
                  type="number"
                  value={editableQuoteData.includedHours}
                  onChange={handleChange}
                  disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                />
              </SectionWrapper>
            )}

            {editableQuoteData.serviceModel === 'hourly' && (
              <SectionWrapper title="Hourly Variables">
                <AdminInput
                  label="Estimated Hours"
                  id="hours"
                  type="number"
                  value={editableQuoteData.hours}
                  onChange={handleChange}
                  disabled={isLocked} // --- MODIFIED (USER REQ 4.A) ---
                />
                <PriceDisplay
                  label="Calculated Total"
                  value={(parseFloat(editableQuoteData.hours) || 0) * (configData.base_rates.hourly_rate || 0)}
                />
              </SectionWrapper>
            )}
            
          </div>

          {/* --- Right Column: Summary / Preview --- */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* --- Status & Links --- */}
            <SectionWrapper title="Quote Status & Links">
                
                {/* --- MODIFIED STATUS DISPLAY --- */}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Status</label>
                  <div 
                    className={`mt-1 flex items-center px-3 py-2 text-sm font-medium rounded-md border ${statusInfo.bgColor} ${statusInfo.textColor} ${statusInfo.borderColor}`}
                  >
                    {statusInfo.icon}
                    {statusInfo.text}
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    {statusInfo.helperText}
                  </p>
                </div>
                {/* --- END MODIFIED STATUS DISPLAY --- */}

                {isTinkerToy && (
                  <div className="pt-4 border-t border-gray-200"> {/* Added separation */}
                    <label className="block text-sm font-medium text-gray-700">Client Calculator Link</label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={`${window.location.origin}/quote/${quoteId}`}
                        className="mt-1 block w-full px-3 py-2 text-gray-500 bg-gray-100 border border-gray-300 rounded-md shadow-sm"
                        onFocus={(e) => e.target.select()}
                      />
                      <button 
                        type="button" 
                        className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-blue-600"
                        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/quote/${quoteId}`)}
                      >
                        <Link className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* --- Display Generated Documents --- */}
                {hasContracts && (
                  <div className="pt-4 border-t border-gray-200">
                    <h4 className="text-md font-medium text-gray-800">Generated Documents</h4>
                    <div className="mt-2 space-y-2">
                      {editableQuoteData.contractDocs.map((doc, index) => (
                        <a
                          key={index}
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download {doc.name}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* --- NEW (CONTEXT [426]): Show Decline Reason --- */}
                {currentStatus === 'Declined' && (
                  <div className="pt-4 border-t border-gray-200">
                    <h4 className="text-md font-medium text-red-800">Client Decline Reason</h4>
                    <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-md">
                      <p className="text-sm text-red-700">
                        {editableQuoteData.declineReason || "No reason provided."}
                      </p>
                    </div>
                  </div>
                )}
            </SectionWrapper>
            
            {/* --- Conditional Preview Panel --- */}
            
            {(editableQuoteData.serviceModel === 'subscription' || editableQuoteData.serviceModel === 'project') && calculatedFees && (
              <SectionWrapper title="Live Quote Preview">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <PriceDisplay
                    label="Due Today"
                    value={calculatedFees.setupFee}
                  />
                  <PriceDisplay
                    label="Total Monthly"
                    value={calculatedFees.totalActiveMonthly}
                  D/>
                  <PriceDisplay
                    label={editableQuoteData.serviceModel === 'subscription' ? 'Buyout Price' : 'Total Project Cost'}
                    value={editableQuoteData.serviceModel === 'subscription' ? calculatedFees.buyoutPrice : calculatedFees.totalCost}
                  />
                </div>
                
                {/* --- MODIFIED (USER REQ 3): Show full schedule --- */}
                {schedule.length > 0 && (
                  <div className="pt-4 border-t">
                    <h4 className="text-md font-medium text-gray-800 mb-2">
                      Payment Schedule Preview ({editableQuoteData.paymentScheduleYears || '...'} Years)
                    </h4>
                    {/* A simple schedule view for admin */}
                    <AdminScheduleTable schedule={schedule} />
                  </div>
                )}
              </SectionWrapper>
            )}
            
            {editableQuoteData.serviceModel === 'maintenance' && (
              <SectionWrapper title="Quote Summary">
                <PriceDisplay
                  label="Monthly Retainer Fee"
                  value={parseFloat(editableQuoteData.finalMonthlyFee) || 0}
                />
              </SectionWrapper>
            )}
            
            {editableQuoteData.serviceModel === 'hourly' && (
              <SectionWrapper title="Quote Summary">
                <PriceDisplay
                  label="Estimated Total Cost"
                  value={(parseFloat(editableQuoteData.hours) || 0) * (configData.base_rates.hourly_rate || 0)}
                />
              </SectionWrapper>
            )}
            
          </div>
        </div>
      </motion.div>

      <AlertModal
        isOpen={alert.show}
        onClose={() => setAlert({ ...alert, show: false })}
        title={alert.isError ? 'Error' : 'Success'}
        message={alert.message}
        icon={
          alert.isError ? (
            <AlertCircle className="w-12 h-12 text-red-500" />
          ) : (
            <CheckCircle className="w-12 h-12 text-green-500" />
          )
        }
      />
    </>
  );
}

export default QuoteProfile;
