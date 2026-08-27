import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, ArrowRight, Clock, MapPin, FileText, Download, Plus, Command as CommandIcon, Component
} from 'lucide-react';

import { APP_ROUTES, type AppRouteDefinition } from "../config/routes";
import { BASE_REGIONS } from "../data/regions";

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (path: string) => void;
  onAction?: (actionId: string) => void;
}

type ResultItem = {
  id: string;
  label: string;
  description?: string;
  icon: React.ElementType;
  path?: string;
  actionId?: string;
  category: 'page' | 'region' | 'action' | 'recent';
  shortcut?: string;
};

const QUICK_ACTIONS: ResultItem[] = [
  { id: 'action-download-template', label: 'Unduh Template CSV', description: 'Download template laporan', icon: Download, path: '/uploads', actionId: 'download-template', category: 'action' },
  { id: 'action-new-report', label: 'Buat Laporan Baru', description: 'Ekspor laporan PDF/Excel', icon: Plus, path: '/reports', actionId: 'new-report', category: 'action' },
  { id: 'action-view-analytics', label: 'Lihat Analitik', description: 'Dashboard analitik eksekutif', icon: FileText, path: '/analytics', actionId: 'view-analytics', category: 'action' }
];

const LOCAL_STORAGE_KEY = 'petakeu-command-palette-recent';

export function CommandPalette({ open, onClose, onNavigate, onAction }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [isRendered, setIsRendered] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent searches
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        setRecentIds(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load recent searches', e);
    }
  }, []);

  // Animation handling
  useEffect(() => {
    if (open) {
      setIsRendered(true);
      // Small delay to ensure display: block is applied before opacity transition
      const timer = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsRendered(false), 200); // match transition duration
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Global Keyboard listener for opening/closing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        // Since we are inside the component, we assume the parent handles the open state.
        // We trigger onClose to toggle it if it's open.
        if (open) {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Trap focus and auto-focus input
  useEffect(() => {
    if (open && isVisible) {
      inputRef.current?.focus();
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open, isVisible]);

  const allItems = useMemo<ResultItem[]>(() => {
    const routeItems = (APP_ROUTES || []).map((route: AppRouteDefinition) => ({
      id: `page-${route.key || route.path}`,
      label: route.label || route.title || 'Page',
      description: `Navigasi ke ${route.label || route.title}`,
      icon: route.icon || Component,
      path: route.path,
      category: 'page' as const
    }));

    const regionItems = (BASE_REGIONS || []).map((region) => ({
      id: `region-${region.name}`,
      label: region.name,
      description: `Lihat data provinsi ${region.name}`,
      icon: MapPin,
      path: `/regions/${region.name.toLowerCase().replace(/\\s+/g, '-')}`,
      category: 'region' as const
    }));

    return [...routeItems, ...regionItems, ...QUICK_ACTIONS];
  }, []);

  const results = useMemo(() => {
    if (!query.trim()) {
      if (recentIds.length === 0) return [];
      // Return recent items
      return recentIds
        .map(id => allItems.find(item => item.id === id))
        .filter((item): item is ResultItem => item !== undefined)
        .map(item => ({ ...item, category: 'recent' as const }))
        .slice(0, 5);
    }

    const lowerQuery = query.toLowerCase();
    
    // Simple scoring: exact match > starts with > includes
    const scored = allItems.map(item => {
      const lowerLabel = item.label.toLowerCase();
      const lowerDesc = (item.description || '').toLowerCase();
      let score = 0;
      
      if (lowerLabel === lowerQuery) score = 100;
      else if (lowerLabel.startsWith(lowerQuery)) score = 50;
      else if (lowerLabel.includes(lowerQuery)) score = 10;
      else if (lowerDesc.includes(lowerQuery)) score = 5;
      
      return { item, score };
    }).filter(x => x.score > 0);

    // Sort by score (desc), then label
    scored.sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.item.label.localeCompare(b.item.label);
    });

    return scored.map(x => x.item).slice(0, 8);
  }, [query, allItems, recentIds]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results.length]);

  const saveRecent = useCallback((item: ResultItem) => {
    setRecentIds((prev) => {
      const newRecents = [item.id, ...prev.filter(id => id !== item.id)].slice(0, 5);
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newRecents));
      } catch (e) {
        // Ignore storage errors
      }
      return newRecents;
    });
  }, []);

  const executeItem = useCallback((item: ResultItem) => {
    saveRecent(item);
    
    if (item.actionId && onAction) {
      onAction(item.actionId);
    } else if (item.path) {
      onNavigate(item.path);
    }
    
    onClose();
  }, [saveRecent, onAction, onNavigate, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        executeItem(results[selectedIndex]);
      }
    }
  };

  if (!isRendered) return null;

  return createPortal(
    <div 
      className={`fixed inset-0 z-50 flex items-start justify-center pt-[20vh] sm:pt-[15vh] px-4 transition-all duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div 
        className={`relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all duration-200 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
      >
        <div className="flex items-center px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 px-3 py-2 bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none text-lg"
            placeholder="Ketik perintah atau cari..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <div className="flex items-center gap-1 text-xs text-slate-400 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
            <span>ESC</span>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="px-4 py-12 text-center text-slate-500 dark:text-slate-400">
              <CommandIcon className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p>Tidak ada hasil yang ditemukan untuk &quot;{query}&quot;</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Group by category if we wanted to, but simple list is fine. Let's add category headers based on index */}
              {results.map((item, index) => {
                const prevItem = index > 0 ? results[index - 1] : null;
                const showHeader = !prevItem || prevItem.category !== item.category;
                
                const categoryLabels: Record<string, string> = {
                  recent: 'Baru Saja',
                  page: 'Halaman',
                  region: 'Provinsi',
                  action: 'Aksi Cepat'
                };

                return (
                  <React.Fragment key={item.id}>
                    {showHeader && (
                      <div className="px-3 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {categoryLabels[item.category] || 'Hasil'}
                      </div>
                    )}
                    <button
                      className={`w-full flex items-center px-3 py-3 rounded-xl transition-colors text-left group ${
                        selectedIndex === index 
                          ? 'bg-emerald-50 dark:bg-emerald-900/20' 
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                      onClick={() => executeItem(item)}
                      onMouseEnter={() => setSelectedIndex(index)}
                    >
                      <div className={`flex items-center justify-center w-10 h-10 rounded-lg shrink-0 mr-4 ${
                        selectedIndex === index 
                          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400' 
                          : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300'
                      }`}>
                        <item.icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${
                          selectedIndex === index ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'
                        }`}>
                          {item.label}
                        </div>
                        {item.description && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {item.description}
                          </div>
                        )}
                      </div>
                      {item.category === 'recent' ? (
                        <Clock className="w-4 h-4 text-slate-300 dark:text-slate-600 ml-3 shrink-0" />
                      ) : (
                        <ArrowRight className={`w-4 h-4 ml-3 shrink-0 transition-transform ${
                          selectedIndex === index 
                            ? 'text-emerald-500 dark:text-emerald-400 translate-x-1' 
                            : 'text-slate-300 dark:text-slate-600'
                        }`} />
                      )}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-sans">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-sans">↓</kbd>
              <span className="ml-1">Navigasi</span>
            </div>
            <div className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-sans">Enter</kbd>
              <span className="ml-1">Pilih</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span>Petakeu v1.0</span>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
