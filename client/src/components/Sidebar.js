import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
// --- Icons Updated ---
import { HomeIcon, XMarkIcon } from '@heroicons/react/24/outline'; // Kept these
import { FileSearch, Settings, LogOut } from 'lucide-react'; // Added these from the library we just installed
// ---
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useScrollDirection } from '../hooks/useScrollDirection';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';

// --- Animation Variants (Unchanged) ---
const sidebarVariants = {
  expanded: {
    width: '16rem', // 256px
    transition: {
      type: 'spring',
      damping: 15,
      stiffness: 100,
      duration: 0.3,
    },
  },
  collapsed: {
    width: '5rem', // 80px
    transition: {
      type: 'spring',
      damping: 15,
      stiffness: 100,
      duration: 0.3,
    },
  },
};

const headerVariants = {
  visible: { y: 0 },
  hidden: { y: '-100%' },
};

const navContainerVariants = {
  visible: { y: 0 },
  hidden: { y: '-5rem' }, // 80px, the height of the header
};

const textVariants = {
  hidden: {
    opacity: 0,
    x: -10,
    transition: {
      type: 'spring',
      damping: 15,
      stiffness: 100,
      duration: 0.1,
    },
  },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      type: 'spring',
      damping: 15,
      stiffness: 100,
      duration: 0.1,
      delay: 0.1,
    },
  },
};

