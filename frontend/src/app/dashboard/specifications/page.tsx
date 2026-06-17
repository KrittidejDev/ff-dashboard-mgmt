'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Database, Plus, Edit2, Trash2, AlertTriangle, RefreshCw, Cpu, ChevronLeft, ChevronRight } from 'lucide-react';
import { PageHeader, DashboardCard, SearchInput } from '@/components/UI';
import ConflictResolver from '@/components/ConflictResolver';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function DeviceSpecifications() {
  const { apiFetch, user } = useAuth();
  const [specifications, setSpecifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'conflicts'>('list');

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [sortBy, setSortBy] = useState<'serial' | 'imei' | 'date'>('serial');

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
    imei: '',
    serial: '',
    secretKey: '',
    commonSiteName: '',
    registrationDate: '',
    station: '',
    regisType: 'Sense',
    purchaseDate: '',
    shippingDate: '',
  });

  const fetchSpecifications = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/mongo/specifications`);
      if (res.ok) {
        const data = await res.json();
        setSpecifications(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch specifications', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpecifications();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({
      imei: '',
      serial: '',
      secretKey: '',
      commonSiteName: '',
      registrationDate: new Date().toISOString().split('T')[0],
      station: '',
      regisType: 'Sense',
      purchaseDate: '',
      shippingDate: '',
    });
    setShowModal(true);
  };

  const handleOpenEdit = (spec: any) => {
    setEditingId(spec.id);
    setFormData({
      imei: spec.imei || '',
      serial: spec.serial || '',
      secretKey: spec.secretKey || '',
      commonSiteName: spec.commonSiteName || '',
      registrationDate: spec.registrationDate || '',
      station: spec.station || '',
      regisType: spec.regisType || 'Sense',
      purchaseDate: spec.purchaseDate || '',
      shippingDate: spec.shippingDate || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete hardware specification for serial "${name}" from MongoDB?`)) {
      return;
    }

    try {
      const res = await apiFetch(`${API_BASE_URL}/mongo/specifications/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        alert('Deleted specification successfully.');
        fetchSpecifications();
      } else {
        alert('Failed to delete specification document.');
      }
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingId
        ? `${API_BASE_URL}/mongo/specifications/${editingId}`
        : `${API_BASE_URL}/mongo/specifications`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        alert(editingId ? 'Specification updated in MongoDB.' : 'Specification registered in MongoDB.');
        setShowModal(false);
        fetchSpecifications();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to submit document.');
      }
    } catch (err) {
      console.error('Submit failed', err);
    }
  };

  // Find Conflicts on Serial & IMEI
  const getConflicts = () => {
    const imeiMap: Record<string, any[]> = {};
    const serialMap: Record<string, any[]> = {};

    specifications.forEach((s) => {
      if (s.imei) {
        if (!imeiMap[s.imei]) imeiMap[s.imei] = [];
        imeiMap[s.imei].push(s);
      }
      if (s.serial) {
        if (!serialMap[s.serial]) serialMap[s.serial] = [];
        serialMap[s.serial].push(s);
      }
    });

    const conflictsList: any[] = [];
    Object.entries(imeiMap).forEach(([imei, items]) => {
      if (items.length > 1) {
        conflictsList.push({ type: 'IMEI Duplicate', value: imei, count: items.length, items });
      }
    });

    Object.entries(serialMap).forEach(([serial, items]) => {
      if (items.length > 1) {
        conflictsList.push({ type: 'Serial Number Duplicate', value: serial, count: items.length, items });
      }
    });

    return conflictsList;
  };

  const filteredSpecifications = specifications.filter(
    (s) =>
      s.serial?.toLowerCase().includes(search.toLowerCase()) ||
      s.imei?.includes(search) ||
      s.commonSiteName?.toLowerCase().includes(search.toLowerCase())
  );

  const conflicts = getConflicts();

  const filteredConflicts = conflicts.filter(
    (c) =>
      c.value?.toLowerCase().includes(search.toLowerCase()) ||
      c.type?.toLowerCase().includes(search.toLowerCase()) ||
      c.items?.some((item: any) =>
        item.serial?.toLowerCase().includes(search.toLowerCase()) ||
        item.imei?.includes(search) ||
        item.commonSiteName?.toLowerCase().includes(search.toLowerCase())
      )
  );

  const getSortedSpecifications = () => {
    const sorted = [...filteredSpecifications];
    if (sortBy === 'serial') {
      sorted.sort((a, b) => (a.serial || '').localeCompare(b.serial || ''));
    } else if (sortBy === 'imei') {
      sorted.sort((a, b) => (a.imei || '').localeCompare(b.imei || ''));
    } else if (sortBy === 'date') {
      sorted.sort((a, b) => (b.id || '').localeCompare(a.id || '')); // Newest ObjectID first
    }
    return sorted;
  };

  const sortedSpecifications = getSortedSpecifications();

  // Pagination calculation
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedSpecifications.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedSpecifications.length / itemsPerPage);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header via Reusable Component */}
      <PageHeader
        title="Manage iotDeviceInfo"
        description="Directly manage physical hardware specifications, serial codes, and secret security keys inside MongoDB."
        icon={<Database className="w-8 h-8 text-indigo-600" />}
        actionButton={
          <>
            <button
              onClick={fetchSpecifications}
              className="flex items-center justify-center p-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleOpenAdd}
              className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 hover:scale-103 active:scale-97 shadow-md shadow-indigo-600/15"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add Specification</span>
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
          <span>All Specifications ({specifications.length})</span>
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

      {/* Searching bar via Reusable Component */}
      <div className="flex flex-col sm:flex-row gap-4 max-w-2xl">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={activeTab === 'list' ? "Search specifications..." : "Search conflicts by ID, IMEI, Serial or Site..."}
          className="flex-1"
        />
        {activeTab === 'list' && (
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-white border border-slate-200 rounded-xl text-xs text-slate-700 py-2.5 px-4 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-150 cursor-pointer shadow-sm font-semibold"
          >
            <option value="serial">Sort by Serial Number (A-Z)</option>
            <option value="imei">Sort by Hardware IMEI</option>
            <option value="date">Sort by Registration Date (Newest)</option>
          </select>
        )}
      </div>

      {activeTab === 'list' ? (
        <div className="space-y-6">
          {/* Table display */}
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
          ) : filteredSpecifications.length === 0 ? (
            <div className="glass-panel p-12 text-center text-slate-400 rounded-2xl border border-slate-250">
              No hardware specifications found.
            </div>
          ) : (
            <div className="glass-panel rounded-2xl overflow-hidden border border-slate-200/80 shadow-md shadow-slate-100">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse align-middle">
                  <thead>
                    <tr className="border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-widest font-extrabold bg-slate-50">
                      <th className="py-4 px-6">Serial Number</th>
                      <th className="py-4 px-6">IMEI</th>
                      <th className="py-4 px-6">Site Name</th>
                      <th className="py-4 px-6">Secret Security Key</th>
                      <th className="py-4 px-6">Reg. Date</th>
                      <th className="py-4 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentItems.map((spec) => (
                      <tr key={spec.id} className="border-b border-slate-100 hover:bg-slate-50/70 text-slate-700 text-sm transition-all duration-200">
                        <td className="py-4.5 px-6 font-extrabold text-slate-900 align-middle">
                          <span className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-lg border border-slate-200/50 text-[12px] font-mono">{spec.serial}</span>
                        </td>
                        <td className="py-4.5 px-6 font-mono text-indigo-600 font-bold align-middle">{spec.imei}</td>
                        <td className="py-4.5 px-6 align-middle font-semibold text-slate-800">{spec.commonSiteName || 'N/A'}</td>
                        <td className="py-4.5 px-6 font-mono text-xs max-w-xs truncate text-slate-500 align-middle">{spec.secretKey || 'No Secret'}</td>
                        <td className="py-4.5 px-6 text-xs text-slate-400 font-semibold align-middle">
                          <span className="bg-slate-100 text-slate-700 border border-slate-200/40 px-2 py-0.5 rounded-md font-mono">{spec.registrationDate || 'N/A'}</span>
                        </td>
                        <td className="py-4.5 px-6 text-right space-x-2 align-middle">
                          <button
                            onClick={() => handleOpenEdit(spec)}
                            title="Edit Document"
                            className="inline-flex items-center justify-center p-2 bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white rounded-xl border border-indigo-100 hover:border-indigo-600 transition-all duration-200 shadow-sm hover:scale-105 active:scale-95"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(spec.id, spec.serial)}
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
                  <span>Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, filteredSpecifications.length)} of {filteredSpecifications.length} entries</span>
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
        </div>
      ) : (
        <ConflictResolver
          conflicts={conflicts}
          loading={loading}
          type="specifications"
          onDeleteConflict={async (type, id) => {
            await handleDelete(id, 'Duplicate Specification');
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
                <Cpu className="w-5 h-5 text-indigo-400 animate-pulse" />
                <span>{editingId ? 'Edit Hardware Specs' : 'Register Hardware Specs'}</span>
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white text-sm">Close</button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Serial / Hardware Number</label>
                <input
                  type="text"
                  required
                  value={formData.serial}
                  onChange={(e) => setFormData({ ...formData, serial: e.target.value })}
                  placeholder="e.g. SN-99824"
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
                <label className="text-xs text-gray-400 font-semibold block">Secret Security Key (Authorization)</label>
                <input
                  type="text"
                  value={formData.secretKey}
                  onChange={(e) => setFormData({ ...formData, secretKey: e.target.value })}
                  placeholder="Encryption or handshake secret"
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Common Site Name</label>
                <input
                  type="text"
                  value={formData.commonSiteName}
                  onChange={(e) => setFormData({ ...formData, commonSiteName: e.target.value })}
                  placeholder="e.g. Nakhon Sawan Basin A"
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Registration Date</label>
                <input
                  type="text"
                  value={formData.registrationDate}
                  onChange={(e) => setFormData({ ...formData, registrationDate: e.target.value })}
                  placeholder="YYYY-MM-DD"
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Purchase Date</label>
                <input
                  type="text"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                  placeholder="YYYY-MM-DD"
                  className="w-full bg-[#111827] border border-gray-800 rounded-xl py-2 px-3.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400 font-semibold block">Shipping Date</label>
                <input
                  type="text"
                  value={formData.shippingDate}
                  onChange={(e) => setFormData({ ...formData, shippingDate: e.target.value })}
                  placeholder="YYYY-MM-DD"
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
                  {editingId ? 'Save Changes' : 'Register Hardware'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
