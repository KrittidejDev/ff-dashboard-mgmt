'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useAuth } from '@/context/AuthContext';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  Waves,
  RefreshCw,
  Maximize2,
  Minimize2,
  Tv2,
  Volume2,
  VolumeX,
  AlertTriangle,
  ShieldAlert,
  Activity,
  Radio,
  Eye,
  Sliders,
  Play,
  Pause,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  ArrowUpRight,
  Sparkles,
  MapPin,
  Clock,
  CheckCircle2,
  Keyboard,
  Zap,
} from 'lucide-react';
import { RtspPlayer } from '@/components/RtspPlayer';
import { SingleStationInspectionCockpit } from '@/components/SingleStationInspectionCockpit';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

// Dynamic import for RiverMap to prevent SSR Leaflet window errors
const RiverMap = dynamic(() => import('@/components/RiverMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[160px] rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-center flex-col space-y-2">
      <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
      <span className="text-[11px] text-slate-400 font-mono">Initializing GIS Engine...</span>
    </div>
  ),
});

// High-performance Sound Synthesizer via Web Audio API (Zero external assets needed)
class SoundFx {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  }

  playAlert(type: 'warning' | 'critical') {
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      const now = this.ctx.currentTime;
      if (type === 'critical') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.setValueAtTime(660, now + 0.15);
        osc.frequency.setValueAtTime(880, now + 0.3);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (e) {
      // Audio autoplay policy catch
    }
  }
}

const sfx = new SoundFx();

export type WarRoomStatusFilter = 'ALL' | 'EMERGENCY' | 'CRITICAL' | 'WARNING' | 'NORMAL' | 'OFFLINE';

export interface DeviceData {
  serial: string;
  name?: string;
  organization_name?: string;
  province?: string;
  basin?: string;
  install_latitude?: number | string;
  install_longitude?: number | string;
  sensor_mode?: string;
  warning_status?: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  net_water_level_cm?: number | null;
  water_level_pct?: number | null;
  last_seen?: string;
  bottom_to_bank_cm?: number;
  bank_to_sensor_cm?: number;
  offline_threshold_min?: number;
}

// ============================================================================
// MEMOIZED CAMERA TILE (100% Fit, Zero Overflow)
// ============================================================================
interface CameraTileProps {
  serial: string;
  slotIdx: number;
  device?: DeviceData;
  gridMode: '1x1' | '2x2' | '3x3' | '4x4';
  allDevices: DeviceData[];
  apiFetch: any;
  apiBaseUrl: string;
  onSlotStationChange: (slotIdx: number, newSerial: string) => void;
  onFocusSingle: (serial: string) => void;
}

