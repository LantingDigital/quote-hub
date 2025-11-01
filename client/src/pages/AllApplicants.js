/*
automated-hiring-funnel/client/src/pages/AllApplicants.js
---
MODIFIED:
- Renamed to AllQuotes.js (as per context.txt)
- TASK (Plan Step 4): Replaced the local 'formatStatus' function
  with the new reusable 'StatusBadge' component to ensure
  visual consistency.
*/

import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, FileSearch, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import emptyStateImage from '../assets/empty-state.png';
import StatusBadge from '../components/StatusBadge'; // <-- TASK: Import new component

// --- TASK: Deleted the old, local formatStatus function ---

function AllQuotes() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    setLoading(true);
    // New query based on our "Quote" data model
    const q = query(
      collection(db, 'quotes'),
      orderBy('createdAt', 'desc') // Assuming you'll have a createdAt timestamp
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const quotesData = [];
      querySnapshot.forEach((doc) => {
        quotesData.push({ id: doc.id, ...doc.data() });
      });
      setQuotes(quotesData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching quotes: ", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8"
    >
      <h1 className="text-3xl font-bold text-gray-900 mb-6">All Quotes</h1>

      {quotes.length === 0 ? (
        <div className="text-center bg-white shadow rounded-lg p-12">
          <img
            src={emptyStateImage}
            alt="No quotes"
            className="mx-auto h-40 w-40"
          />
          <h3 className="mt-4 text-xl font-medium text-gray-900">No quotes found</h3>
          <p className="mt-2 text-sm text-gray-500">
            Get started by creating a new quote from the dashboard.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {quotes.map((quote) => (
              <li
                key={quote.id}
                className="px-4 py-4 sm:px-6 hover:bg-gray-50 cursor-pointer"
                onClick={() => navigate(`/quote-profile/${quote.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="truncate">
                    <div className="flex text-lg font-medium text-blue-600">
                      <User className="w-5 h-5 text-gray-400 mr-2" />
                      {quote.clientContactName || 'No Name'}
                    </div>
                    <div className="flex items-center text-sm text-gray-500 mt-2">
                      <FileSearch className="w-4 h-4 text-gray-400 mr-2" />
                      <p className="truncate">
                        {quote.projectTitle || (quote.id)}
                      </p>
                    </div>
                  </div>
                  <div className="ml-5 flex-shrink-0">
                    {/* --- TASK: Use new StatusBadge component --- */}
                    <StatusBadge status={quote.status} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

export default AllQuotes;
