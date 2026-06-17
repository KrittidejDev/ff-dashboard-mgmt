'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ClipboardList, Layers } from 'lucide-react';
import { PageHeader, DashboardCard, SelectInput, SearchInput } from '@/components/UI';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function RiverAlertLogsPage() {
  const { apiFetch } = useAuth();
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedSerial, setSelectedSerial] = useState<string>('ALL');
  const [alertHistory, setAlertHistory] = useState<any[]>([]);
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Filter & Pagination state
  const [deviceSearch, setDeviceSearch] = useState('');
  const [alertLevelFilter, setAlertLevelFilter] = useState('ALL');
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL');
  const [textSearch, setTextSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Load devices list
  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/river/devices`);
        if (res.ok) {
          const data = await res.json();
          setDevices(data || []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchDevices();
  }, [apiFetch]);

  // Load history logs and thresholds for selected device
  const fetchAlertHistory = async (serial: string) => {
    setLoading(true);
    try {
      const historyUrl = `${API_BASE_URL}/river/devices/${serial}/alerts?limit=1000`;
      const thresholdsUrl = serial === 'ALL'
        ? null
        : `${API_BASE_URL}/river/devices/${serial}/thresholds`;

      const [historyRes, thresholdsRes] = await Promise.all([
        apiFetch(historyUrl),
        thresholdsUrl ? apiFetch(thresholdsUrl).catch(() => null) : null
      ]);

      if (historyRes.ok) {
        const data = await historyRes.json();
        setAlertHistory(data || []);
      }
      if (thresholdsRes && thresholdsRes.ok) {
        const threshData = await thresholdsRes.json();
        setThresholds(threshData || []);
      } else {
        setThresholds([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlertHistory(selectedSerial);
  }, [selectedSerial]);

  // Dynamic device search filter for the dropdown select list
  const filteredDevicesForSelect = useMemo(() => {
    if (!deviceSearch) return devices.slice(0, 100); // Limit to 100 for fast UI rendering
    const lower = deviceSearch.toLowerCase();
    return devices.filter(d => 
      d.name.toLowerCase().includes(lower) || 
      d.serial.toLowerCase().includes(lower)
    ).slice(0, 100);
  }, [devices, deviceSearch]);

  const formatValueAndThreshold = (h: any) => {
    // Find device to get bottom_to_bank_cm
    const rowDevice = devices.find(d => d.serial === h.serial);
    const bottomToBank = rowDevice?.bottom_to_bank_cm;

    // 1. If metadata contains exact values, prioritize them (for newer logs)
    if (h.metadata) {
      const valCm = h.metadata.net_water_level_cm;
      const valPct = h.metadata.water_level_pct;
      const threshCm = h.metadata.threshold_cm;
      const threshPct = h.metadata.threshold_pct;
      
      let valStr = 'N/A';
      if (typeof valCm === 'number' && typeof valPct === 'number') {
        valStr = `${valCm.toFixed(1)} cm (${valPct.toFixed(1)}%)`;
      } else if (typeof valCm === 'number') {
        valStr = `${valCm.toFixed(1)} cm`;
      } else if (typeof valPct === 'number') {
        valStr = `${valPct.toFixed(1)}%`;
      } else if (typeof h.value === 'number') {
        valStr = `${h.value.toFixed(1)}`;
      }

      let threshStr = 'N/A';
      if (typeof threshCm === 'number' && typeof threshPct === 'number') {
        threshStr = `${threshCm.toFixed(1)} cm (${threshPct.toFixed(1)}%)`;
      } else if (typeof threshCm === 'number') {
        threshStr = `${threshCm.toFixed(1)} cm`;
      } else if (typeof threshPct === 'number') {
        threshStr = `${threshPct.toFixed(1)}%`;
      } else if (typeof h.threshold === 'number') {
        threshStr = `${h.threshold.toFixed(1)}`;
      }

      return { valStr, threshStr };
    }

    // 2. Fallback for older logs: determine unit using device config & thresholds
    const val = h.value;
    const thresh = h.threshold;
    if (typeof val !== 'number') {
      return { valStr: 'N/A', threshStr: 'N/A' };
    }

    if (!bottomToBank || bottomToBank <= 0) {
      const unit = (val > 100 || h.alert_type === 'CLEARED') ? 'cm' : '%';
      return {
        valStr: `${val.toFixed(1)} ${unit}`,
        threshStr: typeof thresh === 'number' ? `${thresh.toFixed(1)} ${unit}` : 'N/A'
      };
    }

    let isPercent = false;
    if (h.alert_type !== 'CLEARED') {
      // Only check thresholds if we are focused on a single device where thresholds are loaded
      const threshCfg = selectedSerial !== 'ALL' ? thresholds.find(t => t.alert_level === h.alert_level) : null;
      if (threshCfg) {
        if (threshCfg.threshold_pct !== null && threshCfg.threshold_pct !== undefined && threshCfg.threshold_pct > 0) {
          if (threshCfg.threshold_cm === null || threshCfg.threshold_cm === undefined || Math.abs(thresh - threshCfg.threshold_pct) < 0.1) {
            isPercent = true;
          }
        }
      } else {
        isPercent = thresh > 0 && thresh <= 100;
      }
    }

    let valCm = 0;
    let valPct = 0;
    let threshCm = 0;
    let threshPct = 0;

    if (isPercent) {
      valPct = val;
      valCm = (val / 100) * bottomToBank;
      threshPct = thresh;
      threshCm = (thresh / 100) * bottomToBank;
    } else {
      valCm = val;
      valPct = (val / bottomToBank) * 100;
      threshCm = thresh;
      threshPct = (thresh / bottomToBank) * 100;
    }

    if (h.alert_type === 'CLEARED') {
      return {
        valStr: `${valCm.toFixed(1)} cm (${valPct.toFixed(1)}%)`,
        threshStr: `0.0 cm (0.0%)`
      };
    }

    return {
      valStr: `${valCm.toFixed(1)} cm (${valPct.toFixed(1)}%)`,
      threshStr: `${threshCm.toFixed(1)} cm (${threshPct.toFixed(1)}%)`
    };
  };

  // Filter alert logs
  const filteredLogs = useMemo(() => {
    return alertHistory.filter(h => {
      // Alert level filter
      if (alertLevelFilter !== 'ALL' && h.alert_level !== alertLevelFilter) {
        return false;
      }
      // Event type filter
      if (eventTypeFilter !== 'ALL' && h.alert_type !== eventTypeFilter) {
        return false;
      }
      // General message/serial/name search
      if (textSearch) {
        const query = textSearch.toLowerCase();
        const msgMatch = h.message?.toLowerCase().includes(query);
        const serialMatch = h.serial?.toLowerCase().includes(query);
        const rowDevice = devices.find(d => d.serial === h.serial);
        const nameMatch = rowDevice?.name?.toLowerCase().includes(query);
        if (!msgMatch && !serialMatch && !nameMatch) {
          return false;
        }
      }
      return true;
    });
  }, [alertHistory, alertLevelFilter, eventTypeFilter, textSearch, devices]);

  // Paginated logs
  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title Header */}
      <PageHeader
        title="Alert Logs History"
        description="Review historic warning, critical, and emergency trigger logs across station devices."
        icon={<ClipboardList className="w-8 h-8 text-indigo-650" />}
      />

      {/* Advanced Filter Card */}
      <DashboardCard title="ค้นหาและกรองประวัติการแจ้งเตือน">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Device Search & Selection */}
          <div className="flex flex-col space-y-1">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">ค้นหาอุปกรณ์ (ชื่อ / Serial)</span>
            <SearchInput
              value={deviceSearch}
              onChange={(val) => setDeviceSearch(val)}
              placeholder="พิมพ์เพื่อค้นหา..."
              className="w-full"
            />
            <SelectInput
              value={selectedSerial}
              onChange={(val) => {
                setSelectedSerial(val);
                setCurrentPage(1);
              }}
              options={[
                { value: 'ALL', label: '-- แสดงทั้งหมด --' },
                ...filteredDevicesForSelect.map(d => ({ value: d.serial, label: `${d.name} (${d.serial})` }))
              ]}
              className="w-full mt-1"
            />
          </div>

          {/* Alert Level Filter */}
          <SelectInput
            label="ระดับแจ้งเตือน"
            value={alertLevelFilter}
            onChange={(val) => {
              setAlertLevelFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { value: 'ALL', label: 'ทั้งหมด' },
              { value: 'EMERGENCY', label: 'EMERGENCY' },
              { value: 'CRITICAL', label: 'CRITICAL' },
              { value: 'WARNING', label: 'WARNING' }
            ]}
            className="w-full"
          />

          {/* Event Type Filter */}
          <SelectInput
            label="ประเภทเหตุการณ์"
            value={eventTypeFilter}
            onChange={(val) => {
              setEventTypeFilter(val);
              setCurrentPage(1);
            }}
            options={[
              { value: 'ALL', label: 'ทั้งหมด' },
              { value: 'TRIGGERED', label: 'TRIGGERED' },
              { value: 'CLEARED', label: 'CLEARED' },
              { value: 'ESCALATED', label: 'ESCALATED' }
            ]}
            className="w-full"
          />

          {/* General Text Search */}
          <div className="flex flex-col space-y-1">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1">ค้นหาคำค้นทั่วไป (Serial / ข้อความ)</span>
            <SearchInput
              value={textSearch}
              onChange={(val) => {
                setTextSearch(val);
                setCurrentPage(1);
              }}
              placeholder="ค้นหาข้อความเตือนภัย..."
              className="w-full"
            />
          </div>
        </div>
      </DashboardCard>

      {/* Main Alert Log Table */}
      <DashboardCard
        title={selectedSerial === 'ALL' ? 'Alert Trigger logs (รวมทุกอุปกรณ์)' : `Alert Trigger logs for ${selectedSerial}`}
        icon={<Layers className="w-4 h-4 text-indigo-600" />}
      >
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white p-2">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                <th className="py-3.5 px-4">Time</th>
                <th className="py-3.5 px-4">Device</th>
                <th className="py-3.5 px-4">Alert Level</th>
                <th className="py-3.5 px-4">Event Type</th>
                <th className="py-3.5 px-4">Water Level</th>
                <th className="py-3.5 px-4">Threshold</th>
                <th className="py-3.5 px-4">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">Loading alert logs...</td>
                </tr>
              ) : paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">No alert triggers logged matching the filter.</td>
                </tr>
              ) : (
                paginatedLogs.map((h, idx) => {
                  const { valStr, threshStr } = formatValueAndThreshold(h);
                  const dev = devices.find(d => d.serial === h.serial);
                  return (
                    <tr key={idx} className="hover:bg-slate-50/50 transition">
                      <td className="py-3.5 px-4 font-mono text-slate-500">{new Date(h.time).toLocaleString('th-TH')}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-900 block">{dev?.name || h.serial}</span>
                        <span className="text-[10px] text-slate-400 block font-mono">{h.serial}</span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black ${
                          h.alert_level === 'EMERGENCY' ? 'bg-rose-500 text-white' :
                          h.alert_level === 'CRITICAL' ? 'bg-amber-600 text-white' :
                          'bg-indigo-600 text-white'
                        }`}>
                          {h.alert_level}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold border ${
                          h.alert_type === 'TRIGGERED' 
                            ? 'bg-rose-50 text-rose-700 border-rose-100' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        }`}>
                          {h.alert_type}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{valStr}</td>
                      <td className="py-3.5 px-4 font-mono text-slate-500">{threshStr}</td>
                      <td className="py-3.5 px-4 text-slate-650">{h.message}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100 text-xs">
              <span className="text-slate-500 font-medium">
                แสดง {Math.min(totalItems, (currentPage - 1) * itemsPerPage + 1)} - {Math.min(totalItems, currentPage * itemsPerPage)} จากทั้งหมด {totalItems} รายการ
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-50 hover:text-indigo-600 transition disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-600 cursor-pointer"
                >
                  ก่อนหน้า
                </button>
                <span className="font-bold text-slate-700">
                  หน้า {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="py-1.5 px-3 bg-white border border-slate-200 rounded-lg text-slate-600 font-bold hover:bg-slate-50 hover:text-indigo-600 transition disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-slate-600 cursor-pointer"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>
      </DashboardCard>
    </div>
  );
}
