'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AlertTriangle, ShieldCheck, RefreshCw, AlertOctagon, Heart, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader, DashboardCard, SearchInput } from '@/components/UI';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function ProblematicDevices() {
  const { apiFetch, user } = useAuth();
  const [devices, setDevices] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updatingStation, setUpdatingStation] = useState<string | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Pagination State for Recent Metric Failures
  const [failurePage, setFailurePage] = useState(1);
  const itemsPerFailurePage = 30;

  const fetchData = async () => {
    setLoading(true);
    try {
      const devRes = await apiFetch(`${API_BASE_URL}/fahfon-sense/devices`);
      if (devRes.ok) {
        const data = await devRes.json();
        setDevices(data || []);
      }

      const anomRes = await apiFetch(`${API_BASE_URL}/fahfon-sense/anomalies`);
      if (anomRes.ok) {
        const data = await anomRes.json();
        setAnomalies(data || []);
      }
    } catch (err) {
      console.error('Failed to load device health data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setFailurePage(1);
  }, [search]);

  const handleResolve = async (station: string) => {
    if (!confirm(`Are you sure you want to override status for device ${station} and resolve its active anomalies?`)) {
      return;
    }

    setUpdatingStation(station);
    try {
      const res = await apiFetch(`${API_BASE_URL}/fahfon-sense/devices/${station}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'ACTIVE' }),
      });

      if (res.ok) {
        alert(`Successfully set status of ${station} to ACTIVE and cleared sensor alerts.`);
        fetchData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update status.');
      }
    } catch (err) {
      console.error('Failed to update status', err);
      alert('Error updating status.');
    } finally {
      setUpdatingStation(null);
    }
  };

  const getProblematicDevices = () => {
    return devices.filter(
      (d) =>
        (d.status === 'MALFUNCTIONING' || d.status === 'OFFLINE') &&
        (d.station.toLowerCase().includes(search.toLowerCase()) || d.imei.includes(search))
    );
  };

  const activeFailures = getProblematicDevices();
  const isAdmin = user && (user.role === 'SuperAdmin' || user.role === 'Admin');

  // Pagination calculation for devices
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentFailures = activeFailures.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(activeFailures.length / itemsPerPage);

  // Filter and pagination calculation for active anomalies
  const activeAnomalies = anomalies.filter(
    (a) =>
      !a.resolved &&
      (a.device_id.toLowerCase().includes(search.toLowerCase()) || a.sensor_type.toLowerCase().includes(search.toLowerCase()))
  );
  const totalFailurePages = Math.ceil(activeAnomalies.length / itemsPerFailurePage);
  const indexOfLastFailure = failurePage * itemsPerFailurePage;
  const indexOfFirstFailure = indexOfLastFailure - itemsPerFailurePage;
  const currentAnomaliesList = activeAnomalies.slice(indexOfFirstFailure, indexOfLastFailure);

  const refreshButton = (
    <button
      onClick={fetchData}
      className="flex items-center space-x-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm"
    >
      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      <span>Refresh Health Logs</span>
    </button>
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Title Header via Reusable Component */}
      <PageHeader
        title="Problematic Devices"
        description="Manage and resolve device sensor failures, out-of-bounds readings, or offline warnings."
        icon={<AlertOctagon className="w-8 h-8 text-rose-500 animate-pulse" />}
        actionButton={refreshButton}
      />

      {/* Searching Bar via Reusable Component */}
      <div className="max-w-md">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by Station or IMEI..."
        />
      </div>

      {/* Grid displays */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4">
          <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin"></div>
          <span className="text-sm text-slate-500 font-semibold">Inspecting device states...</span>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Main failures card */}
          <DashboardCard
            title={`Malfunctioning & Offline Devices (${activeFailures.length})`}
            icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
          >
            {activeFailures.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Heart className="w-12 h-12 text-emerald-500 mb-3 animate-pulse" />
                <span className="text-sm font-bold text-slate-800">All hardware devices are currently healthy and operational!</span>
              </div>
            ) : (
              <div className="space-y-4">
                {currentFailures.map((d) => (
                  <div
                    key={d.id}
                    className="bg-slate-50/50 border border-slate-200/80 hover:border-slate-350 rounded-xl p-5 flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 transition-all duration-200 hover:shadow-sm"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center space-x-2.5">
                        <span className="font-extrabold text-slate-900 text-base">{d.station}</span>
                        <span
                          className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border tracking-wide uppercase ${
                            d.status === 'MALFUNCTIONING'
                              ? 'bg-amber-50 border-amber-200 text-amber-600 animate-pulse'
                              : 'bg-rose-50 border-rose-200 text-rose-600'
                          }`}
                        >
                          {d.status}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-xs text-slate-600">
                        <div>
                          <span className="text-slate-400 font-semibold">IMEI:</span>{' '}
                          <span className="font-mono text-slate-850 font-bold">{d.imei}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold">Owner:</span>{' '}
                          <span className="text-slate-850 font-bold">{d.owner || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold">Site:</span>{' '}
                          <span className="text-indigo-650 font-extrabold">{d.site || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-semibold">Coordinates:</span>{' '}
                          <span className="font-mono text-slate-850 font-bold">
                            {d.lat?.toFixed(5)}, {d.lng?.toFixed(5)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="pt-2 text-[11px] text-slate-400 flex items-center space-x-2 border-t border-slate-100 mt-2">
                        <span className="font-semibold text-slate-400">Last Telemetry Sync:</span>
                        <span className="font-mono text-slate-500 font-medium">
                          {new Date(d.updated_at).toLocaleString('th-TH')}
                        </span>
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => handleResolve(d.station)}
                        disabled={updatingStation === d.station}
                        className="flex items-center space-x-2 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:from-slate-300 disabled:to-slate-400 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 hover:scale-105 active:scale-95 shadow-md shadow-emerald-600/10 shrink-0 md:ml-4"
                      >
                        <ShieldCheck className="w-4 h-4" />
                        <span>{updatingStation === d.station ? 'Overriding...' : 'Override Active Status'}</span>
                      </button>
                    )}
                  </div>
                ))}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 font-semibold">
                    <span>Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, activeFailures.length)} of {activeFailures.length} entries</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
                      >
                        <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                      </button>
                      <span className="font-bold text-slate-700 px-2">Page {currentPage} of {totalPages}</span>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
                      >
                        <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DashboardCard>

          {/* Recent Anomaly Records Table */}
          <DashboardCard
            title="Recent Metric Failures (Max 100)"
            icon={<AlertTriangle className="w-5 h-5 text-rose-500" />}
          >
            {activeAnomalies.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No active anomalies reported.</p>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto border border-slate-200/80 rounded-xl bg-white">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 text-slate-500 border-b border-slate-200">
                        <th className="py-3.5 px-4 font-extrabold">Device ID</th>
                        <th className="py-3.5 px-4 font-extrabold">Sensor Metric</th>
                        <th className="py-3.5 px-4 font-extrabold text-center">Reported Value</th>
                        <th className="py-3.5 px-4 font-extrabold text-center">Allowed Range</th>
                        <th className="py-3.5 px-4 font-extrabold text-right">Detected Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentAnomaliesList.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3.5 px-4 font-extrabold text-indigo-650 font-mono">
                            {a.device_id}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="bg-rose-50 border border-rose-100 text-rose-600 font-extrabold px-2.5 py-1 rounded text-[10px] uppercase tracking-wide">
                              {a.sensor_type}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center font-extrabold text-rose-600 text-sm">
                            {a.reported_val}
                          </td>
                          <td className="py-3.5 px-4 text-center text-slate-500 font-mono font-bold">
                            {a.min_threshold} - {a.max_threshold}
                          </td>
                          <td className="py-3.5 px-4 text-right text-slate-500 font-mono font-semibold">
                            {new Date(a.detected_at).toLocaleString('th-TH')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalFailurePages > 1 && (
                  <div className="pt-4 border-t border-slate-200 flex justify-between items-center text-xs text-slate-500 font-semibold">
                    <span>Showing {indexOfFirstFailure + 1}-{Math.min(indexOfLastFailure, activeAnomalies.length)} of {activeAnomalies.length} entries</span>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setFailurePage((p) => Math.max(1, p - 1))}
                        disabled={failurePage === 1}
                        className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
                      >
                        <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                      </button>
                      <span className="font-bold text-slate-700 px-2">Page {failurePage} of {totalFailurePages}</span>
                      <button
                        onClick={() => setFailurePage((p) => Math.min(totalFailurePages, p + 1))}
                        disabled={failurePage === totalFailurePages}
                        className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
                      >
                        <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </DashboardCard>
        </div>
      )}
    </div>
  );
}

