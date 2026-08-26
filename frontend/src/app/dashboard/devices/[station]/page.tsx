'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ArrowLeft, RefreshCw, Cpu, Activity, Database, CheckSquare, Square, ArrowRight } from 'lucide-react';
import { PageHeader, DashboardCard } from '@/components/UI';
import { TelemetryChart } from '@/components/TelemetryChart';
import { TelemetryLogsTable } from '@/components/TelemetryLogsTable';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

// Definitions for the 23 parameters with premium HSL tailored colors
const VARIABLE_METRIC_METADATA: { [key: string]: { name: string; color: string; unit: string } } = {
  temp: { name: 'Temperature', color: '#f87171', unit: '°C' },
  humid: { name: 'Humidity', color: '#38bdf8', unit: '%' },
  press: { name: 'Air Pressure', color: '#c084fc', unit: 'hPa' },
  rain_rate: { name: 'Rain Intensity', color: '#60a5fa', unit: 'mm/h' },
  rain_hourly: { name: 'Rain Hourly', color: '#2563eb', unit: 'mm' },
  rain_daily: { name: 'Rain Daily', color: '#1d4ed8', unit: 'mm' },
  pm1: { name: 'PM1.0', color: '#34d399', unit: 'µg/m³' },
  pm25: { name: 'PM2.5', color: '#10b981', unit: 'µg/m³' },
  pm40: { name: 'PM4.0', color: '#059669', unit: 'µg/m³' },
  pm10: { name: 'PM10', color: '#047857', unit: 'µg/m³' },
  wind_speed: { name: 'Wind Speed', color: '#fbbf24', unit: 'm/s' },
  wind_direction: { name: 'Wind Direction', color: '#f59e0b', unit: '°' },
  uv: { name: 'UV Index', color: '#ec4899', unit: '' },
  co2: { name: 'CO2 level', color: '#8b5cf6', unit: 'ppm' },
  battery: { name: 'Battery', color: '#f43f5e', unit: 'V' },
  signal_strength: { name: 'Signal Strength', color: '#64748b', unit: 'dBm' },
  latitude: { name: 'Latitude', color: '#14b8a6', unit: '°' },
  longitude: { name: 'Longitude', color: '#06b6d4', unit: '°' },
  r_inten: { name: 'Red Intensity', color: '#ef4444', unit: '' },
  g_inten: { name: 'Green Intensity', color: '#22c55e', unit: '' },
  b_inten: { name: 'Blue Intensity', color: '#3b82f6', unit: '' },
  n_inten: { name: 'NIR Intensity', color: '#f97316', unit: '' },
  l_inten: { name: 'Light Intensity', color: '#eab308', unit: 'lux' },
};

