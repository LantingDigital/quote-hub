import React, { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'framer-motion';
import { Save, Loader2, AlertCircle, CheckCircle, X } from 'lucide-react';
import AlertModal from '../components/AlertModal';

// --- Helper Components (Unchanged) ---
const ConfigInput = ({ label, value, onChange, placeholder, type = 'text', step }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700">{label}</label>
    <div className="mt-1">
      <input
        type={type}
        step={step}
        value={value ?? ''} 
        onChange={onChange}
        placeholder={placeholder}
        className="block w-full px-3 py-2 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
      />
    </div>
  </div>
);

const ConfigTextarea = ({ label, value, onChange, placeholder, rows = 3 }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700">{label}</label>
    <div className="mt-1">
      <textarea
        rows={rows}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
        className="block w-full px-3 py-2 placeholder-gray-400 border border-gray-300 rounded-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
      />
    </div>
  </div>
);

// --- NEW (Re-Added): Amortization Terms Editor ---
const AmortizationTermEditor = ({ terms, setConfig }) => {
  const [currentTerm, setCurrentTerm] = useState('');

  const addTerm = () => {
    const newTerm = parseInt(currentTerm, 10);
    if (isNaN(newTerm) || newTerm <= 0 || terms.includes(newTerm)) {
      setCurrentTerm('');
      return;
    }
    setConfig((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        subscription: {
          ...prev.models.subscription,
          amortization_terms: [...prev.models.subscription.amortization_terms, newTerm].sort((a, b) => a - b),
        },
      },
    }));
    setCurrentTerm('');
  };

  const removeTerm = (termToRemove) => {
    setConfig((prev) => ({
      ...prev,
      models: {
        ...prev.models,
        subscription: {
          ...prev.models.subscription,
          amortization_terms: prev.models.subscription.amortization_terms.filter(t => t !== termToRemove),
        },
      },
    }));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTerm();
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">Available Amortization Terms (in months)</label>
      <div className="flex mt-1">
        <input
          type="number"
          value={currentTerm}
          onChange={(e) => setCurrentTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="e.g., 12"
          className="block w-full px-3 py-2 placeholder-gray-400 border border-gray-300 rounded-l-md shadow-sm appearance-none focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
        <button
          type="button"
          onClick={addTerm}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-r-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        {(terms || []).map((term) => (
          <span key={term} className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 rounded-full">
            {term} months
            <button
              type="button"
              onClick={() => removeTerm(term)}
              className="inline-flex items-center justify-center w-4 h-4 ml-2 text-blue-500 rounded-full hover:bg-blue-200 hover:text-blue-700 focus:outline-none"
            >
              <span className="sr-only">Remove {term} months</span>
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
};


// --- Wrapper Components (Unchanged) ---
const PageWrapper = ({ children }) => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">{children}</div>
);

const SectionWrapper = ({ title, children, actions }) => (
  <div className="bg-white rounded-lg shadow mb-6">
    <div className="px-4 py-5 sm:px-6 border-b border-gray-200 flex justify-between items-center">
      <h3 className="text-lg leading-6 font-medium text-gray-900">{title}</h3>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
    <div className="px-4 py-5 sm:p-6 space-y-4">
      {children}
    </div>
  </div>
);

// --- Default State (Based on new config.json) ---
const defaultConfig = {
  company_info: {
    name: "Lanting Digital LLC",
    contact_name: "Caleb Lanting",
    contact_email: "caleb@lantingdigital.com",
    logo_path: "logo.png"
  },
  base_rates: {
    hourly_rate: '75.00',
    default_contingency_buffer_percent: '20',
    overage_rate_multiplier: '1.0'
  },
  models: {
    subscription: {
      display_name: "Subscription (WaaS/SaaS)",
      description: "Our all-in-one subscription model...",
      default_min_term_months: '12',
      buyout_policy: "total_build_cost",
      amortization_terms: [12, 18, 24], // <-- NEW FIELD
      tiers: {
        foundation: {
          name: "Foundation",
          monthly_rate: '149.00',
          description: "Ideal for new businesses...",
          features_list: "**Ideal For:** New businesses, simple sites\n**Initial Build:** Standard 5-Page Website (Semi-Custom)\n**Basic Support/Updates:** Up to 1 hour / month\n**Feature Buildout Hours:** ---\n**Buildout Rollover?:** N/A"
        },
        growth: {
          name: "Growth",
          monthly_rate: '299.00',
          description: "Perfect for growing businesses...",
          features_list: "**Ideal For:** Growing businesses, added features\n**Initial Build:** Custom Design Website (Up to 10 Pages)\n**Basic Support/Updates:** Up to 2 hours / month\n**Feature Buildout Hours:** Up to 1 hour / month\n**Buildout Rollover?:** No"
        },
        accelerator: {
          name: "Accelerator",
          monthly_rate: '499.00',
          description: "Our premium package...",
          rollover_cap_hours: '50',
          features_list: "**Ideal For:** Businesses needing active evolution\n**Initial Build:** Custom Website or Web App Base\n**Basic Support/Updates:** Up to 3 hours / month\n**Feature Buildout Hours:** Up to 5 hours / month\n**Buildout Rollover?:** Yes (Cap at 50 hours)"
        }
      },
      payment_options: {
        flex_start: {
          name: "Flex Start (0% Down)",
          setup_fee_percent_of_build: '0',
          description: "Pay $0 of the build cost upfront."
        },
        split_pay: {
          name: "Split Pay (50% Down)",
          setup_fee_percent_of_build: '50',
          description: "Pay 50% of the build cost upfront."
        },
        full_buyout: {
          name: "Full Buyout (100% Down)",
          setup_fee_percent_of_build: '100',
          description: "Pay 100% of the build cost upfront."
        }
      }
    },
    project: {
      display_name: "Project Build & Buyout",
      description: "A traditional, fixed-price project..."
    },
    maintenance: {
      display_name: "Maintenance Retainer",
      description: "For clients who own their site...",
      default_fee: '179.00',
      default_included_hours: '2',
      features_list: "**Hosting:** Secure hosting...\n**Backups:** Regular automated backups...\n**Security:** Ongoing security monitoring..."
    },
    hourly: {
      display_name: "Ad-hoc / Hourly Task",
      description: "For tasks exceeding retainer hours...",
      process_note: "For requests estimated > 1-2 hours..."
    }
  }
};

// --- Helper function to parse numbers on save ---
const parseConfigNumbers = (config) => {
  const parseFloatOrZero = (val) => parseFloat(val) || 0;

  // Helper to map over keys of an object
  const mapObjectValues = (obj, mapFn) => 
    Object.keys(obj).reduce((acc, key) => {
      acc[key] = mapFn(obj[key]);
      return acc;
    }, {});

  return {
    ...config,
    base_rates: {
      hourly_rate: parseFloatOrZero(config.base_rates.hourly_rate),
      default_contingency_buffer_percent: parseFloatOrZero(config.base_rates.default_contingency_buffer_percent),
      overage_rate_multiplier: parseFloatOrZero(config.base_rates.overage_rate_multiplier),
    },
    models: {
      ...config.models,
      subscription: {
        ...config.models.subscription,
        default_min_term_months: parseInt(config.models.subscription.default_min_term_months, 10) || 12,
        // Amortization terms are already numbers, just ensure it's an array
        amortization_terms: Array.isArray(config.models.subscription.amortization_terms) 
          ? config.models.subscription.amortization_terms 
          : [],
        tiers: mapObjectValues(config.models.subscription.tiers, tier => ({
          ...tier,
          monthly_rate: parseFloatOrZero(tier.monthly_rate),
          // split features_list back into an array
          features_list: tier.features_list.split('\n'), 
          // Handle optional field
          ...(tier.rollover_cap_hours && { rollover_cap_hours: parseFloatOrZero(tier.rollover_cap_hours) })
        })),
        payment_options: mapObjectValues(config.models.subscription.payment_options, plan => ({
          ...plan,
          setup_fee_percent_of_build: parseFloatOrZero(plan.setup_fee_percent_of_build),
        })),
      },
      maintenance: {
        ...config.models.maintenance,
        default_fee: parseFloatOrZero(config.models.maintenance.default_fee),
        default_included_hours: parseFloatOrZero(config.models.maintenance.default_included_hours),
        // split features_list back into an array
        features_list: config.models.maintenance.features_list.split('\n'),
      },
    },
  };
};

// --- Helper function to format numbers for editing ---
const formatConfigStrings = (config) => {
  const StringOrEmpty = (val) => String(val ?? '');

  // Helper to map over keys of an object
  const mapObjectValues = (obj, mapFn) => 
    Object.keys(obj).reduce((acc, key) => {
      acc[key] = mapFn(obj[key]);
      return acc;
    }, {});

  return {
    ...config,
    base_rates: {
      hourly_rate: StringOrEmpty(config.base_rates.hourly_rate),
      default_contingency_buffer_percent: StringOrEmpty(config.base_rates.default_contingency_buffer_percent),
      overage_rate_multiplier: StringOrEmpty(config.base_rates.overage_rate_multiplier),
    },
    models: {
      ...config.models,
      subscription: {
        ...config.models.subscription,
        default_min_term_months: StringOrEmpty(config.models.subscription.default_min_term_months),
        // Ensure amortization_terms is an array, even if missing from loaded data
        amortization_terms: Array.isArray(config.models.subscription.amortization_terms) 
          ? config.models.subscription.amortization_terms 
          : [12, 18, 24], // Default fallback
        tiers: mapObjectValues(config.models.subscription.tiers, tier => ({
          ...tier,
          monthly_rate: StringOrEmpty(tier.monthly_rate),
          // join features_list into a string for textarea
          features_list: Array.isArray(tier.features_list) ? tier.features_list.join('\n') : '',
          ...(tier.rollover_cap_hours && { rollover_cap_hours: StringOrEmpty(tier.rollover_cap_hours) })
        })),
        payment_options: mapObjectValues(config.models.subscription.payment_options, plan => ({
          ...plan,
          setup_fee_percent_of_build: StringOrEmpty(plan.setup_fee_percent_of_build),
        })),
      },
      maintenance: {
        ...config.models.maintenance,
        default_fee: StringOrEmpty(config.models.maintenance.default_fee),
        default_included_hours: StringOrEmpty(config.models.maintenance.default_included_hours),
        // join features_list into a string for textarea
        features_list: Array.isArray(config.models.maintenance.features_list) ? config.models.maintenance.features_list.join('\n') : '',
      },
    },
  };
};

// --- Main Page Component (Refactored) ---
function ProductManager() {
  const [config, setConfig] = useState(defaultConfig);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [alert, setAlert] = useState({ show: false, message: '', isError: false });

  // Load config from Firestore on mount
  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const docRef = doc(db, 'config', 'main');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.base_rates) {
          setConfig(formatConfigStrings(data));
        } else {
          console.warn("Outdated schema in 'config/main'. Loading default config.");
          setConfig(defaultConfig);
        }
      } else {
        setConfig(defaultConfig);
      }
    } catch (error) {
      console.error("Error loading config:", error);
      setAlert({ show: true, message: `Failed to load config: ${error.message}`, isError: true });
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  
  // --- Generic Change Handlers (Unchanged) ---

  const handleCompanyChange = (field, value) => {
    setConfig((prev) => ({
      ...prev,
      company_info: {
        ...prev.company_info,
        [field]: value,
      }
    }));
  };

  const handleBaseRatesChange = (field, value) => {
    setConfig((prev) => ({
      ...prev,
      base_rates: {
        ...prev.base_rates,
        [field]: value,
      }
    }));
  };

  const handleModelChange = (modelKey, field, value) => {
    setConfig(prev => ({
      ...prev,
      models: {
        ...prev.models,
        [modelKey]: {
          ...prev.models[modelKey],
          [field]: value,
        }
      }
    }));
  };

  const handleSubscriptionTierChange = (tierKey, field, value) => {
    setConfig(prev => ({
      ...prev,
      models: {
        ...prev.models,
        subscription: {
          ...prev.models.subscription,
          tiers: {
            ...prev.models.subscription.tiers,
            [tierKey]: {
              ...prev.models.subscription.tiers[tierKey],
              [field]: value,
            }
          }
        }
      }
    }));
  };

  const handleSubscriptionPaymentChange = (planKey, field, value) => {
    setConfig(prev => ({
      ...prev,
      models: {
        ...prev.models,
        subscription: {
          ...prev.models.subscription,
          payment_options: {
            ...prev.models.subscription.payment_options,
            [planKey]: {
              ...prev.models.subscription.payment_options[planKey],
              [field]: value,
            }
          }
        }
      }
    }));
  };


  // Save config to Firestore
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const configToSave = parseConfigNumbers(config);
      
      const docRef = doc(db, 'config', 'main');
      await setDoc(docRef, configToSave);

      setAlert({ show: true, message: 'Configuration saved successfully!', isError: false });
    } catch (error) {
      console.error("Error saving config:", error);
      setAlert({ show: true, message: `Failed to save config: ${error.message}`, isError: true });
    }
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }
  
  // --- New JSX for the Refactored UI ---
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <PageWrapper>
        {/* --- Header and Save Button --- */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">
            Business Product Manager
          </h1>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            {isSaving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>

        {/* --- Three-column grid layout --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* --- Column 1: Global & Other Models --- */}
          <div className="lg:col-span-1 space-y-6">
            <SectionWrapper title="Company Info">
              <ConfigInput
                label="Company Name"
                value={config.company_info.name}
                onChange={(e) => handleCompanyChange('name', e.target.value)}
              />
              <ConfigInput
                label="Contact Name"
                value={config.company_info.contact_name}
                onChange={(e) => handleCompanyChange('contact_name', e.target.value)}
              />
              <ConfigInput
                label="Contact Email"
                value={config.company_info.contact_email}
                onChange={(e) => handleCompanyChange('contact_email', e.target.value)}
              />
            </SectionWrapper>
            
            <SectionWrapper title="Global Base Rates">
              <ConfigInput
                label="Base Hourly Rate ($)"
                type="number"
                value={config.base_rates.hourly_rate}
                onChange={(e) => handleBaseRatesChange('hourly_rate', e.target.value)}
                placeholder="e.g., 75"
              />
              <ConfigInput
                label="Default Contingency Buffer (%)"
                type="number"
                value={config.base_rates.default_contingency_buffer_percent}
                onChange={(e) => handleBaseRatesChange('default_contingency_buffer_percent', e.target.value)}
                placeholder="e.g., 20"
              />
              <ConfigInput
                label="Overage Rate Multiplier"
                type="number"
                step="0.1"
                value={config.base_rates.overage_rate_multiplier}
                onChange={(e) => handleBaseRatesChange('overage_rate_multiplier', e.target.value)}
                placeholder="e.g., 1.0"
              />
            </SectionWrapper>

            <SectionWrapper title="Project Build & Buyout Model">
              <ConfigInput
                label="Display Name"
                value={config.models.project.display_name}
                onChange={(e) => handleModelChange('project', 'display_name', e.target.value)}
              />
               <ConfigTextarea
                label="Description"
                value={config.models.project.description}
                onChange={(e) => handleModelChange('project', 'description', e.target.value)}
                rows={5}
              />
            </SectionWrapper>

            <SectionWrapper title="Maintenance Retainer Model">
              <ConfigInput
                label="Display Name"
                value={config.models.maintenance.display_name}
                onChange={(e) => handleModelChange('maintenance', 'display_name', e.target.value)}
              />
               <ConfigTextarea
                label="Description"
                value={config.models.maintenance.description}
                onChange={(e) => handleModelChange('maintenance', 'description', e.target.value)}
                rows={5}
              />
              <ConfigInput
                label="Default Monthly Fee ($)"
                type="number"
                value={config.models.maintenance.default_fee}
                onChange={(e) => handleModelChange('maintenance', 'default_fee', e.target.value)}
              />
              <ConfigInput
                label="Default Included Hours"
                type="number"
                value={config.models.maintenance.default_included_hours}
                onChange={(e) => handleModelChange('maintenance', 'default_included_hours', e.target.value)}
              />
              <ConfigTextarea
                label="Features List (one per line)"
                value={config.models.maintenance.features_list}
                onChange={(e) => handleModelChange('maintenance', 'features_list', e.target.value)}
                rows={7}
              />
            </SectionWrapper>

            <SectionWrapper title="Ad-hoc / Hourly Task Model">
              <ConfigInput
                label="Display Name"
                value={config.models.hourly.display_name}
                onChange={(e) => handleModelChange('hourly', 'display_name', e.target.value)}
              />
               <ConfigTextarea
                label="Description"
                value={config.models.hourly.description}
                onChange={(e) => handleModelChange('hourly', 'description', e.target.value)}
                rows={4}
              />
               <ConfigTextarea
                label="Process Note"
                value={config.models.hourly.process_note}
                onChange={(e) => handleModelChange('hourly', 'process_note', e.target.value)}
                rows={3}
              />
            </SectionWrapper>
          </div>
          
          {/* --- Columns 2 & 3: Subscription Model --- */}
          <div className="lg:col-span-2 space-y-6">
            <SectionWrapper title="Subscription (WaaS/SaaS) Model">
              <ConfigInput
                label="Display Name"
                value={config.models.subscription.display_name}
                onChange={(e) => handleModelChange('subscription', 'display_name', e.target.value)}
              />
              <ConfigTextarea
                label="Description"
                value={config.models.subscription.description}
                onChange={(e) => handleModelChange('subscription', 'description', e.target.value)}
                rows={4}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ConfigInput
                  label="Default Min. Term (Months)"
                  type="number"
                  value={config.models.subscription.default_min_term_months}
                  onChange={(e) => handleModelChange('subscription', 'default_min_term_months', e.target.value)}
                />
                <ConfigInput
                  label="Buyout Policy"
                  value={config.models.subscription.buyout_policy}
                  onChange={(e) => handleModelChange('subscription', 'buyout_policy', e.target.value)}
                />
              </div>

              {/* --- Subscription: Tiers --- */}
              <div className="mt-4">
                <h5 className="text-md font-semibold text-gray-800 mb-2">Subscription Tiers</h5>
                <div className="space-y-4">
                  {Object.keys(config.models.subscription.tiers).map((tierKey) => {
                    const tier = config.models.subscription.tiers[tierKey];
                    return (
                      <div key={tierKey} className="p-4 border rounded-md bg-gray-50 space-y-3">
                        <ConfigInput
                          label="Tier Name"
                          value={tier.name}
                          onChange={(e) => handleSubscriptionTierChange(tierKey, 'name', e.target.value)}
                        />
                        <ConfigInput
                          label="Monthly SaaS Cost ($)"
                          type="number"
                          value={tier.monthly_rate}
                          onChange={(e) => handleSubscriptionTierChange(tierKey, 'monthly_rate', e.target.value)}
                        />
                        <ConfigTextarea
                          label="Description"
                          value={tier.description}
                          onChange={(e) => handleSubscriptionTierChange(tierKey, 'description', e.target.value)}
                          rows={3}
                        />
                        <ConfigTextarea
                          label="Features List (one per line)"
                          value={tier.features_list}
                          onChange={(e) => handleSubscriptionTierChange(tierKey, 'features_list', e.target.value)}
                          rows={6}
                        />
                        {tier.hasOwnProperty('rollover_cap_hours') && (
                           <ConfigInput
                            label="Rollover Cap (Hours)"
                            type="number"
                            value={tier.rollover_cap_hours}
                            onChange={(e) => handleSubscriptionTierChange(tierKey, 'rollover_cap_hours', e.target.value)}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              
              {/* --- Subscription: Payment Plans --- */}
              <div className="mt-6">
                <h5 className="text-md font-semibold text-gray-800 mb-2">Payment Plans</h5>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {Object.keys(config.models.subscription.payment_options).map((planKey) => {
                    const plan = config.models.subscription.payment_options[planKey];
                    return (
                      <div key={planKey} className="p-3 border rounded-md bg-gray-50 space-y-3">
                        <ConfigInput
                          label="Plan Name"
                          value={plan.name}
                          onChange={(e) => handleSubscriptionPaymentChange(planKey, 'name', e.target.value)}
                        />
                        <ConfigInput
                          label="Down Payment (% of Build)"
                          type="number"
                          value={plan.setup_fee_percent_of_build}
                          onChange={(e) => handleSubscriptionPaymentChange(planKey, 'setup_fee_percent_of_build', e.target.value)}
                        />
                        <ConfigTextarea
                          label="Description"
                          value={plan.description}
                          onChange={(e) => handleSubscriptionPaymentChange(planKey, 'description', e.target.value)}
                          rows={3}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* --- NEW: Subscription: Amortization --- */}
              <div className="mt-6">
                <h5 className="text-md font-semibold text-gray-800 mb-2">Amortization Terms</h5>
                <AmortizationTermEditor
                  terms={config.models.subscription.amortization_terms}
                  setConfig={setConfig}
                />
              </div>

            </SectionWrapper>
          </div>
        </div>
      </PageWrapper>

      <AlertModal
        isOpen={alert.show}
        onClose={() => setAlert({ ...alert, show: false })}
        title={alert.isError ? 'Error Occurred' : 'Success'}
        message={alert.message}
        icon={
          alert.isError ? (
            <AlertCircle className="w-12 h-12 text-red-500" />
          ) : (
            <CheckCircle className="w-12 h-12 text-green-500" />
          )
        }
      />
    </motion.div>
  );
}

export default ProductManager;
