import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronLeft,
  Map as MapIcon,
  BarChart3 as BarChart3Icon,
  Trophy as TrophyIcon,
  AlertTriangle as AlertTriangleIcon,
  Circle as CircleIcon
} from "lucide-react";

import { cn } from "../lib/utils";

import { Button } from "./ui/button";

interface SidebarItem {
  id: string;
  label: string;
  description: string;
  icon: string;
}

interface LeftSidebarProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  items: SidebarItem[];
}

export function LeftSidebar({ activeTab, onTabChange, items }: LeftSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <motion.div
      className={cn(
        "bg-white border-r border-gray-200 flex flex-col h-full transition-all duration-300",
        isCollapsed ? 'w-16' : 'w-64'
      )}
      initial={false}
      animate={{ width: isCollapsed ? 64 : 256 }}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <AnimatePresence>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="text-lg font-semibold text-gray-900">Petakeu</h2>
                <p className="text-sm text-gray-500">Dashboard Keuangan</p>
              </motion.div>
            )}
          </AnimatePresence>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8"
          >
            <motion.div
              animate={{ rotate: isCollapsed ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronLeft className="h-4 w-4" />
            </motion.div>
          </Button>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {items.map((item, index) => (
          <motion.button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={cn(
              "w-full flex items-center p-3 rounded-lg transition-all duration-200 group relative overflow-hidden",
              activeTab === item.id
                ? 'bg-primary-50 border-r-2 border-primary-500 text-primary-700 shadow-sm'
                : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
            )}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.3 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {/* Background glow effect */}
            {activeTab === item.id && (
              <motion.div
                className="absolute inset-0 bg-primary-100 opacity-50"
                layoutId="activeBackground"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}

            {/* Icon */}
            <div className={cn(
              "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center relative z-10",
              activeTab === item.id
                ? 'bg-primary-100 text-primary-600'
                : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
            )}>
              {getIcon(item.icon)}
            </div>

            {/* Content */}
            <AnimatePresence>
              {!isCollapsed && (
                <motion.div
                  className="ml-3 text-left relative z-10"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className={cn(
                    "font-medium text-sm",
                    activeTab === item.id ? 'text-primary-700' : 'text-gray-900'
                  )}>
                    {item.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {item.description}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Active Indicator */}
            {activeTab === item.id && !isCollapsed && (
              <motion.div
                className="ml-auto relative z-10"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
              </motion.div>
            )}
          </motion.button>
        ))}
      </nav>

      {/* Footer */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            className="p-4 border-t border-gray-200 bg-gray-50"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="text-xs text-gray-500 text-center">
              © 2025 Petakeu Dashboard
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function getIcon(iconName: string) {
  const iconClasses = "w-4 h-4";

  switch (iconName) {
    case 'map':
      return <MapIcon className={iconClasses} />;
    case 'chart':
      return <BarChart3Icon className={iconClasses} />;
    case 'trophy':
      return <TrophyIcon className={iconClasses} />;
    case 'alert':
      return <AlertTriangleIcon className={iconClasses} />;
    default:
      return <CircleIcon className={iconClasses} />;
  }
}