export default function DeviceDetailPage() {
  const { station } = useParams();
  const { apiFetch } = useAuth();
  const router = useRouter();
  
  const [metadata, setMetadata] = useState<any>(null);
  const [current, setCurrent] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVars, setActiveVars] = useState<string[]>(['temp', 'humid', 'rain_rate', 'pm25']); // default shown variables
  const [rangeType, setRangeType] = useState<string>('hourly'); // "hourly", "daily", "monthly"

  const fetchDetail = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/fahfon-sense/devices/${station}/detail?range=${rangeType}`);
      if (res.ok) {
        const data = await res.json();
        setMetadata(data.metadata);
        setCurrent(data.current);
        
        // Reformat history timestamps based on rangeType selection
        const formattedHistory = (data.history || []).map((h: any) => {
          let label = '';
          const d = new Date(h.time_onsite);
          if (rangeType === 'daily') {
            label = d.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' });
          } else if (rangeType === 'monthly') {
            label = d.toLocaleDateString('th-TH', { month: 'short', year: 'numeric' });
          } else {
            label = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
          }
          return {
            ...h,
            formattedTime: label,
          };
        }).reverse(); // Oldest first for chronological line drawing
        setHistory(formattedHistory);
      }
    } catch (err) {
      console.error('Failed to load device details', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [station, rangeType]);

  const toggleVariable = (vKey: string) => {
    if (activeVars.includes(vKey)) {
      setActiveVars(activeVars.filter((key) => key !== vKey));
    } else {
      setActiveVars([...activeVars, vKey]);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="relative w-16 h-16">
          <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-500/10 rounded-full"></div>
          <div className="absolute top-0 left-0 w-full h-full border-4 border-t-indigo-650 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center space-y-4">
        <span className="text-slate-500 font-semibold">Device metadata not found or database sync in progress.</span>
        <button
          onClick={() => router.back()}
          className="flex items-center space-x-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-indigo-600/10 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Go Back</span>
        </button>
      </div>
    );
  }

  const isOnline = metadata.status === 'ACTIVE' || metadata.status === 'ONLINE';

  const refreshButton = (
    <button
      onClick={fetchDetail}
      className="flex items-center space-x-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 border border-indigo-100 px-4 py-2.5 rounded-xl text-sm font-bold transition shadow-sm"
    >
      <RefreshCw className="w-4 h-4" />
      <span>Refresh Details</span>
    </button>
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Title Header with Custom Built Back Arrow */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0 border-b border-slate-200/80 pb-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => router.back()}
            title="Back to List"
            className="p-2.5 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 rounded-xl border border-slate-200 transition shadow-sm hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2.5]" />
          </button>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-extrabold text-slate-900 leading-none">{metadata.station}</h1>
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border tracking-wide uppercase ${
                isOnline 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-250' 
                  : 'bg-rose-50 text-rose-600 border-rose-200'
              }`}>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
            <p className="text-slate-400 text-xs mt-1.5 font-medium">IMEI: {metadata.imei} | Owner: {metadata.owner || 'N/A'}</p>
          </div>
        </div>

        {refreshButton}
      </div>

      {/* Grid Quick Stats Cards (Premium White Layout) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
        <div className="glass-panel p-5 rounded-2xl border border-slate-200 bg-white/95 shadow-md shadow-slate-100/50">
          <span className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider block">Battery State</span>
          <span className="text-2xl font-black text-slate-900 block mt-2 font-mono">
            {current ? `${current.battery.toFixed(2)} V` : 'N/A'}
          </span>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-slate-200 bg-white/95 shadow-md shadow-slate-100/50">
          <span className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider block">Temperature</span>
          <span className="text-2xl font-black text-slate-900 block mt-2 font-mono">
            {current ? `${current.temp.toFixed(1)} °C` : 'N/A'}
          </span>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-slate-200 bg-white/95 shadow-md shadow-slate-100/50">
          <span className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider block">Humidity</span>
          <span className="text-2xl font-black text-slate-900 block mt-2 font-mono">
            {current ? `${current.humid.toFixed(0)} %` : 'N/A'}
          </span>
        </div>
        <div className="glass-panel p-5 rounded-2xl border border-slate-200 bg-white/95 shadow-md shadow-slate-100/50">
          <span className="text-slate-400 text-[10px] font-extrabold uppercase tracking-wider block">Rain Rate</span>
          <span className="text-2xl font-black text-slate-900 block mt-2 font-mono">
            {current ? `${current.rain_rate.toFixed(2)} mm/h` : 'N/A'}
          </span>
        </div>
      </div>

      {/* Main Charts & Controls Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Toggle checkboxes selector (Left Side in Desktop) */}
        <DashboardCard
          title="Toggle Graph Variables"
          icon={<Cpu className="w-4 h-4 text-indigo-600" />}
          className="lg:col-span-1"
        >
          <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
            {Object.keys(VARIABLE_METRIC_METADATA).map((vKey) => {
              const meta = VARIABLE_METRIC_METADATA[vKey];
              const isChecked = activeVars.includes(vKey);
              return (
                <button
                  key={vKey}
                  onClick={() => toggleVariable(vKey)}
                  className="w-full flex items-center justify-between text-left py-2 px-2.5 hover:bg-slate-50 border border-transparent hover:border-slate-150 rounded-xl transition"
                >
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="shrink-0 text-indigo-600">
                      {isChecked ? <CheckSquare className="w-4.5 h-4.5 text-indigo-650" /> : <Square className="w-4.5 h-4.5 text-slate-300" />}
                    </div>
                    <span className="text-xs font-bold text-slate-700 truncate">{meta.name}</span>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }}></span>
                </button>
              );
            })}
          </div>
        </DashboardCard>

        {/* Dynamic Line Chart (Right Side in Desktop) */}
        <div className="lg:col-span-3">
          <DashboardCard
            title="Historical Analytical Trends"
            icon={<Activity className="w-4 h-4 text-indigo-600" />}
            badge={
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  onClick={() => setRangeType('hourly')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                    rangeType === 'hourly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Hourly (24h)
                </button>
                <button
                  onClick={() => setRangeType('daily')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                    rangeType === 'daily' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Daily (30d)
                </button>
                <button
                  onClick={() => setRangeType('monthly')}
                  className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                    rangeType === 'monthly' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  Monthly (12m)
                </button>
              </div>
            }
          >
            <div className="w-full h-[350px]">
              {history.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs font-semibold">
                  No historical records found for graph plot.
                </div>
              ) : (
                <TelemetryChart
                  data={history}
                  xAxisKey="formattedTime"
                  activeMetrics={activeVars}
                  metricMetadata={VARIABLE_METRIC_METADATA}
                  height={350}
                />
              )}
            </div>
          </DashboardCard>
        </div>
      </div>

      {/* Reusable High-Performance Telemetry Logs Table */}
      <TelemetryLogsTable
        data={history}
        metricMetadata={VARIABLE_METRIC_METADATA}
        title="Historical Telemetry Raw Log Records"
      />
    </div>
  );
}
