/*
automated-hiring-funnel/client/src/components/NewQuoteModal.js
---
MODIFIED:
- Changed initial status on quote creation from 'Pending' to 'Drafted'
  (Step 1 of new status lifecycle).
*/

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogPanel,
  DialogTitle,
  Transition,
  TransitionChild,
} from '@headlessui/react';
import { LinkIcon, Loader2, AlertCircle, CalendarRange, Save, Briefcase, FileText } from 'lucide-react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

// --- Helper Components ---
const FormInput = ({ label, id, value, onChange, type = 'text', placeholder, step }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700">
      {label}
    </label>
    <div className="mt-1">
      <input
        type={type}
        name={id}
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        step={step}
        className="block w-full px-3 py-2 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
      />
    </div>
  </div>
);

// --- NEW Textarea Component ---
const FormTextarea = ({ label, id, value, onChange, placeholder, rows = 3 }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700">
      {label}
    </label>
    <div className="mt-1">
      <textarea
        id={id}
        name={id}
        rows={rows}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="block w-full px-3 py-2 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
      />
    </div>
  </div>
);

const SelectInput = ({ label, id, value, onChange, children }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700">
      {label}
    </label>
    <select
      id={id}
      name={id}
      value={value}
      onChange={onChange}
      className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
    >
      {children}
    </select>
  </div>
);

// --- Default state for the form ---
const defaultFormState = {
  clientContactName: '', // Renamed from clientName
  email: '',
  // NEW Legal Fields
  clientLegalName: '',
  clientLegalAddress: '',
  clientEntityType: '', // e.g., "California LLC"
  // NEW Project Fields
  projectTitle: '',
  projectScope: '',
  // Tinker Toy Fields
  hours: '10',
  buffer: '20',
  discountPct: '0',
  discountUsd: '0',
  billingSchedule: 'standard',
  amortStartMonth: '', 
  yr1SeasonalRange: '',
  yr2SeasonalRange: '',
  yr2StartDate: '',
  paymentScheduleYears: 2,
  // Maintenance Fields
  maintenanceFee: '',
  maintenanceHours: '',
  // Hourly Fields
  hourlyEstHours: '1',
};

