/*
client/src/components/StatusBadge.js
---
MODIFIED:
- (FIX) Updated logic to correctly map old/default statuses
  ('New', 'Pending', null) to the 'Drafted' pill.
- FEAT (CONTEXT [415, 424]): Added 'Pending Re-send' (Purple 💜)
  and 'Declined' (Red ❤️) to support the new status lifecycle.
*/

import React from 'react';
import {
  FileWarning,
  Clock,
  CheckCircle,
  ShieldCheck,
  AlertTriangle,
  ArchiveX, // For Declined
  RefreshCw, // For Pending Re-send
} from 'lucide-react';

const getStatusInfo = (status) => {
  switch (status) {
    case 'Drafted':
      return {
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-800',
        icon: <FileWarning className="w-4 h-4" />,
        text: 'Drafted',
      };
    case 'Sent':
      return {
        bgColor: 'bg-yellow-100',
        textColor: 'text-yellow-800',
        icon: <Clock className="w-4 h-4" />,
        text: 'Sent',
      };
    // --- NEW (CONTEXT [415]): Purple Status ---
    case 'Pending Re-send':
       return {
        bgColor: 'bg-purple-100',
        textColor: 'text-purple-800',
        icon: <RefreshCw className="w-4 h-4" />,
        text: 'Pending Re-send',
      };
    case 'Approved':
      return {
        bgColor: 'bg-blue-100',
        textColor: 'text-blue-800',
        icon: <CheckCircle className="w-4 h-4" />,
        text: 'Approved',
      };
    case 'Contract Generated':
      return {
        bgColor: 'bg-green-100',
        textColor: 'text-green-800',
        icon: <ShieldCheck className="w-4 h-4" />,
        text: 'Contract Generated',
      };
    case 'Generation Failed':
      return {
        bgColor: 'bg-red-100',
        textColor: 'text-red-800',
        icon: <AlertTriangle className="w-4 h-4" />,
        text: 'Failed',
      };
    // --- NEW (CONTEXT [424]): Declined Status ---
    case 'Declined':
       return {
        bgColor: 'bg-red-100',
        textColor: 'text-red-800',
        icon: <ArchiveX className="w-4 h-4" />,
        text: 'Declined',
      };
    case 'New': // Handle old statuses
    case 'Pending':
    default: // Handle 'New', 'Pending', or other old/unknown statuses
      return {
        bgColor: 'bg-gray-100',
        textColor: 'text-gray-800',
        icon: <FileWarning className="w-4 h-4" />,
        text: 'Drafted',
      };
  }
};

/**
 * A reusable badge for displaying quote status.
 * @param {string} status - The status string (e.g., 'Drafted', 'Sent').
 */
const StatusBadge = ({ status }) => {
  const { bgColor, textColor, icon, text } = getStatusInfo(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${bgColor} ${textColor}`}
    >
      {icon}
      {text}
    </span>
  );
};

export default StatusBadge;
