/*
automated-hiring-funnel/client/src/pages/Dashboard.js
*/

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from 'framer-motion';
import {
  Users,
  FileText,
  Clock,
  Settings,
  ArrowRight,
  Eye,
  LinkIcon, 
  CheckCircle,
  FileDown, // --- Import FileDown Icon ---
} from 'lucide-react';
import NewQuoteModal from '../components/NewQuoteModal';
import AlertModal from '../components/AlertModal';

// (QuoteStatus and RecentQuoteItem components remain unchanged)
// ...
const QuoteStatus = ({ status }) => {
  const statusMap = {
    Draft: 'bg-gray-100 text-gray-800',
    Sent: 'bg-blue-100 text-blue-800',
    Signed: 'bg-green-100 text-green-800',
    Default: 'bg-yellow-100 text-yellow-800',
  };
  const style = statusMap[status] || statusMap.Default;
  return (
    <span
      className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${style}`}
    >
      {status || 'N/A'}
    </span>
  );
};

const RecentQuoteItem = ({ quote }) => (
  <motion.li
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    className="flex items-center justify-between py-4"
  >
    <div className="flex items-center space-x-4">
      <div className="flex-shrink-0">
        <span className="flex items-center justify-center h-10 w-10 rounded-full bg-gray-100">
          <FileText className="h-5 w-5 text-gray-500" />
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900 truncate">
          {/* ---
            FIX: Changed from quote.clientName to quote.clientContactName
            This matches the field being saved by NewQuoteModal.js
            --- */}
          {quote.clientContactName || 'Unnamed Quote'}
        </p>
        <p className="text-sm text-gray-500">
          {quote.createdAt
            ? new Date(quote.createdAt.seconds * 1000).toLocaleDateString()
            : 'No date'}
        </p>
      </div>
    </div>
    <div className="flex items-center space-x-4">
      <QuoteStatus status={quote.status || 'Draft'} />
      <Link
        to={`/quote-profile/${quote.id}`}
        className="text-gray-400 hover:text-blue-600"
      >
        <Eye className="h-5 w-5" />
      </Link>
    </div>
  </motion.li>
);
// ...

export default function Dashboard() {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState({ total: 0, recent: 0 });
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  
  // --- This state will now handle BOTH links and PDFs ---
  const [shareAlert, setShareAlert] = useState({
    show: false,
    title: '',
    message: '',
    link: '',
    isPdf: false,
  });
  // ---------------------------------

  useEffect(() => {
    // ... (fetchDashboardData remains unchanged)
    const fetchDashboardData = async () => {
      if (!currentUser) return;
      setLoading(true);

      try {
        const q = query(
          collection(db, 'quotes'),
          where('userId', '==', currentUser.uid)
        );
        const querySnapshot = await getDocs(q);

        const totalQuotes = querySnapshot.size;
        const recentCount = totalQuotes;
        setStats({ total: totalQuotes, recent: recentCount });

        const recentQuery = query(
          collection(db, 'quotes'),
          where('userId', '==', currentUser.uid),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const recentSnapshot = await getDocs(recentQuery);
        const quotes = recentSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setRecentQuotes(quotes);
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      }
      setLoading(false);
    };
    fetchDashboardData();
  }, [currentUser]);

  // --- Updated Handler ---
  const handleLinkGenerated = (link) => {
    setShareAlert({
      show: true,
      title: 'Client Link Generated!',
      message: 'Here is the shareable link for your client. You can copy this and send it to them.',
      link: link,
      isPdf: false,
    });
  };

  // --- NEW Handler ---
  const handlePdfGenerated = (pdfUrl) => {
    setShareAlert({
      show: true,
      title: 'Static PDF Generated!',
      message: 'Your PDF has been generated. You can download it now to send to your client.',
      link: pdfUrl,
      isPdf: true,
    });
  };

  const statCards = [
    // ... (statCards array is unchanged)
    {
      name: 'Total Quotes',
      stat: stats.total,
      icon: Users,
      href: '/quotes',
      cta: 'View all quotes',
    },
    {
      name: 'New Leads',
      stat: stats.recent,
      icon: FileText,
      href: '/quotes',
      cta: 'View new leads',
    },
    {
      name: 'Pending Signatures',
      stat: '0',
      href: '#',
      icon: Clock,
      cta: 'View pending',
    },
  ];

  return (
    <> 
      <motion.div
        // ... (motion.div and all dashboard UI is unchanged) ...
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="p-6 md:p-10"
      >
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome back, {currentUser?.email || 'Admin'}. Here's your Quote Hub
          overview.
        </p>

        <div className="grid grid-cols-1 gap-6 mt-8 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((item) => (
            <div
              key={item.name}
              className="relative overflow-hidden bg-white rounded-lg shadow"
            >
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <span className="flex items-center justify-center w-12 h-12 text-white bg-blue-600 rounded-md">
                      <item.icon className="w-6 h-6" />
                    </span>
                  </div>
                  <div className="flex-1 w-0 ml-5">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">
                        {item.name}
                      </dt>
                      <dd>
                        <div className="text-3xl font-bold text-gray-900">
                          {loading ? '...' : item.stat}
                        </div>
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
              <div className="px-5 py-3 bg-gray-50">
                <div className="text-sm">
                  <Link
                    to={item.href}
                    className="font-medium text-blue-700 hover:text-blue-900"
                  >
                    {item.cta}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-10 mt-10 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="overflow-hidden bg-white rounded-lg shadow">
              <div className="p-5">
                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  Recent Quotes
                </h3>
              </div>
              <div className="px-5 border-t border-gray-200">
                <ul className="divide-y divide-gray-200">
                  {loading ? (
                    <li className="py-4 text-center text-gray-500">
                      Loading quotes...
                    </li>
                  ) : recentQuotes.length === 0 ? (
                    <li className="py-4 text-center text-gray-500">
                      You haven't created any quotes yet.
                    </li>
                  ) : (
                    recentQuotes.map((quote) => (
                      <RecentQuoteItem key={quote.id} quote={quote} />
                    ))
                  )}
                </ul>
              </div>
              <div className="px-5 py-3 bg-gray-50">
                <Link
                  to="/quotes"
                  className="flex items-center justify-center text-sm font-medium text-blue-700 hover:text-blue-900"
                >
                  View all quotes <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="overflow-hidden bg-white rounded-lg shadow">
              <div className="p-5">
                <h3 className="text-lg font-medium leading-6 text-gray-900">
                  Quick Actions
                </h3>
              </div>
              <div className="px-5 py-6 border-t border-gray-200">
                <div className="flex flex-col space-y-4">
                  <Link
                    to="/config"
                    className="flex items-center justify-center w-full px-4 py-3 text-base font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700"
                  >
                    <Settings className="w-5 h-5 mr-2" />
                    Manage Products & Pricing
                  </Link>
                  <button
                    type="button"
                    onClick={() => setIsQuoteModalOpen(true)}
                    className="flex items-center justify-center w-full px-4 py-3 text-base font-medium text-blue-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
                  >
                    Create New Quote
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* --- Modals --- */}
      <NewQuoteModal
        isOpen={isQuoteModalOpen}
        onClose={() => setIsQuoteModalOpen(false)}
        onLinkGenerated={handleLinkGenerated}
        onPdfGenerated={handlePdfGenerated} // --- Pass new handler ---
      />

      <AlertModal
        isOpen={shareAlert.show}
        onClose={() => setShareAlert({ ...shareAlert, show: false })}
        title={shareAlert.title}
        message={shareAlert.message}
        icon={<CheckCircle className="w-12 h-12 text-green-500" />}
      >
        {/* --- Conditionally render button or input --- */}
        <div className="mt-4">
          {shareAlert.isPdf ? (
            // --- Show Download Button ---
            <a
              href={shareAlert.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-full px-4 py-2 mt-3 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none"
            >
              <FileDown className="w-4 h-4 mr-2" />
              Download PDF
            </a>
          ) : (
            // --- Show Copy Link Input ---
            <>
              <input
                type="text"
                readOnly
                value={shareAlert.link}
                className="w-full px-3 py-2 text-sm text-gray-700 bg-gray-100 border border-gray-300 rounded-md"
                onClick={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(shareAlert.link)}
                className="inline-flex items-center justify-center w-full px-4 py-2 mt-3 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none"
              >
                <LinkIcon className="w-4 h-4 mr-2" />
                Copy Link
              </button>
            </>
          )}
        </div>
      </AlertModal>
    </>
  );
}
