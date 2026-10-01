'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  Activity,
  MapPin,
  Gauge,
  Radio,
  Clock,
  RefreshCw,
  X,
  Compass,
  Layers,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { RtspPlayer } from '@/components/RtspPlayer';

const RiverMap = dynamic(() => import('@/components/RiverMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-slate-950 flex items-center justify-center">
      <span className="text-[10px] text-slate-500 font-mono">Loading GIS Radar...</span>
    </div>
  ),
});

const WaterChart = dynamic(
  () => import('@/components/WaterChart').then((m) => m.WaterChart),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full bg-slate-950/80 flex items-center justify-center">
        <span className="text-[10px] text-slate-500 font-mono">Rendering Hydrology Graph...</span>
      </div>
    ),
  }
);

export interface SingleStationInspectionCockpitProps {
  serial: string;
  device?: any;
  apiFetch: any;
  apiBaseUrl: string;
  onClose: () => void;
}

export function SingleStationInspectionCockpit({
  serial,
  device,
  apiFetch,
  apiBaseUrl,
  onClose,
}: SingleStationInspectionCockpitProps) {
  const [allStats, setAllStats] = useState<any[]>([]);
  const [thresholds, setThresholds] = useState<any[]>([]);
  const [calcConfig, setCalcConfig] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFs);
    return () => document.removeEventListener('fullscreenchange', handleFs);
  }, []);

  const toggleFs = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // 1. Fetch 24-hour Telemetry Stats & Thresholds
  const fetchTelemetryData = useCallback(async () => {
    if (!serial) return;
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const [statsRes, threshRes, configRes] = await Promise.all([
        apiFetch(
          `${apiBaseUrl}/river/devices/${serial}/stats?start=${encodeURIComponent(
            start.toISOString()
          )}&end=${encodeURIComponent(end.toISOString())}`
        ).catch(() => null),
        apiFetch(`${apiBaseUrl}/river/devices/${serial}/thresholds`).catch(() => null),
        apiFetch(`${apiBaseUrl}/river/devices/${serial}/calc-config`).catch(() => null),
      ]);

      if (statsRes && statsRes.ok) {
        const statsData = await statsRes.json().catch(() => null);
        setAllStats(Array.isArray(statsData) ? statsData : (statsData?.stats || []));
      }
      if (threshRes && threshRes.ok) {
        const threshData = await threshRes.json().catch(() => null);
        setThresholds(Array.isArray(threshData) ? threshData : (threshData?.thresholds || []));
      }
      if (configRes && configRes.ok) {
        const configData = await configRes.json().catch(() => null);
        setCalcConfig(configData || null);
      }
    } catch (err) {
      console.error('[SingleStationCockpit] Failed to load data:', err);
    } finally {
      setLoadingStats(false);
      setIsRefreshing(false);
    }
  }, [serial, apiFetch, apiBaseUrl]);

  useEffect(() => {
    setLoadingStats(true);
    fetchTelemetryData();
    const pollInterval = setInterval(fetchTelemetryData, 15000);
    return () => clearInterval(pollInterval);
  }, [fetchTelemetryData]);

  // 2. Keyboard listener: Escape to return to wall
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 3. Transform stats into WaterChartDataItem
  const chartData = useMemo(() => {
    const sorted = [...allStats].sort(
      (a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );
    return sorted.map((point: any) => {
      const rawDist =
        point.raw_level_cm !== null && point.raw_level_cm !== undefined
          ? point.raw_level_cm
          : point.level_cm;

      let rawNet: number | null = null;
      const btb = calcConfig?.bottom_to_bank_cm || device?.bottom_to_bank_cm || 0;
      const b2s = calcConfig?.bank_to_sensor_cm || device?.bank_to_sensor_cm || 0;
      if (rawDist !== null && rawDist !== undefined && (btb > 0 || b2s > 0)) {
        rawNet = btb + b2s - rawDist;
        if (rawNet < 0) rawNet = 0;
        rawNet = parseFloat(rawNet.toFixed(1));
      }

      return {
        label:
          new Date(point.time).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
          }) + ' น.',
        fullLabel:
          new Date(point.time).toLocaleDateString('th-TH', {
            day: '2-digit',
            month: 'short',
          }) +
          ' ' +
          new Date(point.time).toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }) +
          ' น.',
        value:
          point.net_water_level_cm !== null && point.net_water_level_cm !== undefined
            ? parseFloat(point.net_water_level_cm.toFixed(1))
            : null,
        rawValue: rawNet,
        rawDistance:
          rawDist !== null && rawDist !== undefined ? parseFloat(rawDist.toFixed(1)) : null,
        filteredDistance:
          point.filtered_level_cm !== null && point.filtered_level_cm !== undefined
            ? parseFloat(point.filtered_level_cm.toFixed(1))
            : null,
        filterStatus: point.filter_status || 'NORMAL',
      };
    });
  }, [allStats, calcConfig, device]);

  // Extract threshold values
  const warningThresh = useMemo(
    () => thresholds.find((t: any) => t.alert_level === 'WARNING' && t.is_active)?.threshold_cm,
    [thresholds]
  );
  const criticalThresh = useMemo(
    () => thresholds.find((t: any) => t.alert_level === 'CRITICAL' && t.is_active)?.threshold_cm,
    [thresholds]
  );
  const emergencyThresh = useMemo(
    () => thresholds.find((t: any) => t.alert_level === 'EMERGENCY' && t.is_active)?.threshold_cm,
    [thresholds]
  );

  const isEmerg = device?.warning_status === 'EMERGENCY';
  const isCrit = device?.warning_status === 'CRITICAL';
  const isWarn = device?.warning_status === 'WARNING';
  const isSurface = device?.sensor_mode === 'SURFACE';

  // Last seen time
  const lastSeenStr = useMemo(() => {
    if (!device?.last_seen) return 'ไม่ทราบเวลา';
    try {
      return (
        new Date(device.last_seen).toLocaleDateString('th-TH', {
          day: '2-digit',
          month: 'short',
          year: '2-digit',
        }) +
        ' ' +
        new Date(device.last_seen).toLocaleTimeString('th-TH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch {
      return device.last_seen;
    }
  }, [device?.last_seen]);

  const latNum = parseFloat(device?.install_latitude);
  const lngNum = parseFloat(device?.install_longitude);
  const hasCoordinates = !isNaN(latNum) && !isNaN(lngNum) && latNum !== 0 && lngNum !== 0;

  return (
    <div className="fixed inset-0 z-[99999] bg-[#070b14] text-slate-100 flex flex-col overflow-hidden animate-in fade-in duration-200">
      {/* 1. TOP COCKPIT COMMAND BAR */}
      <header className="h-12 flex-shrink-0 bg-slate-900/95 border-b border-slate-800/90 px-3 flex items-center justify-between shadow-xl">
        {/* Left: Back button & Station details */}
        <div className="flex items-center space-x-3 overflow-hidden">
          <button
            onClick={onClose}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center space-x-1.5 transition shadow-md shadow-indigo-950 flex-shrink-0"
            title="กลับห้องควบคุม (หรือกดปุ่ม Esc)"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">กลับห้องควบคุม</span>
            <span className="text-[10px] opacity-75 font-mono">[Esc]</span>
          </button>

<div className="h-4 w-px bg-slate-800 hidden sm:block" />

          <div className="flex items-center space-x-2 truncate">
            <span className="font-mono font-black text-sm tracking-wide text-white" style={{ color: '#ffffff' }}>
              {serial}
            </span>
            <span className="text-xs text-slate-300 font-semibold truncate hidden md:inline">
              {device?.name || device?.province || 'สถานีตรวจวัดระดับน้ำ'}
            </span>
            <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-black/60 border border-slate-700 text-slate-300 font-bold">
              {isSurface ? 'SURFACE' : 'RIVER'}
            </span>
            {isEmerg ? (
              <span className="text-[9px] font-black uppercase px-2 py-0.2 rounded bg-rose-600 text-white border border-rose-400 animate-pulse shadow-sm shadow-rose-950">
                EMERGENCY
              </span>
            ) : isCrit ? (
              <span className="text-[9px] font-black uppercase px-2 py-0.2 rounded bg-rose-700 text-rose-100 border border-rose-500">
                CRITICAL
              </span>
            ) : isWarn ? (
              <span className="text-[9px] font-black uppercase px-2 py-0.2 rounded bg-amber-600 text-amber-100 border border-amber-500">
                WARNING
              </span>
            ) : (
              <span className="text-[9px] font-bold uppercase px-2 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                NORMAL ONLINE
              </span>
            )}
          </div>
        </div>

        {/* Right: Net Water Level cm + Refresh + Close */}
        <div className="flex items-center space-x-3 flex-shrink-0">
          <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 px-3 py-1 rounded-lg">
            <span className="text-[10px] uppercase font-bold text-slate-400">ระดับน้ำปัจจุบัน:</span>
            <span className="font-mono font-black text-sm text-cyan-400" style={{ color: '#22d3ee' }}>
              {device?.net_water_level_cm !== undefined && device?.net_water_level_cm !== null
                ? `${device.net_water_level_cm.toFixed(1)} cm`
                : '-'}
            </span>
            {device?.water_level_pct !== undefined && device?.water_level_pct !== null && (
              <span className="text-[10px] font-mono text-slate-400 font-bold">
                ({device.water_level_pct.toFixed(0)}%)
              </span>
            )}
          </div>

          <button
            onClick={() => {
              setIsRefreshing(true);
              fetchTelemetryData();
            }}
            className={`p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition ${
              isRefreshing ? 'animate-spin text-cyan-400' : ''
            }`}
            title="รีเฟรชข้อมูลล่าสุด"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={toggleFs}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white transition"
            title={isFullscreen ? "ออกจากเต็มจอ [F]" : "ขยายเต็มจอ Kiosk Mode [F]"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white transition"
            title="ปิดหน้าต่างเดี่ยว"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. MAIN COCKPIT VIEWPORT: 60% CCTV STREAM + 40% TELEMETRY & MINI MAP */}
      <div className="flex-1 min-h-0 w-full h-full flex flex-col lg:flex-row gap-2 p-2 overflow-hidden">
        {/* LEFT COLUMN: LARGE LIVE CCTV STREAM (60%) */}
        <div className="w-full lg:w-[60%] h-1/2 lg:h-full flex flex-col bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl relative">
          <div className="flex-1 min-h-0 w-full h-full relative">
            <RtspPlayer
              serial={serial}
              apiFetch={apiFetch}
              apiBaseUrl={apiBaseUrl}
              fillParent={true}
              hideControls={false}
              className="w-full h-full"
            />
          </div>
          <div className="h-7 bg-slate-900/90 border-t border-slate-800/80 px-2.5 flex items-center justify-between text-[10px] text-slate-400 flex-shrink-0">
            <div className="flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="font-mono text-slate-300">LIVE FEED ULTRA-HD</span>
            </div>
            <div className="flex items-center space-x-3 font-mono text-[9.5px]">
              <span>จังหวัด: {device?.province || '-'}</span>
              <span>ลุ่มน้ำ: {device?.basin || '-'}</span>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 24H HYDROLOGY GRAPH + TELEMETRY SPECS + MINI GIS MAP (40%) */}
        <div className="w-full lg:w-[40%] h-1/2 lg:h-full flex flex-col gap-2 min-h-0 overflow-hidden">
          {/* UPPER SECTION: 24-HOUR WATER LEVEL CHART (54%) */}
          <div className="flex-1 min-h-0 bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 shadow-xl flex flex-col backdrop-blur">
            <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-slate-800 flex-shrink-0">
              <div className="flex items-center space-x-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-xs font-bold text-slate-200">
                  กราฟระดับน้ำย้อนหลัง 24 ชั่วโมง
                </span>
              </div>
              {/* High Contrast Threshold Legend Pills */}
              <div className="flex items-center space-x-1.5 text-[9px] font-mono">
                {emergencyThresh && (
                  <span className="text-white bg-rose-600 px-2 py-0.5 rounded font-black shadow-sm" style={{ color: '#ffffff' }}>
                    ฉุกเฉิน: {emergencyThresh} cm
                  </span>
                )}
                {criticalThresh && (
                  <span className="text-white bg-rose-700 px-2 py-0.5 rounded font-bold shadow-sm" style={{ color: '#ffffff' }}>
                    วิกฤต: {criticalThresh} cm
                  </span>
                )}
                {warningThresh && (
                  <span className="text-white bg-amber-600 px-2 py-0.5 rounded font-bold shadow-sm" style={{ color: '#ffffff' }}>
                    เตือนภัย: {warningThresh} cm
                  </span>
                )}
              </div>
            </div>

            {/* Chart Area */}
            <div className="flex-1 min-h-0 w-full h-full relative">
              {loadingStats ? (
                <div className="w-full h-full flex items-center justify-center space-x-2 text-slate-400 text-xs">
                  <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <span>กำลังโหลดข้อมูลระดับน้ำ...</span>
                </div>
              ) : chartData.length === 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs space-y-1">
                  <CheckCircle2 className="w-6 h-6 text-slate-600" />
                  <span>ไม่มีข้อมูลระดับน้ำของวันนี้</span>
                </div>
              ) : (
                <WaterChart
                  data={chartData}
                  warningThresh={warningThresh}
                  criticalThresh={criticalThresh}
                  emergencyThresh={emergencyThresh}
                  gradientId={`cockpit-${serial}`}
                  showRawLine={false}
                  theme="dark"
                />
              )}
            </div>
          </div>

          {/* LOWER SECTION: TELEMETRY SPECS (50%) + MINI GIS MAP (50%) */}
          <div className="h-[46%] min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-2 flex-shrink-0">
            {/* BOX 1: DEVICE TELEMETRY SPECS */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 shadow-xl flex flex-col justify-between overflow-hidden backdrop-blur">
              <div className="flex items-center space-x-1.5 pb-1 border-b border-slate-800/80 flex-shrink-0">
                <Gauge className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[11px] font-bold text-slate-200">ข้อมูลอุปกรณ์และเซนเซอร์</span>
              </div>

              <div className="space-y-1.5 my-auto text-[10.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ระดับน้ำสุทธิ:</span>
                  <span className="font-mono font-bold text-white" style={{ color: '#ffffff' }}>
                    {device?.net_water_level_cm !== undefined && device?.net_water_level_cm !== null
                      ? `${device.net_water_level_cm.toFixed(1)} cm`
                      : '-'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ความจุลำน้ำ:</span>
                  <span className="font-mono font-bold text-cyan-300">
                    {device?.water_level_pct !== undefined && device?.water_level_pct !== null
                      ? `${device.water_level_pct.toFixed(1)}%`
                      : '-'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ความลึกท้องน้ำถึงตลิ่ง:</span>
                  <span className="font-mono text-slate-200">
                    {calcConfig?.bottom_to_bank_cm ?? device?.bottom_to_bank_cm ?? '-'} cm
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">ระยะตลิ่งถึงเซนเซอร์:</span>
                  <span className="font-mono text-slate-200">
                    {calcConfig?.bank_to_sensor_cm ?? device?.bank_to_sensor_cm ?? '-'} cm
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-400">โหมดคำนวณ:</span>
                  <span className="font-mono font-bold text-indigo-300">
                    {isSurface ? 'SURFACE (ผิวน้ำ)' : 'RIVER (ลำน้ำ)'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                  <span className="text-slate-500 text-[9.5px]">อัปเดตล่าสุด:</span>
                  <span className="font-mono text-[9.5px] text-slate-400 truncate max-w-[120px]">
                    {lastSeenStr}
                  </span>
                </div>
              </div>
            </div>

            {/* BOX 2: MINI TACTICAL GIS MAP WITH GPS COORDINATES */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 shadow-xl flex flex-col overflow-hidden backdrop-blur">
              <div className="flex items-center justify-between pb-1 border-b border-slate-800/80 flex-shrink-0">
                <div className="flex items-center space-x-1.5">
                  <MapPin className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-[11px] font-bold text-slate-200">พิกัดและตำแหน่งติดตั้ง</span>
                </div>
                {hasCoordinates && (
                  <span className="text-[8.5px] font-mono px-1 py-0.2 rounded bg-black/60 text-cyan-300 border border-cyan-800/50">
                    {latNum.toFixed(4)}, {lngNum.toFixed(4)}
                  </span>
                )}
              </div>

              {/* Mini Map Viewport */}
              <div className="flex-1 min-h-0 w-full h-full rounded-lg overflow-hidden relative border border-slate-800/80 mt-1">
                {hasCoordinates ? (
                  <RiverMap
                    devices={[device]}
                    height="100%"
                    className="w-full h-full"
                    compact={true}
                    disableCluster={true}
                    activeSerials={[serial]}
                  />
                ) : (
                  <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center text-slate-500 text-[10px] space-y-1">
                    <Compass className="w-5 h-5 text-slate-600" />
                    <span>ไม่ได้บันทึกพิกัด GPS</span>
                  </div>
                )}
                {/* Coordinates Watermark Overlay */}
                <div className="absolute bottom-1 left-1 z-[1000] bg-black/80 backdrop-blur px-1.5 py-0.5 rounded text-[8px] font-mono text-slate-300 border border-slate-700 pointer-events-none">
                  📍 {device?.province || 'ประเทศไทย'} • {device?.basin || 'ลุ่มน้ำ'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
