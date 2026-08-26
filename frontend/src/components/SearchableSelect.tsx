'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

export interface SearchableOption {
  value: string;
  label: string;
  count?: number;
  subLabel?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  allOptionLabel?: string;
  icon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  searchPlaceholder = 'Type to search...',
  allOptionLabel = 'All Pages (เพจทางการทั้งหมด)',
  icon,
  className = '',
  disabled = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm('');
    }
  }, [isOpen]);

  // Filter options based on user input
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase().trim();
    return options.filter((opt) =>
      opt.label.toLowerCase().includes(term) ||
      opt.value.toLowerCase().includes(term) ||
      (opt.subLabel && opt.subLabel.toLowerCase().includes(term))
    );
  }, [options, searchTerm]);

  // Find currently selected option
  const selectedOption = useMemo(() => {
    if (value === 'all' || !value) return null;
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  // Total count for "All" option
  const totalCount = useMemo(() => {
    return options.reduce((sum, opt) => sum + (opt.count || 0), 0);
  }, [options]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between space-x-2.5 bg-white hover:bg-slate-50 border ${
          isOpen ? 'border-indigo-500 ring-2 ring-indigo-100/60' : 'border-slate-200 hover:border-slate-300'
        } rounded-xl py-2 px-3.5 text-xs font-semibold text-slate-800 transition-all shadow-sm focus:outline-none min-w-[210px] max-w-[340px] truncate ${
          disabled ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        <div className="flex items-center space-x-2 truncate">
          {icon}
          <span className="truncate">
            {selectedOption ? (
              <span className="font-bold text-slate-900">
                {selectedOption.label}
                {selectedOption.count !== undefined && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-50 text-indigo-650 font-bold border border-indigo-100">
                    {selectedOption.count}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-slate-700 font-medium">
                {allOptionLabel}
                {totalCount > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
                    {totalCount}
                  </span>
                )}
              </span>
            )}
          </span>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-600' : ''}`} />
      </button>

      {/* Floating Popover Menu */}
      {isOpen && (
        <div className="absolute left-0 sm:right-auto mt-2 w-72 sm:w-80 rounded-2xl bg-white border border-slate-200/90 shadow-2xl shadow-slate-200/60 z-[1100] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Embedded Search Input */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 pl-8 pr-8 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/50 transition-all font-medium"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Options Scrollable Container */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5">
            {/* "All" Option */}
            {!searchTerm && (
              <button
                type="button"
                onClick={() => handleSelect('all')}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all text-left ${
                  value === 'all' || !value
                    ? 'bg-indigo-50 text-indigo-700 font-extrabold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  <span className="truncate">{allOptionLabel}</span>
                  {totalCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600 font-bold">
                      {totalCount} เครื่อง
                    </span>
                  )}
                </div>
                {(value === 'all' || !value) && (
                  <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 ml-2" />
                )}
              </button>
            )}

            {/* Filtered Dynamic Options */}
            {filteredOptions.length === 0 ? (
              <div className="py-6 px-3 text-center">
                <p className="text-xs text-slate-400 font-medium">ไม่พบเพจทางการที่ตรงกับ "{searchTerm}"</p>
                <p className="text-[10px] text-slate-400 mt-1">No matching official pages found</p>
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all text-left group ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-700 font-extrabold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className="truncate font-semibold group-hover:text-indigo-600 transition-colors">
                        {opt.label}
                      </span>
                      {opt.subLabel && (
                        <span className="text-[10px] text-slate-400 font-mono truncate">
                          {opt.subLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-1.5 shrink-0">
                      {opt.count !== undefined && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                          isSelected
                            ? 'bg-indigo-100/80 text-indigo-700'
                            : 'bg-slate-100 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600'
                        }`}>
                          {opt.count} เครื่อง
                        </span>
                      )}
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
