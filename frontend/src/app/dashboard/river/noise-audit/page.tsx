'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { 
  Activity, 
  Search, 
  RefreshCw, 
  Filter, 
  Eye, 
  X, 
  ShieldAlert, 
  Car, 
  Sun, 
  Zap, 
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Database
} from 'lucide-react';
import { PageHeader, DashboardCard, SelectInput } from '@/components/UI';
import { NoiseAuditLog, RiverDevice } from '@/types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function RiverNoiseAuditPage() {
  const { apiFetch } = useAuth();
  const [logs, setLogs] = useState<NoiseAuditLog[]>([]);
  const [devices, setDevices] = useState<RiverDevice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filters & Pagination state
  const [selectedSerial, setSelectedSerial] = useState<string>('ALL');
  const [selectedEventType, setSelectedEventType] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Selected Log for detail modal
  const [selectedLog, setSelectedLog] = useState<NoiseAuditLog | null>(null);

  // Load devices list for dropdown
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/river/devices`);
        if (res.ok) {
          const data = await res.json();
          setDevices(data || []);
        }
      } catch (err) {
        console.error('Failed to load devices:', err);
      }
    };
    fetchDevices();
  }, [apiFetch]);

  // Load noise audit logs
  const fetchLogs = async () => {
    setLoading(true);
    try {
      const offset = (currentPage - 1) * pageSize;
      let url = `${API_BASE_URL}/river/noise-audit?limit=${pageSize}&offset=${offset}`;
      if (selectedSerial !== 'ALL') {
        url += `&serial=${encodeURIComponent(selectedSerial)}`;
      }
      if (selectedEventType !== 'ALL') {
        url += `&event_type=${encodeURIComponent(selectedEventType)}`;
      }

      const res = await apiFetch(url);
      if (res.ok) {
        const json = await res.json();
        setLogs(json.data || []);
        setTotalCount(json.total || 0);
      }
    } catch (err) {
      console.error('Failed to load noise audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [selectedSerial, selectedEventType, currentPage]);

  // Filter logs locally by search query if any
  const filteredLogs = useMemo(() => {
    if (!searchQuery.trim()) return logs;
    const q = searchQuery.toLowerCase();
    return logs.filter((l) => 
      l.serial.toLowerCase().includes(q) || 
      l.event_type.toLowerCase().includes(q)
    );
  }, [logs, searchQuery]);

  // Counts for KPIs
  const eventCounts = useMemo(() => {
    let dryRoad = 0;
    let vehicle = 0;
    let poleSway = 0;
    let slewRate = 0;

    logs.forEach((l) => {
      if (l.event_type === 'DRY_ROAD') dryRoad++;
      else if (l.event_type === 'VEHICLE_BLOCKED') vehicle++;
      else if (l.event_type === 'POLE_SWAY_DAMPED') poleSway++;
      else if (l.event_type === 'SLEW_RATE_EXCEEDED') slewRate++;
    });

    return { dryRoad, vehicle, poleSway, slewRate };
  }, [logs]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'DRY_ROAD':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span>🟡 DRY ROAD (ตัดเสียงรบกวนถนนแห้ง)</span>
          </span>
        );
      case 'VEHICLE_BLOCKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-sky-50 text-sky-700 border border-sky-250 shadow-sm">
            <Car className="w-3.5 h-3.5 text-sky-500" />
            <span>🚗 VEHICLE BLOCKED (รถจอดทับ)</span>
          </span>
        );
      case 'POLE_SWAY_DAMPED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-purple-50 text-purple-700 border border-purple-200 shadow-sm">
            <Activity className="w-3.5 h-3.5 text-purple-500" />
            <span>🟣 POLE SWAY (กรองการสั่นไหวของเสา)</span>
          </span>
        );
      case 'SLEW_RATE_EXCEEDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-50 text-rose-700 border border-rose-200 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-rose-500" />
            <span>⚡ SLEW RATE EXCEEDED (ความเร็วเกินเกณฑ์)</span>
          </span>
        );
      case 'SENSOR_RESET':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700 border border-slate-300 shadow-sm">
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>🔄 SENSOR RESET (เซ็นเซอร์รีเซ็ต)</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-slate-100 text-slate-700 border border-slate-200 shadow-sm">
            <ShieldAlert className="w-3.5 h-3.5 text-slate-500" />
            <span>{type}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-16">
      {/* Title Header */}
      <PageHeader
        title="Noise & Obstruction Audit Log"
        description="ประวัติการตรวจจับและตัดสัญญาณรบกวน (IoT Noise Filtering), การตรวจจับรถจอดทับผิวถนน และการลดการสั่นไหวของเสา"
        icon={<Activity className="w-8 h-8 text-indigo-600 animate-pulse" />}
        actionButton={
          <button
            onClick={() => fetchLogs()}
            className="flex items-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">รายการทั้งหมด (Total Logs)</span>
            <Database className="w-5 h-5 text-indigo-500" />
          </div>
          <h3 className="text-3xl font-extrabold text-slate-900 mt-2 font-mono">{totalCount.toLocaleString()}</h3>
          <p className="text-[10px] text-slate-500 mt-1">Noise suppression & filter audit records</p>
        </div>

        <div className="bg-white border border-amber-200/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition bg-gradient-to-br from-white to-amber-50/30">
          <div className="flex justify-between items-center text-amber-600">
            <span className="text-xs font-bold uppercase tracking-wider">ถนนแห้ง (Dry Road)</span>
            <Sun className="w-5 h-5 text-amber-500" />
          </div>
          <h3 className="text-3xl font-extrabold text-amber-700 mt-2 font-mono">{eventCounts.dryRoad}</h3>
          <p className="text-[10px] text-amber-600/90 mt-1">ตัดสัญญาณน้ำปลอม &lt; 5 cm บนถนนแห้ง</p>
        </div>

        <div className="bg-white border border-sky-200/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition bg-gradient-to-br from-white to-sky-50/30">
          <div className="flex justify-between items-center text-sky-600">
            <span className="text-xs font-bold uppercase tracking-wider">รถจอดทับ (Vehicle Blocked)</span>
            <Car className="w-5 h-5 text-sky-500" />
          </div>
          <h3 className="text-3xl font-extrabold text-sky-700 mt-2 font-mono">{eventCounts.vehicle}</h3>
          <p className="text-[10px] text-sky-600/90 mt-1">ตรวจพบวัตถุ/รถยนต์จอดทับเซนเซอร์ผิวถนน</p>
        </div>

        <div className="bg-white border border-purple-200/80 p-5 rounded-2xl shadow-sm hover:shadow-md transition bg-gradient-to-br from-white to-purple-50/30">
          <div className="flex justify-between items-center text-purple-600">
            <span className="text-xs font-bold uppercase tracking-wider">เสาแกว่ง (Pole Sway Damped)</span>
            <Activity className="w-5 h-5 text-purple-500" />
          </div>
          <h3 className="text-3xl font-extrabold text-purple-700 mt-2 font-mono">{eventCounts.poleSway}</h3>
          <p className="text-[10px] text-purple-600/90 mt-1">ลดทอนการสั่นไหวด้วย Adaptive EMA</p>
        </div>
      </div>

      {/* Main Filter & Table Card */}
      <DashboardCard
        title="บันทึกประวัติการกรองสัญญาณรบกวน (Audit Trail Table)"
        icon={<Activity className="w-5 h-5 text-indigo-650" />}
        badge={
          <span className="text-xs font-bold text-slate-500 font-mono">
            แสดง {filteredLogs.length} จากทั้งหมด {totalCount} รายการ
          </span>
        }
      >
        {/* Controls Bar */}
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Serial Dropdown */}
            <div className="w-full sm:w-56">
              <SelectInput
                label="เลือกอุปกรณ์ (Station Serial)"
                value={selectedSerial}
                onChange={(e) => {
                  setSelectedSerial(e.target.value);
                  setCurrentPage(1);
                }}
                options={[
                  { value: 'ALL', label: '🔍 ทั้งหมดทุกสถานี (All Stations)' },
                  ...devices.map((d) => ({
                    value: d.serial,
                    label: `${d.serial} - ${d.name}`,
                  })),
                ]}
              />
            </div>

            {/* Event Type Dropdown */}
            <div className="w-full sm:w-60">
              <SelectInput
                label="ประเภทเหตุการณ์ (Event Type)"
                value={selectedEventType}
                onChange={(e) => {
                  setSelectedEventType(e.target.value);
                  setCurrentPage(1);
                }}
                options={[
                  { value: 'ALL', label: '🌐 ประเภททั้งหมด (All Types)' },
                  { value: 'DRY_ROAD', label: '🟡 DRY_ROAD (ตัดเสียงรบกวนถนนแห้ง)' },
                  { value: 'VEHICLE_BLOCKED', label: '🚗 VEHICLE_BLOCKED (รถจอดทับ)' },
                  { value: 'POLE_SWAY_DAMPED', label: '🟣 POLE_SWAY_DAMPED (เสาแกว่ง)' },
                  { value: 'SLEW_RATE_EXCEEDED', label: '⚡ SLEW_RATE_EXCEEDED (สไปก์)' },
                  { value: 'SENSOR_RESET', label: '🔄 SENSOR_RESET (รีเซ็ต)' },
                ]}
              />
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหา Serial หรือ Event..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition"
            />
          </div>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white mt-4">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                <th className="py-3.5 px-4">วันและเวลาที่บันทึก (Recorded At)</th>
                <th className="py-3.5 px-4">รหัสสถานี (Serial)</th>
                <th className="py-3.5 px-4">ประเภทเหตุการณ์ (Event Type)</th>
                <th className="py-3.5 px-4 font-mono">ระยะวัดดิบ (Raw Level)</th>
                <th className="py-3.5 px-4 font-mono">ระยะวัดหลังกรอง (Filtered)</th>
                <th className="py-3.5 px-4 font-mono">ความเชื่อมั่น (Confidence)</th>
                <th className="py-3.5 px-4 text-center">รายละเอียด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-500" />
                    <span>กำลังโหลดประวัติ Noise Audit Log...</span>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    ไม่พบรายการเหตุการณ์ผิดปกติในช่วงหรือเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : (
                filteredLogs.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {new Date(item.recorded_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} น.
                      <span className="text-[10px] text-slate-400 block font-normal">
                        {new Date(item.recorded_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-extrabold text-indigo-700">
                      {item.serial}
                    </td>
                    <td className="py-3 px-4">
                      {getEventBadge(item.event_type)}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {item.raw_level_cm !== undefined && item.raw_level_cm !== null 
                        ? `${item.raw_level_cm.toFixed(1)} cm` 
                        : '--'}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {item.filtered_level_cm !== undefined && item.filtered_level_cm !== null 
                        ? `${item.filtered_level_cm.toFixed(1)} cm` 
                        : '--'}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {item.confidence_score !== undefined && item.confidence_score !== null ? (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          item.confidence_score >= 0.8
                            ? 'bg-emerald-50 text-emerald-700'
                            : item.confidence_score >= 0.5
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}>
                          {(item.confidence_score * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-[10px]">--</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => setSelectedLog(item)}
                        className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-indigo-650 hover:text-indigo-750 transition shadow-sm inline-flex items-center gap-1 text-[11px] font-bold"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>ดู JSON Detail</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
            <span className="text-xs font-bold text-slate-500">
              หน้า {currentPage} จาก {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => p - 1)}
                className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </DashboardCard>

      {/* JSON Detail Inspector Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div>
                <h3 className="text-base font-black text-slate-950">Audit Record Detail</h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  ID: #{selectedLog.id} | {selectedLog.serial} | {new Date(selectedLog.recorded_at).toLocaleString('th-TH')}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Event Type</span>
                  <span className="text-xs font-black text-slate-800 block mt-0.5">{selectedLog.event_type}</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Confidence Score</span>
                  <span className="text-xs font-black text-indigo-650 block mt-0.5">
                    {selectedLog.confidence_score !== undefined && selectedLog.confidence_score !== null 
                      ? `${(selectedLog.confidence_score * 100).toFixed(0)}%` 
                      : '--'}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Raw Sensor Level</span>
                  <span className="text-xs font-bold text-slate-800 font-mono block mt-0.5">{selectedLog.raw_level_cm?.toFixed(2) ?? '--'} cm</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Filtered Level</span>
                  <span className="text-xs font-extrabold text-emerald-700 font-mono block mt-0.5">{selectedLog.filtered_level_cm?.toFixed(2) ?? '--'} cm</span>
                </div>
              </div>

              {/* JSON Payload Detail */}
              <div>
                <span className="text-xs font-bold text-slate-600 block mb-1.5">JSON Payload & Metadata:</span>
                <pre className="bg-slate-900 text-emerald-400 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-60 border border-slate-800">
                  {JSON.stringify(selectedLog.detail || selectedLog, null, 2)}
                </pre>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                ปิดหน้าต่าง (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
