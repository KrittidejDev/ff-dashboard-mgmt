'use client';

import React from 'react';
import { Search } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actionButton?: React.ReactNode;
}

export function PageHeader({ title, description, icon, actionButton }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 flex items-center space-x-3">
          {icon}
          <span>{title}</span>
        </h1>
        {description && (
          <p className="text-slate-500 text-sm mt-1">{description}</p>
        )}
      </div>
      {actionButton && (
        <div className="flex items-center space-x-3">
          {actionButton}
        </div>
      )}
    </div>
  );
}

interface DashboardCardProps {
  title?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export function DashboardCard({ title, icon, badge, className = '', children }: DashboardCardProps) {
  return (
    <div className={`glass-panel rounded-2xl p-6 border border-slate-200/80 shadow-md shadow-slate-100/50 bg-white/95 ${className}`}>
      {(title || icon || badge) && (
        <div className="flex justify-between items-center mb-5 border-b border-slate-100 pb-3">
          <h3 className="text-slate-900 font-extrabold text-base flex items-center space-x-2">
            {icon}
            <span>{title}</span>
          </h3>
          {badge && <div>{badge}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Search...', className = '' }: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 transition-all shadow-sm"
      />
    </div>
  );
}

interface SelectInputProps {
  label?: string;
  value: string | number;
  onChange: (val: any) => void;
  options: { value: string | number; label: string }[];
  placeholder?: string;
  className?: string;
  required?: boolean;
  disabled?: boolean;
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
  placeholder,
  className = '',
  required = false,
  disabled = false,
}: SelectInputProps) {
  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="text-xs text-slate-600 font-bold block">{label}</label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        className="w-full bg-white border border-slate-200 rounded-xl h-[42px] px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 transition-all shadow-sm disabled:opacity-50"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt, idx) => (
          <option key={idx} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export { default as SearchableSelect } from './SearchableSelect';
export type { SearchableOption } from './SearchableSelect';


