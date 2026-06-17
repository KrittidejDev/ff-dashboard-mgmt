'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Zap, ZapOff, Info } from 'lucide-react';
import { PageHeader, DashboardCard } from '@/components/UI';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function RiverAdaptiveFrequencyPage() {
  const { apiFetch } = useAuth();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [activeEscalations, setActiveEscalations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEscalations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/freq-control/escalations`);
      if (res.ok) {
        const data = await res.json();
        setActiveEscalations(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchEscalations();
  }, [fetchEscalations]);

  const handleManualRestoreFreq = async (serial: string) => {
    if (!confirm(`Restore device ${serial} sampling rate to default durationSEC?`)) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/devices/${serial}/freq-control/restore`, { method: 'POST' });
      if (res.ok) {
        alert('Adaptive sampling restored to normal frequency.');
        fetchEscalations();
      } else {
        alert('Failed to restore frequency.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title Header */}
      <PageHeader
        title="Adaptive Frequency"
        description="Review active transmission sampling rate escalations and trigger levels."
        icon={<Zap className="w-8 h-8 text-indigo-650" />}
      />

      <div className="flex items-center space-x-2 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
        <Info className="w-5 h-5 text-amber-600" />
        <p className="text-xs text-amber-800">
          When water thresholds are triggered, sampling intervals are adjusted automatically. Restoring sets them back to defaults.
        </p>
      </div>

      <DashboardCard
        title="Active Transmissions Sampling Control Status"
        icon={<Zap className="w-4 h-4 text-indigo-600" />}
      >
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                <th className="py-3 px-4">Serial</th>
                <th className="py-3 px-4">Original Frequency</th>
                <th className="py-3 px-4">Escalated Frequency</th>
                <th className="py-3 px-4">Adaptive State</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading && activeEscalations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">Checking active escalations...</td>
                </tr>
              ) : activeEscalations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">No active frequency escalations. All nodes are operating normally.</td>
                </tr>
              ) : (
                activeEscalations.map((e, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition">
                    <td className="py-4 px-4 font-mono font-bold text-slate-900">{e.serial}</td>
                    <td className="py-4 px-4 font-mono text-slate-500">{e.original_duration_sec} sec</td>
                    <td className="py-4 px-4 font-mono font-extrabold text-amber-600">{e.current_duration_sec} sec</td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                        e.status === 'ESCALATED' 
                          ? 'bg-amber-50 text-amber-705 border-amber-200 animate-pulse' 
                          : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        onClick={() => handleManualRestoreFreq(e.serial)}
                        className="flex items-center space-x-1 ml-auto text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-3 py-1.5 rounded-xl shadow-sm transition"
                      >
                        <ZapOff className="w-3 h-3" />
                        <span>Manual Restore</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </div>
  );
}