export default function NewQuoteModal({ isOpen, onClose, onLinkGenerated }) {
  const { currentUser } = useAuth();
  const [config, setConfig] = useState(null);
  const [selectedModel, setSelectedModel] = useState('subscription'); // 'subscription', 'project', 'maintenance', 'hourly'
  const [formData, setFormData] = useState(defaultFormState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch config data when modal opens (for defaults)
  useEffect(() => {
    if (isOpen) {
      const fetchConfig = async () => {
        try {
          const configRef = doc(db, 'config', 'main');
          const configSnap = await getDoc(configRef);
          if (configSnap.exists()) {
            const configData = configSnap.data();
            setConfig(configData);
            // Pre-fill defaults
            setFormData(prev => ({
              ...prev,
              maintenanceFee: configData.models.maintenance.default_fee.toString(),
              maintenanceHours: configData.models.maintenance.default_included_hours.toString(),
              buffer: configData.base_rates.default_contingency_buffer_percent.toString(),
            }));
          } else {
            setError('Could not load pricing config. Please save in Product Manager.');
          }
        } catch (err) {
          setError('Failed to fetch pricing config.');
        }
      };
      fetchConfig();
    }
  }, [isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleModelChange = (e) => {
    setSelectedModel(e.target.value);
    setError(''); // Clear errors when switching
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Check for NEW required fields
    if (!formData.clientContactName || !formData.clientLegalName || !formData.projectTitle) {
      setError('Contact Name, Legal Name, and Project Title are required.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      let newQuoteData = {
        // Contact & Legal Info
        clientContactName: formData.clientContactName,
        email: formData.email,
        clientLegalName: formData.clientLegalName,
        clientLegalAddress: formData.clientLegalAddress,
        clientEntityType: formData.clientEntityType,
        // Project Info
        projectTitle: formData.projectTitle,
        projectScope: formData.projectScope,
        // System Info
        serviceModel: selectedModel,
        status: 'Drafted', // --- TASK: Set initial status to Drafted ---
        userId: currentUser.uid,
        createdAt: serverTimestamp(),
      };
      
      let link = null;

      // Add data specific to the chosen model
      if (selectedModel === 'subscription' || selectedModel === 'project') {
        // --- This is a "Tinker Toy" Quote ---
        newQuoteData = {
          ...newQuoteData,
          hours: parseFloat(formData.hours) || 0,
          buffer: parseFloat(formData.buffer) || 0,
          discountPct: parseFloat(formData.discountPct) || 0,
          discountUsd: parseFloat(formData.discountUsd) || 0,
          paymentScheduleYears: parseInt(formData.paymentScheduleYears, 10) || 2,
          ...(selectedModel === 'subscription' && {
            billingSchedule: formData.billingSchedule,
            amortStartMonth: formData.amortStartMonth,
            yr1SeasonalRange: formData.yr1SeasonalRange,
            yr2SeasonalRange: formData.yr2SeasonalRange,
            yr2StartDate: formData.yr2StartDate,
          }),
        };
        const docRef = await addDoc(collection(db, 'quotes'), newQuoteData);
        link = `${window.location.origin}/quote/${docRef.id}`;
        
      } else if (selectedModel === 'maintenance') {
        // --- This is a "Static Maintenance" Quote ---
        const fee = parseFloat(formData.maintenanceFee) || 0;
        newQuoteData = {
          ...newQuoteData,
          finalMonthlyFee: fee,
          finalTotalCost: fee * 12, // Set a default total for one year
          includedHours: parseFloat(formData.maintenanceHours) || 0,
        };
        await addDoc(collection(db, 'quotes'), newQuoteData);
        
      } else if (selectedModel === 'hourly') {
        // --- This is a "Static Hourly" Quote ---
        const hours = parseFloat(formData.hourlyEstHours) || 0;
        const total = hours * (config?.base_rates?.hourly_rate || 75);
        newQuoteData = {
          ...newQuoteData,
          hours: hours,
          finalTotalCost: total,
          finalSetupFee: total,
        };
        await addDoc(collection(db, 'quotes'), newQuoteData);
      }
      
      if (link) {
        onLinkGenerated(link); // Pass link to Dashboard
      }
      handleClose();

    } catch (err) {
      console.error('Error creating new quote:', err);
      setError('Failed to create quote. Please try again.');
    }
    setLoading(false);
  };

  const handleClose = () => {
    if (loading) return;
    setFormData(defaultFormState); // Reset to default state
    setSelectedModel('subscription');
    setError('');
    // Re-apply defaults from config if it's loaded
    if (config) {
      setFormData(prev => ({
        ...prev,
        ...defaultFormState, // Start from default
        maintenanceFee: config.models.maintenance.default_fee.toString(),
        maintenanceHours: config.models.maintenance.default_included_hours.toString(),
        buffer: config.base_rates.default_contingency_buffer_percent.toString(),
      }));
    }
    onClose();
  };

  // Change button text based on model
  const isTinkerToy = selectedModel === 'subscription' || selectedModel === 'project';
  const buttonText = isTinkerToy ? 'Save & Generate Client Link' : 'Save Static Quote';
  const ButtonIcon = isTinkerToy ? LinkIcon : Save;

  return (
    <Transition show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <TransitionChild
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-30" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex items-center justify-center min-h-full p-4 text-center">
            <TransitionChild
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-lg p-6 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-2xl">
                <div className="flex items-start justify-between">
                  <DialogTitle
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Create New Quote
                  </DialogTitle>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
                
                <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                  {error && (
                    <div className="flex p-3 text-sm text-red-700 bg-red-100 rounded-md">
                      <AlertCircle className="w-5 h-5 mr-2" />
                      <span>{error}</span>
                    </div>
                  )}
                  
                  <SelectInput
                    label="Quote Service Model"
                    id="serviceModel"
                    value={selectedModel}
                    onChange={handleModelChange}
                  >
                    <option value="subscription">Subscription (SaaS)</option>
                    <option value="project">Project Build & Buyout</option>
                    <option value="maintenance">Maintenance Retainer</option>
                    <option value="hourly">Ad-hoc / Hourly</option>
                  </SelectInput>
                  
                  <div className="pt-2 border-t border-gray-200" />

                  {/* --- Core Details (Always Show) --- */}
                  <FormInput
                    label="Client Contact Name"
                    id="clientContactName"
                    value={formData.clientContactName}
                    onChange={handleChange}
                    placeholder="e.g., Pete Jones"
                  />
                  <FormInput
                    label="Client Email (Optional)"
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="pete@lighting.com"
                  />

                  {/* --- NEW: Legal Details --- */}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                       <Briefcase className="w-5 h-5 text-gray-500" />
                       <h4 className="text-md font-medium text-gray-800">Client Legal Details (for Contracts)</h4>
                    </div>
                  </div>
                  <FormInput
                    label="Client Legal Name"
                    id="clientLegalName"
                    value={formData.clientLegalName}
                    onChange={handleChange}
                    placeholder="e.g., Pete's Holiday Lighting, LLC"
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormInput
                      label="Client Legal Address"
                      id="clientLegalAddress"
                      value={formData.clientLegalAddress}
                      onChange={handleChange}
                      placeholder="e.g., 123 Main St, Anytown, CA"
                    />
                    <FormInput
                      label="Client State & Entity Type"
                      id="clientEntityType"
                      value={formData.clientEntityType}
                      onChange={handleChange}
                      placeholder="e.g., California LLC"
                    />
                  </div>
                  
                  {/* --- NEW: Project Details --- */}
                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                       <FileText className="w-5 h-5 text-gray-500" />
                       <h4 className="text-md font-medium text-gray-800">Project Details (for SOW)</h4>
                    </div>
                  </div>
                  <FormInput
                    label="Project Title"
                    id="projectTitle"
                    value={formData.projectTitle}
                    onChange={handleChange}
                    placeholder="e.g., 2025 Holiday Website & Support"
                  />
                  <FormTextarea
                    label="High-Level Scope of Work"
                    id="projectScope"
                    value={formData.projectScope}
                    onChange={handleChange}
                    placeholder="Summarize the key deliverables and services to be provided..."
                    rows={4}
                  />

                  {/* --- Conditional Fields: Tinker Toy (Sub/Project) --- */}
                  <AnimatePresence>
                    {isTinkerToy && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden pt-2 border-t border-gray-100"
                      >
                        <h4 className="text-md font-medium text-gray-800">Calculator Variables</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <FormInput
                            label="Project Hours"
                            id="hours"
                            type="number"
                            value={formData.hours}
                            onChange={handleChange}
                          />
                          <FormInput
                            label="Contingency Buffer (%)"
                            id="buffer"
                            type="number"
                            value={formData.buffer}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <FormInput
                            label="Discount (%)"
                            id="discountPct"
                            type="number"
                            value={formData.discountPct}
                            onChange={handleChange}
                          />
                          <FormInput
                            label="Discount ($)"
                            id="discountUsd"
                            type="number"
                            value={formData.discountUsd}
                            onChange={handleChange}
                          />
                        </div>

                        {selectedModel === 'subscription' && (
                          <>
                            <div className="pt-2 border-t border-gray-100">
                              <div className="flex items-center gap-2">
                                <CalendarRange className="w-5 h-5 text-gray-500" />
                                <h4 className="text-md font-medium text-gray-800">Billing & Schedule</h4>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <SelectInput
                                label="Billing Schedule"
                                id="billingSchedule"
                                value={formData.billingSchedule}
                                onChange={handleChange}
                              >
                                <option value="standard">Standard (Billed Every Month)</option>
                                <option value="seasonal">Seasonal (Billed Specific Months)</option>
                              </SelectInput>
                              <FormInput
                                label="First Payment Month"
                                id="amortStartMonth"
                                type="text"
                                value={formData.amortStartMonth}
                                onChange={handleChange}
                                placeholder="YYYY-MM (e.g., 2025-11)"
                              />
                            </div>
                            {formData.billingSchedule === 'seasonal' && (
                              <div className="space-y-4">
                                <FormInput
                                  label="Year 1 Seasonal Range"
                                  id="yr1SeasonalRange"
                                  type="text"
                                  value={formData.yr1SeasonalRange}
                                  onChange={handleChange}
                                  placeholder="YYYY-MM:YYYY-MM (e.g., 2025-11:2025-12)"
                                />
                                <FormInput
                                  label="Year 2+ Start Month (Optional)"
                                  id="yr2StartDate"
                                  type="text"
                                  value={formData.yr2StartDate}
                                  onChange={handleChange}
                                  placeholder="YYYY-MM (e.g., 2026-09)"
                                />
                                <FormInput
                                  label="Year 2+ Seasonal Range (Optional)"
                                  id="yr2SeasonalRange"
                                  type="text"
                                  value={formData.yr2SeasonalRange}
                                  onChange={handleChange}
                                  placeholder="YYYY-MM:YYYY-MM (e.g., 2026-09:2026-12)"
                                />
                              </div>
                            )}
                          </>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* --- Conditional Fields: Maintenance --- */}
                  <AnimatePresence>
                    {selectedModel === 'maintenance' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden pt-2 border-t border-gray-100"
                      >
                        <h4 className="text-md font-medium text-gray-800">Retainer Variables</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <FormInput
                            label="Monthly Fee ($)"
                            id="maintenanceFee"
                            type="number"
                            value={formData.maintenanceFee}
                            onChange={handleChange}
                          />
                          <FormInput
                            label="Included Hours / mo"
                            id="maintenanceHours"
                            type="number"
                            value={formData.maintenanceHours}
                            onChange={handleChange}
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {/* --- Conditional Fields: Hourly --- */}
                  <AnimatePresence>
                    {selectedModel === 'hourly' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-4 overflow-hidden pt-2 border-t border-gray-100"
                      >
                        <h4 className="text-md font-medium text-gray-800">Hourly Variables</h4>
                        <FormInput
                          label="Estimated Hours"
                          id="hourlyEstHours"
                          type="number"
                          value={formData.hourlyEstHours}
                          onChange={handleChange}
                        />
                        <p className="text-sm text-gray-600">
                          Total cost will be calculated based on your default hourly rate of ${config?.base_rates?.hourly_rate || 'N/A'}.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {/* --- Submit Button --- */}
                  <div className="pt-4 border-t border-gray-200">
                    <button
                      type="submit"
                      disabled={loading}
                      className="inline-flex justify-center w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm disabled:bg-gray-400 hover:bg-blue-700 focus:outline-none"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      ) : (
                        <ButtonIcon className="w-5 h-5 mr-2" />
                      )}
                      {loading ? 'Generating...' : buttonText}
                    </button>
                  </div>

                </form>
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
