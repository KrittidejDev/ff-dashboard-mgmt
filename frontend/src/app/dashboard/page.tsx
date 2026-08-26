'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/context/AuthContext';
import { Cpu, Search, AlertCircle, RefreshCw, Layers, ArrowRight, ArrowUpDown, AlertTriangle, ChevronLeft, ChevronRight, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { SearchableSelect, SearchableOption } from '@/components/UI';

// Dynamically load Map component to bypass Node SSR environment crashes
const FahfonMap = dynamic(() => import('@/components/FahfonMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[450px] bg-gray-900/50 rounded-2xl flex items-center justify-center border border-gray-800">
      <div className="flex flex-col items-center space-y-3">
        <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
        <span className="text-sm text-gray-400">Loading Leaflet Map Engine...</span>
      </div>
    </div>
  ),
});

import ConflictResolver from '@/components/ConflictResolver';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function SenseDashboard() {
  const { apiFetch, user } = useAuth();
  const [devices, setDevices] = useState<any[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [officialPages, setOfficialPages] = useState<any[]>([]);
  const [selectedOfficialPage, setSelectedOfficialPage] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState('time_onsite');
  const [selectedVariable, setSelectedVariable] = useState('temp');
  const [activeTab, setActiveTab] = useState<'monitor' | 'silent' | 'conflicts'>('monitor');

  // Debounce search input by 400ms to eliminate server query overload and rendering lag on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Pagination states
  const [devicePage, setDevicePage] = useState(1);
  const itemsPerDevicePage = 10;

  const [anomalyPage, setAnomalyPage] = useState(1);
  const itemsPerAnomalyPage = 10;

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

  const formatMetricValue = (val: any, key: string) => {
    if (val === undefined || val === null || val === -999.0) return '-';
    switch (key) {
      case 'temp': return `${val.toFixed(1)} °C`;
      case 'humid': return `${val.toFixed(1)} %`;
      case 'press': return `${val.toFixed(1)} hPa`;
      case 'rain_rate': return `${val.toFixed(2)} mm/h`;
      case 'rain_hourly': return `${val.toFixed(2)} mm`;
      case 'rain_daily': return `${val.toFixed(2)} mm`;
      case 'pm25': return `${val.toFixed(1)} µg/m³`;
      case 'pm10': return `${val.toFixed(1)} µg/m³`;
      case 'pm1': return `${val.toFixed(1)} µg/m³`;
      case 'pm40': return `${val.toFixed(1)} µg/m³`;
      case 'co2': return `${Math.round(val)} ppm`;
      case 'uv': return `${val.toFixed(1)}`;
      case 'battery': return `${val.toFixed(2)} V`;
      case 'wind_speed': return `${val.toFixed(1)} m/s`;
      case 'wind_direction': return `${Math.round(val)}°`;
      case 'signal_strength': return `${Math.round(val)} dBm`;
      default: return `${val}`;
    }
  };

  const handleDeleteConflict = async (field: string, id: string) => {
    if (!confirm(`Are you sure you want to delete this duplicate document (ID: ${id}) from MongoDB to resolve the conflict?`)) {
      return;
    }
    const collection = field === 'imei' ? 'registrations' : 'specifications';
    try {
      const res = await apiFetch(`${API_BASE_URL}/mongo/${collection}/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        alert('Successfully deleted duplicate document from MongoDB!');
        fetchDevices();
      } else {
        alert('Failed to delete duplicate document.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const variables = [
    { name: 'Temperature', key: 'temp' },
    { name: 'Humidity', key: 'humid' },
    { name: 'Air Pressure', key: 'press' },
    { name: 'Rain Intensity', key: 'rain_rate' },
    { name: 'Rain Hourly', key: 'rain_hourly' },
    { name: 'Rain Daily', key: 'rain_daily' },
    { name: 'PM2.5', key: 'pm25' },
    { name: 'PM10', key: 'pm10' },
    { name: 'PM1.0', key: 'pm1' },
    { name: 'PM4.0', key: 'pm40' },
    { name: 'CO2', key: 'co2' },
    { name: 'UV Index', key: 'uv' },
    { name: 'Battery Voltage', key: 'battery' },
    { name: 'Wind Speed', key: 'wind_speed' },
    { name: 'Wind Direction', key: 'wind_direction' },
    { name: 'Signal Strength', key: 'signal_strength' },
    { name: 'Red Light', key: 'r_inten' },
    { name: 'Green Light', key: 'g_inten' },
    { name: 'Blue Light', key: 'b_inten' },
  ];

  // useCallback ensures fetchDevices always captures the LATEST debouncedSearch/sort
  // without needing to restart the interval effect on every keystroke
  const fetchDevices = React.useCallback(async (silent = false, signal?: AbortSignal) => {
    if (silent) {
      setSilentRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await apiFetch(`${API_BASE_URL}/fahfon-sense/devices?search=${debouncedSearch}&sort=${sort}`, { signal });
      if (!res.ok) throw new Error(`devices: ${res.status}`);
      const data = await res.json();
      setDevices(data || []);

      const anomaliesRes = await apiFetch(`${API_BASE_URL}/fahfon-sense/anomalies`, { signal });
      if (anomaliesRes.ok) {
        const aData = await anomaliesRes.json();
        setAnomalies(aData || []);
      }

      let loadedPages: any[] = [];
      try {
        const pagesRes = await apiFetch(`${API_BASE_URL}/fahfon-sense/official-pages`, { signal });
        if (pagesRes.ok) {
          loadedPages = await pagesRes.json();
        }
      } catch (e) {
        // Handled by fallback
      }

      // If backend returned empty pages or error, derive immediately from devices array grouped by email
      if (!loadedPages || loadedPages.length === 0) {
        const counts = new Map<string, { email: string; account_id: string; device_count: number }>();
        (data || []).forEach((d: any) => {
          if (d.email) {
            const key = d.email;
            const existing = counts.get(key);
            if (existing) {
              existing.device_count++;
              if (!existing.account_id && d.account_id) {
                existing.account_id = d.account_id;
              }
            } else {
              counts.set(key, { email: d.email, account_id: d.account_id || '', device_count: 1 });
            }
          }
        });
        loadedPages = Array.from(counts.values());
      }
      setOfficialPages(loadedPages || []);

      if (user && (user.role === 'SuperAdmin' || user.role === 'Admin')) {
        const conflictsRes = await apiFetch(`${API_BASE_URL}/fahfon-sense/conflicts`, { signal });
        if (conflictsRes.ok) {
          const cData = await conflictsRes.json();
          setConflicts(cData || []);
        }
      }
      setLastRefreshed(new Date());
    } catch (err: any) {
      // AbortError is expected when effect cleans up — not a real error
      if (err?.name !== 'AbortError') {
        console.error('Failed to load devices/anomalies/conflicts/pages', err);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setSilentRefreshing(false);
      }
    }
  }, [debouncedSearch, sort, user]);

  // Initial + search/sort triggered fetch — abort previous request on re-run
  useEffect(() => {
    const controller = new AbortController();
    setDevicePage(1);
    fetchDevices(false, controller.signal);
    return () => controller.abort();
  }, [fetchDevices]);

  // Silent background auto-refresh every 60 seconds as a fallback safety sync
  // fetchDevices is stable via useCallback, so this interval only starts once
  // but always calls the latest version of the function with current search/sort
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDevices(true);
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchDevices]);

  // Truly Real-time WebSockets integration for O(1) reactive UI updates
  useEffect(() => {
    let wsUrl = API_BASE_URL.replace(/^http/, 'ws');
    wsUrl = wsUrl.replace(/\/api\/v1\/?$/, '/api/v1/ws/v1/telemetry/raw');

    let socket: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log('Successfully connected to raw telemetry WebSocket stream');
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.device_id) {
            setDevices((prevDevices) => {
              if (!prevDevices) return prevDevices;
              
              const rainHourly = data.rain_hourly ?? data.rain_acc_hourly ?? 0.0;
              
              return prevDevices.map((d) => {
                if (d.station === data.device_id) {
                  const updatedCurrent = {
                    ...d.current_value,
                    temp: data.temp ?? 0.0,
                    humid: data.humid ?? 0.0,
                    press: data.press ?? 0.0,
                    wind_speed: data.wind_speed ?? 0.0,
                    rain_rate: data.rain_rate ?? 0.0,
                    pm25: data.pm25 ?? 0.0,
                    battery: data.battery ?? 0.0,
                    wind_direction: data.wind_direction ?? 0.0,
                    rain_hourly: rainHourly,
                    rain_daily: data.rain_daily ?? 0.0,
                    uv: data.uv ?? 0.0,
                    co2: data.co2 ?? 0.0,
                    pm1: data.pm1 ?? 0.0,
                    pm40: data.pm40 ?? 0.0,
                    pm10: data.pm10 ?? 0.0,
                    r_inten: data.r_inten ?? 0.0,
                    g_inten: data.g_inten ?? 0.0,
                    b_inten: data.b_inten ?? 0.0,
                    signal_strength: data.signal_strength ?? 0.0,
                  };

                  const timeOnsiteStr = data.time_onsite || data.time || new Date().toISOString();
                  
                  return {
                    ...d,
                    status: 'ACTIVE',
                    updated_at: new Date(timeOnsiteStr).toISOString(),
                    current_value: updatedCurrent,
                  };
                }
                return d;
              });
            });
          }
        } catch (err) {
          // Silent parsing errors
        }
      };

      socket.onclose = () => {
        console.warn('WebSocket stream closed. Retrying connection in 5 seconds...');
        reconnectTimeout = setTimeout(connect, 5000);
      };

      socket.onerror = (err) => {
        console.error('WebSocket error encountered:', err);
      };
    };

    connect();

    return () => {
      if (socket) socket.close();
      clearTimeout(reconnectTimeout);
    };
  }, []);

  // Official Page Dropdown Options
  const officialPageOptions: SearchableOption[] = React.useMemo(() => {
    return (officialPages || []).map((p) => ({
      value: p.email || p.account_id || '',
      label: p.email || p.account_id || 'Unknown Official Page',
      count: p.device_count || 0,
      subLabel: p.account_id && p.account_id !== p.email ? `Account ID: ${p.account_id}` : undefined,
    }));
  }, [officialPages]);

  // Client-side reactive filtering by Selected Official Page email / account_id
  const filteredDevices = React.useMemo(() => {
    if (!devices) return [];
    if (selectedOfficialPage === 'all' || !selectedOfficialPage) return devices;
    return devices.filter((d) => d && (d.email === selectedOfficialPage || d.account_id === selectedOfficialPage));
  }, [devices, selectedOfficialPage]);

  // Quick statistics calculation
  const totalCount = filteredDevices?.length || 0;
  const onlineCount = (filteredDevices || []).filter((d) => d && d.status === 'ACTIVE').length;
  const offlineCount = (filteredDevices || []).filter((d) => d && d.status === 'OFFLINE').length;
  const malfunctionCount = (filteredDevices || []).filter((d) => d && d.status === 'MALFUNCTIONING').length;

  // Client-side reactive sorting and filtering
  const sortedDevices = React.useMemo(() => {
    let list = [...filteredDevices];
    if (activeTab === 'silent') {
      list = list.filter((d) => d.status === 'OFFLINE');
    }

    if (sort === 'time_onsite') {
      list.sort((a, b) => {
        const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return timeB - timeA; // Newest first
      });
    } else if (sort === 'station') {
      list.sort((a, b) => (a.station || '').localeCompare(b.station || ''));
    } else if (sort === 'imei') {
      list.sort((a, b) => (a.imei || '').localeCompare(b.imei || ''));
    }
    return list;
  }, [filteredDevices, activeTab, sort]);

  // Anomalies filtered by selected page
  const filteredAnomalies = React.useMemo(() => {
    if (!anomalies) return [];
    if (selectedOfficialPage === 'all' || !selectedOfficialPage) return anomalies;
    const pageDeviceStations = new Set(filteredDevices.map((d) => d.station));
    return anomalies.filter((a) => pageDeviceStations.has(a.device_id));
  }, [anomalies, filteredDevices, selectedOfficialPage]);

  // Pagination calculation
  const indexOfLastDevice = devicePage * itemsPerDevicePage;
  const indexOfFirstDevice = indexOfLastDevice - itemsPerDevicePage;
  const currentDevices = sortedDevices.slice(indexOfFirstDevice, indexOfLastDevice);
  const totalDevicePages = Math.ceil(sortedDevices.length / itemsPerDevicePage);

  const indexOfLastAnomaly = anomalyPage * itemsPerAnomalyPage;
  const indexOfFirstAnomaly = indexOfLastAnomaly - itemsPerAnomalyPage;
  const currentAnomalies = filteredAnomalies.slice(indexOfFirstAnomaly, indexOfLastAnomaly);
  const totalAnomalyPages = Math.ceil(filteredAnomalies.length / itemsPerAnomalyPage);

  const filteredConflicts = conflicts.filter(
    (c) =>
      c.value?.toLowerCase().includes(search.toLowerCase()) ||
      c.field?.toLowerCase().includes(search.toLowerCase()) ||
      c.device_ids?.some((id: string) => id.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Sense Monitor</h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">Real-time status overview and coordinate mapping.</p>
        </div>
        <div className="flex items-center space-x-3">
          {lastRefreshed && (
            <span className="text-[11px] text-slate-400 font-mono font-medium">
              {silentRefreshing ? (
                <span className="text-indigo-600 animate-pulse font-bold">⟳ Syncing...</span>
              ) : (
                `อัพเดทล่าสุด ${lastRefreshed.toLocaleTimeString('th-TH')}`
              )}
            </span>
          )}
          <button
            onClick={() => fetchDevices()}
            className="flex items-center space-x-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 px-4 py-2.5 rounded-xl text-sm font-bold transition shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${silentRefreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-panel p-6 rounded-2xl hover-scale bg-white/95 border border-slate-200/80 shadow-md shadow-slate-100/50">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Registers</span>
            <Cpu className="w-5 h-5 text-indigo-600" />
          </div>
          <h3 className="text-3xl font-extrabold text-slate-900 mt-4">{totalCount}</h3>
          <p className="text-[10px] text-slate-400 mt-2 font-medium">Active devices registered in systems.</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl hover-scale bg-white/95 border border-slate-200/80 shadow-md shadow-slate-100/50">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Online Devices</span>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          </div>
          <h3 className="text-3xl font-extrabold text-emerald-600 mt-4">{onlineCount}</h3>
          <p className="text-[10px] text-emerald-600/70 mt-2 font-medium">Pinging telemetry data within 6 hours.</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl hover-scale bg-white/95 border border-slate-200/80 shadow-md shadow-slate-100/50">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-600">Silent Devices</span>
            <AlertCircle className="w-5 h-5 text-rose-500" />
          </div>
          <h3 className="text-3xl font-extrabold text-rose-600 mt-4">{offlineCount}</h3>
          <p className="text-[10px] text-rose-600/70 mt-2 font-medium">Offline or onsite maintenance required.</p>
        </div>

        <div className="glass-panel p-6 rounded-2xl hover-scale bg-white/95 border border-slate-200/80 shadow-md shadow-slate-100/50">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Malfunctions</span>
            <AlertCircle className="w-5 h-5 text-amber-500 animate-bounce" />
          </div>
          <h3 className="text-3xl font-extrabold text-amber-600 mt-4">{malfunctionCount}</h3>
          <p className="text-[10px] text-amber-600/70 mt-2 font-medium">Active device parameter thresholds breached.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 space-x-6">
        <button
          onClick={() => {
            setActiveTab('monitor');
            setDevicePage(1);
          }}
          className={`pb-4 text-sm font-bold transition-all duration-200 relative ${
            activeTab === 'monitor' 
              ? 'text-indigo-600 font-extrabold' 
              : 'text-slate-500 hover:text-indigo-600'
          }`}
        >
          <span>Sense Monitor Overview</span>
          {activeTab === 'monitor' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-full"></div>
          )}
        </button>

        <button
          onClick={() => {
            setActiveTab('silent');
            setDevicePage(1);
          }}
          className={`pb-4 text-sm font-bold transition-all duration-200 relative flex items-center space-x-2 ${
            activeTab === 'silent' 
              ? 'text-rose-600 font-extrabold' 
              : 'text-slate-500 hover:text-rose-600'
          }`}
        >
          <span>Silent Devices ({offlineCount})</span>
          {offlineCount > 0 && (
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
          )}
          {activeTab === 'silent' && (
            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-rose-600 rounded-full"></div>
          )}
        </button>

        {user && (user.role === 'SuperAdmin' || user.role === 'Admin') && (
          <button
            onClick={() => {
              setActiveTab('conflicts');
              setDevicePage(1);
            }}
            className={`pb-4 text-sm font-bold transition-all duration-200 relative flex items-center space-x-2 ${
              activeTab === 'conflicts' 
                ? 'text-amber-600 font-extrabold' 
                : 'text-slate-500 hover:text-amber-600'
            }`}
          >
            <span>Conflict Resolver ({conflicts.length})</span>
            {conflicts.length > 0 && (
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
            )}
            {activeTab === 'conflicts' && (
              <div className="absolute bottom-0 left-0 w-full h-0.5 bg-amber-600 rounded-full"></div>
            )}
          </button>
        )}
      </div>

      {activeTab === 'monitor' || activeTab === 'silent' ? (
        <>
          {/* Interactive Map Section */}
          <div className="glass-panel rounded-2xl p-6 space-y-6 border border-slate-200/80 shadow-md shadow-slate-100/50 bg-white/95">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0">
              <div className="flex items-center space-x-2 text-slate-900">
                <Layers className="w-5 h-5 text-indigo-600" />
                <span className="font-extrabold">
                  {activeTab === 'silent' ? 'Silent Devices Location Mappings' : 'Real-time Location Mappings'}
                </span>
              </div>

              {/* Toggles Container */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-3">
                {/* Official Page Searchable Combobox on Map */}
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-500 font-bold hidden md:inline">เพจทางการ:</span>
                  <SearchableSelect
                    options={officialPageOptions}
                    value={selectedOfficialPage}
                    onChange={(val) => {
                      setSelectedOfficialPage(val);
                      setDevicePage(1);
                    }}
                    allOptionLabel="All Pages (เพจทางการทั้งหมด)"
                    searchPlaceholder="พิมพ์เพื่อค้นหาเพจทางการ..."
                    icon={<Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  />
                </div>

                {/* Active Variable Toggles */}
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-500 font-bold hidden md:inline">Metric:</span>
                  <select
                    value={selectedVariable}
                    onChange={(e) => setSelectedVariable(e.target.value)}
                    className="bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 transition-all shadow-sm"
                  >
                    {variables.map((v) => (
                      <option key={v.key} value={v.key}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Render Dynamic Map */}
            <FahfonMap
              devices={filteredDevices}
              selectedVariable={selectedVariable}
              activeTab={activeTab}
            />
          </div>

          {/* Database Search & Details Table */}
          <div className="glass-panel rounded-2xl p-6 space-y-6 border border-slate-200/80 shadow-md shadow-slate-100/50 bg-white/95">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center space-y-4 lg:space-y-0 gap-4">
              <div className="flex items-center space-x-2.5">
                <h4 className="font-extrabold text-slate-900 text-lg">
                  {activeTab === 'silent' ? 'Silent Devices Telemetry Log List' : 'System Telemetry Log List'}
                </h4>
                {selectedOfficialPage !== 'all' && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-indigo-50 text-indigo-700 font-extrabold border border-indigo-100/80">
                    {filteredDevices.length} เครื่อง
                  </span>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 w-full lg:w-auto">
                {/* Official Page Searchable Combobox on Table */}
                <SearchableSelect
                  options={officialPageOptions}
                  value={selectedOfficialPage}
                  onChange={(val) => {
                    setSelectedOfficialPage(val);
                    setDevicePage(1);
                  }}
                  allOptionLabel="All Pages (เพจทางการทั้งหมด)"
                  searchPlaceholder="พิมพ์เพื่อค้นหาเพจทางการ..."
                  icon={<Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                />

                {/* Search filter input */}
                <div className="relative w-full sm:w-56">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search Serial, IMEI, Site..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-9 pr-3.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 transition-all shadow-sm font-medium"
                  />
                </div>

                {/* Sort sorting select */}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl text-xs text-slate-700 py-2 px-3 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100/40 transition-all shadow-sm font-semibold"
                >
                  <option value="time_onsite">Sort by Time Onsite (Default)</option>
                  <option value="station">Sort by Station ID</option>
                  <option value="imei">Sort by Hardware IMEI</option>
                </select>
              </div>
            </div>

            {/* Datatable list */}
            <div className="overflow-x-auto border border-slate-200/90 rounded-2xl shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="py-3 px-4 font-bold">Station ID</th>
                    <th className="py-3 px-4 font-bold">Hardware IMEI</th>
                    <th className="py-3 px-4 font-bold">Site / Common Name</th>
                    <th className="py-3 px-4 font-bold text-indigo-600">
                      {variables.find(v => v.key === selectedVariable)?.name || 'Metric'}
                    </th>
                    <th className="py-3 px-4 font-bold">Interval</th>
                    <th className="py-3 px-4 font-bold">Time Onsite</th>
                    <th className="py-3 px-4 font-bold">Status</th>
                    <th className="py-3 px-4 font-bold text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"></div>
                        Fetching device data...
                      </td>
                    </tr>
                  ) : currentDevices.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500 font-medium">
                        No devices found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    currentDevices.map((d, idx) => (
                      <tr key={`${d.mongo_id || d.uuid || d.station || ''}-${idx}`} className="hover:bg-indigo-50/20 transition-colors">
                        <td className="py-3.5 px-4 font-extrabold text-slate-900">
                          <div className="flex flex-col">
                            <span>{d.station}</span>
                            {d.serial && d.serial !== d.station && (
                              <span className="font-mono text-[11px] font-semibold text-indigo-600">
                                {d.serial}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600 font-medium">{d.imei}</td>
                        <td className="py-3.5 px-4 text-slate-600 font-medium">{d.site || 'N/A'}</td>
                        <td className="py-3.5 px-4 font-bold text-indigo-600 font-mono">
                          {d.current_value ? formatMetricValue(d.current_value[selectedVariable], selectedVariable) : '-'}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-medium">{d.interval}m</td>
                        <td className="py-3.5 px-4 text-slate-500 font-mono">
                          {new Date(d.updated_at).toLocaleString('th-TH')}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                            d.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : d.status === 'MALFUNCTIONING'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              d.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' :
                              d.status === 'MALFUNCTIONING' ? 'bg-amber-500 animate-pulse' :
                              'bg-rose-500'
                            }`} />
                            {d.status === 'ACTIVE' ? 'ONLINE' : d.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Link
                             href={`/dashboard/devices/${d.uuid || d.station}`}
                            className="inline-flex items-center space-x-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 px-3 py-1.5 rounded-xl transition text-[11px] font-extrabold shadow-sm"
                          >
                            <span>Details</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {!loading && totalDevicePages > 1 && (
              <div className="px-4 py-3 bg-slate-50/70 border border-slate-200/80 rounded-xl flex justify-between items-center text-xs text-slate-500 font-medium">
                <span>Showing {indexOfFirstDevice + 1}-{Math.min(indexOfLastDevice, sortedDevices.length)} of {sortedDevices.length} entries</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setDevicePage((p) => Math.max(1, p - 1))}
                    disabled={devicePage === 1}
                    className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-slate-800 px-2">Page {devicePage} of {totalDevicePages}</span>
                  <button
                    onClick={() => setDevicePage((p) => Math.min(totalDevicePages, p + 1))}
                    disabled={devicePage === totalDevicePages}
                    className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Problematic Devices Anomaly List (Active threshold breaches) */}
          <div className="glass-panel rounded-2xl p-6 space-y-6 border border-slate-200/80 shadow-md shadow-slate-100/50 bg-white/95">
            <div className="flex items-center space-x-2 text-slate-900">
              <AlertCircle className="w-5 h-5 text-amber-500 animate-pulse" />
              <h4 className="font-extrabold text-lg">Active Device Anomalies & Failures (ff-preprocess-raw)</h4>
              {selectedOfficialPage !== 'all' && (
                <span className="ml-2 px-2.5 py-0.5 rounded-full text-[11px] bg-amber-50 text-amber-700 font-bold border border-amber-100">
                  {filteredAnomalies.length} anomalies
                </span>
              )}
            </div>
            
            <p className="text-xs text-slate-500 leading-relaxed -mt-4">
              The listing below displays active parameter threshold breaches detected by the auto-health watchdog service. 
              Breaches automatically flag the device status as <span className="text-amber-600 font-bold">MALFUNCTIONING</span>.
            </p>

            <div className="overflow-x-auto border border-slate-200/90 rounded-2xl shadow-sm">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="py-3 px-4 font-bold">Device ID</th>
                    <th className="py-3 px-4 font-bold">Sensor Parameter</th>
                    <th className="py-3 px-4 font-bold">Reported Value</th>
                    <th className="py-3 px-4 font-bold">Normal Range (Min-Max)</th>
                    <th className="py-3 px-4 font-bold">Detection Date</th>
                    <th className="py-3 px-4 font-bold">Resolution</th>
                    <th className="py-3 px-4 font-bold text-center">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">Loading anomalies...</td>
                    </tr>
                  ) : currentAnomalies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-emerald-600 font-bold">
                        Zero Active Anomalies! All sensor metrics are within healthy limits.
                      </td>
                    </tr>
                  ) : (
                    currentAnomalies.map((a) => (
                      <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3.5 px-4 font-extrabold text-slate-900">{a.device_id}</td>
                        <td className="py-3.5 px-4 text-slate-700 capitalize font-medium">{a.sensor_type}</td>
                        <td className="py-3.5 px-4 text-rose-600 font-mono font-bold">{a.reported_val}</td>
                        <td className="py-3.5 px-4 text-slate-500 font-mono">
                          {a.min_threshold} - {a.max_threshold}
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-mono">
                          {new Date(a.detected_at).toLocaleString('th-TH')}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            a.resolved
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {a.resolved ? 'RESOLVED' : 'UNRESOLVED'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <Link
                            href={`/dashboard/devices/${a.device_id}`}
                            className="inline-flex items-center space-x-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 px-3 py-1 rounded-lg transition text-[11px] font-bold"
                          >
                            <span>Analyze</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {!loading && totalAnomalyPages > 1 && (
              <div className="px-4 py-3 bg-slate-50/70 border border-slate-200/80 rounded-xl flex justify-between items-center text-xs text-slate-500 font-medium">
                <span>Showing {indexOfFirstAnomaly + 1}-{Math.min(indexOfLastAnomaly, filteredAnomalies.length)} of {filteredAnomalies.length} entries</span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setAnomalyPage((p) => Math.max(1, p - 1))}
                    disabled={anomalyPage === 1}
                    className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-bold text-slate-800 px-2">Page {anomalyPage} of {totalAnomalyPages}</span>
                  <button
                    onClick={() => setAnomalyPage((p) => Math.min(totalAnomalyPages, p + 1))}
                    disabled={anomalyPage === totalAnomalyPages}
                    className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 disabled:opacity-40 disabled:pointer-events-none transition shadow-sm"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <ConflictResolver
          conflicts={conflicts}
          loading={loading}
          type="sql"
          onDeleteConflict={handleDeleteConflict}
        />
      )}
    </div>
  );
}
