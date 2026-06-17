'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSearchParams } from 'next/navigation';
import { Anchor, Plus, Edit2, Trash2, X, Waves, RefreshCw } from 'lucide-react';
import { PageHeader, DashboardCard, SelectInput } from '@/components/UI';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function RiverStationsPage() {
  const { apiFetch } = useAuth();
  const searchParams = useSearchParams();
  const editSerial = searchParams.get('edit');
  const initialTab = searchParams.get('tab') === 'unregistered' ? 'unregistered' : 'registered';

  const [devices, setDevices] = useState<any[]>([]);
  const [officialPages, setOfficialPages] = useState<any[]>([]);
  const [unregisteredSerials, setUnregisteredSerials] = useState<string[]>([]);
  const [senseOfficialPages, setSenseOfficialPages] = useState<any[]>([]);
  const [useDetectedSerial, setUseDetectedSerial] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingTelemetry, setFetchingTelemetry] = useState(false);
  const [activeTab, setActiveTab] = useState<'registered' | 'unregistered'>(initialTab);

  // Modals & Selection
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<any>(null);

  // Device Form State
  const [deviceForm, setDeviceForm] = useState({
    serial: '',
    official_page_id: '' as any,
    name: '',
    status: 'ACTIVE',
    description: '',
    owner_email: '',
    owner_id: '',
    install_latitude: '',
    install_longitude: '',
    organization_name: '',
    cctv_path_0: '',
    cctv_path_1: '',
    cctv_path_2: '',
    bottom_to_bank_cm: '',
    bank_to_sensor_cm: '',
  });

  const [thresholdsForm, setThresholdsForm] = useState<Record<string, {
    id: number | null;
    threshold_cm: string;
    threshold_pct: string;
    freq_duration_sec: string;
    is_active: boolean;
  }>>({
    WARNING: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
    CRITICAL: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
    EMERGENCY: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
  });

  const [formError, setFormError] = useState<string>('');

  const handleOpenEditDevice = async (dev: any) => {
    setEditingDevice(dev);
    setUseDetectedSerial(false);
    setDeviceForm({
      serial: dev.serial || '',
      official_page_id: dev.official_page_id || '',
      name: dev.name || '',
      status: dev.status || 'ACTIVE',
      description: dev.description || '',
      owner_email: dev.owner_email || '',
      owner_id: dev.owner_id || '',
      install_latitude: dev.install_latitude || '',
      install_longitude: dev.install_longitude || '',
      organization_name: dev.organization_name || '',
      cctv_path_0: dev.cctv_path_0 || '',
      cctv_path_1: dev.cctv_path_1 || '',
      cctv_path_2: dev.cctv_path_2 || '',
      bottom_to_bank_cm: '',
      bank_to_sensor_cm: '',
    });
    setThresholdsForm({
      WARNING: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
      CRITICAL: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
      EMERGENCY: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
    });
    setFormError('');
    setShowDeviceModal(true);

    try {
      const configRes = await apiFetch(`${API_BASE_URL}/river/devices/${dev.serial}/calc-config`);
      if (configRes.ok) {
        const configData = await configRes.json();
        setDeviceForm(prev => ({
          ...prev,
          bottom_to_bank_cm: configData.bottom_to_bank_cm !== undefined ? configData.bottom_to_bank_cm.toString() : '',
          bank_to_sensor_cm: configData.bank_to_sensor_cm !== undefined ? configData.bank_to_sensor_cm.toString() : '',
        }));
      }
    } catch (err) {
      console.error("Failed to fetch calculation config", err);
    }

    try {
      const thRes = await apiFetch(`${API_BASE_URL}/river/devices/${dev.serial}/thresholds`);
      if (thRes.ok) {
        const thData = await thRes.json();
        if (Array.isArray(thData)) {
          const updated = {
            WARNING: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
            CRITICAL: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
            EMERGENCY: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
          } as any;
          thData.forEach((t: any) => {
            if (updated[t.alert_level]) {
              updated[t.alert_level] = {
                id: t.id,
                threshold_cm: t.threshold_cm !== null && t.threshold_cm !== undefined ? t.threshold_cm.toString() : '',
                threshold_pct: t.threshold_pct !== null && t.threshold_pct !== undefined ? t.threshold_pct.toString() : '',
                freq_duration_sec: t.freq_duration_sec !== null && t.freq_duration_sec !== undefined ? t.freq_duration_sec.toString() : '',
                is_active: t.is_active !== false,
              };
            }
          });
          setThresholdsForm(updated);
        }
      }
    } catch (err) {
      console.error("Failed to fetch thresholds config", err);
    }
  };

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const devRes = await apiFetch(`${API_BASE_URL}/river/devices`);
      if (devRes.ok) {
        const data = await devRes.json();
        setDevices(data || []);

        if (editSerial) {
          const target = data.find((d: any) => d.serial === editSerial);
          if (target) {
            handleOpenEditDevice(target);
          }
        }
      }

      const opRes = await apiFetch(`${API_BASE_URL}/river/official-pages`);
      if (opRes.ok) {
        const data = await opRes.json();
        setOfficialPages(data || []);
      }

      const unregRes = await apiFetch(`${API_BASE_URL}/river/unregistered-serials`);
      if (unregRes.ok) {
        const data = await unregRes.json();
        setUnregisteredSerials(data || []);
      }

      const senseOpRes = await apiFetch(`${API_BASE_URL}/fahfon-sense/official-pages`);
      if (senseOpRes.ok) {
        const data = await senseOpRes.json();
        setSenseOfficialPages(data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, editSerial]);

  const handleSelectUnregisteredSerial = async (serial: string) => {
    if (!serial) {
      setDeviceForm(prev => ({ ...prev, serial: '' }));
      return;
    }
    setDeviceForm(prev => ({ ...prev, serial }));
    setFetchingTelemetry(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/devices/${serial}/current`);
      if (res.ok) {
        const data = await res.json();
        setDeviceForm(prev => ({
          ...prev,
          name: data.common_site_name || `สถานีวัดน้ำ ${serial}`,
          install_latitude: data.latitude ? data.latitude.toString() : prev.install_latitude,
          install_longitude: data.longitude ? data.longitude.toString() : prev.install_longitude,
          cctv_path_0: data.snapshot_url0 || prev.cctv_path_0,
          cctv_path_1: data.snapshot_url1 || prev.cctv_path_1,
          cctv_path_2: data.snapshot_url2 || prev.cctv_path_2,
        }));
      }
    } catch (err) {
      console.error("Failed to fetch telemetry details for auto-fill", err);
    } finally {
      setFetchingTelemetry(false);
    }
  };

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  const validateForm = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (deviceForm.owner_email && !emailRegex.test(deviceForm.owner_email)) {
      setFormError('Invalid owner email format.');
      return false;
    }

    const lat = parseFloat(deviceForm.install_latitude);
    const lng = parseFloat(deviceForm.install_longitude);

    if (deviceForm.install_latitude && (isNaN(lat) || lat < -90 || lat > 90)) {
      setFormError('Latitude must be a valid number between -90 and 90.');
      return false;
    }

    if (deviceForm.install_longitude && (isNaN(lng) || lng < -180 || lng > 180)) {
      setFormError('Longitude must be a valid number between -180 and 180.');
      return false;
    }

    setFormError('');
    return true;
  };

  const handleDeviceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const url = editingDevice 
        ? `${API_BASE_URL}/river/devices/${editingDevice.serial}`
        : `${API_BASE_URL}/river/devices`;
      const method = editingDevice ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...deviceForm,
          official_page_id: null,
        }),
      });

      if (res.ok) {
        // Save calculation config
        const bottom = parseFloat(deviceForm.bottom_to_bank_cm);
        const bank = parseFloat(deviceForm.bank_to_sensor_cm);
        if (!isNaN(bottom) || !isNaN(bank)) {
          await apiFetch(`${API_BASE_URL}/river/devices/${deviceForm.serial}/calc-config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              serial: deviceForm.serial,
              bottom_to_bank_cm: isNaN(bottom) ? 0 : bottom,
              bank_to_sensor_cm: isNaN(bank) ? 0 : bank,
            }),
          });
        }

        // Save Alert Thresholds
        for (const level of ['WARNING', 'CRITICAL', 'EMERGENCY']) {
          const th = thresholdsForm[level];
          if (th.is_active || th.id !== null) {
            const body = {
              alert_level: level,
              threshold_cm: th.threshold_cm ? parseFloat(th.threshold_cm) : null,
              threshold_pct: th.threshold_pct ? parseFloat(th.threshold_pct) : null,
              freq_duration_sec: th.freq_duration_sec ? parseInt(th.freq_duration_sec) : null,
              is_active: th.is_active,
            };
            
            if (th.id !== null) {
              await apiFetch(`${API_BASE_URL}/river/thresholds/${th.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
            } else {
              await apiFetch(`${API_BASE_URL}/river/devices/${deviceForm.serial}/thresholds`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              });
            }
          }
        }

        alert(editingDevice ? 'Device updated successfully.' : 'Device registered successfully.');
        setShowDeviceModal(false);
        fetchAllData();
      } else {
        const errData = await res.json();
        setFormError(errData.error || 'Failed to submit device details.');
      }
    } catch (err) {
      console.error(err);
      setFormError('Connection failed.');
    }
  };

  const handleRegisterUnregistered = (serial: string) => {
    setEditingDevice(null);
    setUseDetectedSerial(true);
    setDeviceForm({
      serial: serial,
      official_page_id: '',
      name: `สถานีวัดน้ำ ${serial}`,
      status: 'ACTIVE',
      description: '',
      owner_email: '',
      owner_id: '',
      install_latitude: '',
      install_longitude: '',
      organization_name: '',
      cctv_path_0: '',
      cctv_path_1: '',
      cctv_path_2: '',
      bottom_to_bank_cm: '',
      bank_to_sensor_cm: '',
    });
    setThresholdsForm({
      WARNING: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
      CRITICAL: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
      EMERGENCY: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
    });
    setFormError('');
    setShowDeviceModal(true);
    handleSelectUnregisteredSerial(serial);
  };

  const handleOpenAddDevice = () => {
    setEditingDevice(null);
    setUseDetectedSerial(unregisteredSerials.length > 0);
    setDeviceForm({
      serial: '',
      official_page_id: '',
      name: '',
      status: 'ACTIVE',
      description: '',
      owner_email: '',
      owner_id: '',
      install_latitude: '',
      install_longitude: '',
      organization_name: '',
      cctv_path_0: '',
      cctv_path_1: '',
      cctv_path_2: '',
      bottom_to_bank_cm: '',
      bank_to_sensor_cm: '',
    });
    setThresholdsForm({
      WARNING: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
      CRITICAL: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
      EMERGENCY: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
    });
    setFormError('');
    setShowDeviceModal(true);
  };

  const handleDeleteDevice = async (serial: string) => {
    if (!confirm(`Are you sure you want to delete river device: ${serial}?`)) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/devices/${serial}`, { method: 'DELETE' });
      if (res.ok) {
        alert('Device deleted successfully.');
        fetchAllData();
      } else {
        alert('Failed to delete device.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title Header */}
      <PageHeader
        title="River Stations CRUD"
        description="Manage physical hydrological telemetry terminals and paths."
        icon={<Anchor className="w-8 h-8 text-indigo-650" />}
        actionButton={
          <>
            <button
              onClick={fetchAllData}
              className="flex items-center justify-center p-2.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded-xl text-sm font-semibold transition shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleOpenAddDevice}
              className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm px-4 py-2.5 rounded-xl shadow-md transition"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Add River Device</span>
            </button>
          </>
        }
      />

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('registered')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'registered'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          สถานีที่ลงทะเบียนแล้ว ({devices.length})
        </button>
        <button
          onClick={() => setActiveTab('unregistered')}
          className={`py-3 px-6 text-sm font-semibold border-b-2 transition-all ${
            activeTab === 'unregistered'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          พบอุปกรณ์ใหม่ยังไม่ลงทะเบียน ({unregisteredSerials.length})
        </button>
      </div>

      <DashboardCard>
        {activeTab === 'registered' ? (
          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-wider font-semibold">
                  <th className="py-4 px-4">Serial</th>
                  <th className="py-4 px-4">Name</th>
                  <th className="py-4 px-4">Owner Info</th>
                  <th className="py-4 px-4">Install Location</th>
                  <th className="py-4 px-4">Warning Status</th>
                  <th className="py-4 px-4">CCTV Paths</th>
                  <th className="py-4 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"></div>
                      Loading river devices...
                    </td>
                  </tr>
                ) : devices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">No river devices configured.</td>
                  </tr>
                ) : (
                  devices.map((dev) => (
                    <tr key={dev.serial} className="hover:bg-slate-50/50 transition">
                      <td className="py-4.5 px-4 font-mono font-bold text-indigo-600">{dev.serial}</td>
                      <td className="py-4.5 px-4">
                        <div className="font-bold text-slate-900">{dev.name}</div>
                        <div className="text-slate-400 text-[10px]">{dev.organization_name}</div>
                      </td>
                      <td className="py-4.5 px-4">
                        <div className="font-medium text-slate-800">{dev.owner_id || 'No ID'}</div>
                        <div className="text-slate-400 text-[10px]">{dev.owner_email || 'No Email'}</div>
                      </td>
                      <td className="py-4.5 px-4">
                        {dev.install_latitude && dev.install_longitude ? (
                          <span className="font-mono text-[10px] bg-slate-100 border border-slate-200 px-2 py-0.5 rounded text-indigo-600">
                            {parseFloat(dev.install_latitude).toFixed(4)}, {parseFloat(dev.install_longitude).toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-slate-400">Not set</span>
                        )}
                      </td>
                      <td className="py-4.5 px-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                          dev.warning_status === 'EMERGENCY'
                            ? 'bg-rose-500 text-white border-rose-600'
                            : dev.warning_status === 'CRITICAL'
                            ? 'bg-amber-500 text-white border-amber-600'
                            : dev.warning_status === 'WARNING'
                            ? 'bg-indigo-555 text-indigo-700 border-indigo-200'
                            : 'bg-emerald-555 text-emerald-700 border-emerald-100'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            dev.warning_status === 'EMERGENCY' || dev.warning_status === 'CRITICAL'
                              ? 'bg-white animate-pulse'
                              : dev.warning_status === 'WARNING'
                              ? 'bg-indigo-500'
                              : 'bg-emerald-500'
                          }`} />
                          {dev.warning_status || 'NORMAL'}
                        </span>
                      </td>
                      <td className="py-4.5 px-4 text-slate-500">
                        <div className="flex gap-1">
                          {dev.cctv_path_0 && <span className="bg-indigo-50 border border-indigo-100 text-[9px] font-bold px-1.5 py-0.5 rounded text-indigo-600">C0</span>}
                          {dev.cctv_path_1 && <span className="bg-indigo-50 border border-indigo-100 text-[9px] font-bold px-1.5 py-0.5 rounded text-indigo-600">C1</span>}
                          {dev.cctv_path_2 && <span className="bg-indigo-50 border border-indigo-100 text-[9px] font-bold px-1.5 py-0.5 rounded text-indigo-600">C2</span>}
                          {!dev.cctv_path_0 && !dev.cctv_path_1 && !dev.cctv_path_2 && <span className="text-slate-300">-</span>}
                        </div>
                      </td>
                      <td className="py-4.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEditDevice(dev)}
                          className="p-2 bg-indigo-50 hover:bg-indigo-600 text-indigo-650 hover:text-white border border-indigo-100 rounded-xl transition shadow-sm"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteDevice(dev.serial)}
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
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase tracking-wider font-semibold">
                  <th className="py-4 px-4">Serial Number</th>
                  <th className="py-4 px-4">Status</th>
                  <th className="py-4 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-400">
                      <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"></div>
                      Loading unregistered devices...
                    </td>
                  </tr>
                ) : unregisteredSerials.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-8 text-center text-slate-400 font-medium">
                      ไม่มีอุปกรณ์ใหม่ที่รอการลงทะเบียนในขณะนี้
                    </td>
                  </tr>
                ) : (
                  unregisteredSerials.map((serial) => (
                    <tr key={serial} className="hover:bg-slate-50/50 transition">
                      <td className="py-4 px-4 font-mono font-bold text-slate-900">{serial}</td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-700 border-amber-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                          PENDING REGISTRATION
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => handleRegisterUnregistered(serial)}
                          className="inline-flex items-center space-x-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[11px] px-3.5 py-1.5 rounded-xl shadow-md transition"
                        >
                          <Plus className="w-3.5 h-3.5 stroke-[3]" />
                          <span>ลงทะเบียน / Register</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </DashboardCard>

      {/* MODAL: Device CRUD */}
      {showDeviceModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h3 className="text-slate-900 font-extrabold text-lg flex items-center space-x-2">
                <Waves className="w-5 h-5 text-indigo-600 animate-pulse" />
                <span>{editingDevice ? 'Modify Telemetry Node' : 'Register River Telemetry Node'}</span>
              </h3>
              <button onClick={() => setShowDeviceModal(false)} className="text-slate-400 hover:text-slate-650 text-sm"><X className="w-5 h-5" /></button>
            </div>

            {formError && (
              <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-650 text-xs font-bold">
                {formError}
              </div>
            )}

            <form onSubmit={handleDeviceSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!editingDevice && unregisteredSerials.length > 0 && (
                <div className="md:col-span-2 flex items-center space-x-3 bg-indigo-50 border border-indigo-100 p-3.5 rounded-xl">
                  <input
                    type="checkbox"
                    id="toggleDetected"
                    checked={useDetectedSerial}
                    onChange={(e) => {
                      setUseDetectedSerial(e.target.checked);
                      setDeviceForm(prev => ({ ...prev, serial: '' }));
                    }}
                    className="w-4 h-4 text-indigo-600 bg-white border-slate-300 rounded focus:ring-indigo-500"
                  />
                  <label htmlFor="toggleDetected" className="text-xs font-bold text-slate-700 cursor-pointer select-none">
                    Link with detected active telemetry from MongoDB (Auto-fill location & details)
                  </label>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs text-slate-600 font-bold block">
                  {useDetectedSerial ? 'Detected Serial Number' : 'Serial Number / Hardware ID'}
                </label>
                {useDetectedSerial ? (
                  <>
                    <SelectInput
                      value={deviceForm.serial}
                      onChange={(val) => handleSelectUnregisteredSerial(val)}
                      options={unregisteredSerials.map(s => ({ value: s, label: s }))}
                      placeholder="-- Choose Serial --"
                      required
                    />
                    {fetchingTelemetry && <span className="text-[10px] text-indigo-600 block mt-1 animate-pulse">Fetching telemetry metadata to auto-fill...</span>}
                  </>
                ) : (
                  <input
                    type="text"
                    required
                    disabled={!!editingDevice}
                    value={deviceForm.serial}
                    onChange={(e) => setDeviceForm({ ...deviceForm, serial: e.target.value })}
                    placeholder="e.g. SN-RIVER-001"
                    className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 disabled:opacity-50 font-mono"
                  />
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-600 font-bold block">Station Name</label>
                <input
                  type="text"
                  required
                  value={deviceForm.name}
                  onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                  placeholder="e.g. Ping River Delta"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40"
                />
              </div>

              <SelectInput
                label="Official Page Association (Fahfon Sense)"
                value={deviceForm.owner_email ? `${deviceForm.owner_email}|${deviceForm.owner_id}` : ''}
                onChange={(val) => {
                  if (val) {
                    const [email, accId] = val.split('|');
                    setDeviceForm(prev => ({
                      ...prev,
                      owner_email: email,
                      owner_id: accId
                    }));
                  } else {
                    setDeviceForm(prev => ({
                      ...prev,
                      owner_email: '',
                      owner_id: ''
                    }));
                  }
                }}
                options={senseOfficialPages.map(page => ({
                  value: `${page.email}|${page.account_id || ''}`,
                  label: `${page.email} (ID: ${page.account_id || 'N/A'})`
                }))}
                placeholder="-- Select Fahfon Sense Official Page --"
                className="md:col-span-2"
                required
              />

              <div className="space-y-1">
                <label className="text-xs text-slate-650 font-bold block">Organization Name</label>
                <input
                  type="text"
                  required
                  value={deviceForm.organization_name}
                  onChange={(e) => setDeviceForm({ ...deviceForm, organization_name: e.target.value })}
                  placeholder="e.g. RID Department"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-bold block">Owner ID Reference (Auto-filled)</label>
                <input
                  type="text"
                  required
                  disabled
                  value={deviceForm.owner_id}
                  placeholder="Will be auto-filled from Official Page"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-500 focus:outline-none disabled:opacity-80"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400 font-bold block">Owner Contact Email (Auto-filled)</label>
                <input
                  type="text"
                  required
                  disabled
                  value={deviceForm.owner_email}
                  placeholder="Will be auto-filled from Official Page"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-500 focus:outline-none disabled:opacity-80"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-650 font-bold block">ท้องน้ำถึงตลิ่ง (ซม.) / Bottom to Bank (cm)</label>
                <input
                  type="text"
                  required
                  value={deviceForm.bottom_to_bank_cm}
                  onChange={(e) => setDeviceForm({ ...deviceForm, bottom_to_bank_cm: e.target.value })}
                  placeholder="e.g. 500.0"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-650 font-bold block">ตลิ่งถึงเซ็นเซอร์ (ซม.) / Bank to Sensor (cm)</label>
                <input
                  type="text"
                  required
                  value={deviceForm.bank_to_sensor_cm}
                  onChange={(e) => setDeviceForm({ ...deviceForm, bank_to_sensor_cm: e.target.value })}
                  placeholder="e.g. 150.0"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-600 font-bold block">Installation Latitude</label>
                <input
                  type="text"
                  required
                  value={deviceForm.install_latitude}
                  onChange={(e) => setDeviceForm({ ...deviceForm, install_latitude: e.target.value })}
                  placeholder="e.g. 13.7367"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-600 font-bold block">Installation Longitude</label>
                <input
                  type="text"
                  required
                  value={deviceForm.install_longitude}
                  onChange={(e) => setDeviceForm({ ...deviceForm, install_longitude: e.target.value })}
                  placeholder="e.g. 100.5231"
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 font-mono"
                />
              </div>

              <div className="md:col-span-2 space-y-1">
                <label className="text-xs text-slate-600 font-bold block">Location Description</label>
                <textarea
                  value={deviceForm.description}
                  onChange={(e) => setDeviceForm({ ...deviceForm, description: e.target.value })}
                  placeholder="Installation spot details, river bank structure..."
                  className="w-full bg-white border border-slate-200 rounded-xl py-2.5 px-3.5 text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 h-20"
                />
              </div>

              {/* Alert Rules & Thresholds */}
              <div className="md:col-span-2 border-t border-slate-100 pt-4 space-y-3">
                <h4 className="text-xs font-bold text-indigo-650 uppercase tracking-widest">Alert Rules & Thresholds</h4>
                <div className="space-y-4">
                  {['WARNING', 'CRITICAL', 'EMERGENCY'].map((level) => {
                    const cfg = thresholdsForm[level] || { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false };
                    const colorClass = level === 'EMERGENCY' ? 'text-rose-600' : level === 'CRITICAL' ? 'text-amber-500' : 'text-indigo-600';
                    return (
                      <div key={level} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id={`active-${level}`}
                              checked={cfg.is_active}
                              onChange={(e) => {
                                setThresholdsForm(prev => ({
                                  ...prev,
                                  [level]: { ...prev[level], is_active: e.target.checked }
                                }));
                              }}
                              className="w-4 h-4 text-indigo-600 bg-white border-slate-300 rounded focus:ring-indigo-500"
                            />
                            <label htmlFor={`active-${level}`} className={`text-xs font-extrabold uppercase ${colorClass} cursor-pointer`}>
                              Enable {level} Alert Rule
                            </label>
                          </div>
                        </div>

                        {cfg.is_active && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-500 font-bold block">Threshold Depth (cm)</label>
                              <input
                                type="number"
                                step="any"
                                value={cfg.threshold_cm}
                                onChange={(e) => {
                                  setThresholdsForm(prev => ({
                                    ...prev,
                                    [level]: { ...prev[level], threshold_cm: e.target.value }
                                  }));
                                }}
                                placeholder="e.g. 400"
                                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-500 font-bold block">Threshold Capacity (%)</label>
                              <input
                                type="number"
                                step="any"
                                value={cfg.threshold_pct}
                                onChange={(e) => {
                                  setThresholdsForm(prev => ({
                                    ...prev,
                                    [level]: { ...prev[level], threshold_pct: e.target.value }
                                  }));
                                }}
                                placeholder="e.g. 80"
                                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] text-slate-500 font-bold block">Transmission Interval / Snap Speed (sec)</label>
                              <input
                                type="number"
                                value={cfg.freq_duration_sec}
                                onChange={(e) => {
                                  setThresholdsForm(prev => ({
                                    ...prev,
                                    [level]: { ...prev[level], freq_duration_sec: e.target.value }
                                  }));
                                }}
                                placeholder="e.g. 120"
                                className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CCTV Paths Inputs */}
              <div className="md:col-span-2 border-t border-slate-100 pt-4 space-y-3">
                <h4 className="text-xs font-bold text-indigo-650 uppercase tracking-widest">CCTV Camera Video Feeds Paths</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-semibold block">CCTV Camera 0 URL / Path</label>
                    <input
                      type="text"
                      value={deviceForm.cctv_path_0}
                      onChange={(e) => setDeviceForm({ ...deviceForm, cctv_path_0: e.target.value })}
                      placeholder="/CAM0_*.jpg or RTMP url"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-semibold block">CCTV Camera 1 URL / Path</label>
                    <input
                      type="text"
                      value={deviceForm.cctv_path_1}
                      onChange={(e) => setDeviceForm({ ...deviceForm, cctv_path_1: e.target.value })}
                      placeholder="/CAM1_*.jpg or RTMP url"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-semibold block">CCTV Camera 2 URL / Path</label>
                    <input
                      type="text"
                      value={deviceForm.cctv_path_2}
                      onChange={(e) => setDeviceForm({ ...deviceForm, cctv_path_2: e.target.value })}
                      placeholder="/CAM2_*.jpg or RTMP url"
                      className="w-full bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-100"
                    />
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 pt-4 border-t border-slate-100 flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeviceModal(false)}
                  className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-2.5 rounded-xl text-sm font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-100"
                >
                  {editingDevice ? 'Update Specifications' : 'Register Terminal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}