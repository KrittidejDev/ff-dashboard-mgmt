'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AlertTriangle, Edit2, RefreshCw, ChevronLeft, ChevronRight, Save } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function SensorThresholds() {
  const { apiFetch } = useAuth();
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Edit Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState<any>(null);
  const [formData, setFormData] = useState({
    min_val: 0,
    max_val: 0,
    description: '',
  });

  const fetchThresholds = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/fahfon-sense/thresholds`);
      if (res.ok) {
        const data = await res.json();
        setThresholds(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch sensor thresholds', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchThresholds();
  }, []);

  const handleOpenEdit = (t: any) => {
    setEditingThreshold(t);
    setFormData({
      min_val: t.min_val,
      max_val: t.max_val,
      description: t.description || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`${API_BASE_URL}/fahfon-sense/thresholds/${editingThreshold.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          min_val: parseFloat(formData.min_val as any),
          max_val: parseFloat(formData.max_val as any),
          description: formData.description,
        }),
      });

      if (res.ok) {
        alert('Sensor thresholds updated successfully.');
        setShowModal(false);
        fetchThresholds();
      } else {
        alert('Failed to update thresholds.');
      }
    } catch (err) {
      console.error('Failed to submit thresholds', err);
    }
  };

  // Pagination calculation
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = thresholds.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(thresholds.length / itemsPerPage);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center space-x-3">
            <AlertTriangle className="w-8 h-8 text-amber-500 animate-pulse" />
            <span>Sensor Threshold Settings</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Configure minimum and maximum bounds for physical sensor variable alerts.</p>
        </div>
        <button
          onClick={fetchThresholds}
          className="flex items-center space-x-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-4 py-2 rounded-xl text-sm font-semibold transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Thresholds</span>
        </button>
      </div>

      {/* Main Table Display */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="glass-panel rounded-2xl overflow-hidden border border-gray-800">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-800 text-[10px] text-gray-500 uppercase tracking-widest font-bold bg-gray-900/40">
                    <th className="py-4 px-6">Sensor Variable</th>
                    <th className="py-4 px-6">Min Threshold</th>
                    <th className="py-4 px-6">Max Threshold</th>
                    <th className="py-4 px-6">Watchdog Description</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {currentItems.map((t) => (
                    <tr key={t.id} className="border-b border-gray-800/40 hover:bg-gray-800/20 text-gray-300 text-sm transition">
                      <td className="py-4.5 px-6 font-bold text-white capitalize">{t.sensor_type}</td>
                      <td className="py-4.5 px-6 font-mono text-emerald-400 font-semibold">{t.min_val}</td>
                      <td className="py-4.5 px-6 font-mono text-rose-400 font-semibold">{t.max_val}</td>
                      <td className="py-4.5 px-6 text-gray-400 text-xs">{t.description || 'No description'}</td>
                      <td className="py-4.5 px-6 text-right">
                        <button
                          onClick={() => handleOpenEdit(t)}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-xl text-xs font-semibold transition"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Configure</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-800/80 bg-gray-900/10 flex justify-between items-center text-xs text-gray-400 font-medium">
                <span>Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, thresholds.length)} of {thresholds.length} entries</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white disabled:opacity-50 disabled:pointer-events-none transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-semibold text-white px-2">Page {currentPage} of {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white disabled:opacity-50 disabled:pointer-events-none transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-[#000000]/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1e293b] border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-gray-800 pb-4">
              <h3 className="text-white font-bold text-lg flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-indigo-400" />
                <span>Adjust thresholds: <strong className="capitalize text-white">{editingThreshold?.sensor_type}</strong></span>
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white text-sm">Close</button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Minimum Allowed Value</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={formData.min_val}
                  onChange={(e) => setFormData({ ...formData, min_val: parseFloat(e.target.value) })}
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2.5 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Maximum Allowed Value</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={formData.max_val}
                  onChange={(e) => setFormData({ ...formData, max_val: parseFloat(e.target.value) })}
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2.5 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Watchdog / Alert Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-4 border-t border-gray-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-600/25 flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Update Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
