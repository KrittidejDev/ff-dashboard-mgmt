'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import { useAuth } from '@/context/AuthContext';
import { 
  ArrowLeft, 
  Calendar, 
  Clock, 
  Database, 
  AlertCircle, 
  Droplet, 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  RefreshCw,
  Camera,
  X,
  Eye,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import Link from 'next/link';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import { DashboardCard } from '@/components/UI';
import { RtspPlayer } from '@/components/RtspPlayer';
import { WaterChart } from '@/components/WaterChart';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';
const getProxiedImageUrl = (url: string) => {
  if (!url || url === '-') return '';
  return `${API_BASE_URL}/river/images/proxy?url=${encodeURIComponent(url)}`;
};

interface PageProps {
  params: Promise<{ serial: string }>;
}

export default function DeviceDetailPage({ params }: PageProps) {
  const { serial } = use(params);
  const { apiFetch } = useAuth();

  // Core state
  const [device, setDevice] = useState<any>(null);
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [deviceConfig, setDeviceConfig] = useState<any>(null);
  const [allStats, setAllStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal and Photo View States
  const [selectedLogForModal, setSelectedLogForModal] = useState<any>(null);
  const [modalActiveCam, setModalActiveCam] = useState<number>(0);

  // Alert Thresholds Form State
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
  const [savingThresholds, setSavingThresholds] = useState(false);

  // Calculation Config Form State
  const [editingConfig, setEditingConfig] = useState(false);
  const [configForm, setConfigForm] = useState({
    bottom_to_bank_cm: '',
    bank_to_sensor_cm: '',
    default_duration_sec: '',
    offline_threshold_min: ''
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Device Meta Form State
  const [editingMeta, setEditingMeta] = useState(false);
  const [metaForm, setMetaForm] = useState({
    organization_name: '',
    description: '',
    cctv_path_0: '',
    cctv_path_1: '',
    cctv_path_2: '',
  });
  const [savingMeta, setSavingMeta] = useState(false);

  // PTZ Control States
  const [ptzSpeed, setPtzSpeed] = useState<number>(0.5);
  const [rotateVideo, setRotateVideo] = useState(false);

  const handlePTZ = async (action: string, speed = 0.5) => {
    try {
      await apiFetch(`${API_BASE_URL}/river/devices/${serial}/ptz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, speed }),
      });
    } catch (err) {
      console.error('PTZ action failed', err);
    }
  };
  const handlePTZStart = (action: string) => {
    let finalAction = action;
    if (rotateVideo) {
      if (action === 'MOVE_UP') finalAction = 'MOVE_DOWN';
      else if (action === 'MOVE_DOWN') finalAction = 'MOVE_UP';
      else if (action === 'MOVE_LEFT') finalAction = 'MOVE_RIGHT';
      else if (action === 'MOVE_RIGHT') finalAction = 'MOVE_LEFT';
    }
    handlePTZ(finalAction, ptzSpeed);
  };
  const handlePTZStop = () => {
    handlePTZ('STOP', 0);
  };

  // Logs Table Pagination State
  const [visibleLogsCount, setVisibleLogsCount] = useState(50);

  // Logs Table Isolated Date Picker States
  const [selectedLogDate, setSelectedLogDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });
  const [logStats, setLogStats] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Filter state
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  const [resolution, setResolution] = useState<'hourly' | '6hourly' | 'daily'>('hourly');
  const [selectedHour, setSelectedHour] = useState<string>('ALL');
  const [selected6Hour, setSelected6Hour] = useState<string>('ALL');
  const [lastLoadedKey, setLastLoadedKey] = useState<string>('');

  const fetchDeviceMetadata = useCallback(async () => {
    try {
      const [devRes, threshRes, configRes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/river/devices/${serial}`).catch(() => null),
        apiFetch(`${API_BASE_URL}/river/devices/${serial}/thresholds`).catch(() => null),
        apiFetch(`${API_BASE_URL}/river/devices/${serial}/calc-config`).catch(() => null)
      ]);

      if (devRes && devRes.ok) {
        const devData = await devRes.json();
        setDevice(devData);
        setMetaForm({
          organization_name: devData.organization_name || '',
          description: devData.description || '',
          cctv_path_0: devData.cctv_path_0 || '',
          cctv_path_1: devData.cctv_path_1 || '',
          cctv_path_2: devData.cctv_path_2 || '',
        });
      }
      if (threshRes && threshRes.ok) {
        const threshData = await threshRes.json();
        setThresholds(threshData || []);

        if (Array.isArray(threshData)) {
          const updated = {
            WARNING: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
            CRITICAL: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
            EMERGENCY: { id: null, threshold_cm: '', threshold_pct: '', freq_duration_sec: '', is_active: false },
          } as any;
          threshData.forEach((t: any) => {
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
      if (configRes && configRes.ok) {
        const configData = await configRes.json();
        setDeviceConfig(configData);
        if (configData) {
          setConfigForm({
            bottom_to_bank_cm: configData.bottom_to_bank_cm !== null && configData.bottom_to_bank_cm !== undefined ? configData.bottom_to_bank_cm.toString() : '',
            bank_to_sensor_cm: configData.bank_to_sensor_cm !== null && configData.bank_to_sensor_cm !== undefined ? configData.bank_to_sensor_cm.toString() : '',
            default_duration_sec: configData.default_duration_sec !== null && configData.default_duration_sec !== undefined ? configData.default_duration_sec.toString() : '',
            offline_threshold_min: configData.extra_config?.offline_threshold_min !== undefined && configData.extra_config?.offline_threshold_min !== null ? configData.extra_config.offline_threshold_min.toString() : '',
          });
        }
      } else {
        setDeviceConfig(null);
        setConfigForm({
          bottom_to_bank_cm: '',
          bank_to_sensor_cm: '',
          default_duration_sec: '',
          offline_threshold_min: '',
        });
      }
    } catch (err) {
      console.error('Error fetching device meta/thresholds/config:', err);
    }
  }, [serial, apiFetch]);

  const handleSaveThresholds = async () => {
    setSavingThresholds(true);
    try {
      for (const level of ['WARNING', 'CRITICAL', 'EMERGENCY']) {
        const th = thresholdsForm[level];
        if (th.is_active || th.id !== null) {
          const pctVal = th.threshold_pct !== '' && th.threshold_pct !== null && th.threshold_pct !== undefined ? parseFloat(th.threshold_pct) : null;
          const calculatedCm = (pctVal !== null && deviceConfig?.bottom_to_bank_cm)
            ? parseFloat(((pctVal / 100) * deviceConfig.bottom_to_bank_cm).toFixed(1))
            : null;

          const body = {
            alert_level: level,
            threshold_cm: calculatedCm,
            threshold_pct: pctVal,
            freq_duration_sec: th.freq_duration_sec !== '' && th.freq_duration_sec !== null && th.freq_duration_sec !== undefined ? parseInt(th.freq_duration_sec) : null,
            is_active: th.is_active,
          };
          
          if (th.id !== null) {
            await apiFetch(`${API_BASE_URL}/river/thresholds/${th.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
          } else {
            await apiFetch(`${API_BASE_URL}/river/devices/${serial}/thresholds`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
          }
        }
      }
      alert('บันทึกเกณฑ์การแจ้งเตือนสำเร็จเรียบร้อย');
      fetchDeviceMetadata();
    } catch (err) {
      console.error("Failed to save alert thresholds:", err);
      alert('เกิดข้อผิดพลาดในการบันทึกเกณฑ์การแจ้งเตือน');
    } finally {
      setSavingThresholds(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const body = {
        bottom_to_bank_cm: configForm.bottom_to_bank_cm ? parseFloat(configForm.bottom_to_bank_cm) : 0,
        bank_to_sensor_cm: configForm.bank_to_sensor_cm ? parseFloat(configForm.bank_to_sensor_cm) : 0,
        default_duration_sec: configForm.default_duration_sec ? parseInt(configForm.default_duration_sec) : 0,
        extra_config: {
          ...deviceConfig?.extra_config,
          offline_threshold_min: configForm.offline_threshold_min ? parseFloat(configForm.offline_threshold_min) : null
        }
      };

      const res = await apiFetch(`${API_BASE_URL}/river/devices/${serial}/calc-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        alert('บันทึกการตั้งค่าคำนวณสำเร็จเรียบร้อย');
        setEditingConfig(false);
        fetchDeviceMetadata();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`เกิดข้อผิดพลาด: ${errData.error || 'ไม่สามารถบันทึกข้อมูลได้'}`);
      }
    } catch (err) {
      console.error('Failed to save calculation config:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSaveMeta = async () => {
    setSavingMeta(true);
    try {
      const body = {
        ...device,
        organization_name: metaForm.organization_name,
        description: metaForm.description,
        cctv_path_0: metaForm.cctv_path_0,
        cctv_path_1: metaForm.cctv_path_1,
        cctv_path_2: metaForm.cctv_path_2,
      };

      const res = await apiFetch(`${API_BASE_URL}/river/devices/${serial}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        alert('บันทึกข้อมูลอุปกรณ์สำเร็จเรียบร้อย');
        setEditingMeta(false);
        fetchDeviceMetadata();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`เกิดข้อผิดพลาด: ${errData.error || 'ไม่สามารถบันทึกข้อมูลได้'}`);
      }
    } catch (err) {
      console.error('Failed to save device metadata:', err);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูล');
    } finally {
      setSavingMeta(false);
    }
  };

  const fetchStatsData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      let startStr = '';
      let endStr = '';
      const dateObj = new Date(selectedDate);
      if (resolution === 'daily') {
        const start = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate() - 30, 0, 0, 0, 0);
        const end = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59, 999);
        startStr = start.toISOString();
        endStr = end.toISOString();
      } else {
        const start = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 0, 0, 0, 0);
        const end = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), 23, 59, 59, 999);
        startStr = start.toISOString();
        endStr = end.toISOString();
      }

      const res = await apiFetch(`${API_BASE_URL}/river/devices/${serial}/stats?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`);
      if (res.ok) {
        const data = await res.json();
        setAllStats(data || []);
      }
    } catch (err) {
      console.error('Error fetching stats data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [serial, selectedDate, resolution, apiFetch]);

  const fetchLogStatsData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingLogs(true);
    try {
      const dateObj = new Date(selectedLogDate);
      const start = new Date(dateObj);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateObj);
      end.setHours(23, 59, 59, 999);

      const res = await apiFetch(`${API_BASE_URL}/river/devices/${serial}/stats?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`);
      if (res.ok) {
        const data = await res.json();
        setLogStats(data || []);
      }
    } catch (err) {
      console.error('Error fetching log stats data:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [serial, selectedLogDate, apiFetch]);

  useEffect(() => { fetchLogStatsData(); }, [selectedLogDate, fetchLogStatsData]);
  useEffect(() => { fetchStatsData(); }, [selectedDate, resolution, fetchStatsData]);
  useEffect(() => { fetchDeviceMetadata(); }, [fetchDeviceMetadata]);

  // Consolidate live sync interval to single 15s timer when dates match today
  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const isChartToday = selectedDate === todayStr;
    const isLogToday = selectedLogDate === todayStr;

    if (!isChartToday && !isLogToday) return;

    const interval = setInterval(() => {
      setRefreshing(true);
      if (isChartToday) {
        fetchStatsData(true);
        fetchDeviceMetadata();
      }
      if (isLogToday && selectedLogDate !== selectedDate) {
        fetchLogStatsData(true);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [selectedDate, selectedLogDate, fetchStatsData, fetchDeviceMetadata, fetchLogStatsData]);

  useEffect(() => { setVisibleLogsCount(50); }, [selectedDate, resolution, selectedHour, selected6Hour]);

  useEffect(() => {
    const key = `${selectedDate}_${resolution}`;
    if (allStats.length > 0 && lastLoadedKey !== key) {
      const latestPoint = allStats.reduce((latest: any, p: any) => new Date(p.time).getTime() > new Date(latest.time).getTime() ? p : latest, allStats[0]);
      const hour = new Date(latestPoint.time).getHours();
      setSelectedHour(String(hour));
      setSelected6Hour(String(Math.floor(hour / 6)));
      setLastLoadedKey(key);
    } else if (allStats.length === 0 && !lastLoadedKey) {
      setSelectedHour(String(new Date().getHours()));
      setSelected6Hour(String(Math.floor(new Date().getHours() / 6)));
    }
  }, [allStats, selectedDate, resolution, lastLoadedKey]);

  const filteredStats = React.useMemo(() => {
    return allStats;
  }, [allStats]);

  const chartData = React.useMemo(() => {
    const sorted = [...filteredStats].sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
    return sorted.map((point: any) => ({
      label: resolution === 'daily'
        ? new Date(point.time).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' })
        : new Date(point.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' น.',
      fullLabel: resolution === 'daily'
        ? new Date(point.time).toLocaleDateString('th-TH', { day: '2-digit', month: 'short' }) + ' ' + new Date(point.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' น.'
        : new Date(point.time).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' น.',
      value: point.net_water_level_cm !== null && point.net_water_level_cm !== undefined ? parseFloat(point.net_water_level_cm.toFixed(1)) : null,
    }));
  }, [filteredStats, resolution]);

  const tableData = React.useMemo(() => {
    if (logStats.length === 0) return [];
    return logStats
      .filter((point: any) => {
        const d = new Date(point.time);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` === selectedLogDate;
      })
      .sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [logStats, selectedLogDate]);

  const latestStatWithPhoto = React.useMemo(() => {
    const sortedAll = [...allStats].sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime());
    const foundAll = sortedAll.find((s: any) => s.snapshot_url0 || s.snapshot_url1 || s.snapshot_url2);
    if (foundAll) return foundAll;
    const sortedLog = [...logStats].sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return sortedLog.find((s: any) => s.snapshot_url0 || s.snapshot_url1 || s.snapshot_url2) || null;
  }, [allStats, logStats]);

  const metrics = React.useMemo(() => {
    if (loading || allStats.length === 0) return { min: null, max: null, avg: null };
    const values = allStats.map((s: any) => s.net_water_level_cm).filter((v: any) => v !== null && v !== undefined);
    if (values.length === 0) return { min: null, max: null, avg: null };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const avg = values.reduce((sum: number, v: number) => sum + v, 0) / values.length;
    return { min: parseFloat(min.toFixed(1)), max: parseFloat(max.toFixed(1)), avg: parseFloat(avg.toFixed(1)) };
  }, [allStats, loading]);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'EMERGENCY': return 'bg-rose-500 text-white border-rose-600';
      case 'CRITICAL': return 'bg-amber-500 text-white border-amber-600';
      case 'WARNING': return 'bg-indigo-550 text-white border-indigo-650';
      case 'OFFLINE': return 'bg-slate-400 text-white border-slate-500';
      default: return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    }
  };

  const isDeviceOffline = (d: any) => {
    if (!d || !d.last_seen) return true;
    return (new Date().getTime() - new Date(d.last_seen).getTime()) > (d.offline_threshold_min || 360) * 60 * 1000;
  };

  const isOffline = isDeviceOffline(device);

  const warningThreshObj = thresholds.find((t: any) => t.alert_level === 'WARNING' && t.is_active);
  const criticalThreshObj = thresholds.find((t: any) => t.alert_level === 'CRITICAL' && t.is_active);
  const emergencyThreshObj = thresholds.find((t: any) => t.alert_level === 'EMERGENCY' && t.is_active);

  const getThreshCm = (obj: any) => {
    if (!obj) return undefined;
    if (obj.threshold_cm !== null && obj.threshold_cm !== undefined && obj.threshold_cm !== '') {
      const val = parseFloat(obj.threshold_cm);
      if (!isNaN(val)) return val;
    }
    if (obj.threshold_pct !== null && obj.threshold_pct !== undefined && obj.threshold_pct !== '' && deviceConfig?.bottom_to_bank_cm) {
      return (parseFloat(obj.threshold_pct) / 100) * deviceConfig.bottom_to_bank_cm;
    }
    return undefined;
  };

  const getThreshPct = (obj: any) => {
    if (!obj) return undefined;
    if (obj.threshold_pct !== null && obj.threshold_pct !== undefined && obj.threshold_pct !== '') {
      const val = parseFloat(obj.threshold_pct);
      if (!isNaN(val)) return val;
    }
    if (obj.threshold_cm !== null && obj.threshold_cm !== undefined && obj.threshold_cm !== '' && deviceConfig?.bottom_to_bank_cm && deviceConfig.bottom_to_bank_cm > 0) {
      return (parseFloat(obj.threshold_cm) / deviceConfig.bottom_to_bank_cm) * 100;
    }
    return undefined;
  };

  const warningThresh = getThreshCm(warningThreshObj);
  const criticalThresh = getThreshCm(criticalThreshObj);
  const emergencyThresh = getThreshCm(emergencyThreshObj);
  const warningThreshPct = getThreshPct(warningThreshObj);
  const criticalThreshPct = getThreshPct(criticalThreshObj);
  const emergencyThreshPct = getThreshPct(emergencyThreshObj);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Navigation & Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center space-x-4">
          <Link href="/dashboard/river" className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition shadow-sm text-slate-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-900">{device?.name || 'Loading Station...'}</h1>
              {device && (
                <>
                  {isOffline ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-655 border-slate-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> OFFLINE
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-550" /> ONLINE
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(device.warning_status)}`}>
                    <span className={`w-1.5 h-1.5 rounded-full bg-white ${device.warning_status !== 'NORMAL' ? 'animate-pulse' : ''}`} />
                    {device.warning_status || 'NORMAL'}
                  </span>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
              <p className="text-xs text-slate-400 font-mono">Serial: {serial}</p>
              {device?.last_seen && (
                <span className="text-xs text-slate-400 font-medium">เวลาอัปเดตล่าสุด: {new Date(device.last_seen).toLocaleString('th-TH')}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3 self-end sm:self-auto">
          {refreshing && (
            <span className="text-[10px] text-indigo-600 font-bold flex items-center gap-1.5 animate-pulse bg-indigo-50 px-2.5 py-1 rounded-lg">
              <RefreshCw className="w-3 h-3 animate-spin" /> Live Syncing...
            </span>
          )}
          <span className="text-[11px] text-slate-500 font-mono bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
            พิกัด: {device?.install_latitude ? parseFloat(device.install_latitude).toFixed(4) : 'N/A'}, {device?.install_longitude ? parseFloat(device.install_longitude).toFixed(4) : 'N/A'}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ระดับน้ำปัจจุบัน</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-3xl font-extrabold text-indigo-650">{device?.net_water_level_cm?.toFixed(1) ?? 'N/A'}</span>
            <span className="text-xs text-slate-400 font-bold">cm</span>
          </div>
          {device?.water_level_pct !== undefined && (
            <span className="text-[10px] font-bold text-slate-500 block mt-1">คิดเป็น {device.water_level_pct.toFixed(1)}% ของความจุตลิ่ง</span>
          )}
          {device?.level_cm !== undefined && device?.level_cm !== null && (
            <span className="text-[10px] text-slate-400 block mt-1">ค่าดิบเซ็นเซอร์: {device.level_cm.toFixed(2)} cm</span>
          )}
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ระดับสูงสุด (ช่วงที่เลือก)</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-3xl font-extrabold text-rose-600">{metrics.max ?? '--'}</span><span className="text-xs text-slate-400 font-bold">cm</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-1 flex items-center gap-1"><TrendingUp className="w-3 h-3 text-rose-500" /> ระดับน้ำคำนวณ (Net)</span>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ระดับต่ำสุด (ช่วงที่เลือก)</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-3xl font-extrabold text-emerald-600">{metrics.min ?? '--'}</span><span className="text-xs text-slate-400 font-bold">cm</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-1 flex items-center gap-1"><TrendingDown className="w-3 h-3 text-emerald-500" /> ระดับน้ำคำนวณ (Net)</span>
        </div>
        <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ค่าเฉลี่ย (ช่วงที่เลือก)</span>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-3xl font-extrabold text-slate-700">{metrics.avg ?? '--'}</span><span className="text-xs text-slate-400 font-bold">cm</span>
          </div>
          <span className="text-[10px] text-slate-400 block mt-1 flex items-center gap-1"><Activity className="w-3 h-3 text-indigo-500 animate-pulse" /> ระดับน้ำคำนวณ (Net)</span>
        </div>
      </div>

      {/* Row 1: CCTV & Alert Thresholds (Side-by-side: CCTV 2 parts, Thresholds 1 part) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live CCTV Card (2 parts) */}
        <div className="lg:col-span-2">
          <DashboardCard 
            title="กล้องวงจรปิดเรียลไทม์ (Live)" 
            icon={<Camera className="w-5 h-5 text-indigo-650" />}
            badge={
              <button 
                onClick={() => setRotateVideo(!rotateVideo)}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded-xl text-xs font-bold transition border ${
                  rotateVideo 
                    ? 'bg-amber-500 border-amber-500 text-white shadow-sm' 
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>กลับหัวภาพ 180°</span>
              </button>
            }
          >
            <div className={`w-full h-full overflow-hidden rounded-2xl transition-transform duration-300 ${rotateVideo ? 'rotate-180' : ''}`}>
              <RtspPlayer serial={serial} apiFetch={apiFetch} apiBaseUrl={API_BASE_URL} className="w-full h-full" />
            </div>
            
            {/* PTZ D-Pad Control Panel */}
            <div className="flex flex-wrap items-center justify-center sm:justify-around gap-6 p-5 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl mt-4 font-sans">
              <div className="flex flex-col space-y-1 items-center sm:items-start min-w-[150px] shrink-0">
                <span className="text-xs font-bold text-slate-500">ความเร็ว PTZ (PTZ Speed)</span>
                <div className="flex items-center space-x-3">
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={ptzSpeed}
                    onChange={(e) => setPtzSpeed(parseFloat(e.target.value))}
                    className="w-32 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-650"
                  />
                  <span className="text-xs font-mono font-bold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-lg">{(ptzSpeed * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div className="relative w-36 h-36 bg-slate-200/80 rounded-full flex items-center justify-center shadow-inner border border-slate-350/60 shrink-0">
                <button
                  onMouseDown={() => handlePTZStart('MOVE_UP')}
                  onMouseUp={handlePTZStop}
                  onMouseLeave={handlePTZStop}
                  onTouchStart={() => handlePTZStart('MOVE_UP')}
                  onTouchEnd={handlePTZStop}
                  className="absolute top-1.5 w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm text-slate-600 active:bg-indigo-50 active:text-indigo-650 transition cursor-pointer"
                  title="Move Up"
                >
                  <ChevronUp className="w-5 h-5" />
                </button>
                <button
                  onMouseDown={() => handlePTZStart('MOVE_DOWN')}
                  onMouseUp={handlePTZStop}
                  onMouseLeave={handlePTZStop}
                  onTouchStart={() => handlePTZStart('MOVE_DOWN')}
                  onTouchEnd={handlePTZStop}
                  className="absolute bottom-1.5 w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm text-slate-600 active:bg-indigo-50 active:text-indigo-650 transition cursor-pointer"
                  title="Move Down"
                >
                  <ChevronDown className="w-5 h-5" />
                </button>
                <button
                  onMouseDown={() => handlePTZStart('MOVE_LEFT')}
                  onMouseUp={handlePTZStop}
                  onMouseLeave={handlePTZStop}
                  onTouchStart={() => handlePTZStart('MOVE_LEFT')}
                  onTouchEnd={handlePTZStop}
                  className="absolute left-1.5 w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm text-slate-600 active:bg-indigo-50 active:text-indigo-650 transition cursor-pointer"
                  title="Move Left"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onMouseDown={() => handlePTZStart('MOVE_RIGHT')}
                  onMouseUp={handlePTZStop}
                  onMouseLeave={handlePTZStop}
                  onTouchStart={() => handlePTZStart('MOVE_RIGHT')}
                  onTouchEnd={handlePTZStop}
                  className="absolute right-1.5 w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 shadow-sm text-slate-600 active:bg-indigo-50 active:text-indigo-650 transition cursor-pointer"
                  title="Move Right"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button
                  onClick={handlePTZStop}
                  className="w-11 h-11 flex items-center justify-center rounded-full bg-indigo-600 shadow-md text-white hover:bg-indigo-700 transition cursor-pointer text-[10px] font-black uppercase tracking-wider"
                  title="Stop Movement"
                >
                  Stop
                </button>
              </div>

              <div className="flex items-center space-x-2 justify-center shrink-0">
                <button
                  onMouseDown={() => handlePTZStart('ZOOM_IN')}
                  onMouseUp={handlePTZStop}
                  onMouseLeave={handlePTZStop}
                  onTouchStart={() => handlePTZStart('ZOOM_IN')}
                  onTouchEnd={handlePTZStop}
                  className="flex items-center space-x-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  <ZoomIn className="w-4 h-4 text-indigo-600" />
                  <span>Zoom In</span>
                </button>
                <button
                  onMouseDown={() => handlePTZStart('ZOOM_OUT')}
                  onMouseUp={handlePTZStop}
                  onMouseLeave={handlePTZStop}
                  onTouchStart={() => handlePTZStart('ZOOM_OUT')}
                  onTouchEnd={handlePTZStop}
                  className="flex items-center space-x-1.5 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  <ZoomOut className="w-4 h-4 text-indigo-600" />
                  <span>Zoom Out</span>
                </button>
              </div>
            </div>
          </DashboardCard>
        </div>

        {/* Alert Thresholds Card (1 part) */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          <DashboardCard title="การตั้งค่าระดับแจ้งเตือนภัยและความถี่ส่งข้อมูล" icon={<AlertCircle className="w-5 h-5 text-indigo-650" />}>
            <div className="space-y-4">
              <div className="flex flex-col gap-3">
                {['WARNING','CRITICAL','EMERGENCY'].map(level=>{
                  const cfg=thresholdsForm[level]||{id:null,threshold_cm:'',threshold_pct:'',freq_duration_sec:'',is_active:false};
                  const colorClass=level==='EMERGENCY' 
                    ? 'bg-rose-50/30 border-rose-200 text-rose-700' 
                    : level==='CRITICAL' 
                    ? 'bg-amber-50/30 border-amber-200 text-amber-700' 
                    : 'bg-indigo-50/30 border-indigo-200 text-indigo-700';
                  
                  const activeLabelClass = level==='EMERGENCY' ? 'text-rose-700' : level==='CRITICAL' ? 'text-amber-700' : 'text-indigo-700';
                  const labelText=level==='WARNING' ? 'ระดับเฝ้าระวัง (Warning)' : level==='CRITICAL' ? 'ระดับวิกฤต (Critical)' : 'ระดับฉุกเฉิน (Emergency)';
                  
                  return (
                    <div key={level} className={`p-4 rounded-2xl border transition-all ${cfg.is_active ? colorClass : 'bg-slate-50/50 border-slate-200/80 opacity-70'}`}>
                      <div className="flex items-center justify-between mb-3">
                        <span className={`text-xs font-black tracking-wide ${cfg.is_active ? activeLabelClass : 'text-slate-500'}`}>{labelText}</span>
                        <label className="relative inline-flex items-center cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            checked={cfg.is_active} 
                            onChange={e=>setThresholdsForm(p=>({...p,[level]:{...p[level],is_active:e.target.checked}}))}
                            className="sr-only peer" 
                          />
                          <div className={`relative w-9 h-5 bg-slate-200 rounded-full peer peer-focus:outline-none transition-colors duration-200
                            after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all after:shadow-sm
                            peer-checked:after:translate-x-4
                            ${level === 'EMERGENCY' ? 'peer-checked:bg-rose-500' : level === 'CRITICAL' ? 'peer-checked:bg-amber-500' : 'peer-checked:bg-indigo-600'}
                          `}></div>
                        </label>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 block mb-1">ความจุตลิ่ง (%)</span>
                          <input 
                            type="number" 
                            step="0.1" 
                            placeholder="เช่น 85" 
                            value={cfg.threshold_pct} 
                            disabled={!cfg.is_active}
                            onChange={e=>setThresholdsForm(p=>({...p,[level]:{...p[level],threshold_pct:e.target.value}}))}
                            className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-100/50 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                          />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 block mb-1">ความถี่ส่งข้อมูล (วินาที)</span>
                          <input 
                            type="number" 
                            placeholder="เช่น 300" 
                            value={cfg.freq_duration_sec} 
                            disabled={!cfg.is_active}
                            onChange={e=>setThresholdsForm(p=>({...p,[level]:{...p[level],freq_duration_sec:e.target.value}}))}
                            className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:border-indigo-500 disabled:opacity-50 disabled:bg-slate-100/50 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end pt-2">
                <button onClick={handleSaveThresholds} disabled={savingThresholds}
                  className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-md transition disabled:opacity-50">
                  {savingThresholds ? <><RefreshCw className="w-3 h-3 animate-spin" /><span>กำลังบันทึก...</span></> : <span>บันทึกเกณฑ์แจ้งเตือน</span>}
                </button>
              </div>
            </div>
          </DashboardCard>

          {/* Normal State Data Interval Card (durationSEC) */}
          <DashboardCard title="ตั้งค่าความถี่ปกติ / durationSEC" icon={<RefreshCw className="w-5 h-5 text-indigo-650" />}>
            <div className="space-y-4">
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black tracking-wide text-slate-700">ความถี่ส่งข้อมูลสภาวะปกติ (วินาที)</span>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    placeholder="เช่น 300" 
                    value={configForm.default_duration_sec} 
                    onChange={e=>setConfigForm(p=>({...p,default_duration_sec:e.target.value}))}
                    className="w-full bg-white border border-slate-200 rounded-xl py-1.5 px-3 text-xs focus:outline-none focus:border-indigo-500 font-mono" 
                  />
                  <button onClick={handleSaveConfig} disabled={savingConfig}
                    className="shrink-0 flex items-center justify-center bg-indigo-650 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-md transition disabled:opacity-50">
                    {savingConfig ? 'กำลังบันทึก...' : 'บันทึก'}
                  </button>
                </div>
              </div>
            </div>
          </DashboardCard>
        </div>
      </div>

      {/* Row 2: Graph (Full width) */}
      <div>
        <DashboardCard title="กราฟวิเคราะห์ระดับน้ำย้อนหลัง" icon={<Activity className="w-5 h-5 text-indigo-600" />}
          badge={
            <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl">
              {(['hourly','6hourly','daily'] as const).map(r => (
                <button key={r} onClick={() => setResolution(r)}
                  className={`py-1.5 px-3 text-xs font-bold rounded-lg transition ${resolution===r?'bg-white text-indigo-700 shadow-sm':'text-slate-500'}`}>
                  {r==='hourly'?'รายชั่วโมง':r==='6hourly'?'ราย 6 ชั่วโมง':'รายวัน (30 วัน)'}
                </button>
              ))}
            </div>
          }>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center space-x-3 bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold text-slate-500">เลือกวันที่:</span>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                  className="text-xs font-bold text-slate-800 bg-transparent border-none focus:outline-none cursor-pointer" />
              </div>
            </div>
            <div className="flex items-center flex-wrap gap-2 text-[10px] font-bold">
              <span className="text-slate-400 mr-1">เกณฑ์แจ้งเตือน:</span>
              {warningThresh!==undefined && warningThreshPct!==undefined && (
                <span className="bg-indigo-50 border border-indigo-150 text-indigo-650 px-2 py-0.5 rounded">
                  Warning: &ge; {Number(warningThreshPct.toFixed(1))}% ({Number(warningThresh.toFixed(1))} cm)
                </span>
              )}
              {criticalThresh!==undefined && criticalThreshPct!==undefined && (
                <span className="bg-amber-50 border border-amber-250 text-amber-700 px-2 py-0.5 rounded">
                  Critical: &ge; {Number(criticalThreshPct.toFixed(1))}% ({Number(criticalThresh.toFixed(1))} cm)
                </span>
              )}
              {emergencyThresh!==undefined && emergencyThreshPct!==undefined && (
                <span className="bg-rose-50 border border-rose-250 text-rose-700 px-2 py-0.5 rounded">
                  Emergency: &ge; {Number(emergencyThreshPct.toFixed(1))}% ({Number(emergencyThresh.toFixed(1))} cm)
                </span>
              )}
              {thresholds.length===0 && <span className="text-slate-400 italic">ไม่ได้กำหนดเกณฑ์สำหรับอุปกรณ์นี้</span>}
            </div>
          </div>
          <div className="h-[400px] w-full mt-4" style={{ minHeight: '400px' }}>
            {loading ? (
              <div className="w-full h-full flex flex-col justify-center items-center text-slate-400">
                <div className="w-8 h-8 border-2 border-indigo-550/20 border-t-indigo-600 rounded-full animate-spin mb-3"></div>
                <span>กำลังดึงข้อมูลและพล็อตจุดวัดระดับน้ำ...</span>
              </div>
            ) : chartData.length === 0 ? (
              <div className="w-full h-full flex flex-col justify-center items-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                <Droplet className="w-8 h-8 text-slate-300 mb-2" />
                <span className="text-sm font-semibold">ไม่พบข้อมูลสถิติระดับน้ำในช่วงวันที่เลือก</span>
              </div>
            ) : (
              <WaterChart
                data={chartData}
                height={400}
                warningThresh={warningThresh}
                criticalThresh={criticalThresh}
                emergencyThresh={emergencyThresh}
              />
            )}
          </div>
        </DashboardCard>
      </div>

      {/* Log Table */}
      <DashboardCard title="ตารางประวัติการตรวจวัดระดับน้ำ" icon={<Database className="w-5 h-5 text-indigo-650" />}
        badge={
          <div className="flex items-center space-x-3 bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-500">เลือกวันที่:</span>
            <input type="date" value={selectedLogDate} onChange={e=>setSelectedLogDate(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-transparent border-none focus:outline-none cursor-pointer" />
          </div>
        }>
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <th className="py-3.5 px-4"><Clock className="w-3.5 h-3.5 inline mr-1" />เวลาบันทึก</th>
                <th className="py-3.5 px-4">ระดับน้ำที่คำนวณได้ (Net Level)</th>
                <th className="py-3.5 px-4">เปอร์เซ็นต์ความจุตลิ่ง</th>
                <th className="py-3.5 px-4">สถานะแจ้งเตือน</th>
                <th className="py-3.5 px-4 text-center">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loadingLogs ? (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">กำลังดึงรายการตรวจวัดระดับน้ำ...</td></tr>
              ) : tableData.length === 0 ? (
                <tr><td colSpan={5} className="py-6 text-center text-slate-400">ไม่พบรายการตรวจวัดในช่วงที่เลือก</td></tr>
              ) : (
                tableData.slice(0,visibleLogsCount).map((row:any,idx:number)=>{
                  let alertLevel='NORMAL';
                  const lv=row.net_water_level_cm||0, pv=row.water_level_pct||0;
                  if((typeof emergencyThresh==='number'&&lv>=emergencyThresh)||(typeof emergencyThreshPct==='number'&&pv>=emergencyThreshPct)) alertLevel='EMERGENCY';
                  else if((typeof criticalThresh==='number'&&lv>=criticalThresh)||(typeof criticalThreshPct==='number'&&pv>=criticalThreshPct)) alertLevel='CRITICAL';
                  else if((typeof warningThresh==='number'&&lv>=warningThresh)||(typeof warningThreshPct==='number'&&pv>=warningThreshPct)) alertLevel='WARNING';
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-600">
                        {new Date(row.time).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'})} น.
                        <span className="text-[10px] text-slate-400 block font-normal">{new Date(row.time).toLocaleDateString('th-TH',{day:'2-digit',month:'short'})}</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-indigo-650">
                        {row.net_water_level_cm?.toFixed(1)} cm
                        {row.level_cm !== undefined && row.level_cm !== null && (
                          <span className="text-[10px] text-slate-400 block font-normal">
                            Raw: {row.level_cm.toFixed(2)} cm
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">{row.water_level_pct?.toFixed(1)}%</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${getStatusBadgeClass(alertLevel)}`}>
                          <span className={`w-1 h-1 rounded-full bg-white ${alertLevel!=='NORMAL'?'animate-pulse':''}`} /> {alertLevel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button onClick={()=>{setSelectedLogForModal(row);setModalActiveCam(0)}}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-indigo-650 hover:text-indigo-700 transition shadow-sm inline-flex items-center gap-1 text-[11px] font-bold">
                          <Eye className="w-3.5 h-3.5" /> <span>ดูรายละเอียด</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {tableData.length>visibleLogsCount && (
          <div className="flex justify-center mt-4 pt-4 border-t border-slate-100">
            <button onClick={()=>setVisibleLogsCount(p=>p+50)}
              className="text-xs bg-slate-50 hover:bg-slate-100 text-indigo-700 border border-slate-200 px-4 py-2 rounded-xl font-bold transition shadow-sm">
              แสดงข้อมูลเพิ่มเติม (+50 รายการ / มีทั้งหมด {tableData.length} รายการ)
            </button>
          </div>
        )}
      </DashboardCard>

      {/* Modal */}
      {selectedLogForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h3 className="text-base font-black text-slate-950">รายละเอียดประวัติและภาพถ่าย</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">ID: {selectedLogForModal.serial} | {new Date(selectedLogForModal.time).toLocaleString('th-TH')}</p>
              </div>
              <button onClick={()=>setSelectedLogForModal(null)} className="p-2 rounded-xl text-slate-400 hover:text-slate-655 transition"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ระดับน้ำคำนวณ</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-extrabold text-indigo-650 font-mono">{selectedLogForModal.net_water_level_cm?.toFixed(1)||'N/A'}</span>
                    <span className="text-[10px] text-slate-400 font-bold">cm</span>
                  </div>
                  {selectedLogForModal.level_cm !== undefined && selectedLogForModal.level_cm !== null && (
                    <span className="text-[10px] text-slate-400 block mt-0.5">Raw: {selectedLogForModal.level_cm.toFixed(2)} cm</span>
                  )}
                </div>
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">ความจุตลิ่ง</span>
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-xl font-extrabold text-slate-800 font-mono">{selectedLogForModal.water_level_pct?.toFixed(1)||'N/A'}</span>
                    <span className="text-[10px] text-slate-400 font-bold">%</span>
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">สถานะเตือนภัย</span>
                  <div className="mt-1">
                    {(()=>{
                      let al='NORMAL';const lv=selectedLogForModal.net_water_level_cm||0,pv=selectedLogForModal.water_level_pct||0;
                      if((typeof emergencyThresh==='number'&&lv>=emergencyThresh)||(typeof emergencyThreshPct==='number'&&pv>=emergencyThreshPct)) al='EMERGENCY';
                      else if((typeof criticalThresh==='number'&&lv>=criticalThresh)||(typeof criticalThreshPct==='number'&&pv>=criticalThreshPct)) al='CRITICAL';
                      else if((typeof warningThresh==='number'&&lv>=warningThresh)||(typeof warningThreshPct==='number'&&pv>=warningThreshPct)) al='WARNING';
                      return <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[10px] font-bold border ${getStatusBadgeClass(al)}`}>
                        <span className={`w-1 h-1 rounded-full bg-white ${al!=='NORMAL'?'animate-pulse':''}`} /> {al}
                      </span>;
                    })()}
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">ภาพถ่ายจากกล้องวงจรปิด</span>
                {selectedLogForModal.snapshot_url0||selectedLogForModal.snapshot_url1||selectedLogForModal.snapshot_url2 ? (
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-200">
                    <img src={getProxiedImageUrl(selectedLogForModal.snapshot_url0||selectedLogForModal.snapshot_url1||selectedLogForModal.snapshot_url2)}
                      alt="Telemetry CCTV view" className="w-full h-full object-cover"
                      onError={e=>{(e.currentTarget as HTMLImageElement).src='https://images.unsplash.com/photo-1542831371-29b0f74f9713?w=800&auto=format&fit=crop&q=60'}} />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                    <Camera className="w-8 h-8 text-slate-350 mb-2" />
                    <span className="text-xs font-semibold text-slate-400">ไม่มีรูปภาพประกอบสำหรับรายการนี้</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end items-center px-6 py-4 border-t border-slate-100 bg-slate-50/30">
              <button onClick={()=>setSelectedLogForModal(null)}
                className="py-2 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-700 text-xs font-bold transition shadow-sm">
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}