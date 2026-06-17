'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Database } from 'lucide-react';
import { PageHeader, DashboardCard } from '@/components/UI';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function RiverDataQualityPage() {
  const { apiFetch } = useAuth();
  const [dqSummary, setDqSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchDqData = async () => {
      setLoading(true);
      try {
        const res = await apiFetch(`${API_BASE_URL}/river/dq-summary`);
        if (res.ok) {
          const data = await res.json();
          setDqSummary(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchDqData();
  }, [apiFetch]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Data Quality Audit"
        description="Review data flow checks, gap detections, duplicates, and anomaly categories."
        icon={<Database className="w-8 h-8 text-indigo-650" />}
      />

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        {['ANOMALY', 'DUPLICATE', 'GAP', 'STALE', 'INCONSISTENT'].map((type) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const count = (dqSummary as any)?.metrics?.[type] || 0;
          return (
            <div key={type} className="glass-panel p-4 rounded-xl bg-white border border-slate-200 shadow-sm shadow-slate-100/50 text-center">
              <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">{type}</span>
              <span className="text-xl font-black block mt-1 text-indigo-600">{count}</span>
            </div>
          );
        })}
      </div>

      <DashboardCard
        title="Quality Anomaly Audit Records"
        icon={<Database className="w-4 h-4 text-indigo-600" />}
      >
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Serial</th>
                <th className="py-3 px-4">Issue Category</th>
                <th className="py-3 px-4">Severity</th>
                <th className="py-3 px-4">Message</th>
                <th className="py-3 px-4">Logged Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">Loading anomalies...</td>
                </tr>
              ) : !dqSummary?.reports || dqSummary.reports.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-emerald-600 font-bold">Zero active quality issues! Data flow is 100% correct.</td>
                </tr>
              ) : (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dqSummary.reports.map((r: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-650">{r.serial}</td>
                    <td className="py-3.5 px-4">
                      <span className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded text-[10px] font-bold">
                        {r.check_type}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                        r.severity === 'CRITICAL' ? 'bg-rose-500 text-white' : 'bg-amber-605 text-white'
                      }`}>
                        {r.severity}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-750">{r.message}</td>
                    <td className="py-3.5 px-4 font-mono text-slate-500">{new Date(r.detected_at).toLocaleString('th-TH')}</td>
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