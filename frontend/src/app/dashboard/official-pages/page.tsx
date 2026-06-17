'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { PageHeader, DashboardCard, SearchInput } from '@/components/UI';
import { Users, Mail, Cpu, RefreshCw, ChevronDown, ChevronUp, ExternalLink, ShieldCheck, Database } from 'lucide-react';
import Link from 'next/link';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function OfficialPagesPage() {
  const { apiFetch } = useAuth();
  const [pages, setPages] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedPages, setExpandedPages] = useState<string[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch unique official pages grouped by email and account_id
      const pagesRes = await apiFetch(`${API_BASE_URL}/fahfon-sense/official-pages`);
      if (pagesRes.ok) {
        const data = await pagesRes.json();
        setPages(data || []);
      }

      // 2. Fetch all devices to show associated stations client-side
      const devicesRes = await apiFetch(`${API_BASE_URL}/fahfon-sense/devices`);
      if (devicesRes.ok) {
        const data = await devicesRes.json();
        setDevices(data || []);
      }
    } catch (err) {
      console.error('Failed to load official pages data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const togglePageExpand = (email: string) => {
    if (expandedPages.includes(email)) {
      setExpandedPages(expandedPages.filter((e) => e !== email));
    } else {
      setExpandedPages([...expandedPages, email]);
    }
  };

  // Filtered pages list based on search text
  const filteredPages = pages.filter(
    (p) =>
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.account_id?.toLowerCase().includes(search.toLowerCase())
  );

  const getDevicesForPage = (email: string) => {
    return devices.filter((d) => d.email === email);
  };

  const refreshButton = (
    <button
      onClick={fetchData}
      className="flex items-center space-x-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-650 border border-indigo-100 px-4 py-2.5 rounded-xl text-sm font-bold transition shadow-sm"
    >
      <RefreshCw className="w-4 h-4" />
      <span>Refresh Data</span>
    </button>
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Title Header */}
      <PageHeader
        title="Official Pages (เพจทางการ)"
        description="Manage and group IoT devices by official emails and account IDs synced from MongoDB."
        icon={<Users className="w-8 h-8 text-indigo-600 stroke-[2.5]" />}
        actionButton={refreshButton}
      />

      {/* Quick Guide Alert Banner */}
      <div className="bg-gradient-to-r from-indigo-50 to-indigo-100/50 border border-indigo-100 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 shadow-sm">
        <div className="flex items-start space-x-3.5">
          <div className="p-2.5 bg-white rounded-xl border border-indigo-100 text-indigo-600 shrink-0">
            <ShieldCheck className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h4 className="text-sm font-extrabold text-slate-900 leading-tight">Official Page Matching Rule</h4>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed max-w-2xl">
              An Official Page is automatically grouped based on unique combinations of **Email** and **Account ID** defined within device registrations in MongoDB (`iotRegistedIMEI`).
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/registrations"
          className="flex items-center space-x-2 bg-white hover:bg-slate-50 text-indigo-600 border border-slate-200/80 hover:border-slate-300 font-extrabold px-4.5 py-2.5 rounded-xl text-xs transition-all shadow-sm shrink-0"
        >
          <Database className="w-4 h-4" />
          <span>Manage Mongo Registrations</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Main Search & Listing Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by official email or account id..."
            className="w-full max-w-md"
          />
          <span className="text-xs text-slate-400 font-bold">Total Pages: {filteredPages.length}</span>
        </div>

        {loading ? (
          <div className="glass-panel py-16 text-center text-slate-500 rounded-2xl border border-slate-200 bg-white">
            <div className="w-8 h-8 border-4 border-indigo-500/10 border-t-indigo-600 rounded-full animate-spin mx-auto mb-3"></div>
            <span className="text-sm font-bold text-slate-800">Fetching Official Groups...</span>
          </div>
        ) : filteredPages.length === 0 ? (
          <div className="glass-panel py-12 text-center text-slate-400 rounded-2xl border border-slate-200 bg-white font-bold text-sm">
            No official pages found matching query.
          </div>
        ) : (
          <div className="space-y-4.5">
            {filteredPages.map((page, idx) => {
              const pageDevices = getDevicesForPage(page.email);
              const isExpanded = expandedPages.includes(page.email);
              
              return (
                <div 
                  key={`${page.email}-${page.account_id || ''}-${idx}`} 
                  className="glass-panel rounded-2xl border border-slate-200/80 shadow-md shadow-slate-100/50 bg-white overflow-hidden transition-all duration-200"
                >
                  {/* Summary Card Header */}
                  <div 
                    onClick={() => togglePageExpand(page.email)}
                    className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 hover:bg-slate-50/50 transition cursor-pointer select-none"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100 text-indigo-600">
                        <Mail className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 leading-none">{page.email}</h3>
                        <p className="text-[11px] text-slate-400 font-mono mt-2 font-medium">User Account ID: {page.account_id || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-6 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="flex items-center space-x-2 bg-indigo-50/80 border border-indigo-100 text-indigo-700 px-3.5 py-1.5 rounded-xl">
                        <Cpu className="w-4 h-4" />
                        <span className="text-xs font-black font-mono">{pageDevices.length} Devices</span>
                      </div>
                      <div className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg border border-slate-200 transition">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Devices List */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50/40 px-6 py-5 space-y-4.5">
                      <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wide">
                        Assigned Hardware & Station Registrations
                      </div>
                      
                      {pageDevices.length === 0 ? (
                        <div className="text-xs text-slate-400 font-semibold py-2">
                          No devices currently active for this official page email.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {pageDevices.map((dev, idx) => {
                            const isOnline = dev.status === 'ACTIVE';
                            return (
                              <div 
                                key={`${dev.mongo_id || dev.uuid || dev.station || ''}-${idx}`}
                                className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center shadow-sm hover:scale-[1.01] transition-transform"
                              >
                                <div className="space-y-1 overflow-hidden pr-2">
                                  <div className="flex items-center space-x-2">
                                    <span className="font-extrabold text-slate-900 text-xs tracking-wide">{dev.station}</span>
                                    <span className={`text-[8.5px] font-black px-1.5 py-0.2 rounded border uppercase ${
                                      isOnline 
                                        ? 'bg-emerald-50 border-emerald-100 text-emerald-600' 
                                        : 'bg-rose-50 border-rose-100 text-rose-600'
                                    }`}>{dev.status}</span>
                                  </div>
                                  <p className="text-[10px] text-slate-400 font-mono font-medium">IMEI: {dev.imei}</p>
                                  <p className="text-[10px] text-slate-500 truncate font-semibold">Location: {dev.site || 'N/A'}</p>
                                </div>
                                <Link
                                  href={`/dashboard/devices/${dev.uuid || dev.station}`}
                                  className="flex items-center space-x-1 text-xs font-bold text-indigo-650 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100/80 border border-indigo-100 px-3 py-2 rounded-xl transition"
                                >
                                  <span>Inspect</span>
                                  <ChevronDown className="w-3.5 h-3.5 -rotate-90" />
                                </Link>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
