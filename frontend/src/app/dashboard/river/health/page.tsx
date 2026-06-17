'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ShieldAlert, AlertCircle, Info } from 'lucide-react';
import { PageHeader, DashboardCard } from '@/components/UI';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function RiverStationHealthPage() {
  const { apiFetch } = useAuth();
  const [offlineDevices, setOfflineDevices] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchHealthData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/health/offlines`);
      if (res.ok) {
        const data = await res.json();
        setOfflineDevices(data || []);
      }

      const devRes = await apiFetch(`${API_BASE_URL}/river/devices`);
      if (devRes.ok) {
        const data = await devRes.json();
        setDevices(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchHealthData();
    const interval = setInterval(fetchHealthData, 30000);
    return () => clearInterval(interval);
  }, [fetchHealthData]);

  const healthyCount = devices.length - offlineDevices.length;
  const qualityIndex = devices.length > 0 ? ((healthyCount / devices.length) * 100).toFixed(1) : '100';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title Header */}
      <PageHeader
        title="Station Health Watchdog"
        description="Live status monitor for radar availability and device connection state."
        icon={<ShieldAlert className="w-8 h-8 text-indigo-650" />}
      />

      <div className="flex items-center space-x-2 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
        <Info className="w-5 h-5 text-indigo-600" />
        <p className="text-xs text-indigo-850">
          Live status panel showing radar health metrics. Auto-refreshes every 30 seconds.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DashboardCard
          title="Unhealthy / Offline Watchdog Logs"
          icon={<AlertCircle className="w-4 h-4 text-rose-500" />}
        >
          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2.5 px-3">Serial</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Issue Detail</th>
                  <th className="py-2.5 px-3">Last Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading && offlineDevices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">Checking logs...</td>
                  </tr>
                ) : offlineDevices.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-emerald-600 font-bold">All telemetry terminals are ONLINE & stable!</td>
                  </tr>
                ) : (
                  offlineDevices.map((d, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-3 font-mono font-bold text-rose-600">{d.serial}</td>
                      <td className="py-3 px-3">
                        <span className="bg-rose-50 text-rose-700 border border-rose-100 font-black text-[10px] px-2 py-0.5 rounded">
                          {d.health_status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-700">{d.message}</td>
                      <td className="py-3 px-3 font-mono text-slate-500">{new Date(d.last_seen_at).toLocaleString('th-TH')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Device Health Status Summary"
          icon={<ShieldAlert className="w-4 h-4 text-indigo-600" />}
        >
          <div className="space-y-4 text-slate-650">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm font-semibold">Total Monitored Nodes</span>
              <span className="font-bold text-slate-900">{devices.length}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm font-semibold">Healthy Terminals (ONLINE)</span>
              <span className="font-bold text-emerald-600">{healthyCount}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm font-semibold">Flagged Terminals (OFFLINE / ERROR)</span>
              <span className="font-bold text-rose-600">{offlineDevices.length}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm font-semibold">Network Health Quality Index</span>
              <span className="font-black text-indigo-600 text-lg">
                {qualityIndex}%
              </span>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>
  );
}