const CameraTile = memo(function CameraTile({
  serial,
  slotIdx,
  device,
  gridMode,
  allDevices,
  apiFetch,
  apiBaseUrl,
  onSlotStationChange,
  onFocusSingle,
}: CameraTileProps) {
  const isCritical = device?.warning_status === 'CRITICAL';
  const isWarning = device?.warning_status === 'WARNING';
  const isSurface = device?.sensor_mode === 'SURFACE';
  const waterLevel = device?.net_water_level_cm;
  const isOffline = !device?.last_seen || (new Date().getTime() - new Date(device.last_seen).getTime()) > ((device.offline_threshold_min || 360) * 60 * 1000);

  return (
    <div
      className={`rounded-lg overflow-hidden flex flex-col bg-slate-950 border transition-all duration-200 h-full w-full min-h-0 shadow-md ${
        isCritical
          ? 'border-rose-500 shadow-rose-900/30 ring-1 ring-rose-500/80 animate-pulse'
          : isWarning
          ? 'border-amber-500/80 shadow-amber-900/20'
          : 'border-slate-800 hover:border-slate-700'
      }`}
    >
      {/* 1. SEPARATE TOP TITLE BAR (Zero Overlap with Video Timestamp OSD) */}
      <div className="h-6 sm:h-7 bg-slate-900/95 border-b border-slate-800/90 px-1.5 sm:px-2 flex items-center justify-between flex-shrink-0 text-xs select-none">
        {/* Left: Indicator + Station Identity (Clickable to open Cockpit) */}
        <div 
          onClick={() => onFocusSingle(serial)} 
          className="flex items-center space-x-1.5 overflow-hidden min-w-0 cursor-pointer hover:opacity-90 transition"
          title="คลิกเพื่อดูรายละเอียดสถานีพร้อมกราฟและข้อมูลอุปกรณ์"
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              device?.warning_status === 'EMERGENCY'
                ? 'bg-rose-500 animate-ping'
                : isCritical
                ? 'bg-rose-500 animate-pulse'
                : isWarning
                ? 'bg-amber-400'
                : isOffline
                ? 'bg-slate-600'
                : 'bg-emerald-400'
            }`}
          />
          <span
            className="font-mono font-black text-white text-[10px] sm:text-[11px] tracking-wide truncate"
            style={{ color: '#ffffff' }}
          >
            {serial}
          </span>
          {device?.warning_status === 'EMERGENCY' ? (
            <span className="text-[7.5px] font-black px-1.5 py-0.2 rounded bg-rose-600 text-white border border-rose-400 animate-pulse flex-shrink-0 shadow-sm shadow-rose-950">
              EMERGENCY
            </span>
          ) : isCritical ? (
            <span className="text-[7.5px] font-black px-1 py-0.2 rounded bg-rose-700 text-rose-100 border border-rose-500 flex-shrink-0">
              CRITICAL
            </span>
          ) : isWarning ? (
            <span className="text-[7.5px] font-black px-1 py-0.2 rounded bg-amber-600 text-amber-100 border border-amber-500 flex-shrink-0">
              WARNING
            </span>
          ) : isOffline ? (
            <span className="text-[7.5px] font-black px-1 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 flex-shrink-0">
              OFFLINE
            </span>
          ) : null}
        </div>

        {/* Right: Water Depth Badge + Slot Switcher + Maximize */}
        <div className="flex items-center space-x-1 flex-shrink-0">
          {waterLevel !== undefined && waterLevel !== null && (
            <div
              className={`px-1.5 py-0.2 rounded font-mono font-black text-[9px] sm:text-[10px] border shadow-sm ${
                device?.warning_status === 'EMERGENCY'
                  ? 'bg-rose-950 text-white border-rose-500 shadow-rose-900/60 animate-pulse'
                  : isCritical
                  ? 'bg-rose-950 text-rose-200 border-rose-700'
                  : isWarning
                  ? 'bg-amber-950 text-amber-200 border-amber-700'
                  : 'bg-emerald-950 text-emerald-300 border-emerald-700'
              }`}
            >
              {waterLevel.toFixed(1)} cm
            </div>
          )}

          {/* Quick Slot Station Picker */}
          <select
            value={serial}
            onChange={(e) => onSlotStationChange(slotIdx, e.target.value)}
            className="bg-black border border-slate-700 rounded text-[9px] text-slate-200 px-1 py-0.2 outline-none cursor-pointer max-w-[65px] transition"
            title="เปลี่ยนกล้องประจำช่องนี้"
          >
            {allDevices.map((d) => (
              <option key={d.serial} value={d.serial} className="bg-slate-900 text-white">
                {d.serial} - {d.name || d.province || ''}
              </option>
            ))}
          </select>

          {/* Focus Button */}
          {gridMode !== '1x1' && (
            <button
              onClick={() => onFocusSingle(serial)}
              title="ขยายกล้องนี้เดี่ยวเต็มจอ"
              className="p-0.5 rounded bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white transition"
            >
              <Maximize2 className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 2. UNCLUTTERED VIDEO FRAME (100% Clean Video Stream, No UI Collisions) */}
      {isOffline ? (
        <div 
          onClick={() => onFocusSingle(serial)}
          className="flex-1 min-h-0 w-full h-full relative flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-2 text-center select-none cursor-pointer hover:bg-slate-900/60 transition"
          title="คลิกเพื่อดูรายละเอียดสถานีพร้อมกราฟและข้อมูลอุปกรณ์"
        >
          <div className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-1 shadow-inner">
            <Radio className="w-4 h-4 text-slate-500" />
          </div>
          <span className="text-[10px] sm:text-[11px] font-black text-rose-400 font-mono tracking-wider">
            STATION OFFLINE
          </span>
          <span className="text-[8.5px] text-slate-500">
            ขาดสัญญาณการเชื่อมต่อ
          </span>
          {device?.last_seen && (
            <span className="text-[8px] text-slate-600 font-mono mt-0.5">
              อัปเดตล่าสุด: {new Date(device.last_seen).toLocaleDateString('th-TH')} {new Date(device.last_seen).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      ) : (
        <div 
          onClick={() => onFocusSingle(serial)}
          className="flex-1 min-h-0 w-full h-full relative overflow-hidden bg-black flex items-center justify-center cursor-pointer"
          title="คลิกเพื่อดูรายละเอียดสถานีพร้อมกราฟและข้อมูลอุปกรณ์"
        >
          <RtspPlayer
            serial={serial}
            apiFetch={apiFetch}
            apiBaseUrl={apiBaseUrl}
            fillParent={true}
            hideControls={true}
            onVideoClick={() => onFocusSingle(serial)}
            className="w-full h-full object-contain"
          />
        </div>
      )}

      {/* 3. SEPARATE BOTTOM STATUS STRIP */}
      <div 
        onClick={() => onFocusSingle(serial)}
        className="h-4 sm:h-5 bg-slate-950/95 border-t border-slate-900 px-2 flex items-center justify-between text-[8.5px] sm:text-[9px] text-slate-400 flex-shrink-0 select-none cursor-pointer hover:text-slate-200 transition"
        title="คลิกเพื่อดูรายละเอียดสถานีพร้อมกราฟและข้อมูลอุปกรณ์"
      >
        <span className="font-mono text-slate-400 truncate max-w-[120px]">
          {isSurface ? 'SURFACE' : 'RIVER'} {device?.name ? `• ${device.name}` : ''}
        </span>
        <Link
          href={`/dashboard/river/${serial}`}
          target="_blank"
          className="flex items-center gap-0.5 text-indigo-400 hover:text-indigo-300 transition"
        >
          <span>Telemetry</span>
          <ArrowUpRight className="w-2.5 h-2.5" />
        </Link>
      </div>
    </div>
  );
});

// ============================================================================
// MAIN RIVER WAR ROOM COMPONENT
// ============================================================================
export default function RiverWarRoomPage() {
  const { apiFetch } = useAuth();
  const warroomRef = useRef<HTMLDivElement>(null);

  // Core Data States
  const [devices, setDevices] = useState<DeviceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  // Video Wall Grid Configuration: '1x1' | '2x2' | '3x3'
  const [gridMode, setGridMode] = useState<'1x1' | '2x2' | '3x3' | '4x4'>('3x3');
  const [selectedSerials, setSelectedSerials] = useState<string[]>([]);

  // Auto-Cycle Engine States
  const [isAutoCycling, setIsAutoCycling] = useState<boolean>(true);
  const [cycleIntervalSec, setCycleIntervalSec] = useState<number>(60);
  const [cycleCountdown, setCycleCountdown] = useState<number>(60);
  const [focusedStationSerial, setFocusedStationSerial] = useState<string | null>(null);
  const [cyclePageIndex, setCyclePageIndex] = useState<number>(0);
  const [slotOverrides, setSlotOverrides] = useState<Record<number, string>>({});

  // Sound Alarm & Presentation Settings
  const [isMuted, setIsMuted] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  // WarRoom Status Filter state
  const [statusFilter, setStatusFilter] = useState<WarRoomStatusFilter>('ALL');
  const [showHotkeysHelp, setShowHotkeysHelp] = useState<boolean>(false);

  const prevCriticalCountRef = useRef<number>(0);

  // 1. Clock Engine (Tick every second)
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeStr(
        now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch Devices & Hydrology Telemetry
  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/river/devices`);
      if (res.ok) {
        const data = await res.json();
        const devList: DeviceData[] = Array.isArray(data) ? data : data.devices || [];
        setDevices(devList);

        const currentCriticalCount = devList.filter((d) => d.warning_status === 'CRITICAL').length;
        if (currentCriticalCount > prevCriticalCountRef.current) {
          if (!isMuted) {
            sfx.playAlert('critical');
          }
        }
        prevCriticalCountRef.current = currentCriticalCount;
      }
    } catch (err) {
      console.error('[WarRoom] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, isMuted]);

  useEffect(() => {
    fetchTelemetry();
    const pollTimer = setInterval(fetchTelemetry, 15000);
    return () => clearInterval(pollTimer);
  }, [fetchTelemetry]);

  // Helper to determine offline status (matches River main dashboard)
  const isDeviceOffline = useCallback((d: DeviceData) => {
    if (!d.last_seen) return true;
    const lastSeenTime = new Date(d.last_seen).getTime();
    const nowTime = new Date().getTime();
    const thresholdMinutes = d.offline_threshold_min || 360;
    return nowTime - lastSeenTime > thresholdMinutes * 60 * 1000;
  }, []);

  // 3. DETERMINISTIC STATION SORTERS (Strict Serial / Alphanumeric Order, Stable & Non-jumping)
  const sortedStations = useMemo(() => {
    return [...devices].sort((a, b) =>
      (a.serial || '').localeCompare(b.serial || '', undefined, { numeric: true })
    );
  }, [devices]);

  const alertStations = useMemo(() => {
    return sortedStations.filter(
      (d) => d.warning_status === 'EMERGENCY' || d.warning_status === 'CRITICAL' || d.warning_status === 'WARNING'
    );
  }, [sortedStations]);

  // 3.1 Single-pass O(N) Status Counts for High-Performance UI Badges
  const statusCounts = useMemo(() => {
    let emergency = 0;
    let critical = 0;
    let warning = 0;
    let normal = 0;
    let offline = 0;

    for (let i = 0; i < devices.length; i++) {
      const d = devices[i];
      const isOff = isDeviceOffline(d);
      if (isOff) offline++;
      if (d.warning_status === 'EMERGENCY') emergency++;
      else if (d.warning_status === 'CRITICAL') critical++;
      else if (d.warning_status === 'WARNING') warning++;
      else if (!isOff) normal++;
    }

    return {
      all: devices.length,
      emergency,
      critical,
      warning,
      normal,
      offline,
    };
  }, [devices, isDeviceOffline]);

  // 3.2 Filtered Stations (Strict Serial Numerical Order, No Randomness, No Pinning)
  const filteredStations = useMemo(() => {
    let list: any[] = [];
    switch (statusFilter) {
      case 'EMERGENCY':
        list = devices.filter((d) => d.warning_status === 'EMERGENCY');
        break;
      case 'CRITICAL':
        list = devices.filter((d) => d.warning_status === 'CRITICAL');
        break;
      case 'WARNING':
        list = devices.filter((d) => d.warning_status === 'WARNING');
        break;
      case 'NORMAL':
        list = devices.filter((d) => (!d.warning_status || d.warning_status === 'NORMAL') && !isDeviceOffline(d));
        break;
      case 'OFFLINE':
        list = devices.filter((d) => isDeviceOffline(d));
        break;
      case 'ALL':
      default:
        list = devices;
        break;
    }
    return [...list].sort((a, b) =>
      (a.serial || '').localeCompare(b.serial || '', undefined, { numeric: true })
    );
  }, [statusFilter, devices, isDeviceOffline]);

  // 4. Grid Slots Calculation based on gridMode
  const activeSlotsCount = useMemo(() => {
    switch (gridMode) {
      case '1x1': return 1;
      case '2x2': return 4;
      case '3x3': return 9;
      case '4x4': return 16;
      default: return 9;
    }
  }, [gridMode]);

  // Total Pages and Current Page index
  const totalPoolCount = filteredStations.length;
  const totalPages = Math.max(1, Math.ceil(totalPoolCount / activeSlotsCount));
  const safePageIndex = totalPages > 0 ? ((cyclePageIndex % totalPages) + totalPages) % totalPages : 0;

  // Reset page index and overrides when filter or gridMode changes
  useEffect(() => {
    setCyclePageIndex(0);
    setSlotOverrides({});
    setCycleCountdown(cycleIntervalSec);
  }, [statusFilter, gridMode, cycleIntervalSec]);

  // 4. Default Slot Allocation on first load
  useEffect(() => {
    if (devices.length > 0 && selectedSerials.length === 0) {
      const initialSerials = sortedStations.slice(0, 9).map((d) => d.serial);
      setSelectedSerials(initialSerials);
    }
  }, [devices, sortedStations, selectedSerials.length]);

  // 6. AUTO-CYCLE PATROL ENGINE (Sequential Batch By Batch, No Pinning, Rock Solid)
  const totalPagesRef = useRef(totalPages);
  totalPagesRef.current = totalPages;

  useEffect(() => {
    if (!isAutoCycling) return;

    setCycleCountdown(cycleIntervalSec);

    const interval = setInterval(() => {
      setCycleCountdown((prev) => {
        if (prev <= 1) {
          // Strictly advance to next batch in sequential order
          setSlotOverrides({}); // clear manual overrides on new batch
          setCyclePageIndex((currPage) => {
            const maxP = totalPagesRef.current;
            return (currPage + 1) % maxP;
          });
          return cycleIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isAutoCycling, cycleIntervalSec]);

  // Manual Previous / Next Batch Handlers
  const handlePrevBatch = () => {
    setSlotOverrides({});
    setCyclePageIndex((prev) => (prev - 1 + totalPages) % totalPages);
    setCycleCountdown(cycleIntervalSec);
  };

  const handleNextBatch = () => {
    setSlotOverrides({});
    setCyclePageIndex((prev) => (prev + 1) % totalPages);
    setCycleCountdown(cycleIntervalSec);
  };

  // 7. DISPLAYED SERIALS (STRICT SEQUENTIAL BATCHING + IMMEDIATE SLOT OVERRIDE GUARANTEE)
  const displayedSerials = useMemo(() => {
    if (totalPoolCount === 0) {
      return [];
    }

    const startIdx = safePageIndex * activeSlotsCount;
    const batch = filteredStations.slice(startIdx, startIdx + activeSlotsCount);
    const base = batch.map((d) => d.serial);

    // If batch has fewer items than activeSlotsCount, fill from start of pool
    while (base.length < activeSlotsCount && base.length < totalPoolCount) {
      const candidate = filteredStations.find((d) => !base.includes(d.serial));
      if (candidate) base.push(candidate.serial);
      else break;
    }

    // Apply manual slot overrides immediately!
    return base.map((serial, idx) => slotOverrides[idx] || serial);
  }, [
    filteredStations,
    safePageIndex,
    activeSlotsCount,
    totalPoolCount,
    slotOverrides,
  ]);

  // 8. Fullscreen Toggle (Target containerRef to isolate War Room from Sidebar)
  const toggleFullscreen = useCallback(() => {
    const el = warroomRef.current;
    if (!document.fullscreenElement) {
      if (el && el.requestFullscreen) {
        el.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {
          document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
        });
      } else {
        document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      }
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // 9. Tactical Keyboard Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      switch (e.key) {
        case '1':
          setGridMode('1x1');
          break;
        case '2':
          setGridMode('2x2');
          break;
        case '3':
          setGridMode('3x3');
          break;
        case '4':
          setGridMode('4x4');
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          setIsMuted((prev) => !prev);
          break;
        case 'r':
        case 'R':
          fetchTelemetry();
          break;
        case ' ':
          e.preventDefault();
          setIsAutoCycling((prev) => !prev);
          break;
        case '?':
          setShowHotkeysHelp((prev) => !prev);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleFullscreen, fetchTelemetry]);

  // 10. Slot change and focus helpers (Immediate slot override + auto-pause)
  const handleSlotStationChange = useCallback((slotIndex: number, newSerial: string) => {
    // 1. Immediately pause auto-cycling so the user's selected camera is NOT rotated away!
    setIsAutoCycling(false);
    // 2. Set slot override so the slot in the grid changes to newSerial INSTANTLY
    setSlotOverrides((prev) => ({
      ...prev,
      [slotIndex]: newSerial,
    }));
  }, []);

  const openSingleStationView = useCallback((serial: string) => {
    setFocusedStationSerial(serial);
    setIsAutoCycling(false); // PAUSE/STOP Auto-Cycle when entering single station view
  }, []);

  const closeSingleStationView = useCallback(() => {
    setFocusedStationSerial(null);
    setIsAutoCycling(true); // RESUME Auto-Cycle immediately upon returning to video wall!
    setCycleCountdown(cycleIntervalSec);
  }, [cycleIntervalSec]);

  const focusStationOnWall = useCallback((serial: string) => {
    setSelectedSerials((prev) => {
      const next = [serial, ...prev.filter((s) => s !== serial)];
      return next;
    });
    // Open full inspection cockpit view
    openSingleStationView(serial);
  }, [openSingleStationView]);

  const handleFocusSingle = useCallback((serial: string) => {
    setSelectedSerials((prev) => [serial, ...prev.filter((s) => s !== serial)]);
    openSingleStationView(serial);
  }, [openSingleStationView]);

  // Status Tab Selection with instant camera allocation
  const handleSelectStatusTab = useCallback((tab: WarRoomStatusFilter) => {
    setStatusFilter(tab);
    setCyclePageIndex(0);
    setSlotOverrides({});
    let subset: DeviceData[] = [];
    if (tab === 'ALL') subset = sortedStations;
    else if (tab === 'EMERGENCY') subset = devices.filter((d) => d.warning_status === 'EMERGENCY');
    else if (tab === 'CRITICAL') subset = devices.filter((d) => d.warning_status === 'CRITICAL');
    else if (tab === 'WARNING') subset = devices.filter((d) => d.warning_status === 'WARNING');
    else if (tab === 'NORMAL') subset = devices.filter((d) => (!d.warning_status || d.warning_status === 'NORMAL') && !isDeviceOffline(d));
    else if (tab === 'OFFLINE') subset = devices.filter((d) => isDeviceOffline(d));

    if (subset.length > 0) {
      setSelectedSerials(subset.slice(0, activeSlotsCount).map((d) => d.serial));
    }
  }, [sortedStations, devices, isDeviceOffline, activeSlotsCount]);


  // KPI Metrics Calculation (High-Performance O(N))
  const kpi = useMemo(() => {
    const total = devices.length;
    let emergency = 0;
    let critical = 0;
    let warning = 0;
    let normal = 0;
    let offline = 0;
    let maxLevel = 0;
    let maxStation = '-';

    devices.forEach((d) => {
      const isOff = isDeviceOffline(d);
      if (isOff) offline++;
      if (d.warning_status === 'EMERGENCY') emergency++;
      else if (d.warning_status === 'CRITICAL') critical++;
      else if (d.warning_status === 'WARNING') warning++;
      else if (!isOff) normal++;

      const lvl = d.net_water_level_cm || 0;
      if (lvl > maxLevel) {
        maxLevel = lvl;
        maxStation = `${d.serial} (${d.name || d.province || ''})`;
      }
    });

    return { total, emergency, critical, warning, normal, offline, maxLevel, maxStation };
  }, [devices, isDeviceOffline]);

  return (
    <div
      ref={warroomRef}
      className={`relative warroom-noc bg-[#070b14] text-slate-100 flex flex-col font-sans select-none overflow-hidden ${
        isFullscreen
          ? 'fixed inset-0 z-[9999] w-screen h-screen p-2 max-h-screen'
          : 'h-[calc(100vh-1rem)] w-full p-2'
      }`}
    >
      {/* 1. TOP COMMAND BAR & EMERGENCY STATUS STRIP (Slim, Non-Wrapping & Always Visible Controls) */}
      <header className="h-12 flex-shrink-0 bg-slate-900/95 backdrop-blur border border-slate-800/80 rounded-xl px-2.5 sm:px-3 mb-2 shadow-lg flex items-center justify-between gap-2 relative z-30">
        {/* Left: Branding */}
        <div className="flex items-center space-x-2 sm:space-x-2.5 flex-shrink-0">
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-indigo-700 shadow-md shadow-rose-900/30 flex-shrink-0">
            <Radio className="w-4 h-4 text-white animate-pulse" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <h1 className="text-sm font-black tracking-wider uppercase text-white flex items-center gap-1.5 whitespace-nowrap">
              <span className="hidden sm:inline">RIVER COMMAND </span>WAR ROOM
              <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold uppercase tracking-widest hidden md:inline">
                LIVE NOC
              </span>
            </h1>
          </div>
        </div>

        {/* Center: Real-Time Tactical KPI Strip (Single Row, Scroll-safe, Never pushes Controls) */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 justify-start md:justify-center">
          <div className="bg-slate-950/70 border border-slate-800 px-2 py-1 rounded-lg flex items-center space-x-1 sm:space-x-1.5 flex-shrink-0">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Total</span>
            <span className="text-xs font-black font-mono text-slate-200">{kpi.total}</span>
          </div>

          <div className="bg-emerald-950/40 border border-emerald-800/40 px-2 py-1 rounded-lg flex items-center space-x-1 sm:space-x-1.5 flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span className="text-[10px] text-emerald-300 font-semibold uppercase">Normal</span>
            <span className="text-xs font-black font-mono text-emerald-400">{kpi.normal}</span>
          </div>

          <div
            className={`px-2 py-1 rounded-lg flex items-center space-x-1 sm:space-x-1.5 border transition flex-shrink-0 ${
              kpi.warning > 0
                ? 'bg-amber-950/60 border-amber-600/50 text-amber-300 animate-pulse'
                : 'bg-slate-950/60 border-slate-800/60 text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${kpi.warning > 0 ? 'bg-amber-400' : 'bg-slate-600'}`}
            ></span>
            <span className="text-[10px] font-semibold uppercase">Warning</span>
            <span className="text-xs font-black font-mono">{kpi.warning}</span>
          </div>

          {/* Emergency KPI */}
          <div
            onClick={() => handleSelectStatusTab('EMERGENCY')}
            className={`cursor-pointer px-2 py-1 rounded-lg flex items-center space-x-1 sm:space-x-1.5 border transition flex-shrink-0 ${
              kpi.emergency > 0
                ? 'bg-rose-950 border-rose-500 text-white shadow-lg shadow-rose-900/50 animate-pulse ring-1 ring-rose-400'
                : 'bg-slate-950/60 border-slate-800/60 text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                kpi.emergency > 0 ? 'bg-rose-500 animate-ping' : 'bg-slate-600'
              }`}
            ></span>
            <span className="text-[10px] font-black uppercase tracking-wider">Emergency</span>
            <span className="text-xs font-black font-mono text-rose-300">{kpi.emergency}</span>
          </div>

          {/* Critical KPI */}
          <div
            onClick={() => handleSelectStatusTab('CRITICAL')}
            className={`cursor-pointer px-2 py-1 rounded-lg flex items-center space-x-1 sm:space-x-1.5 border transition flex-shrink-0 ${
              kpi.critical > 0
                ? 'bg-rose-950/80 border-rose-600 text-rose-300 shadow-md shadow-rose-900/40 animate-pulse'
                : 'bg-slate-950/60 border-slate-800/60 text-slate-400'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                kpi.critical > 0 ? 'bg-rose-500 animate-ping' : 'bg-slate-600'
              }`}
            ></span>
            <span className="text-[10px] font-black uppercase tracking-wider">Critical</span>
            <span className="text-xs font-black font-mono text-rose-400">{kpi.critical}</span>
          </div>

          {kpi.maxLevel > 0 && (
            <div className="hidden 2xl:flex items-center space-x-1.5 bg-indigo-950/40 border border-indigo-700/50 px-2 py-1 rounded-lg flex-shrink-0">
              <Activity className="w-3 h-3 text-indigo-400" />
              <span className="text-[10px] text-indigo-300 font-semibold">Peak:</span>
              <span className="text-xs font-black font-mono text-indigo-200">
                {kpi.maxLevel.toFixed(1)} cm
              </span>
            </div>
          )}
        </div>

        {/* Right: Master War Room Controls (Sticky, Never Hidden, Guaranteed Visibility) */}
        <div className="flex items-center space-x-1.5 flex-shrink-0 z-30 sticky right-0 bg-slate-900/95 pl-1.5 py-0.5 ml-auto">
          <div className="hidden xl:flex bg-slate-950/90 border border-slate-800 text-slate-200 font-mono text-xs px-2.5 py-1 rounded-lg items-center space-x-1 shadow-inner">
            <Clock className="w-3 h-3 text-indigo-400" />
            <span className="font-bold tracking-wider">{currentTimeStr || '--:--:--'}</span>
          </div>

          <button
            onClick={() => {
              const nextState = !isMuted;
              setIsMuted(nextState);
              if (!nextState) sfx.playAlert('warning');
            }}
            title={isMuted ? 'เปิดเสียงเตือนภัย [Hotkey: M]' : 'ปิดเสียงเตือนภัย [Hotkey: M]'}
            className={`p-1.5 rounded-lg border transition ${
              !isMuted
                ? 'bg-rose-600 border-rose-500 text-white shadow-md shadow-rose-600/30 animate-pulse'
                : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {!isMuted ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setShowHotkeysHelp(!showHotkeysHelp)}
            title="ดูปุ่มลัดคีย์บอร์ด [Hotkey: ?]"
            className={`p-1.5 rounded-lg border transition hidden sm:inline-flex ${
              showHotkeysHelp
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-slate-800/80 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={fetchTelemetry}
            disabled={loading}
            title="รีเฟรชข้อมูล [Hotkey: R]"
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {/* Primary High-Contrast Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            title={
              isFullscreen
                ? 'ออกจากโหมดเต็มจอ [Hotkey: F]'
                : 'ขยายเต็มหน้าจอ Kiosk Mode [Hotkey: F]'
            }
            className="px-2.5 sm:px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 border border-indigo-400 text-white shadow-md shadow-indigo-600/40 transition flex items-center gap-1.5 font-bold text-xs ring-1 ring-indigo-300/40 hover:scale-[1.02] active:scale-[0.98]"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="whitespace-nowrap">{isFullscreen ? 'ออกเต็มจอ' : 'เต็มจอ [F]'}</span>
          </button>

          <Link
            href="/dashboard/river"
            className="hidden sm:inline-flex text-xs font-semibold px-2 sm:px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-700 transition items-center gap-1"
          >
            <span>Overview</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </Link>
        </div>
      </header>

      {/* HOTKEYS CHEATSHEET OVERLAY */}
      {showHotkeysHelp && (
        <div className="bg-slate-900 border border-indigo-500/50 p-2.5 rounded-xl mb-2 flex flex-wrap items-center justify-between gap-2 text-xs shadow-xl animate-in fade-in slide-in-from-top duration-150 flex-shrink-0">
          <div className="flex items-center space-x-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-bold text-white uppercase tracking-wider text-[11px]">
              NOC Tactical Hotkeys:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="px-1.5 py-0.2 rounded bg-black/60 border border-slate-700 font-mono text-amber-300">
              [1] 1x1
            </span>
            <span className="px-1.5 py-0.2 rounded bg-black/60 border border-slate-700 font-mono text-amber-300">
              [2] 2x2
            </span>
            <span className="px-1.5 py-0.2 rounded bg-black/60 border border-slate-700 font-mono text-amber-300">
              [3] 3x3
            </span>
            <span className="px-1.5 py-0.2 rounded bg-black/60 border border-slate-700 font-mono text-amber-300">
              [4] 4x4 (16 กล้อง)
            </span>
            <span className="px-1.5 py-0.2 rounded bg-black/60 border border-slate-700 font-mono text-amber-300">
              [Space] Cycle
            </span>
            <span className="px-1.5 py-0.2 rounded bg-black/60 border border-slate-700 font-mono text-amber-300">
              [F] Fullscreen
            </span>
            <span className="px-1.5 py-0.2 rounded bg-black/60 border border-slate-700 font-mono text-amber-300">
              [M] Mute
            </span>
            <span className="px-1.5 py-0.2 rounded bg-black/60 border border-slate-700 font-mono text-amber-300">
              [R] Refresh
            </span>
          </div>
          <button
            onClick={() => setShowHotkeysHelp(false)}
            className="text-slate-400 hover:text-white text-xs px-1"
          >
            ✕ ปิด
          </button>
        </div>
      )}

      {/* 4. FULL-SCREEN SINGLE STATION INSPECTION COCKPIT (WHEN STATION FOCUSED) */}
      {focusedStationSerial && (
        <SingleStationInspectionCockpit
          serial={focusedStationSerial}
          device={devices.find((d) => d.serial === focusedStationSerial)}
          apiFetch={apiFetch}
          apiBaseUrl={API_BASE_URL}
          onClose={closeSingleStationView}
        />
      )}

      {/* 2. MAIN SPLIT WORKSPACE: 100% HEIGHT ALLOCATION, ZERO OVERFLOW */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-12 gap-2 h-full overflow-hidden">
        
        {/* LEFT COLUMN: MULTI-CAMERA CCTV VIDEO WALL (100% Fit) */}
        <section className="xl:col-span-7 2xl:col-span-8 h-full flex flex-col min-h-0 bg-slate-900/60 border border-slate-800/80 rounded-xl p-2 shadow-xl backdrop-blur overflow-hidden">
          {/* Video Wall Tool Bar (Slim) */}
          <div className="h-7 flex-shrink-0 flex items-center justify-between pb-1.5 mb-1 border-b border-slate-800/80 gap-2">
            <div className="flex items-center space-x-1.5">
              <Tv2 className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
                Multi-CCTV Wall Matrix
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                ({displayedSerials.length} active streams)
              </span>
            </div>

            {/* Grid Switchers, Auto Cycle & Cycle Speed Controls */}
            <div className="flex items-center space-x-1.5">
              {/* Auto-Cycle Control Pill (Sleek, Single-Line, Never Wrapping) */}
              <div className="flex items-center rounded-lg bg-slate-950/90 border border-slate-800 p-0.5 shadow-inner flex-shrink-0 whitespace-nowrap">
                <button
                  onClick={() => setIsAutoCycling(!isAutoCycling)}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold transition whitespace-nowrap ${
                    isAutoCycling
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                  }`}
                  title={
                    isAutoCycling
                      ? `ระบบกำลังวนกล้องอัตโนมัติ (เปลี่ยนชุดถัดไปใน ${cycleCountdown} วินาที) [Space]`
                      : 'เริ่มระบบวนกล้องอัตโนมัติ [Space]'
                  }
                >
                  {isAutoCycling ? (
                    <>
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                      </span>
                      <span>วนกล้องอัตโนมัติ</span>
                      <span className="font-mono text-emerald-200 bg-emerald-950 px-1 py-0.2 rounded text-[9.5px] border border-emerald-600/50">
                        {cycleCountdown}s
                      </span>
                    </>
                  ) : (
                    <>
                      <Play className="w-2.5 h-2.5 text-slate-300 fill-slate-300" />
                      <span>เริ่มวนกล้อง</span>
                    </>
                  )}
                </button>

                {isAutoCycling && (
                  <div className="flex items-center pl-1 pr-0.5 border-l border-slate-800 ml-1">
                    <select
                      value={cycleIntervalSec}
                      onChange={(e) => {
                        const sec = Number(e.target.value);
                        setCycleIntervalSec(sec);
                        setCycleCountdown(sec);
                      }}
                      className="bg-transparent text-[9.5px] font-mono text-slate-300 outline-none cursor-pointer py-0.5 pr-1 hover:text-white"
                      title="ปรับรอบเวลาการสลับชุดกล้อง"
                    >
                      <option value={15} className="bg-slate-900 text-white">15s</option>
                      <option value={30} className="bg-slate-900 text-white">30s</option>
                      <option value={60} className="bg-slate-900 text-white">60s</option>
                      <option value={120} className="bg-slate-900 text-white">120s</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Batch Controls (Sequential Pagination Indicator & Next/Prev) */}
              {totalPoolCount > 0 && (
                <div className="flex items-center space-x-1 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-[10px]">
                  <button
                    onClick={handlePrevBatch}
                    className="p-0.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                    title="ชุดก่อนหน้า"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <span className="font-mono text-cyan-300 font-bold px-1 whitespace-nowrap text-[9.5px]">
                    ชุด {safePageIndex + 1}/{totalPages}
                    <span className="text-slate-400 font-normal hidden sm:inline ml-1">
                      ({safePageIndex * activeSlotsCount + 1}-{Math.min((safePageIndex + 1) * activeSlotsCount, totalPoolCount)}/{totalPoolCount})
                    </span>
                  </span>
                  <button
                    onClick={handleNextBatch}
                    className="p-0.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                    title="ชุดถัดไป"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Grid Mode Selection */}
              <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800 text-[10px]">
                <button
                  onClick={() => setGridMode('1x1')}
                  className={`px-2 py-0.5 font-bold rounded transition ${
                    gridMode === '1x1'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="มุมมอง 1 กล้องเดี่ยว [Hotkey: 1]"
                >
                  1x1
                </button>
                <button
                  onClick={() => setGridMode('2x2')}
                  className={`px-2 py-0.5 font-bold rounded transition ${
                    gridMode === '2x2'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="มุมมอง 4 กล้อง (2x2) [Hotkey: 2]"
                >
                  2x2
                </button>
                <button
                  onClick={() => setGridMode('3x3')}
                  className={`px-2 py-0.5 font-bold rounded transition ${
                    gridMode === '3x3'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="มุมมอง 9 กล้อง (3x3) [Hotkey: 3]"
                >
                  3x3
                </button>
                <button
                  onClick={() => setGridMode('4x4')}
                  className={`px-2 py-0.5 font-bold rounded transition ${
                    gridMode === '4x4'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="มุมมอง 16 กล้อง (4x4) [Hotkey: 4]"
                >
                  4x4
                </button>
              </div>
            </div>
          </div>

          {/* Adaptive Video Wall Grid Viewport: Exactly 100% Height */}
          <div className="flex-1 min-h-0 w-full h-full overflow-hidden">
            {displayedSerials.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-950/80 border border-slate-800/80 rounded-xl text-slate-300 space-y-2.5 p-6 backdrop-blur">
                <CheckCircle2 className="w-12 h-12 text-emerald-400 animate-pulse" />
                <div className="text-center">
                  <p className="text-sm font-bold text-white">ไม่มีสถานีในสถานะ {statusFilter}</p>
                  <p className="text-xs text-slate-400 mt-0.5">No active cameras match this status filter</p>
                </div>
                <button
                  onClick={() => handleSelectStatusTab('ALL')}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-indigo-900/40"
                >
                  กลับสู่มุมมองทั้งหมด (View All Stations)
                </button>
              </div>
            ) : (
              <div
                className={`w-full h-full grid ${
                  displayedSerials.length === 1
                    ? 'grid-cols-1 grid-rows-1'
                    : displayedSerials.length <= 4 && gridMode !== '3x3' && gridMode !== '4x4'
                    ? 'grid-cols-2 grid-rows-2 gap-1.5'
                    : gridMode === '1x1'
                    ? 'grid-cols-1 grid-rows-1'
                    : gridMode === '2x2'
                    ? 'grid-cols-2 grid-rows-2 gap-1.5'
                    : gridMode === '3x3'
                    ? 'grid-cols-3 grid-rows-3 gap-1'
                    : 'grid-cols-4 grid-rows-4 gap-0.5'
                }`}
              >
                {displayedSerials.map((serial, slotIdx) => {
                  const device = devices.find((d) => d.serial === serial);
                  return (
                    <CameraTile
                      key={`${serial}-${slotIdx}`}
                      serial={serial}
                      slotIdx={slotIdx}
                      device={device}
                      gridMode={gridMode}
                      allDevices={devices}
                      apiFetch={apiFetch}
                      apiBaseUrl={API_BASE_URL}
                      onSlotStationChange={handleSlotStationChange}
                      onFocusSingle={handleFocusSingle}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT COLUMN: SITUATIONAL GIS MAP (50%) + REAL-TIME INCIDENT FEED (50%) */}
        <section className="xl:col-span-5 2xl:col-span-4 h-full flex flex-col min-h-0 gap-2 overflow-hidden">
          {/* TOP HALF: GIS SITUATIONAL SPATIAL MAP WITH ACTIVE CAMERA HIGHLIGHTS */}
          <div className="flex-1 min-h-0 h-1/2 flex flex-col bg-slate-900/60 border border-slate-800/80 rounded-xl p-2 shadow-xl backdrop-blur overflow-hidden">
            <div className="h-6 flex-shrink-0 flex items-center justify-between pb-1 mb-1 border-b border-slate-800/80">
              <div className="flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-200">
                  GIS Situational Radar Map
                </span>
                <span className="text-[9px] bg-cyan-950/80 text-cyan-300 border border-cyan-800 px-1.5 py-0.2 rounded font-mono font-bold">
                  {displayedSerials.length} LIVE ON WALL
                </span>
              </div>
              <span className="text-[9.5px] text-slate-400">
                หมุดสีฟ้าคือกล้องที่กำลังสตรีมสด
              </span>
            </div>

            <div className="flex-1 min-h-0 w-full h-full rounded-lg overflow-hidden border border-slate-800 relative">
              <RiverMap
                devices={filteredStations}
                height="100%"
                className="w-full h-full"
                compact={true}
                disableCluster={true}
                activeSerials={displayedSerials}
                onSelectStation={focusStationOnWall}
              />
            </div>
          </div>

          {/* BOTTOM HALF: REAL-TIME INCIDENT & TELEMETRY TICKER */}
          <div className="flex-1 min-h-0 h-1/2 flex flex-col bg-slate-900/60 border border-slate-800/80 rounded-xl p-2 shadow-xl backdrop-blur overflow-hidden">
            <div className="h-7 flex-shrink-0 flex items-center justify-between pb-1.5 mb-1 border-b border-slate-800/80">
              <div className="flex items-center space-x-1.5 flex-shrink-0">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-100">
                  Live Incident & Telemetry Feed
                </span>
                <span className="text-[9.5px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.2 rounded font-mono font-bold border border-indigo-500/30">
                  {filteredStations.length}
                </span>
              </div>

              {/* Complete Professional 6-Status Filter Tabs */}
              <div className="flex items-center space-x-1 text-[9px] overflow-x-auto custom-scrollbar">
                <button
                  onClick={() => handleSelectStatusTab('ALL')}
                  className={`px-1.5 py-0.5 rounded transition flex items-center space-x-1 whitespace-nowrap ${
                    statusFilter === 'ALL'
                      ? 'bg-indigo-600 text-white font-bold shadow ring-1 ring-indigo-400'
                      : 'text-slate-400 hover:text-slate-200 bg-slate-950/60 hover:bg-slate-800/60 border border-slate-800/80'
                  }`}
                  title="แสดงทุกสถานี"
                >
                  <span>ทั้งหมด</span>
                  <span className="text-[8px] px-1 py-0.2 rounded bg-black/40 font-mono font-bold">
                    {statusCounts.all}
                  </span>
                </button>

                <button
                  onClick={() => handleSelectStatusTab('EMERGENCY')}
                  className={`px-1.5 py-0.5 rounded transition flex items-center space-x-1 whitespace-nowrap ${
                    statusFilter === 'EMERGENCY'
                      ? 'bg-rose-600 text-white font-black shadow-md shadow-rose-900/60 ring-1 ring-rose-300 animate-pulse'
                      : 'text-rose-400 hover:text-rose-200 bg-rose-950/30 hover:bg-rose-900/40 border border-rose-800/40'
                  }`}
                  title="ระดับฉุกเฉินสูงสุด"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-ping"></span>
                  <span>ฉุกเฉิน</span>
                  <span className="text-[8px] px-1 py-0.2 rounded bg-rose-950 text-rose-200 font-mono font-bold border border-rose-800/50">
                    {statusCounts.emergency}
                  </span>
                </button>

                <button
                  onClick={() => handleSelectStatusTab('CRITICAL')}
                  className={`px-1.5 py-0.5 rounded transition flex items-center space-x-1 whitespace-nowrap ${
                    statusFilter === 'CRITICAL'
                      ? 'bg-rose-700 text-white font-bold shadow ring-1 ring-rose-400'
                      : 'text-rose-300 hover:text-rose-100 bg-rose-950/20 hover:bg-rose-900/30 border border-rose-900/30'
                  }`}
                  title="ระดับวิกฤต"
                >
                  <span>วิกฤต</span>
                  <span className="text-[8px] px-1 py-0.2 rounded bg-black/40 font-mono font-bold">
                    {statusCounts.critical}
                  </span>
                </button>

                <button
                  onClick={() => handleSelectStatusTab('WARNING')}
                  className={`px-1.5 py-0.5 rounded transition flex items-center space-x-1 whitespace-nowrap ${
                    statusFilter === 'WARNING'
                      ? 'bg-amber-600 text-white font-bold shadow ring-1 ring-amber-400'
                      : 'text-amber-400 hover:text-amber-200 bg-amber-950/30 hover:bg-amber-900/40 border border-amber-800/40'
                  }`}
                  title="ระดับเตือนภัย"
                >
                  <span>เตือนภัย</span>
                  <span className="text-[8px] px-1 py-0.2 rounded bg-black/40 font-mono font-bold">
                    {statusCounts.warning}
                  </span>
                </button>

                <button
                  onClick={() => handleSelectStatusTab('NORMAL')}
                  className={`px-1.5 py-0.5 rounded transition flex items-center space-x-1 whitespace-nowrap ${
                    statusFilter === 'NORMAL'
                      ? 'bg-emerald-600 text-white font-bold shadow ring-1 ring-emerald-400'
                      : 'text-emerald-400 hover:text-emerald-200 bg-emerald-950/30 hover:bg-emerald-900/40 border border-emerald-800/40'
                  }`}
                  title="ระดับปกติออนไลน์"
                >
                  <span>ปกติ</span>
                  <span className="text-[8px] px-1 py-0.2 rounded bg-black/40 font-mono font-bold">
                    {statusCounts.normal}
                  </span>
                </button>

                <button
                  onClick={() => handleSelectStatusTab('OFFLINE')}
                  className={`px-1.5 py-0.5 rounded transition flex items-center space-x-1 whitespace-nowrap ${
                    statusFilter === 'OFFLINE'
                      ? 'bg-slate-600 text-white font-bold shadow ring-1 ring-slate-400'
                      : 'text-slate-400 hover:text-slate-200 bg-slate-900/40 hover:bg-slate-800/60 border border-slate-700/50'
                  }`}
                  title="สถานีที่ขาดการเชื่อมต่อ"
                >
                  <span>ออฟไลน์</span>
                  <span className="text-[8px] px-1 py-0.2 rounded bg-black/40 font-mono font-bold">
                    {statusCounts.offline}
                  </span>
                </button>
              </div>
            </div>

            {/* Incident Scroll List (Fills remaining height) */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {filteredStations.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-1.5 py-6">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400/80" />
                  <span className="text-xs font-semibold text-slate-300">ไม่มีข้อมูลสถานีในสถานะ {statusFilter}</span>
                  <span className="text-[10px] text-slate-500">(No stations match selected filter)</span>
                </div>
              ) : (
                filteredStations.map((item) => {
                  const isEmerg = item.warning_status === 'EMERGENCY';
                  const isCrit = item.warning_status === 'CRITICAL';
                  const isWarn = item.warning_status === 'WARNING';
                  const isOff = isDeviceOffline(item);
                  const isSurface = item.sensor_mode === 'SURFACE';
                  const isMounted = displayedSerials.includes(item.serial);

                  return (
                    <div
                      key={item.serial}
                      onClick={() => focusStationOnWall(item.serial)}
                      className={`p-2 rounded-lg border cursor-pointer transition-all duration-150 flex items-center justify-between group ${
                        isEmerg
                          ? 'bg-rose-950/60 hover:bg-rose-900/70 border-rose-600/80 text-white shadow-sm shadow-rose-950 ring-1 ring-rose-500/40'
                          : isCrit
                          ? 'bg-rose-950/40 hover:bg-rose-900/50 border-rose-700/60 text-rose-100'
                          : isWarn
                          ? 'bg-amber-950/40 hover:bg-amber-900/50 border-amber-700/60 text-amber-100'
                          : isOff
                          ? 'bg-slate-950/50 hover:bg-slate-900/60 border-slate-800 text-slate-400 opacity-80'
                          : 'bg-slate-950/70 hover:bg-slate-800/70 border-slate-800/90 text-slate-200'
                      } ${isMounted ? 'ring-2 ring-cyan-400 shadow-md shadow-cyan-950' : ''}`}
                    >
                      <div className="flex items-center space-x-2 overflow-hidden">
                        <span
                          className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            isEmerg
                              ? 'bg-rose-500 animate-ping'
                              : isCrit
                              ? 'bg-rose-500 animate-pulse'
                              : isWarn
                              ? 'bg-amber-400'
                              : isOff
                              ? 'bg-slate-600'
                              : 'bg-emerald-400'
                          }`}
                        />
                        <div className="truncate">
                          <div className="flex items-center space-x-1.5">
                            {/* Station Serial with guaranteed 100% bright white text */}
                            <span
                              className="font-mono font-bold text-xs tracking-wide"
                              style={{ color: '#ffffff' }}
                            >
                              {item.serial}
                            </span>
                            <span className="text-[8px] uppercase px-1 py-0.2 rounded bg-black/50 border border-slate-700 text-slate-300 font-semibold">
                              {isSurface ? 'SURFACE' : 'RIVER'}
                            </span>
                            {isMounted && (
                              <span className="text-[8px] uppercase px-1 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 font-black tracking-wider">
                                ON WALL
                              </span>
                            )}
                          </div>
                          {/* High contrast subtext */}
                          <p
                            className="text-[10.5px] truncate font-medium mt-0.5"
                            style={{ color: '#cbd5e1' }}
                          >
                            {item.name || item.province || 'สถานีตรวจวัดระดับน้ำ'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 flex-shrink-0 text-right">
                        <div>
                          {/* Water Level with crisp high contrast */}
                          <div
                            className="font-mono font-black text-xs tracking-tight"
                            style={{ color: '#ffffff' }}
                          >
                            {item.net_water_level_cm !== undefined &&
                            item.net_water_level_cm !== null
                              ? `${item.net_water_level_cm.toFixed(1)} cm`
                              : '-'}
                          </div>
                          {/* Distinct Status Pill */}
                          <span
                            className={`text-[8.5px] font-black uppercase tracking-wider block ${
                              isEmerg
                                ? 'text-rose-400 font-black animate-pulse'
                                : isCrit
                                ? 'text-rose-400'
                                : isWarn
                                ? 'text-amber-400'
                                : isOff
                                ? 'text-slate-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {isOff ? 'OFFLINE' : (item.warning_status || 'NORMAL')}
                          </span>
                        </div>
                        <button
                          title="นำกล้องขึ้นจอแสดงผล"
                          className="opacity-0 group-hover:opacity-100 p-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition shadow"
                        >
                          <Eye className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      {/* 3. TACTICAL NOC FOOTER CREDIT BAR (High Contrast & Official Logos) */}
      <footer className="h-8 flex-shrink-0 flex items-center justify-between px-3.5 border border-slate-700/80 bg-slate-900/95 backdrop-blur-md rounded-xl mt-1.5 shadow-md select-none">
        {/* Left: System Status & Title */}
        <div className="flex items-center space-x-2.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-xs text-slate-300 font-semibold tracking-wide">
            ระบบเฝ้าระวังและเตือนภัยระดับน้ำอัจฉริยะ 
            <span className="text-slate-500 ml-1.5 hidden sm:inline font-normal">| ศูนย์ควบคุมปฏิบัติการ (Command Center)</span>
          </span>
        </div>

        {/* Right: Logos & Developer Credit (Crisp, High Contrast) */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="flex items-center space-x-1.5 bg-slate-950/80 border border-slate-800 px-2 py-0.5 rounded-lg shadow-inner">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logos/cps-agri-logo.png"
              alt="CPS AGRI"
              className="h-4.5 sm:h-5 w-auto object-contain drop-shadow"
            />
            <div className="h-3 w-px bg-slate-700/80" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/logos/fahfon-logo.png"
              alt="FAHFON"
              className="h-4.5 sm:h-5 w-auto object-contain drop-shadow"
            />
          </div>

          <div className="flex items-center space-x-1.5 text-xs">
            <span className="text-slate-400 font-medium hidden sm:inline">พัฒนาโดย</span>
            <span className="font-extrabold text-white tracking-wide text-xs sm:text-sm drop-shadow" style={{ color: '#ffffff' }}>
              บริษัท ซีพีเอส อะกริ จำกัด
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
