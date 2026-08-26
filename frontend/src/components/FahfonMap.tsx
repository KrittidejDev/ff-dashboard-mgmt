'use client';

import React, { useDeferredValue } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import Link from 'next/link';
import { ArrowRight, Activity, Cpu } from 'lucide-react';

// Fix Leaflet default icon for Next.js bundler
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface FahfonMapProps {
  devices: any[];
  selectedVariable: string;
  activeTab?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const getVariableValue = (d: any, key: string): string => {
  if (!d || !d.current_value) return 'N/A';
  const cur = d.current_value;
  const fmt = (val: any) => {
    if (val === undefined || val === null) return null;
    const num = Number(val);
    if (isNaN(num) || num <= -900) return null;
    return num.toFixed(2);
  };
  const unit: Record<string, string> = {
    temp: '°C', humid: '%', press: ' hPa', rain_rate: ' mm', rain_hourly: ' mm',
    rain_daily: ' mm', pm25: ' µg', pm10: ' µg', pm1: ' µg', pm40: ' µg',
    co2: ' ppm', uv: '', battery: 'V', wind_speed: ' m/s', wind_direction: '°',
    signal_strength: ' dBm', r_inten: ' lx', g_inten: ' lx', b_inten: ' lx',
  };
  const raw: Record<string, any> = {
    temp: cur.temp, humid: cur.humid, press: cur.press, rain_rate: cur.rain_rate,
    rain_hourly: cur.rain_hourly, rain_daily: cur.rain_daily, pm25: cur.pm25,
    pm10: cur.pm10, pm1: cur.pm1, pm40: cur.pm40, co2: cur.co2, uv: cur.uv,
    battery: cur.battery, wind_speed: cur.wind_speed, wind_direction: cur.wind_direction,
    signal_strength: cur.signal_strength, r_inten: cur.r_inten, g_inten: cur.g_inten,
    b_inten: cur.b_inten,
  };
  const v = fmt(raw[key] ?? raw['temp']);
  return v ? `${v}${unit[key] ?? ''}` : 'N/A';
};

const getVariableName = (key: string): string => {
  const names: Record<string, string> = {
    temp: 'Temperature', humid: 'Humidity', press: 'Air Pressure',
    rain_rate: 'Rain Intensity', rain_hourly: 'Rain Hourly', rain_daily: 'Rain Daily',
    pm25: 'PM2.5', pm10: 'PM10', pm1: 'PM1.0', pm40: 'PM4.0', co2: 'CO2',
    uv: 'UV Index', battery: 'Battery', wind_speed: 'Wind Speed',
    wind_direction: 'Wind Direction', signal_strength: 'Signal Strength',
    r_inten: 'Red Light', g_inten: 'Green Light', b_inten: 'Blue Light',
  };
  return names[key] ?? 'Temperature';
};

// Custom cluster icon — clean numeric bubble matching the design system
const createClusterIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  const size = count >= 1000 ? 50 : count >= 100 ? 44 : 38;
  return L.divIcon({
    html: `
      <div style="
        width:${size}px; height:${size}px;
        background: linear-gradient(135deg,#4f46e5,#6366f1);
        border: 2.5px solid rgba(255,255,255,0.9);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: ${count >= 1000 ? 11 : 12}px;
        font-weight: 800; font-family: monospace;
        box-shadow: 0 4px 14px rgba(79,70,229,0.5);
        cursor: pointer;
      ">${count >= 1000 ? (count / 1000).toFixed(1) + 'k' : count}</div>
    `,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// ── Component ─────────────────────────────────────────────────────────────────

const FahfonMap = React.memo(function FahfonMap({
  devices,
  selectedVariable,
  activeTab = 'monitor',
}: FahfonMapProps) {
  const defaultCenter: [number, number] = [13.7367, 100.5231];

  // Low-priority update — auto-refresh won't interrupt user interactions
  const deferredDevices = useDeferredValue(devices);
  const isStale = deferredDevices !== devices;

  // All devices with valid GPS coordinates
  const validDevices = React.useMemo(
    () => deferredDevices.filter((d) => d.lat && d.lng && d.lat !== 0 && d.lng !== 0),
    [deferredDevices]
  );

  // Tab-filtered devices — ALL valid devices including OFFLINE in Monitor Overview
  const targetDevices = React.useMemo(() => {
    if (activeTab === 'silent') return validDevices.filter((d) => d.status === 'OFFLINE');
    return validDevices;
  }, [validDevices, activeTab]);

  // Summary stats for legend panel
  const systemActiveCount = React.useMemo(
    () => deferredDevices.filter((d) => d.status === 'ACTIVE').length,
    [deferredDevices]
  );
  const systemMalfunctionCount = React.useMemo(
    () => deferredDevices.filter((d) => d.status === 'MALFUNCTIONING').length,
    [deferredDevices]
  );
  const systemOfflineCount = React.useMemo(
    () => deferredDevices.filter((d) => d.status === 'OFFLINE').length,
    [deferredDevices]
  );
  const systemNoGpsCount = React.useMemo(
    () => deferredDevices.length - validDevices.length,
    [deferredDevices, validDevices]
  );

  // Build ALL markers — MarkerClusterGroup handles DOM efficiency automatically
  const renderedMarkers = React.useMemo(() => {
    return targetDevices.map((d) => {
      const valStr = getVariableValue(d, selectedVariable);
      const isOnline = d.status === 'ACTIVE';
      const isMalfunctioning = d.status === 'MALFUNCTIONING';

      const cleanVal = valStr === 'N/A' ? 'N/A' : valStr.replace(/[a-zA-Z°%µ\s]/g, '');
      const displayVal = cleanVal && cleanVal !== '' ? cleanVal : 'N/A';

      // 3-state color: indigo=ACTIVE, amber=MALFUNCTIONING, rose=OFFLINE
      const borderColor = isOnline ? '#4f46e5' : isMalfunctioning ? '#f59e0b' : '#f43f5e';
      const textColor   = isOnline ? '#4338ca' : isMalfunctioning ? '#b45309' : '#e11d48';

      const pinIcon = L.divIcon({
        className: 'fahfon-pin',
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;width:40px;height:46px;">
            <div style="
              width:36px;height:36px;border-radius:50%;
              background:#fff;border:2.5px solid ${borderColor};
              display:flex;align-items:center;justify-content:center;
              font-family:monospace;font-size:8.5px;font-weight:900;
              color:${textColor};
              box-shadow:0 2px 8px ${borderColor}55;
            ">${displayVal}</div>
            <div style="
              width:0;height:0;
              border-left:5px solid transparent;border-right:5px solid transparent;
              border-top:6px solid ${borderColor};margin-top:-1px;
            "></div>
          </div>
        `,
        iconSize: [40, 46],
        iconAnchor: [20, 46],
      });

      return (
        <Marker
          key={d.mongo_id || d.uuid || d.station}
          position={[d.lat, d.lng]}
          icon={pinIcon}
        >
          <Popup>
            <div className="p-1 space-y-3.5 min-w-[230px] text-slate-800">
              {/* Station Header */}
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <div className="flex items-center space-x-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="font-extrabold text-slate-900 text-xs tracking-wide">{d.station}</span>
                </div>
                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border tracking-wide uppercase ${
                  isOnline
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                    : isMalfunctioning
                    ? 'bg-amber-50 border-amber-200 text-amber-600'
                    : 'bg-rose-50 border-rose-200 text-rose-600'
                }`}>{isOnline ? 'ONLINE' : isMalfunctioning ? 'FAULT' : 'OFFLINE'}</span>
              </div>

              {/* 2x2 Quick Stats */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100">
                  <span className="text-slate-400 block font-semibold">IMEI</span>
                  <span className="font-mono text-slate-700 truncate block">{d.imei}</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Site</span>
                  <span className="text-slate-700 truncate block">{d.site || 'N/A'}</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Coordinates</span>
                  <span className="font-mono text-indigo-600 block">{d.lat.toFixed(4)}, {d.lng.toFixed(4)}</span>
                </div>
                <div className="bg-indigo-50 rounded-lg p-1.5 border border-indigo-100">
                  <span className="text-indigo-600 font-bold block">{getVariableName(selectedVariable)}</span>
                  <span className="font-mono text-indigo-700 font-extrabold text-xs block">{valStr}</span>
                </div>
              </div>

              <Link
                href={`/dashboard/devices/${d.uuid || d.station}`}
                className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-[10.5px] font-extrabold py-2 rounded-xl transition-all shadow-md shadow-indigo-600/15"
              >
                <span>View Device Telemetries</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </Popup>
        </Marker>
      );
    });
  }, [targetDevices, selectedVariable]);

  return (
    <div className={`w-full h-[520px] rounded-3xl overflow-hidden border border-slate-200 relative z-10 shadow-xl shadow-slate-100 transition-opacity duration-500 ${isStale ? 'opacity-90' : 'opacity-100'}`}>
      <style>{`
        .fahfon-pin { background: transparent !important; border: none !important; }
        .leaflet-popup-content-wrapper {
          background: rgba(255,255,255,0.98) !important;
          border: 1px solid rgba(0,0,0,0.08) !important;
          border-radius: 20px !important;
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05) !important;
        }
        .leaflet-popup-tip { background: rgba(255,255,255,0.98) !important; }
        .leaflet-container { background: #f8fafc !important; }
        .leaflet-bar {
          border: 1px solid rgba(15,23,42,0.08) !important;
          border-radius: 12px !important; overflow: hidden;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05) !important;
        }
        .leaflet-bar a {
          background-color: rgba(255,255,255,0.9) !important;
          color: #475569 !important;
          border-bottom: 1px solid rgba(15,23,42,0.08) !important;
          transition: all 0.2s ease;
        }
        .leaflet-bar a:hover { background-color: #4f46e5 !important; color: #fff !important; }
        .leaflet-control-attribution {
          background: rgba(255,255,255,0.8) !important; color: #64748b !important;
          font-size: 9px !important; border-top-left-radius: 8px;
        }
        .leaflet-control-attribution a { color: #4f46e5 !important; }
      `}</style>

      {/* Floating Legend Panel */}
      <div className="absolute top-4 right-4 z-[1000] bg-white/95 border border-slate-200 rounded-2xl p-4 shadow-xl pointer-events-auto flex flex-col space-y-3 min-w-[260px]">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
          <Activity className="w-4 h-4 text-emerald-600" />
          <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">Map Legend</span>
          {isStale && (
            <span className="ml-auto text-[9px] text-indigo-400 font-semibold animate-pulse">Syncing…</span>
          )}
        </div>
        <div className="space-y-2 text-[11px]">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Viewing Metric:</span>
            <span className="font-semibold text-indigo-600 font-mono">{getVariableName(selectedVariable)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Pins on Map:</span>
            <span className="font-bold text-slate-700">{targetDevices.length.toLocaleString()}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-100">
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse flex-shrink-0"></span>
            <span className="text-emerald-600 font-bold text-[10.5px]">{systemActiveCount.toLocaleString()} Online</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse flex-shrink-0"></span>
            <span className="text-amber-600 font-bold text-[10.5px]">{systemMalfunctionCount.toLocaleString()} Fault</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0"></span>
            <span className="text-rose-600 font-bold text-[10.5px]">{systemOfflineCount.toLocaleString()} Offline</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400 flex-shrink-0"></span>
            <span className="text-gray-500 font-bold text-[10.5px]">{systemNoGpsCount.toLocaleString()} No GPS</span>
          </div>
        </div>
      </div>

      <MapContainer
        center={defaultCenter}
        zoom={6}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <MarkerClusterGroup
          chunkedLoading
          chunkInterval={50}
          chunkDelay={10}
          maxClusterRadius={60}
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          zoomToBoundsOnClick={true}
          iconCreateFunction={createClusterIcon}
        >
          {renderedMarkers}
        </MarkerClusterGroup>
      </MapContainer>
    </div>
  );
}, (prev, next) =>
  prev.selectedVariable === next.selectedVariable &&
  prev.devices === next.devices &&
  prev.activeTab === next.activeTab
);

export default FahfonMap;
