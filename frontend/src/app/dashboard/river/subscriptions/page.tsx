'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Zap, Plus, Edit2, Trash2, X } from 'lucide-react';
import { PageHeader, DashboardCard } from '@/components/UI';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function RiverWebhookSubscriptionsPage() {
  const { apiFetch } = useAuth();
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal Subscriptions state
  const [showSubModal, setShowSubModal] = useState(false);
  const [editingSub, setEditingSub] = useState<any>(null);
  const [subForm, setSubForm] = useState({
    serial: '',
    project_code: '',
    callback_url: '',
    alert_types: ['WARNING', 'CRITICAL', 'EMERGENCY'],
  });

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/subscriptions`);
      if (res.ok) {
        const data = await res.json();
        setSubscriptions(data || []);
      }

      const devRes = await apiFetch(`${API_BASE_URL}/river/devices`);
      if (devRes.ok) {
        const dData = await devRes.json();
        setDevices(dData || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const handleSubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingSub 
        ? `${API_BASE_URL}/river/subscriptions/${editingSub.id}`
        : `${API_BASE_URL}/river/subscriptions`;
      const method = editingSub ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subForm),
      });

      if (res.ok) {
        alert('Webhook subscription saved.');
        setShowSubModal(false);
        fetchAllData();
      } else {
        alert('Failed to submit subscription.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenAddSub = () => {
    setEditingSub(null);
    setSubForm({
      serial: '',
      project_code: '',
      callback_url: '',
      alert_types: ['WARNING', 'CRITICAL', 'EMERGENCY'],
    });
    setShowSubModal(true);
  };

  const handleOpenEditSub = (sub: any) => {
    setEditingSub(sub);
    setSubForm({
      serial: sub.serial || '',
      project_code: sub.project_code || '',
      callback_url: sub.callback_url || '',
      alert_types: sub.alert_types || ['WARNING', 'CRITICAL', 'EMERGENCY'],
    });
    setShowSubModal(true);
  };

  const handleDeleteSub = async (id: number) => {
    if (!confirm('Delete this Webhook callback subscription?')) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/subscriptions/${id}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Subscription deleted.');
        fetchAllData();
      } else {
        alert('Failed.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title Header */}
      <PageHeader
        title="Webhook Subscriptions"
        description="Configure automated payload deliveries and callback endpoints."
        icon={<Zap className="w-8 h-8 text-indigo-650" />}
        actionButton={
          <button
            onClick={handleOpenAddSub}
            className="flex items-center space-x-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md transition"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>Add Webhook Subscription</span>
          </button>
        }
      />

      <DashboardCard>
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3.5 px-4">Project Code</th>
                <th className="py-3.5 px-4">Callback URL</th>
                <th className="py-3.5 px-4">Subscribed Levels</th>
                <th className="py-3.5 px-4">Device Serial</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-450">
                    <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"></div>
                    Loading subscriptions...
                  </td>
                </tr>
              ) : subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">No active webhook subscribers configured.</td>
                </tr>
              ) : (
                subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-4 px-4 font-bold text-slate-900">{sub.project_code}</td>
                    <td className="py-4 px-4 font-mono text-indigo-600 select-all truncate max-w-xs">{sub.callback_url}</td>
                    <td className="py-4 px-4">
                      <div className="flex gap-1 flex-wrap">
                        {sub.alert_types?.map((type: string) => (
                          <span key={type} className="bg-slate-100 border border-slate-200 text-slate-650 font-extrabold text-[9px] px-1.5 py-0.5 rounded">
                            {type}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono text-slate-500">{sub.serial || 'All Devices (GLOBAL)'}</td>
                    <td className="py-4 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenEditSub(sub)}
                        className="p-2 bg-indigo-50 hover:bg-indigo-600 text-indigo-650 hover:text-white border border-indigo-100 rounded-xl transition shadow-sm"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSub(sub.id)}
                        className="p-2 bg-rose-50 hover:bg-rose-600 text-rose-650 hover:text-white border border-rose-100 rounded-xl transition shadow-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      {/* MODAL: Webhook Sub */}
      {showSubModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-slate-900 font-bold text-base">
                {editingSub ? 'Edit Webhook Subscription' : 'New Webhook Subscription'}
              </h3>
              <button onClick={() => setShowSubModal(false)} className="text-slate-400 hover:text-slate-655"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-600 font-bold block">Project Identifier (project_code)</label>
                <input
                  type="text"
                  required
                  value={subForm.project_code}
                  onChange={(e) => setSubForm({ ...subForm, project_code: e.target.value })}
                  placeholder="e.g. PATHUM-SMART-CITY"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-600 font-bold block">Callback Webhook Endpoints</label>
                <input
                  type="url"
                  required
                  value={subForm.callback_url}
                  onChange={(e) => setSubForm({ ...subForm, callback_url: e.target.value })}
                  placeholder="https://api.myproject.com/v1/alert-webhook"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-600 font-bold block">River Station Serial (Empty for GLOBAL alerts)</label>
                <select
                  value={subForm.serial}
                  onChange={(e) => setSubForm({ ...subForm, serial: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40"
                >
                  <option value="">All River Stations (GLOBAL)</option>
                  {devices.map(d => (
                    <option key={d.serial} value={d.serial}>{d.name} ({d.serial})</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowSubModal(false)}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-100"
                >
                  Save Subscription
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
