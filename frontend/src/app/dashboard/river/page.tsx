'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  Waves,
  RefreshCw,
  Layers,
  Cpu,
  AlertCircle,
  Anchor,
  FileSpreadsheet,
  CheckSquare,
  Square,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { PageHeader, DashboardCard } from '@/components/UI';
import ExportModal from '@/components/ExportModal';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

const RiverMap = dynamic(() => import('@/components/RiverMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[450px] rounded-3xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-col space-y-3">
      <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
      <span className="text-sm text-slate-400 font-medium">Loading Hydrological Map Engine...</span>
    </div>
  ),
});

export default function RiverMonitorDashboard() {
  const { apiFetch } = useAuth();
  const [devices, setDevices] = useState<any[]>([]);
  const [unregisteredDevices, setUnregisteredDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [unregisteredCount, setUnregisteredCount] = useState<number>(0);

  // Search & Filter & Tab States
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'online' | 'offline'>('online');

  // Pagination Engine States
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Selection Engine States (Cross-pagination)
  const [selectedSerials, setSelectedSerials] = useState<Set<string>>(new Set());
  const [isSelectAllMatching, setIsSelectAllMatching] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const [devRes, unregRes, unregDevicesRes] = await Promise.allSettled([
        apiFetch(`${API_BASE_URL}/river/devices`),
        apiFetch(`${API_BASE_URL}/river/unregistered-serials`),
        apiFetch(`${API_BASE_URL}/river/unregistered-devices`),
      ]);

      if (devRes.status === 'fulfilled' && devRes.value.ok) {
        const data = await devRes.value.json();
        setDevices(data || []);
      }

      if (unregRes.status === 'fulfilled' && unregRes.value.ok) {
        const data = await unregRes.value.json();
        setUnregisteredCount(data ? data.length : 0);
      }

      if (unregDevicesRes.status === 'fulfilled' && unregDevicesRes.value.ok) {
        const data = await unregDevicesRes.value.json();
        setUnregisteredDevices(data || []);
      }

      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Failed to fetch river devices', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  // Statistics
  const totalCount = devices.length;
  const activeWarnings = devices.filter(
    (d) =>
      d.warning_status === 'WARNING' ||
      d.warning_status === 'CRITICAL' ||
      d.warning_status === 'EMERGENCY'
  ).length;
  const uniqueOrgs = new Set(devices.map((d) => d.organization_name).filter(Boolean)).size;

  // Offline condition check
  const isDeviceOffline = (d: any) => {
    if (!d.last_seen) return true;
    const lastSeenTime = new Date(d.last_seen).getTime();
    const nowTime = new Date().getTime();
    const thresholdMinutes = d.offline_threshold_min || 360;
    return nowTime - lastSeenTime > thresholdMinutes * 60 * 1000;
  };

  const offlineDevices = React.useMemo(() => devices.filter(isDeviceOffline), [devices]);
  const onlineDevices = React.useMemo(() => devices.filter((d) => !isDeviceOffline(d)), [devices]);
  const onlineCount = onlineDevices.length;

  // Combined list for map rendering (passes registered + unregistered)
  const allDevicesForMap = React.useMemo(() => {
    return [...devices, ...unregisteredDevices];
  }, [devices, unregisteredDevices]);

  // Filtered devices for main list table view
  const filteredDevices = React.useMemo(() => {
    const list = activeTab === 'online' ? onlineDevices : offlineDevices;
    return list.filter((d: any) => {
      const matchSearch =
        d.serial.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.name.toLowerCase().includes(searchTerm.toLowerCase());

      const matchStatus = statusFilter === 'ALL' || (d.warning_status || 'NORMAL') === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [onlineDevices, offlineDevices, activeTab, searchTerm, statusFilter]);

  // Reset pagination & select all matching state when filters change
  useEffect(() => {
    setCurrentPage(1);
    setIsSelectAllMatching(false);
  }, [searchTerm, statusFilter, activeTab]);

  // Paginated devices slice
  const totalPages = Math.max(1, Math.ceil(filteredDevices.length / pageSize));
  const paginatedDevices = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredDevices.slice(start, start + pageSize);
  }, [filteredDevices, currentPage, pageSize]);

  // Page level selection helpers
  const currentPageSerials = useMemo(() => paginatedDevices.map((d) => d.serial), [paginatedDevices]);

  const isCurrentPageAllSelected = useMemo(() => {
    if (currentPageSerials.length === 0) return false;
    return currentPageSerials.every((s) => selectedSerials.has(s));
  }, [currentPageSerials, selectedSerials]);

  const isCurrentPageSomeSelected = useMemo(() => {
    return currentPageSerials.some((s) => selectedSerials.has(s)) && !isCurrentPageAllSelected;
  }, [currentPageSerials, selectedSerials, isCurrentPageAllSelected]);

  const toggleSelectCurrentPage = () => {
    setSelectedSerials((prev) => {
      const next = new Set(prev);
      if (isCurrentPageAllSelected) {
        currentPageSerials.forEach((s) => next.delete(s));
        setIsSelectAllMatching(false);
      } else {
        currentPageSerials.forEach((s) => next.add(s));
      }
      return next;
    });
  };

  const toggleSelectRow = (serial: string) => {
    setSelectedSerials((prev) => {
      const next = new Set(prev);
      if (next.has(serial)) {
        next.delete(serial);
        setIsSelectAllMatching(false);
      } else {
        next.add(serial);
      }
      return next;
    });
  };

  const handleSelectAllMatching = () => {
    setIsSelectAllMatching(true);
    const allFilteredSerials = filteredDevices.map((d) => d.serial);
    setSelectedSerials(new Set(allFilteredSerials));
  };

  const clearSelection = () => {
    setSelectedSerials(new Set());
    setIsSelectAllMatching(false);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Title Header */}
      <PageHeader
        title="River Monitor"
        description="Real-time status overview of hydrological radar sensors."
        icon={<Waves className="w-8 h-8 text-indigo-600 animate-pulse" />}
        actionButton={
          <>
            {lastRefreshed && (
              <span className="text-[11px] text-slate-500 font-mono">
                อัพเดทล่าสุด {lastRefreshed.toLocaleTimeString('th-TH')}
              </span>
            )}
            <button
              onClick={fetchDevices}
              className="flex items-center space-x-2 bg-white hover:bg-slate-50 text-slate-650 border border-slate-200 px-4 py-2 rounded-xl text-sm font-semibold transition shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </>
        }
      />

      {unregisteredCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl flex items-center justify-between shadow-sm animate-pulse">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <div>
              <span className="font-bold text-sm">
                พบเซ็นเซอร์วัดน้ำใหม่ยังไม่ได้ลงทะเบียน ({unregisteredCount} รายการ)
              </span>
              <p className="text-xs text-amber-700/90 mt-0.5">
                มีข้อมูลสัญญาณส่งเข้ามาจากอุปกรณ์ใหม่ แต่ยังไม่ได้บันทึกพิกัดและข้อมูลของสถานีลงในระบบ
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/river/stations?tab=unregistered"
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm whitespace-nowrap"
          >
            ลงทะเบียนด่วน
          </Link>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-2xl hover-scale bg-white/95 border border-slate-200/80 shadow-md shadow-slate-100/50">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">River Stations</span>
            <Anchor className="w-5 h-5 text-indigo-500" />
          </div>
          <h3 className="text-3xl font-bold text-slate-900 mt-4">{totalCount}</h3>
          <p className="text-[10px] text-slate-500 mt-2">Active telemetry radar nodes.</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl hover-scale bg-white/95 border border-slate-200/80 shadow-md shadow-slate-100/50">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Warnings</span>
            <AlertCircle className="w-5 h-5 text-amber-500" />
          </div>
          <h3
            className={`text-3xl font-bold mt-4 ${
              activeWarnings > 0 ? 'text-amber-550 animate-pulse' : 'text-emerald-500'
            }`}
          >
            {activeWarnings}
          </h3>
          <p className="text-[10px] text-slate-500 mt-2">Critical threshold breaches.</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl hover-scale bg-white/95 border border-slate-200/80 shadow-md shadow-slate-100/50">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Organizations</span>
            <Cpu className="w-5 h-5 text-indigo-500" />
          </div>
          <h3 className="text-3xl font-bold text-slate-900 mt-4">{uniqueOrgs}</h3>
          <p className="text-[10px] text-slate-500 mt-2">Active government & partner agencies.</p>
        </div>
      </div>

      {/* Interactive Map Section */}
      <DashboardCard
        title="Real-time Location Mappings"
        icon={<Layers className="w-5 h-5 text-indigo-650" />}
      >
        <RiverMap devices={allDevicesForMap} />
      </DashboardCard>

      {/* Real-time Basins Telemetry Overview */}
      <DashboardCard
        title="Real-time Basins Telemetry Overview"
        icon={<Layers className="w-5 h-5 text-indigo-650" />}
      >
        {/* Filters and Search Bar */}
        <div className="flex flex-col md:flex-row gap-4 mb-4 justify-between items-stretch md:items-center">
          <div className="flex flex-1 gap-3 max-w-xl">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาด้วย Serial หรือ ชื่อสถานี..."
              className="flex-1 bg-white border border-slate-200 rounded-xl py-2 px-4 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl py-2 px-3 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
            >
              <option value="ALL">ทุกระดับเตือนภัย</option>
              <option value="NORMAL">NORMAL</option>
              <option value="WARNING">WARNING</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="EMERGENCY">EMERGENCY</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            {/* Main Export Button */}
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export CSV Config</span>
            </button>

            {/* Tab Switcher */}
            <div className="flex bg-slate-100 p-1 rounded-xl space-x-1 self-start md:self-auto">
              <button
                onClick={() => setActiveTab('online')}
                className={`py-1.5 px-4 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'online'
                    ? 'bg-white text-indigo-650 shadow-sm'
                    : 'text-slate-500 hover:text-slate-850'
                }`}
              >
                ออนไลน์ ({onlineCount})
              </button>
              <button
                onClick={() => setActiveTab('offline')}
                className={`py-1.5 px-4 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'offline'
                    ? 'bg-white text-rose-650 shadow-sm'
                    : 'text-slate-500 hover:text-slate-850'
                }`}
              >
                ออฟไลน์ ({offlineDevices.length})
              </button>
            </div>
          </div>
        </div>

        {/* Cross-Pagination Selection Banner Suggestion */}
        {isCurrentPageAllSelected &&
          filteredDevices.length > paginatedDevices.length &&
          !isSelectAllMatching && (
            <div className="mb-4 bg-indigo-50 border border-indigo-200 text-indigo-900 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between animate-in fade-in">
              <span>
                เลือกแล้ว <strong>{currentPageSerials.length} รายการ</strong> ในหน้านี้
              </span>
              <button
                onClick={handleSelectAllMatching}
                className="font-bold text-indigo-700 hover:text-indigo-900 underline ml-2"
              >
                กดเลือกทั้งหมด {filteredDevices.length} รายการที่ตรงตามตัวกรอง
              </button>
            </div>
          )}

        {isSelectAllMatching && (
          <div className="mb-4 bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-sm animate-in fade-in">
            <span>
              คุณกำลังเลือกอุปกรณ์ทั้งหมด <strong>{filteredDevices.length} รายการ</strong> ที่ค้นพบข้ามทุกหน้า
            </span>
            <button onClick={clearSelection} className="font-bold text-white hover:underline ml-2">
              ยกเลิกการเลือกทั้งหมด
            </button>
          </div>
        )}

        {/* Telemetry Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <th className="py-3.5 px-4 w-10 text-center">
                  <button
                    onClick={toggleSelectCurrentPage}
                    className="text-slate-500 hover:text-indigo-600 transition"
                  >
                    {isCurrentPageAllSelected ? (
                      <CheckSquare className="w-4 h-4 text-indigo-650" />
                    ) : isCurrentPageSomeSelected ? (
                      <div className="w-4 h-4 rounded bg-indigo-100 border border-indigo-400 flex items-center justify-center text-indigo-600 font-bold text-[10px]">
                        -
                      </div>
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="py-3.5 px-4">Serial</th>
                <th className="py-3.5 px-4">Station Name</th>
                <th className="py-3.5 px-4">Organization</th>
                <th className="py-3.5 px-4">Coordinates</th>
                <th className="py-3.5 px-4">Water Level</th>
                <th className="py-3.5 px-4">อัปเดตล่าสุด</th>
                <th className="py-3.5 px-4">การเชื่อมต่อ</th>
                <th className="py-3.5 px-4">การเตือนภัย</th>
                <th className="py-3.5 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"></div>
                    Loading telemetry data...
                  </td>
                </tr>
              ) : paginatedDevices.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    ไม่พบข้อมูลอุปกรณ์วัดน้ำที่ตรงกับตัวกรอง
                  </td>
                </tr>
              ) : (
                paginatedDevices.map((dev) => {
                  const isChecked = selectedSerials.has(dev.serial);
                  return (
                    <tr
                      key={dev.serial}
                      className={`hover:bg-slate-50/70 transition-all ${
                        isChecked ? 'bg-indigo-50/30' : ''
                      }`}
                    >
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => toggleSelectRow(dev.serial)}
                          className="text-slate-500 hover:text-indigo-600 transition"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-indigo-650" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300" />
                          )}
                        </button>
                      </td>
                      <td className="py-4 px-4 font-mono font-bold">
                        <Link
                          href={`/dashboard/river/${dev.serial}`}
                          className="text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          {dev.serial}
                        </Link>
                      </td>
                      <td className="py-4 px-4 font-bold">
                        <Link
                          href={`/dashboard/river/${dev.serial}`}
                          className="text-slate-900 hover:text-indigo-650 hover:underline block"
                        >
                          {dev.name}
                        </Link>
                        <span className={`inline-block mt-0.5 text-[8.5px] font-black px-1.5 py-0.2 rounded border uppercase ${
                          (dev as any).sensor_mode === 'SURFACE' || ((dev as any).bottom_to_bank_cm === 0 && (dev as any).bank_to_sensor_cm > 0)
                            ? 'bg-amber-50 border-amber-250 text-amber-700'
                            : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        }`}>
                          {(dev as any).sensor_mode === 'SURFACE' || ((dev as any).bottom_to_bank_cm === 0 && (dev as any).bank_to_sensor_cm > 0) ? '🚧 SURFACE' : '🌊 RIVER'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-500">{dev.organization_name || 'N/A'}</td>
                      <td className="py-4 px-4 text-slate-500 font-mono">
                        {dev.install_latitude && dev.install_longitude
                          ? `${parseFloat(dev.install_latitude).toFixed(4)}, ${parseFloat(
                              dev.install_longitude
                            ).toFixed(4)}`
                          : 'N/A'}
                      </td>
                      <td className="py-4 px-4 font-mono font-bold text-indigo-600">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm font-extrabold text-indigo-700">
                            {dev.net_water_level_cm !== undefined && dev.net_water_level_cm !== null
                              ? `${dev.net_water_level_cm.toFixed(1)} cm`
                              : 'N/A'}
                          </span>
                          {((dev as any).sensor_mode !== 'SURFACE' && (dev as any).bottom_to_bank_cm !== 0) && dev.water_level_pct !== undefined && dev.water_level_pct !== null && dev.water_level_pct > 0 && (
                            <span className="text-slate-400 text-[10px] block font-normal">
                              {dev.water_level_pct.toFixed(1)}% ความจุ
                            </span>
                          )}
                          {dev.filtered_level_cm !== undefined && dev.filtered_level_cm !== null && (
                            <span className="text-slate-400 text-[9.5px] block font-normal">
                              Filtered: {dev.filtered_level_cm.toFixed(1)} cm
                            </span>
                          )}
                          {dev.filter_status && (
                            <span className={`inline-flex items-center gap-1 w-fit mt-1 text-[8.5px] font-black px-2 py-0.5 rounded-full border ${
                              dev.filter_status === 'NORMAL'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                : dev.filter_status === 'DRY_ROAD'
                                ? 'bg-amber-50 border-amber-200 text-amber-700'
                                : dev.filter_status === 'VEHICLE_BLOCKED'
                                ? 'bg-sky-50 border-sky-250 text-sky-700'
                                : dev.filter_status === 'POLE_SWAY_DAMPED'
                                ? 'bg-purple-50 border-purple-200 text-purple-700'
                                : dev.filter_status === 'FLASH_FLOOD_BYPASS'
                                ? 'bg-rose-50 border-rose-250 text-rose-700 animate-pulse'
                                : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}>
                              {dev.filter_status === 'NORMAL' && '🟢 ปกติ'}
                              {dev.filter_status === 'DRY_ROAD' && '🟡 ถนนแห้ง'}
                              {dev.filter_status === 'VEHICLE_BLOCKED' && '🚗 รถจอดทับ'}
                              {dev.filter_status === 'POLE_SWAY_DAMPED' && '🟣 เสาแกว่ง'}
                              {dev.filter_status === 'FLASH_FLOOD_BYPASS' && '⚡ น้ำขึ้นเร็ว'}
                              {dev.filter_status === 'UNRESOLVABLE_OBSTRUCTION' && '🔴 ขวางถาวร'}
                              {!['NORMAL','DRY_ROAD','VEHICLE_BLOCKED','POLE_SWAY_DAMPED','FLASH_FLOOD_BYPASS','UNRESOLVABLE_OBSTRUCTION'].includes(dev.filter_status) && dev.filter_status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-slate-500 font-mono">
                        {dev.last_seen ? new Date(dev.last_seen).toLocaleString('th-TH') : 'N/A'}
                      </td>
                      <td className="py-4 px-4">
                        {isDeviceOffline(dev) ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-slate-100 text-slate-650 border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            OFFLINE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-700 border-emerald-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-550" />
                            ONLINE
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            dev.warning_status === 'EMERGENCY'
                              ? 'bg-rose-500 text-white border-rose-600'
                              : dev.warning_status === 'CRITICAL'
                              ? 'bg-amber-500 text-white border-amber-600'
                              : dev.warning_status === 'WARNING'
                              ? 'bg-indigo-550 text-white border-indigo-600'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              dev.warning_status === 'EMERGENCY' ||
                              dev.warning_status === 'CRITICAL' ||
                              dev.warning_status === 'WARNING'
                                ? 'bg-white animate-pulse'
                                : 'bg-emerald-550'
                            }`}
                          />
                          {dev.warning_status || 'NORMAL'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/dashboard/river/${dev.serial}`}
                            className="inline-flex items-center space-x-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-150 px-2.5 py-1.5 rounded-xl transition text-[11px] font-bold shadow-sm"
                          >
                            Detail
                          </Link>
                          <Link
                            href={`/dashboard/river/stations?edit=${dev.serial}`}
                            className="inline-flex items-center space-x-1 bg-white hover:bg-slate-50 text-slate-650 border border-slate-200 px-2.5 py-1.5 rounded-xl transition text-[11px] font-bold shadow-sm"
                          >
                            Configure
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Toolbar */}
        {filteredDevices.length > 0 && (
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center space-x-4">
              <span>
                แสดง{' '}
                <strong>
                  {Math.min((currentPage - 1) * pageSize + 1, filteredDevices.length)}
                </strong>{' '}
                -{' '}
                <strong>
                  {Math.min(currentPage * pageSize, filteredDevices.length)}
                </strong>{' '}
                จากทั้งหมด <strong>{filteredDevices.length}</strong> รายการ
              </span>

              <div className="flex items-center space-x-1.5">
                <span>แสดงหน้าละ:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold text-slate-700 focus:outline-none focus:border-indigo-500"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Pagination Controls Buttons */}
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <ChevronsLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <span className="px-3 py-1 font-bold text-slate-700 bg-slate-100 rounded-lg">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 transition"
              >
                <ChevronsRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </DashboardCard>

      {/* Selection Floating Action Bar */}
      {selectedSerials.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/90 text-white backdrop-blur-md px-6 py-3 rounded-2xl shadow-2xl flex items-center space-x-6 border border-slate-700/50 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center space-x-2 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>
              เลือกอยู่{' '}
              <strong className="text-emerald-400 text-sm">{selectedSerials.size}</strong> รายการ
            </span>
          </div>

          <div className="h-4 w-px bg-slate-700" />

          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center space-x-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Export CSV ({selectedSerials.size})</span>
            </button>

            <button
              onClick={clearSelection}
              className="flex items-center space-x-1 text-slate-400 hover:text-white text-xs transition px-2 py-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>
      )}

      {/* Dynamic DB Column Picker Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        selectedSerials={selectedSerials}
        isSelectAllMatching={isSelectAllMatching}
        totalMatchingCount={filteredDevices.length}
        filterCriteria={{
          search: searchTerm,
          status: statusFilter,
          tab: activeTab,
        }}
      />
    </div>
  );
}
