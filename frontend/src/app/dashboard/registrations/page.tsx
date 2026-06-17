'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ClipboardList, Plus, Edit2, Trash2, AlertTriangle, RefreshCw, Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader, DashboardCard, SearchInput } from '@/components/UI';
import ConflictResolver from '@/components/ConflictResolver';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function DeviceRegistrations() {
  const { apiFetch, user } = useAuth();
  const [registrations, setRegistrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'conflicts'>('list');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [sortBy, setSortBy] = useState<'station' | 'imei' | 'date'>('station');

  const getTimestampFromObjectId = (id: string) => {
    try {
      if (!id || id.length !== 24) return '';
      const timestampHex = id.substring(0, 8);
      const timestampSec = parseInt(timestampHex, 16);
      return new Date(timestampSec * 1000).toLocaleString('th-TH');
    } catch (e) {
      return '';
    }
  };

  // Form State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    accountId: '',
    imei: '',
    station: '',
    regisType: 'Sense',
    commonSiteName: '',
    owner: '',
    email: '',
    latitude: 0,
    longitude: 0,
    height: 0,
    interval: 300,
    isverify: 1,
    issue: '',
  });

  const fetchRegistrations = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/mongo/registrations`);
      if (res.ok) {
        const data = await res.json();
        setRegistrations(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch registrations', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({
      accountId: '',
      imei: '',
      station: '',
      regisType: 'Sense',
      commonSiteName: '',
      owner: '',
      email: '',
      latitude: 13.736717,
      longitude: 100.523186,
      height: 10,
      interval: 300,
      isverify: 1,
      issue: '',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (reg: any) => {
    setEditingId(reg.id);
    setFormData({
      accountId: reg.accountId || '',
      imei: reg.imei || '',
      station: reg.station || '',
      regisType: reg.regisType || 'Sense',
      commonSiteName: reg.commonSiteName || '',
      owner: reg.owner || '',
      email: reg.email || '',
      latitude: reg.latitude || 0,
      longitude: reg.longitude || 0,
      height: reg.height || 0,
      interval: reg.interval || 300,
      isverify: reg.isverify || 1,
      issue: reg.issue || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete registration for station "${name}" directly from MongoDB?`)) {
      return;
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/mongo/registrations/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        alert('Deleted registration successfully.');
        fetchRegistrations();
      } else {
        alert('Failed to delete registration document.');
      }
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingId
        ? `${API_BASE_URL}/mongo/registrations/${editingId}`
        : `${API_BASE_URL}/mongo/registrations`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          latitude: parseFloat(formData.latitude as any),
          longitude: parseFloat(formData.longitude as any),
          height: parseFloat(formData.height as any),
          interval: parseInt(formData.interval as any),
          isverify: parseInt(formData.isverify as any),
        }),
      });

      if (res.ok) {
        alert(editingId ? 'Registration updated in MongoDB.' : 'Registration created in MongoDB.');
        setShowModal(false);
        fetchRegistrations();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to submit document.');
      }
    } catch (err) {
      console.error('Submit failed', err);
    }
  };

  // Find Conflicts on Station & IMEI
  const getConflicts = () => {
    const imeiMap: Record<string, any[]> = {};
    const stationMap: Record<string, any[]> = {};

    registrations.forEach((r) => {
      if (r.imei) {
        if (!imeiMap[r.imei]) imeiMap[r.imei] = [];
        imeiMap[r.imei].push(r);
      }
      if (r.station) {
        if (!stationMap[r.station]) stationMap[r.station] = [];
        stationMap[r.station].push(r);
      }
    });

    const conflictsList: any[] = [];
    Object.entries(imeiMap).forEach(([imei, items]) => {
      if (items.length > 1) {
        conflictsList.push({ type: 'IMEI Duplicate', value: imei, count: items.length, items });
      }
    });

    Object.entries(stationMap).forEach(([station, items]) => {
      if (items.length > 1) {
        conflictsList.push({ type: 'Station ID Duplicate', value: station, count: items.length, items });
      }
    });

    return conflictsList;
  };

  const filteredRegistrations = registrations.filter(
    (r) =>
      r.station?.toLowerCase().includes(search.toLowerCase()) ||
      r.imei?.includes(search) ||
      r.owner?.toLowerCase().includes(search.toLowerCase())
  );

  const conflicts = getConflicts();

  const filteredConflicts = conflicts.filter(
    (c) =>
      c.value?.toLowerCase().includes(search.toLowerCase()) ||
      c.type?.toLowerCase().includes(search.toLowerCase()) ||
      c.items?.some((item: any) =>
        item.station?.toLowerCase().includes(search.toLowerCase()) ||
        item.imei?.includes(search) ||
        item.owner?.toLowerCase().includes(search.toLowerCase())
      )
  );

  const getSortedRegistrations = () => {
    const sorted = [...filteredRegistrations];
    if (sortBy === 'station') {
      sorted.sort((a, b) => (a.station || '').localeCompare(b.station || ''));
    } else if (sortBy === 'imei') {
      sorted.sort((a, b) => (a.imei || '').localeCompare(b.imei || ''));
    } else if (sortBy === 'date') {
      sorted.sort((a, b) => (b.id || '').localeCompare(a.id || '')); // Newest ObjectID first
    }
    return sorted;
  };

  const sortedRegistrations = getSortedRegistrations();

  // Pagination calculation
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedRegistrations.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedRegistrations.length / itemsPerPage);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <PageHeader
        title="Manage iotRegistedIMEI"
        description="Directly manage physical hardware registrations and coordinate targets inside MongoDB."
        icon={<ClipboardList className="w-8 h-8 text-indigo-600" />}
        actionButton={
          <>
            <button
              onClick={fetchRegistrations}
              className="flex items-center justify-center p-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleOpenAdd}
              className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-103 active:scale-97 shadow-md shadow-indigo-600/15"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add Registration</span>
            </button>
          </>
        }
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-6">
        <button
          onClick={() => setActiveTab('list')}
          className={`pb-4 text-sm font-bold transition-colors relative ${
            activeTab === 'list' ? 'text-indigo-600 font-extrabold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <span>All Registrations ({registrations.length})</span>
          {activeTab === 'list' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-full"></div>
          )}
        </button>

        <button
          onClick={() => setActiveTab('conflicts')}
          className={`pb-4 text-sm font-bold transition-colors relative flex items-center space-x-2 ${
            activeTab === 'conflicts' ? 'text-indigo-600 font-extrabold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <span>Conflict Checker ({filteredConflicts.length})</span>
          {filteredConflicts.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
          )}
          {activeTab === 'conflicts' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-full"></div>
          )}
        </button>
      </div>

      {/* Searching bar */}
      <div className="flex flex-col sm:flex-row gap-4 max-w-2xl">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={activeTab === 'list' ? "Search registrations..." : "Search conflicts by ID, IMEI, Owner or Station..."}
          className="flex-1"
        />
        {activeTab === 'list' && (
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-white border border-slate-200 rounded-xl text-xs text-slate-700 py-2.5 px-4 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-150 cursor-pointer shadow-sm font-semibold"
          >
            <option value="station">Sort by Station ID (A-Z)</option>
            <option value="imei">Sort by Hardware IMEI</option>
            <option value="date">Sort by Registration Date (Newest)</option>
          </select>
        )}
      </div>

      {activeTab === 'list' ? (
        <div className="space-y-6">
          {/* Grid list of registrations */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
          ) : filteredRegistrations.length === 0 ? (
            <div className="glass-panel p-12 text-center text-slate-400 rounded-2xl border border-slate-250">
              No registrations found.
            </div>
          ) : (
            <div className="glass-panel rounded-2xl overflow-hidden border border-slate-200/80 shadow-md shadow-slate-100">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse align-middle">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-widest font-extrabold bg-slate-50">
                      <th className="py-4 px-6">Station ID</th>
                      <th className="py-4 px-6">IMEI</th>
                      <th className="py-4 px-6">Owner</th>
                      <th className="py-4 px-6">Coordinates</th>
                      <th className="py-4 px-6">Interval</th>
                      <th className="py-4 px-6">Reg. Date</th>
                      <th className="py-4 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentItems.map((reg) => (
                      <tr key={reg.id} className="border-b border-slate-100 hover:bg-slate-50/70 text-slate-700 text-sm transition-all duration-200">
                        <td className="py-4.5 px-6 font-extrabold text-slate-900 align-middle">
                          <span className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/50 text-[12px] font-mono">{reg.station}</span>
                        </td>
                        <td className="py-4.5 px-6 font-mono text-indigo-600 font-bold align-middle">{reg.imei}</td>
                        <td className="py-4.5 px-6 align-middle">
                          <div className="font-semibold text-slate-800">{reg.owner || 'No Owner'}</div>
                          <div className="text-xs text-slate-400 font-medium">{reg.email || 'No email'}</div>
                        </td>
                        <td className="py-4.5 px-6 align-middle">
                          <span className="inline-block bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold">
                            {reg.latitude?.toFixed(5)}, {reg.longitude?.toFixed(5)}
                          </span>
                        </td>
                        <td className="py-4.5 px-6 text-xs font-semibold text-slate-550 align-middle">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-md font-mono">{reg.interval}s</span>
                        </td>
                        <td className="py-4.5 px-6 text-xs font-mono text-slate-400 align-middle">
                          {getTimestampFromObjectId(reg.id)}
                        </td>
                        <td className="py-4.5 px-6 text-right space-x-2 align-middle">
                          <button
                            onClick={() => handleOpenEdit(reg)}
                            title="Edit Document"
                            className="inline-flex items-center justify-center p-2 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white rounded-xl border border-indigo-100 hover:border-indigo-600 transition-all duration-200 shadow-sm hover:scale-105 active:scale-95"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(reg.id, reg.station)}
                            title="Delete Document"
                            className="inline-flex items-center justify-center p-2 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white rounded-xl border border-rose-100 hover:border-rose-600 transition-all duration-200 shadow-sm hover:scale-105 active:scale-95"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-slate-250 bg-slate-50 flex justify-between items-center text-xs text-slate-500 font-semibold">
                  <span>Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, filteredRegistrations.length)} of {filteredRegistrations.length} entries</span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
                    >
                      <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
                    </button>
                    <span className="font-bold text-slate-700 px-2">Page {currentPage} of {totalPages}</span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 hover:text-slate-800 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
                    >
                      <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <ConflictResolver
          conflicts={conflicts}
          loading={loading}
          type="registrations"
          onDeleteConflict={async (type, id) => {
            await handleDelete(id, 'Duplicate Registration');
          }}
          onEditConflict={handleOpenEdit}
        />
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-[#000000]/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1e293b] border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-gray-800 pb-4">
              <h3 className="text-white font-bold text-lg flex items-center space-x-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <span>{editingId ? 'Edit Mongo Document' : 'Register New Device'}</span>
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white text-sm">Close</button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Station ID</label>
                <input
                  type="text"
                  required
                  value={formData.station}
                  onChange={(e) => setFormData({ ...formData, station: e.target.value })}
                  placeholder="e.g. STN-001"
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">IMEI</label>
                <input
                  type="text"
                  required
                  value={formData.imei}
                  onChange={(e) => setFormData({ ...formData, imei: e.target.value })}
                  placeholder="15-digit IMEI"
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Owner Name</label>
                <input
                  type="text"
                  required
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="Owner / Department"
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Owner Email</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="alerts@fahfon.com"
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Latitude</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={formData.latitude}
                  onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Longitude</label>
                <input
                  type="number"
                  step="any"
                  required
                  value={formData.longitude}
                  onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Reporting Interval (seconds)</label>
                <input
                  type="number"
                  required
                  value={formData.interval}
                  onChange={(e) => setFormData({ ...formData, interval: parseInt(e.target.value) })}
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Account UUID Reference</label>
                <input
                  type="text"
                  value={formData.accountId}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  placeholder="Optional account ID"
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="md:col-span-2 pt-4 border-t border-gray-800 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-600/25"
                >
                  {editingId ? 'Save Changes' : 'Register Device'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
