'use client';

import React, { useDeferredValue } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import Link from 'next/link';
import { ArrowRight, Activity, Cpu, Waves } from 'lucide-react';

// Fix Leaflet default icon for Next.js bundler
const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});
L.Marker.prototype.options.icon = DefaultIcon;

interface RiverMapProps {
  devices: any[];
}

// Custom cluster icon — clean numeric bubble matching the design system from Fahfon Sense
const createClusterIcon = (cluster: any) => {
  const count = cluster.getChildCount();
  const size = count >= 100 ? 44 : 38;
  return L.divIcon({
    html: `
      <div style="
        width:${size}px; height:${size}px;
        background: linear-gradient(135deg,#4f46e5,#6366f1);
        border: 2.5px solid rgba(255,255,255,0.9);
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        color: #fff; font-size: 12px;
        font-weight: 800; font-family: monospace;
        box-shadow: 0 4px 14px rgba(79,70,229,0.5);
        cursor: pointer;
      ">${count}</div>
    `,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};const RiverMap = React.memo(function RiverMap({ devices }: RiverMapProps) {
  const defaultCenter: [number, number] = [13.8420, 100.5976];

  const deferredDevices = useDeferredValue(devices);
  const isStale = deferredDevices !== devices;

  // Filter selection states for Map Legend
  const [showOnline, setShowOnline] = React.useState(true);
  const [showWarning, setShowWarning] = React.useState(true);
  const [showOffline, setShowOffline] = React.useState(true);
  const [showUnregistered, setShowUnregistered] = React.useState(true);

  // Status classification helper
  const getDeviceStatus = React.useCallback((d: any) => {
    if (d.warning_status === 'UNREGISTERED') {
      return 'UNREGISTERED';
    }
    // Offline threshold: no last seen data or last seen is older than 15 mins
    const isOffline = !d.last_seen || (new Date().getTime() - new Date(d.last_seen).getTime()) > 15 * 60 * 1000;
    if (isOffline) {
      return 'OFFLINE';
    }
    const isWarning = d.warning_status === 'WARNING' || d.warning_status === 'CRITICAL' || d.warning_status === 'EMERGENCY';
    if (isWarning) {
      return 'WARNING';
    }
    return 'ONLINE';
  }, []);

  // Filter devices with valid GPS coordinates
  const validDevices = React.useMemo(() => {
    return deferredDevices.filter((d) => {
      if (!d.install_latitude || !d.install_longitude) return false;
      const lat = parseFloat(d.install_latitude);
      const lng = parseFloat(d.install_longitude);
      return !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0;
    });
  }, [deferredDevices]);

  // Dynamic status counts based on classified status
  const stats = React.useMemo(() => {
    let online = 0;
    let warning = 0;
    let offline = 0;
    let unregistered = 0;

    validDevices.forEach((d) => {
      const status = getDeviceStatus(d);
      if (status === 'ONLINE') online++;
      else if (status === 'WARNING') warning++;
      else if (status === 'OFFLINE') offline++;
      else if (status === 'UNREGISTERED') unregistered++;
    });

    return { online, warning, offline, unregistered };
  }, [validDevices, getDeviceStatus]);

  // Filter markers to render on map based on user checks
  const filteredValidDevices = React.useMemo(() => {
    return validDevices.filter((d) => {
      const status = getDeviceStatus(d);
      if (status === 'ONLINE') return showOnline;
      if (status === 'WARNING') return showWarning;
      if (status === 'OFFLINE') return showOffline;
      if (status === 'UNREGISTERED') return showUnregistered;
      return true;
    });
  }, [validDevices, getDeviceStatus, showOnline, showWarning, showOffline, showUnregistered]);

  const noGpsCount = deferredDevices.length - validDevices.length;
  const [metric, setMetric] = React.useState<'net' | 'raw' | 'pct'>('net');

  // Build markers
  const renderedMarkers = React.useMemo(() => {
    return filteredValidDevices.map((d) => {
      const lat = parseFloat(d.install_latitude);
      const lng = parseFloat(d.install_longitude);
      const status = getDeviceStatus(d);

      // Value string based on selected metric
      let valStr = 'N/A';
      let displayVal = 'N/A';
      if (metric === 'net') {
        if (d.net_water_level_cm !== undefined && d.net_water_level_cm !== null) {
          valStr = `${d.net_water_level_cm.toFixed(1)} cm`;
          displayVal = d.net_water_level_cm.toFixed(1);
        }
      } else if (metric === 'pct') {
        if (d.water_level_pct !== undefined && d.water_level_pct !== null) {
          valStr = `${d.water_level_pct.toFixed(1)}%`;
          displayVal = `${d.water_level_pct.toFixed(0)}%`;
        }
      } else {
        if (d.level_cm !== undefined && d.level_cm !== null) {
          valStr = `${d.level_cm.toFixed(1)} cm`;
          displayVal = d.level_cm.toFixed(1);
        }
      }

      // Design distinct pin themes based on status
      let borderColor = '#4f46e5'; // default Indigo
      let bgColor = '#ffffff'; // default White
      let textColor = '#4338ca'; // default Indigo text

      if (status === 'OFFLINE') {
        borderColor = '#ef4444'; // Red
        bgColor = '#fee2e2'; // Light Red background
        textColor = '#b91c1c'; // Dark Red text
      } else if (status === 'UNREGISTERED') {
        borderColor = '#64748b'; // Slate Gray
        bgColor = '#f1f5f9'; // Light Gray background
        textColor = '#334155'; // Dark Gray text
      } else if (status === 'WARNING') {
        borderColor = '#d97706'; // Amber/Orange border
        bgColor = '#fef3c7'; // Light Yellow/Amber warning background!
        textColor = '#92400e'; // Dark Amber/Orange text
      }

      const pinIcon = L.divIcon({
        className: 'river-pin',
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;width:44px;height:50px;">
            <div style="
              width:40px;height:40px;border-radius:50%;
              background:${bgColor};border:2.5px solid ${borderColor};
              display:flex;align-items:center;justify-content:center;
              font-family:monospace;font-size:9px;font-weight:900;
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
        iconSize: [44, 50],
        iconAnchor: [22, 50],
      });

      const isSurface = (d as any).sensor_mode === 'SURFACE' || ((d as any).bottom_to_bank_cm === 0 && (d as any).bank_to_sensor_cm > 0);

      return (
        <Marker
          key={d.serial}
          position={[lat, lng]}
          icon={pinIcon}
        >
          <Popup className="custom-popup" key={d.serial}>
            <div className="p-1 space-y-3.5 min-w-[240px] text-slate-800">
              {/* Header */}
              <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                <div className="flex items-center space-x-1.5">
                  <Waves className="w-3.5 h-3.5 text-indigo-650" />
                  <span className="font-extrabold text-slate-900 text-xs tracking-wide">{d.serial}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded border uppercase ${
                    isSurface 
                      ? 'bg-amber-50 border-amber-250 text-amber-700' 
                      : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  }`}>
                    {isSurface ? '🚧 SURFACE' : '🌊 RIVER'}
                  </span>
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border tracking-wide uppercase ${
                    status === 'ONLINE'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                      : status === 'WARNING'
                      ? 'bg-amber-50 border-amber-200 text-amber-600 animate-pulse'
                      : status === 'OFFLINE'
                      ? 'bg-rose-50 border-rose-200 text-rose-600'
                      : 'bg-slate-100 border-slate-300 text-slate-600'
                  }`}>{status}</span>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100 col-span-2">
                  <span className="text-slate-400 block font-semibold">Station Name</span>
                  <span className="text-slate-700 font-bold block">{d.name}</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100">
                  <span className="text-slate-400 block font-semibold">Organization</span>
                  <span className="text-slate-700 truncate block">{d.organization_name || 'N/A'}</span>
                </div>
                <div className="bg-indigo-50 rounded-lg p-1.5 border border-indigo-100">
                  <span className="text-indigo-600 font-bold block">
                    {isSurface ? 'ระดับน้ำท่วมขัง (Flood)' : 'ระดับน้ำ (Water Level)'}
                  </span>
                  <span className="font-mono text-indigo-700 font-extrabold text-xs block">
                    {d.net_water_level_cm !== undefined && d.net_water_level_cm !== null 
                      ? `${d.net_water_level_cm.toFixed(1)} cm` 
                      : valStr}
                  </span>
                </div>
                {isSurface ? (
                  <div className="bg-amber-50/50 rounded-lg p-1.5 border border-amber-150">
                    <span className="text-amber-700 font-bold block">Station Type</span>
                    <span className="text-amber-800 font-extrabold text-[10px] block">🚧 พื้นถนน (Road)</span>
                  </div>
                ) : (
                  <>
                    {d.water_level_pct !== undefined && d.water_level_pct !== null && d.water_level_pct > 0 && (
                      <div className="bg-indigo-55/40 rounded-lg p-1.5 border border-indigo-100">
                        <span className="text-indigo-600 font-bold block">Percentage</span>
                        <span className="font-mono text-indigo-700 font-extrabold text-xs block">{d.water_level_pct.toFixed(1)} %</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {status === 'UNREGISTERED' ? (
                <Link
                  href="/dashboard/river/stations?tab=unregistered"
                  className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-[10.5px] font-extrabold py-2 rounded-xl transition-all shadow-md shadow-indigo-600/15"
                >
                  <span>ลงทะเบียนสถานี (Register)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/dashboard/river/${d.serial}`}
                    className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-[10.5px] font-extrabold py-2 rounded-xl transition-all shadow-md shadow-indigo-600/15"
                  >
                    <span>ดูรายละเอียดสถานี (Detail)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                  <Link
                    href={`/dashboard/river/stations?edit=${d.serial}`}
                    className="w-full flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-extrabold py-2 rounded-xl transition-all border border-slate-200/60"
                  >
                    <span>ตั้งค่าสถานี (Configure)</span>
                  </Link>
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      );
    });
  }, [filteredValidDevices, metric, showOnline, showWarning, showOffline, showUnregistered]);

  // Automatically fit map bounds if we have coordinates
  const centerPosition = validDevices.length > 0
    ? [parseFloat(validDevices[0].install_latitude), parseFloat(validDevices[0].install_longitude)] as [number, number]
    : defaultCenter;

  return (
    <div className={`w-full h-[450px] rounded-3xl overflow-hidden border border-slate-200 relative z-10 shadow-xl transition-opacity duration-500 ${isStale ? 'opacity-90' : 'opacity-100'}`}>
      <style>{`
        .river-pin { background: transparent !important; border: none !important; }
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

      {/* Floating Legend Panel (Fahfon Sense reuseable style) */}
      <div className="absolute top-4 right-4 z-[1000] bg-white/95 border border-slate-200 rounded-2xl p-4 shadow-xl pointer-events-auto flex flex-col space-y-3 min-w-[250px]">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
          <Activity className="w-4 h-4 text-indigo-600" />
          <span className="text-xs font-bold text-slate-800 tracking-wide uppercase">River Map Filters</span>
          {isStale && (
            <span className="ml-auto text-[9px] text-indigo-400 font-semibold animate-pulse">Syncing…</span>
          )}
        </div>

        <div className="space-y-2 text-[11px] text-slate-500">
          <div className="flex justify-between items-center space-x-2">
            <span>Metric Display:</span>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-bold text-indigo-650 focus:outline-none"
            >
              <option value="net">Net Level (cm)</option>
              <option value="raw">Sensor Distance (cm)</option>
              <option value="pct">Percentage (%)</option>
            </select>
          </div>
          <div className="flex justify-between items-center">
            <span>Stations Mapped:</span>
            <span className="font-bold text-slate-700">{filteredValidDevices.length} / {validDevices.length}</span>
          </div>
        </div>

        <div className="flex flex-col space-y-2 pt-2 border-t border-slate-100 text-[11px]">
          <label className="flex items-center space-x-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOnline}
              onChange={(e) => setShowOnline(e.target.checked)}
              className="w-3.5 h-3.5 text-indigo-650 rounded border-slate-300 focus:ring-indigo-500"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 flex-shrink-0"></span>
            <span className="text-indigo-600 font-bold">Online ({stats.online})</span>
          </label>

          <label className="flex items-center space-x-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showWarning}
              onChange={(e) => setShowWarning(e.target.checked)}
              className="w-3.5 h-3.5 text-amber-650 rounded border-slate-300 focus:ring-amber-500"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 flex-shrink-0 animate-pulse"></span>
            <span className="text-amber-650 font-bold">Warning ({stats.warning})</span>
          </label>

          <label className="flex items-center space-x-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showOffline}
              onChange={(e) => setShowOffline(e.target.checked)}
              className="w-3.5 h-3.5 text-rose-650 rounded border-slate-300 focus:ring-rose-500"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 flex-shrink-0"></span>
            <span className="text-rose-600 font-bold">Offline ({stats.offline})</span>
          </label>

          <label className="flex items-center space-x-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showUnregistered}
              onChange={(e) => setShowUnregistered(e.target.checked)}
              className="w-3.5 h-3.5 text-slate-650 rounded border-slate-300 focus:ring-slate-500"
            />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 flex-shrink-0"></span>
            <span className="text-slate-600 font-bold">Unregistered ({stats.unregistered})</span>
          </label>
        </div>
      </div>

      <MapContainer
        center={centerPosition}
        zoom={10}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.google.com/maps">Google Maps</a>'
          url="https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=th"
          subdomains={['0', '1', '2', '3']}
          maxZoom={20}
          keepBuffer={4}
          updateWhenIdle={true}
        />
        <MarkerClusterGroup
          chunkedLoading
          chunkInterval={50}
          chunkDelay={10}
          maxClusterRadius={40}
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
  prev.devices === next.devices
);

export default RiverMap;