// --- NOTE: 'isReordering' prop removed from here ---
function Sidebar({ isMobileMenuOpen, onLinkClick }) {
  const [isHovering, setIsHovering] = useState(false);
  const { currentUser, logout } = useAuth();
  const { isReordering: isContextReordering } = useProfile(); // This is from context, for drag-and-drop
  const navigate = useNavigate();
  const isMediumScreen = useMediaQuery('(min-width: 768px)');

  // --- NOTE: 'isReordering' variable removed from this logic ---
  const isExpanded =
    (isMediumScreen && (isHovering || isContextReordering)) ||
    (!isMediumScreen && isMobileMenuOpen);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  const navLinkClasses = ({ isActive }) => {
    let baseClasses =
      'flex items-center h-14 px-6 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white';
    if (isActive) {
      return `${baseClasses} bg-gray-900 text-white`; // Active state
    }
    return `${baseClasses} text-gray-400 hover:bg-gray-700 hover:text-white`; // Inactive state
  };

  return (
    <motion.div
      // Desktop: Animate width based on hover state
      // Mobile: Animate width based on mobile menu toggle
      animate={isExpanded ? 'expanded' : 'collapsed'}
      variants={sidebarVariants}
      className={`
        bg-gray-800 text-white 
        hidden md:flex flex-col flex-shrink-0 
        relative z-20 
      `}
      onHoverStart={() => {
        if (isMediumScreen) setIsHovering(true);
      }}
      onHoverEnd={() => {
        if (isMediumScreen) setIsHovering(false);
      }}
    >
      {/* Mobile Menu (Overlay) */}
      <AnimatePresence>
        {!isMediumScreen && isMobileMenuOpen && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 20, stiffness: 150 }}
            className="
              absolute top-0 left-0 h-screen w-64 
              bg-gray-800 text-white 
              flex flex-col z-30 
              md:hidden shadow-lg
            "
          >
            {/* --- Mobile Header --- */}
            <div className="flex items-center justify-between h-20 border-b border-gray-700 px-6">
              <span className="text-xl font-semibold text-white">Quote Hub</span>
              <button onClick={onLinkClick} className="text-gray-400 hover:text-white">
                <XMarkIcon className="h-7 w-7" />
              </button>
            </div>
            {/* --- Mobile Nav --- */}
            <nav className="flex-1 py-6 space-y-2">
              <NavLink to="/" className={navLinkClasses} onClick={onLinkClick}>
                <HomeIcon className="h-6 w-6 shrink-0" />
                <span className="ml-5 font-medium">Dashboard</span>
              </NavLink>
              <NavLink to="/quotes" className={navLinkClasses} onClick={onLinkClick}>
                {/* --- Icon Updated --- */}
                <FileSearch className="h-6 w-6 shrink-0" />
                <span className="ml-5 font-medium">All Quotes</span>
              </NavLink>
              {/* --- Link Updated --- */}
              <NavLink to="/config" className={navLinkClasses} onClick={onLinkClick}>
                {/* --- Icon Updated --- */}
                <Settings className="h-6 w-6 shrink-0" />
                <span className="ml-5 font-medium">Product Manager</span>
              </NavLink>
            </nav>
            {/* --- Mobile Footer --- */}
            <div className="border-t border-gray-700">
              {currentUser && (
                <div 
                  className="flex items-center h-14 px-6 text-gray-400 text-sm overflow-hidden text-ellipsis"
                  title={currentUser.email}
                >
                  {currentUser.email}
                </div>
              )}
              <button onClick={handleLogout} className={navLinkClasses({isActive: false}) + ' w-full'}>
                {/* --- Icon Updated --- */}
                <LogOut className="h-6 w-6 shrink-0" />
                <span className="ml-5 font-medium">Log Out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Desktop Sidebar (Permanent) --- */}
      <div className="flex items-center justify-center h-20 border-b border-gray-700 shrink-0">
        <motion.span
          animate={{ opacity: isExpanded ? 1 : 0 }}
          className="text-xl font-semibold text-white whitespace-nowrap"
        >
          Quote Hub
        </motion.span>
      </div>

      <motion.nav
        className="flex-1 py-6 space-y-2"
        variants={navContainerVariants}
      >
        <NavLink to="/" className={navLinkClasses} onClick={onLinkClick}>
          <HomeIcon className="h-6 w-6 shrink-0" />
          <motion.span animate={{ opacity: isExpanded ? 1 : 0 }} className="ml-5 font-medium whitespace-nowrap">
            Dashboard
          </motion.span>
        </NavLink>
        <NavLink to="/quotes" className={navLinkClasses} onClick={onLinkClick}>
          {/* --- Icon Updated --- */}
          <FileSearch className="h-6 w-6 shrink-0" />
          <motion.span animate={{ opacity: isExpanded ? 1 : 0 }} className="ml-5 font-medium whitespace-nowrap">
            All Quotes
          </motion.span>
        </NavLink>
        {/* --- Link Updated --- */}
        <NavLink to="/config" className={navLinkClasses} onClick={onLinkClick}>
          <Settings className="h-6 w-6 shrink-0" />
          <motion.span animate={{ opacity: isExpanded ? 1 : 0 }} className="ml-5 font-medium whitespace-nowrap">
            Product Manager
          </motion.span>
        </NavLink>
      </motion.nav>

      <div className="border-t border-gray-700 shrink-0">
        {currentUser && (
           <div 
             className="flex items-center h-14 px-6 text-gray-400"
             title={currentUser.email}
           >
           <img 
             src={`https://ui-avatars.com/api/?name=${currentUser.email.charAt(0)}&background=374151&color=fff&size=24`} 
             alt="User avatar"
             className="h-6 w-6 rounded-full shrink-0" 
           />
            <motion.span 
              animate={{ opacity: isExpanded ? 1 : 0 }} 
              className="ml-5 text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis"
            >
              {currentUser.email}
            </motion.span>
          </div>
        )}
        <button onClick={handleLogout} className={navLinkClasses({isActive: false}) + ' w-full'}>
          {/* --- Icon Updated --- */}
          <LogOut className="h-6 w-6 shrink-0" /> 
          <motion.span animate={{ opacity: isExpanded ? 1 : 0 }} className="ml-5 font-medium whitespace-nowrap">
            Log Out
          </motion.span>
        </button>
      </div>
    </motion.div>
  );
}

export default Sidebar;
