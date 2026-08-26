'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  ShieldAlert,
  AlertCircle,
  Calendar,
  Search,
  Download,
  RefreshCw,
  Clock,
  CheckCircle2,
  Radio,
  Activity,
  Cpu,
  Sliders,
  Check,
  ChevronDown,
} from 'lucide-react';
import { PageHeader, DashboardCard } from '@/components/UI';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function RiverStationHealthPage() {
  const { apiFetch } = useAuth();

  // Data states
  const [offlineDevices, setOfflineDevices] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Global Offline Threshold Configuration
  const [globalThreshold, setGlobalThreshold] = useState<number>(360);
  const [thresholdInput, setThresholdInput] = useState<string>('360');
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Filters (Default to 'all' - shows all offline terminals and historical logs)
  const getTodayStr = () => new Date().toISOString().split('T')[0];
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days' | 'custom'>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ONGOING' | 'RESOLVED'>('ALL');

  // Handle Preset Change
  const applyPreset = (preset: 'all' | 'today' | 'yesterday' | '7days' | '30days') => {
    setDatePreset(preset);
    const today = new Date();
    if (preset === 'all') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'today') {
      const d = today.toISOString().split('T')[0];
      setFromDate(d);
      setToDate(d);
    } else if (preset === 'yesterday') {
      const y = new Date(today);
      y.setDate(today.getDate() - 1);
      const d = y.toISOString().split('T')[0];
      setFromDate(d);
      setToDate(d);
    } else if (preset === '7days') {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      setFromDate(start.toISOString().split('T')[0]);
      setToDate(today.toISOString().split('T')[0]);
    } else if (preset === '30days') {
      const start = new Date(today);
      start.setDate(today.getDate() - 29);
      setFromDate(start.toISOString().split('T')[0]);
      setToDate(today.toISOString().split('T')[0]);
    }
    setCurrentPage(1);
  };

  // Fetch Global Threshold Setting
  const fetchGlobalSetting = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/settings/system_config`);
      if (res.ok) {
        const json = await res.json();
        if (json && json.value && json.value.offline_threshold_min) {
          const val = Number(json.value.offline_threshold_min);
          setGlobalThreshold(val);
          setThresholdInput(val.toString());
        }
      }
    } catch (err) {
      console.error('Fetch global setting error:', err);
    }
  }, [apiFetch]);

  // Save Global Threshold Setting
  const handleSaveThreshold = async () => {
    const val = parseInt(thresholdInput, 10);
    if (isNaN(val) || val <= 0) {
      alert('กรุณากรอกค่าเกณฑ์ระยะเวลาที่เป็นตัวเลขมากกว่า 0 นาที');
      return;
    }

    setSavingThreshold(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: 'system_config',
          value: { offline_threshold_min: val },
          description: 'Global offline threshold in minutes for river telemetry watchdog',
        }),
      });

      if (res.ok) {
        setGlobalThreshold(val);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        // Refresh all data with new threshold immediately
        fetchData();
      } else {
        alert('เกิดข้อผิดพลาดในการบันทึกค่าเกณฑ์');
      }
    } catch (err) {
      console.error('Save global threshold error:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    } finally {
      setSavingThreshold(false);
    }
  };

  // Fetch Live Status & Permanent Outage Logs
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch live overview devices & offlines
      const [offRes, devRes] = await Promise.all([
        apiFetch(`${API_BASE_URL}/river/health/offlines`),
        apiFetch(`${API_BASE_URL}/river/devices`),
      ]);

      if (offRes.ok) {
        const offData = await offRes.json();
        setOfflineDevices(offData || []);
      }
      if (devRes.ok) {
        const devData = await devRes.json();
        setDevices(devData || []);
      }

      // 2. Fetch outage lifecycle logs (shows all historical outages, both ongoing and resolved)
      const params = new URLSearchParams({
        page: currentPage.toString(),
        page_size: pageSize.toString(),
      });
      if (fromDate) {
        params.append('from_date', fromDate);
      }
      if (toDate) {
        params.append('to_date', toDate);
      }
      if (searchTerm.trim()) {
        params.append('serial', searchTerm.trim());
      }
      if (statusFilter !== 'ALL') {
        params.append('status', statusFilter);
      }

      const logRes = await apiFetch(`${API_BASE_URL}/river/uptime-logs?${params.toString()}`);
      if (logRes.ok) {
        const logData = await logRes.json();
        setLogs(logData.data || []);
        setTotalCount(logData.total || 0);
      }
    } catch (err) {
      console.error('Fetch health data error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, currentPage, fromDate, toDate, searchTerm, statusFilter]);

  useEffect(() => {
    fetchGlobalSetting();
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchGlobalSetting, fetchData]);

  // Export CSV Handler (Exports ALL matching records for the selected filters)
  const [exporting, setExporting] = useState(false);
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        page: '1',
        page_size: '10000', // Fetch all records for full export
        from_date: fromDate,
        to_date: toDate,
      });
      if (searchTerm.trim()) {
        params.append('serial', searchTerm.trim());
      }
      if (statusFilter !== 'ALL') {
        params.append('status', statusFilter);
      }

      const res = await apiFetch(`${API_BASE_URL}/river/uptime-logs?${params.toString()}`);
      if (!res.ok) {
        alert('ไม่สามารถดาวน์โหลดข้อมูลเพื่อ Export ได้');
        return;
      }
      const json = await res.json();
      const exportList = json.data || [];

      if (exportList.length === 0) {
        alert('ไม่พบข้อมูลประวัติในช่วงเวลาที่เลือกสำหรับ Export');
        return;
      }

      const headers = ['ลำดับ,Serial,ชื่อสถานี,หน่วยงาน,สถานะ,เวลาเริ่มดับ,เวลากลับมาออน,ระยะเวลาดับรวม,สาเหตุ/รายละเอียด'];
      const rows = exportList.map((l: any, idx: number) => {
        const offAt = new Date(l.offline_at).toLocaleString('th-TH');
        const onAt = l.online_at ? new Date(l.online_at).toLocaleString('th-TH') : 'ยังไม่กลับมา';
        const dur = l.duration_formatted || '-';
        const stName = (l.station_name || '').replace(/"/g, '""');
        const org = (l.organization_name || '').replace(/"/g, '""');
        const reason = (l.reason || '').replace(/"/g, '""');
        return `${idx + 1},"${l.serial}","${stName}","${org}","${l.status}","${offAt}","${onAt}","${dur}","${reason}"`;
      });

      // UTF-8 BOM (\uFEFF) ensures Thai language displays correctly in Microsoft Excel
      const csvString = '\uFEFF' + [headers, ...rows].join('\r\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `river_outage_logs_${fromDate}_to_${toDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export CSV error:', err);
      alert('เกิดข้อผิดพลาดในการสร้างไฟล์ CSV');
    } finally {
      setExporting(false);
    }
  };

  const healthyCount = Math.max(0, devices.length - offlineDevices.length);
  const qualityIndex = devices.length > 0 ? ((healthyCount / devices.length) * 100).toFixed(1) : '100';
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Title Header */}
      <PageHeader
        title="Station Health Watchdog"
        description="ระบบตรวจสอบความพร้อมและบันทึกประวัติการดับ-ออนของอุปกรณ์โทรมาตรอุทกวิทยา (River IoT)"
        icon={<ShieldAlert className="w-8 h-8 text-indigo-650" />}
      />

      {/* ── 1. Global Offline Threshold Setting Card ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gradient-to-r from-indigo-50/90 to-slate-50 border border-indigo-100 rounded-2xl shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-650 text-white rounded-xl shadow-sm">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-black text-slate-900 flex items-center gap-2">
              <span>เกณฑ์ระยะเวลาออฟไลน์กลาง (Global Offline Threshold)</span>
              <span className="bg-indigo-100 text-indigo-800 text-[10px] px-2 py-0.5 rounded-full font-mono">
                ปัจจุบัน: {globalThreshold} นาที
              </span>
            </h4>
            <p className="text-[11px] text-slate-500">
              กำหนดระยะเวลาที่สัญญาณเงียบก่อนที่ระบบจะตัดสินว่า OFFLINE และเริ่มนับ Log การดับของอุปกรณ์ทุกสถานี
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <div className="relative flex items-center">
            <input
              type="number"
              min="1"
              max="1440"
              value={thresholdInput}
              onChange={(e) => setThresholdInput(e.target.value)}
              className="w-24 text-xs font-mono font-bold px-3 py-2 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-center shadow-inner"
            />
            <span className="ml-2 text-xs font-bold text-slate-650">นาที</span>
          </div>

          <button
            onClick={handleSaveThreshold}
            disabled={savingThreshold}
            className="flex items-center space-x-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-650 hover:bg-indigo-700 disabled:opacity-50 rounded-xl transition shadow-sm"
          >
            {saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>บันทึกแล้ว!</span>
              </>
            ) : (
              <span>{savingThreshold ? 'กำลังบันทึก...' : 'บันทึกเกณฑ์'}</span>
            )}
          </button>
        </div>
      </div>

      {/* ── 2. Top KPI Summary Cards (ย้ายจากฝั่งขวามาเป็นการ์ดด้านบน) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Monitored Nodes</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Cpu className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-slate-900 mt-2">{devices.length}</p>
          <p className="text-[11px] text-slate-650 mt-1">จำนวนสถานีตรวจวัดทั้งหมด</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Healthy Terminals (ONLINE)</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-emerald-600 mt-2">{healthyCount}</p>
          <p className="text-[11px] text-emerald-700 mt-1">ส่งสัญญาณเชื่อมต่อปกติ</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Flagged Terminals (OFFLINE)</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-rose-600 mt-2">{offlineDevices.length}</p>
          <p className="text-[11px] text-rose-500 mt-1">ดับหรือขาดการติดต่อ ณ ตอนนี้</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Network Health Quality Index</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-black text-indigo-650 mt-2">{qualityIndex}%</p>
          <p className="text-[11px] text-slate-650 mt-1">ดัชนีคุณภาพความพร้อมระบบ</p>
        </div>
      </div>

      {/* ── 3. Filter Toolbar (ตัวกรองค้นหา วันที่ / รายเครื่อง / สถานะ) ── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          {/* Quick Date Presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-650 mr-2 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> ช่วงเวลา:
            </span>
            <button
              onClick={() => applyPreset('all')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                datePreset === 'all'
                  ? 'bg-indigo-650 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              ทั้งหมด (All Time)
            </button>
            <button
              onClick={() => applyPreset('today')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                datePreset === 'today'
                  ? 'bg-indigo-650 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              วันนี้ (Today)
            </button>
            <button
              onClick={() => applyPreset('yesterday')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                datePreset === 'yesterday'
                  ? 'bg-indigo-650 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              เมื่อวาน (Yesterday)
            </button>
            <button
              onClick={() => applyPreset('7days')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                datePreset === '7days'
                  ? 'bg-indigo-650 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              7 วันล่าสุด
            </button>
            <button
              onClick={() => applyPreset('30days')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                datePreset === '30days'
                  ? 'bg-indigo-650 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              30 วันล่าสุด
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchData}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-650 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>รีเฟรช</span>
            </button>

            <button
              onClick={handleExportCSV}
              disabled={exporting || logs.length === 0}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl hover:bg-emerald-100 disabled:opacity-50 transition shadow-sm cursor-pointer"
            >
              <Download className={`w-3.5 h-3.5 ${exporting ? 'animate-bounce' : ''}`} />
              <span>{exporting ? 'กำลัง Export...' : 'Export CSV'}</span>
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">จากวันที่ (From)</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setDatePreset('custom');
                setCurrentPage(1);
              }}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">ถึงวันที่ (To)</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setDatePreset('custom');
                setCurrentPage(1);
              }}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">ค้นหารายเครื่อง (Serial / Name)</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="พิมพ์ Serial หรือชื่อสถานี..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full text-xs pl-8 pr-3 py-2 border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">สถานะ (Status)</label>
            <div className="relative">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="w-full text-xs pl-3 pr-8 py-2 border border-slate-200 rounded-xl bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-slate-700 appearance-none cursor-pointer"
              >
                <option value="ALL">ทุกสถานะ (All)</option>
                <option value="ONGOING">🔴 กำลังดับอยู่ (Ongoing)</option>
                <option value="RESOLVED">🟢 กู้คืนแล้ว (Resolved)</option>
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Main Outage & Offline Lifecycle Log Table (แสดงประวัติตลอด แม้เครื่องจะกลับมาออน) ── */}
      <DashboardCard
        title="Unhealthy / Offline Watchdog Logs (ประวัติการดับ-ออนของอุปกรณ์)"
        icon={<AlertCircle className="w-4 h-4 text-rose-500" />}
      >
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Serial / สถานี</th>
                <th className="py-3 px-4">สถานะ (Status)</th>
                <th className="py-3 px-4">เวลาเริ่มดับ (Offline At)</th>
                <th className="py-3 px-4">เวลากลับมาออน (Online At)</th>
                <th className="py-3 px-4">ระยะเวลาที่ดับ (Downtime)</th>
                <th className="py-3 px-4">สาเหตุ / รายละเอียด (Issue Detail)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-500 mb-2" />
                    กำลังโหลดข้อมูลประวัติการดับ...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-emerald-600 font-bold">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                    All telemetry terminals are ONLINE & stable! (ไม่พบประวัติการดับในช่วงเวลานี้)
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60 transition">
                    {/* Serial & Station Name */}
                    <td className="py-3 px-4">
                      <span className="font-mono font-bold text-rose-600">{l.serial}</span>
                      {l.station_name && l.station_name !== l.serial && (
                        <div className="text-[11px] text-slate-500">{l.station_name}</div>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4">
                      {l.status === 'ONGOING' ? (
                        <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-100 font-black text-[10px] px-2.5 py-0.5 rounded">
                          <Radio className="w-2.5 h-2.5 animate-ping" />
                          OFFLINE
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-100 font-black text-[10px] px-2.5 py-0.5 rounded">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          RESOLVED
                        </span>
                      )}
                    </td>

                    {/* Offline At */}
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {new Date(l.offline_at).toLocaleString('th-TH')}
                    </td>

                    {/* Online At */}
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {l.online_at ? (
                        <span className="text-emerald-700 font-semibold">
                          {new Date(l.online_at).toLocaleString('th-TH')}
                        </span>
                      ) : (
                        <span className="text-rose-500 font-medium italic">ยังไม่กลับมา</span>
                      )}
                    </td>

                    {/* Downtime Duration */}
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 font-bold text-[11px] px-2 py-0.5 rounded-lg ${
                          l.status === 'ONGOING'
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        {l.duration_formatted || '-'}
                      </span>
                    </td>

                    {/* Issue Detail / Reason */}
                    <td className="py-3 px-4 text-xs text-slate-700">
                      {l.reason || 'Device has been silent beyond threshold'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>
              หน้า {currentPage} จาก {totalPages} (ทั้งหมด {totalCount} รายการ)
            </span>
            <div className="flex space-x-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >
                ก่อนหน้า
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40"
              >
                ถัดไป
              </button>
            </div>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
