/*
client/src/components/ModifyModal.js
---
NEW FILE:
- This is the modal component for the "Request to Modify" feature.
- It is based on DeclineModal.js but adapted for this flow.
- It requires a comment to be submitted.
*/

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { XCircle, MessageSquare, Loader2 } from 'lucide-react';

const ModifyModal = ({ isOpen, onClose, onSubmit, isLoading = false }) => {
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!reason) {
      alert('Please provide a reason for your modification request.');
      return;
    }
    onSubmit(reason);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative p-6 bg-white rounded-lg shadow-xl max-w-lg w-full"
      >
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          <XCircle className="w-6 h-6" />
        </button>
        <div className="flex items-start">
          <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 sm:mx-0">
            <MessageSquare className="h-6 w-6 text-blue-600" />
          </div>
          <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left flex-1">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
              Request to Modify Quote
            </h3>
            <div className="mt-2">
              <p className="text-sm text-gray-500">
                Please let us know what you'd like to change. Your request
                will be sent to our team for review.
              </p>
              <textarea
                id="modifyReason"
                rows={4}
                className="mt-4 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md disabled:bg-gray-100"
                placeholder="e.g., 'Please change the start date to next month,' 'Can we adjust the scope of Phase 1?'"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
        </div>
        <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
          <button
            type="button"
            disabled={isLoading || !reason}
            className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
            onClick={handleSubmit}
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : null}
            {isLoading ? 'Submitting...' : 'Submit Request'}
          </button>
          <button
            type="button"
            className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50"
            onClick={onClose}
            disabled={isLoading}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ModifyModal;
