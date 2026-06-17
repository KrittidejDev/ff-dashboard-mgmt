'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { PageHeader, DashboardCard } from '@/components/UI';
import { Users, RefreshCw, Link2, Unlink, Edit2, Trash2, Plus, X, Globe, MapPin, CheckCircle, ShieldAlert } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function RiverOfficialPagesPage() {
  const { apiFetch } = useAuth();
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Modals & Action Forms
  const [showPageModal, setShowPageModal] = useState(false);
  const [editingPage, setEditingPage] = useState<any>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingPage, setLinkingPage] = useState<any>(null);
  const [senseOfficialPages, setSenseOfficialPages] = useState<any[]>([]);

  // Form states
  const [pageForm, setPageForm] = useState({
    name: '',
    code: '',
    description: '',
    municipality_id: '',
  });
  const [municipalityIdInput, setMunicipalityIdInput] = useState('');
  const [formError, setFormError] = useState('');

  const fetchSenseOfficialPages = async () => {
    try {
      const senseOpRes = await apiFetch(`${API_BASE_URL}/fahfon-sense/official-pages`);
      if (senseOpRes.ok) {
        const data = await senseOpRes.json();
        setSenseOfficialPages(data || []);
      }
    } catch (err) {
      console.error('Failed to load Fahfon Sense official pages', err);
    }
  };

  const fetchPages = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/official-pages`);
      if (res.ok) {
        const data = await res.json();
        setPages(data || []);
      } else {
        setError('Failed to fetch River Official Pages from gateway.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection error occurred while fetching pages.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPages();
    fetchSenseOfficialPages();
  }, []);

  const handleOpenAddPage = () => {
    setEditingPage(null);
    setPageForm({ name: '', code: '', description: '', municipality_id: '' });
    setFormError('');
    setShowPageModal(true);
  };

  const handleOpenEditPage = (page: any) => {
    setEditingPage(page);
    setPageForm({
      name: page.name || '',
      code: page.code || '',
      description: page.description || '',
      municipality_id: page.municipality_id || '',
    });
    setFormError('');
    setShowPageModal(true);
  };

  const handlePageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const submitData = {
      ...pageForm,
      municipality_id: pageForm.municipality_id.trim() === '' ? null : pageForm.municipality_id.trim()
    };

    try {
      const url = editingPage 
        ? `${API_BASE_URL}/river/official-pages/${editingPage.id}`
        : `${API_BASE_URL}/river/official-pages`;
      const method = editingPage ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });

      if (res.ok) {
        setShowPageModal(false);
        fetchPages();
      } else {
        const errData = await res.json();
        setFormError(errData.error || 'Failed to submit official page details.');
      }
    } catch (err) {
      console.error(err);
      setFormError('Network connection failed.');
    }
  };

  const handleDeletePage = async (page: any) => {
    if (!confirm(`Are you sure you want to delete the official page "${page.name}"?`)) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/official-pages/${page.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchPages();
      } else {
        alert('Failed to delete official page.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenLink = (page: any) => {
    setLinkingPage(page);
    setMunicipalityIdInput(page.municipality_id || '');
    setFormError('');
    setShowLinkModal(true);
  };

  const handleLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const targetUuid = municipalityIdInput.trim() === '' ? null : municipalityIdInput.trim();

    try {
      const res = await apiFetch(`${API_BASE_URL}/river/official-pages/${linkingPage.id}/link-municipality`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ municipality_id: targetUuid }),
      });

      if (res.ok) {
        setShowLinkModal(false);
        fetchPages();
      } else {
        const errData = await res.json();
        setFormError(errData.error || 'Failed to update municipality pairing.');
      }
    } catch (err) {
      console.error(err);
      setFormError('Network connection failed.');
    }
  };

  const handleUnlink = async (page: any) => {
    if (!confirm(`Are you sure you want to unlink municipality from page: ${page.name}?`)) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/official-pages/${page.id}/link-municipality`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ municipality_id: null }),
      });
      if (res.ok) {
        fetchPages();
      } else {
        alert('Failed to unlink municipality.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title Header */}
      <PageHeader
        title="River Official Pages & Municipality Pairing"
        description="Manage hydrological page definitions and bind Mueangsmart municipality IDs to segregate telemetry."
        icon={<Users className="w-8 h-8 text-indigo-650" />}
        actionButton={
          <>
            <button
              onClick={fetchPages}
              className="flex items-center justify-center p-2.5 bg-white hover:bg-slate-50 text-slate-650 border border-slate-200 rounded-xl text-sm font-semibold transition shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleOpenAddPage}
              className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-md transition"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Create Official Page</span>
            </button>
          </>
        }
      />

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-650 font-bold text-sm flex items-center space-x-2">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Pairing logic alert banner */}
      <div className="bg-gradient-to-r from-indigo-50 to-indigo-100/50 border border-indigo-100 rounded-2xl p-5 shadow-sm">
        <h4 className="text-sm font-extrabold text-slate-900 leading-tight flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-600" />
          <span>Mueangsmart Integration Architecture</span>
        </h4>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          Binding a <strong>Municipality ID</strong> (UUID) maps requests authorized by Mueangsmart Client Keys/Web Headers directly to the matched <strong>Official Page Code</strong>. This isolates device telemetry data correctly at the <code>ff-river-service</code> usecase layer.
        </p>
      </div>

      <DashboardCard>
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-wider font-semibold">
                <th className="py-4 px-5">Page Name</th>
                <th className="py-4 px-5">Page Code</th>
                <th className="py-4 px-5">Linked Municipality ID (UUID)</th>
                <th className="py-4 px-5">Description</th>
                <th className="py-4 px-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"></div>
                    Loading official pages...
                  </td>
                </tr>
              ) : pages.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 font-medium">No official pages found. Click Create Official Page to get started.</td>
                </tr>
              ) : (
                pages.map((page) => (
                  <tr key={page.id} className="hover:bg-slate-50/50 transition">
                    <td className="py-4 px-5 font-bold text-slate-900">{page.name}</td>
                    <td className="py-4 px-5">
                      <span className="font-mono bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded text-indigo-650 font-bold">
                        {page.code}
                      </span>
                    </td>
                    <td className="py-4 px-5">
                      {page.municipality_id ? (
                        <div className="flex items-center space-x-2">
                          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="font-mono text-slate-800 break-all select-all">{page.municipality_id}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 font-medium italic">Unlinked</span>
                      )}
                    </td>
                    <td className="py-4 px-5 text-slate-500 max-w-xs truncate">{page.description || '-'}</td>
                    <td className="py-4 px-5 text-right space-x-2">
                      <button
                        onClick={() => handleOpenLink(page)}
                        className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition shadow-sm ${
                          page.municipality_id
                            ? 'bg-rose-50 border-rose-100 text-rose-650 hover:bg-rose-100/50'
                            : 'bg-indigo-50 border-indigo-100 text-indigo-650 hover:bg-indigo-100/50'
                        }`}
                      >
                        {page.municipality_id ? (
                          <>
                            <Unlink className="w-3.5 h-3.5" />
                            <span>Change link</span>
                          </>
                        ) : (
                          <>
                            <Link2 className="w-3.5 h-3.5" />
                            <span>Link Municipality</span>
                          </>
                        )}
                      </button>
                      {page.municipality_id && (
                        <button
                          onClick={() => handleUnlink(page)}
                          title="Unlink Municipality"
                          className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 rounded-lg transition"
                        >
                          <Unlink className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleOpenEditPage(page)}
                        className="p-2 bg-indigo-50 hover:bg-indigo-600 text-indigo-650 hover:text-white border border-indigo-100 rounded-xl transition shadow-sm"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeletePage(page)}
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

      {/* MODAL: Page Create / Update */}
      {showPageModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-slate-900 font-extrabold text-base flex items-center space-x-2">
                <Users className="w-5 h-5 text-indigo-600" />
                <span>{editingPage ? 'Edit River Official Page' : 'Create River Official Page'}</span>
              </h3>
              <button onClick={() => setShowPageModal(false)} className="text-slate-400 hover:text-slate-650"><X className="w-5 h-5" /></button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-650 text-xs font-bold">
                {formError}
              </div>
            )}

            <form onSubmit={handlePageSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-650 font-bold block">Fahfon Sense Official Page (เพจทางการหลัก)</label>
                <select
                  required
                  value={pageForm.code}
                  onChange={(e) => {
                    const selectedCode = e.target.value;
                    const selectedPage = senseOfficialPages.find(p => p.email === selectedCode || p.account_id === selectedCode);
                    setPageForm(prev => ({
                      ...prev,
                      code: selectedCode,
                      // Auto-fill the name based on the selected email
                      name: selectedPage ? selectedPage.email.split('@')[0] : prev.name
                    }));
                  }}
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40"
                >
                  <option value="">-- Choose Official Page --</option>
                  {senseOfficialPages.map((page, pIdx) => (
                    <option key={pIdx} value={page.email}>
                      {page.email} {page.account_id ? `(ID: ${page.account_id})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-slate-600 font-bold block">Page Name / Title (ชื่อเมือง/เทศบาล)</label>
                  <input
                    type="text"
                    required
                    value={pageForm.name}
                    onChange={(e) => setPageForm({ ...pageForm, name: e.target.value })}
                    placeholder="e.g. เทศบาลเมืองสามพราน"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-600 font-bold block">Municipality UUID (รหัส UUID ของเมือง)</label>
                  <input
                    type="text"
                    value={pageForm.municipality_id}
                    onChange={(e) => setPageForm({ ...pageForm, municipality_id: e.target.value })}
                    placeholder="e.g. 861dc6a4-f4d3-431f-9b48-6726532bcf82"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-600 font-bold block">Description</label>
                <textarea
                  value={pageForm.description}
                  onChange={(e) => setPageForm({ ...pageForm, description: e.target.value })}
                  placeholder="Details of the page jurisdiction..."
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 h-20"
                />
              </div>

              <div className="flex justify-end space-x-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPageModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition"
                >
                  {editingPage ? 'Save Changes' : 'Create Page'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Link Municipality */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-slate-900 font-extrabold text-base flex items-center space-x-2">
                <Link2 className="w-5 h-5 text-indigo-600" />
                <span>Pair Municipality UUID</span>
              </h3>
              <button onClick={() => setShowLinkModal(false)} className="text-slate-400 hover:text-slate-650"><X className="w-5 h-5" /></button>
            </div>

            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 p-3.5 rounded-xl space-y-1">
              <p><strong>Page:</strong> {linkingPage?.name} (code: {linkingPage?.code})</p>
              <p className="mt-1">Enter the Mueangsmart Municipality UUID. You can unlink it later anytime.</p>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-650 text-xs font-bold">
                {formError}
              </div>
            )}

            <form onSubmit={handleLinkSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-600 font-bold block">Municipality UUID</label>
                <input
                  type="text"
                  value={municipalityIdInput}
                  onChange={(e) => setMunicipalityIdInput(e.target.value)}
                  placeholder="e.g. 123e4567-e89b-12d3-a456-426614174000"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 font-mono"
                />
              </div>

              <div className="flex justify-end space-x-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-650 rounded-xl text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md transition"
                >
                  Save Link Connection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
