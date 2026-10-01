"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceDot,
  Label,
} from "recharts";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

export interface WaterChartDataItem {
  label: string;
  fullLabel: string;
  value: number | null;
  rawValue?: number | null;
  rawDistance?: number | null;
  filteredDistance?: number | null;
  filterStatus?: string;
}

interface WaterChartProps {
  data: WaterChartDataItem[];
  height?: number;
  warningThresh?: number;
  criticalThresh?: number;
  emergencyThresh?: number;
  gradientId?: string;
  showRawLine?: boolean;
  theme?: 'light' | 'dark';
}

const ChartBase = React.memo(function ChartBase({
  data,
  yMin,
  yMax,
  gradientId,
  warningThresh,
  criticalThresh,
  emergencyThresh,
  showRawLine = true,
}: {
  data: WaterChartDataItem[];
  yMin: number;
  yMax: number;
  gradientId: string;
  warningThresh?: number;
  criticalThresh?: number;
  emergencyThresh?: number;
  showRawLine?: boolean;
}) {
  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.18} />
          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
      <XAxis
        dataKey="label"
        tickLine={false}
        axisLine={false}
        tick={{ fontSize: 9, fontWeight: 700, fill: "#94a3b8" }}
      />
      <YAxis hide width={0} domain={[yMin, yMax]} tickFormatter={(v: number) => v.toFixed(1)} />
      
      {warningThresh !== undefined && (
        <ReferenceLine
          y={warningThresh}
          stroke="#6366f1"
          strokeDasharray="3 3"
          label={{ value: 'Warning', fill: '#6366f1', fontSize: 9, position: 'top', fontWeight: 'bold' }}
        />
      )}
      {criticalThresh !== undefined && (
        <ReferenceLine
          y={criticalThresh}
          stroke="#d97706"
          strokeDasharray="3 3"
          label={{ value: 'Critical', fill: '#d97706', fontSize: 9, position: 'top', fontWeight: 'bold' }}
        />
      )}
      {emergencyThresh !== undefined && (
        <ReferenceLine
          y={emergencyThresh}
          stroke="#e11d48"
          strokeDasharray="3 3"
          label={{ value: 'Emergency', fill: '#e11d48', fontSize: 9, position: 'top', fontWeight: 'bold' }}
        />
      )}

      {/* Raw Water Level Line (Dashed Amber/Orange) */}
      {showRawLine && (
        <Line
          type="monotone"
          dataKey="rawValue"
          stroke="#f59e0b"
          strokeWidth={1.75}
          strokeDasharray="4 3"
          dot={{ r: 4, strokeWidth: 1.5, fill: '#f59e0b', stroke: '#ffffff' }}
          activeDot={{ r: 6, strokeWidth: 2, fill: '#f59e0b', stroke: '#ffffff' }}
          isAnimationActive={true}
          animationDuration={300}
          connectNulls={true}
          name="ระดับน้ำดิบ (Raw)"
        />
      )}

      {/* Main Calculated Net Water Level Area (Solid Indigo) */}
      <Area
        type="monotone"
        dataKey="value"
        stroke="#4f46e5"
        strokeWidth={2.25}
        fillOpacity={1}
        fill={`url(#${gradientId})`}
        isAnimationActive={true}
        animationDuration={300}
        connectNulls={true}
        dot={{ r: 5, strokeWidth: 1.5, fill: '#4f46e5', stroke: '#ffffff' }}
        activeDot={{ r: 7.5, strokeWidth: 2, fill: '#4f46e5', stroke: '#ffffff' }}
        name="ระดับน้ำคำนวณ (Net)"
      />
    </>
  );
}, (prev, next) => {
  return prev.data === next.data
    && prev.yMin === next.yMin
    && prev.yMax === next.yMax
    && prev.gradientId === next.gradientId
    && prev.warningThresh === next.warningThresh
    && prev.criticalThresh === next.criticalThresh
    && prev.emergencyThresh === next.emergencyThresh
    && prev.showRawLine === next.showRawLine;
});

export function WaterChart({
  data,
  height = 350,
  warningThresh,
  criticalThresh,
  emergencyThresh,
  gradientId = "waterChartGradient",
  showRawLine = true,
  theme = 'light',
}: WaterChartProps) {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragScrollLeftRef = useRef(0);
  const mouseMovedRef = useRef(false);

  // Dynamic maximum points threshold depending on zoomLevel to ensure peak rendering speed
  const maxPoints = useMemo(() => {
    if (zoomLevel <= 1) return 120;
    return Math.min(300, Math.round(120 * zoomLevel));
  }, [zoomLevel]);

  // Adjust selectedTime during render when data first label changes
  const firstDataLabel = data?.[0]?.label;
  const [prevFirstDataLabel, setPrevFirstDataLabel] = useState(firstDataLabel);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [isManualSelection, setIsManualSelection] = useState(false);

  if (firstDataLabel !== prevFirstDataLabel) {
    setPrevFirstDataLabel(firstDataLabel);
    setSelectedLabel(null);
    setIsManualSelection(false);
  }

  const processedData = useMemo(() => {
    return data || [];
  }, [data]);

  const safeSelectedIdx = useMemo(() => {
    if (processedData.length === 0) return null;
    const activeSelLabel = isManualSelection ? selectedLabel : (selectedLabel || processedData[processedData.length - 1]?.label || null);
    if (activeSelLabel !== null) {
      const index = processedData.findIndex(d => d.label === activeSelLabel);
      if (index !== -1) return index;
    }
    return null;
  }, [processedData, selectedLabel, isManualSelection]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const performScroll = () => {
      if (!container) return;
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;

      if (isManualSelection && safeSelectedIdx !== null && processedData.length > 1) {
        const ratio = safeSelectedIdx / (processedData.length - 1);
        container.scrollLeft = (ratio * scrollWidth) - (clientWidth / 2);
      } else {
        // ALWAYS scroll smoothly to the latest data point at the far right!
        container.scrollLeft = scrollWidth - clientWidth;
      }
    };

    performScroll();
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(performScroll);
    });
    const t1 = setTimeout(performScroll, 50);
    const t2 = setTimeout(performScroll, 150);
    const t3 = setTimeout(performScroll, 350);
    const t4 = setTimeout(performScroll, 700);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [processedData, zoomLevel, safeSelectedIdx, isManualSelection]);

  const chartWidth = useMemo(() => {
    return `${Math.max(1200, processedData.length * 10 * zoomLevel)}px`;
  }, [processedData, zoomLevel]);

  const selectedPoint = useMemo(() => {
    if (safeSelectedIdx === null || !processedData[safeSelectedIdx]) return null;
    const pt = processedData[safeSelectedIdx];
    return {
      label: pt.label,
      fullLabel: pt.fullLabel,
      value: pt.value,
      rawValue: pt.rawValue,
      rawDistance: pt.rawDistance,
      filterStatus: pt.filterStatus,
    };
  }, [processedData, safeSelectedIdx]);

  const { yMin, yMax } = useMemo(() => {
    if (!processedData || processedData.length === 0) return { yMin: 0, yMax: 100 };
    const values = processedData.map(d => d.value).filter((v): v is number => v !== null && !isNaN(v));
    
    // Include raw values in bounds calculation if raw line is displayed
    if (showRawLine) {
      processedData.forEach(d => {
        if (d.rawValue !== null && d.rawValue !== undefined && !isNaN(d.rawValue)) {
          values.push(d.rawValue);
        }
      });
    }

    if (values.length === 0) return { yMin: 0, yMax: 100 };
    
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);
    
    // Include threshold lines in yMin/yMax limits if present
    const thresholdsList = [warningThresh, criticalThresh, emergencyThresh].filter((t): t is number => t !== undefined);
    if (thresholdsList.length > 0) {
      minVal = Math.min(minVal, ...thresholdsList);
      maxVal = Math.max(maxVal, ...thresholdsList);
    }

    const range = maxVal - minVal;
    const padding = range > 0 ? Math.max(5, range * 0.15) : 10;
    return {
      yMin: Math.max(0, minVal - padding),
      yMax: maxVal + padding,
    };
  }, [processedData, warningThresh, criticalThresh, emergencyThresh, showRawLine]);

  const handleChartClick = useCallback((state: any) => {
    if (mouseMovedRef.current) return;

    let clickLabel: string | null = null;

    if (state && typeof state.activeLabel === "string") {
      clickLabel = state.activeLabel;
    }

    if (!clickLabel && state && Array.isArray(state.activePayload) && state.activePayload.length > 0) {
      const payloadItem = state.activePayload[0];
      const p = payloadItem?.payload;
      if (p && typeof p.label === "string") {
        clickLabel = p.label;
      }
    }

    if (!clickLabel && state && typeof state.activeTooltipIndex === "number") {
      const idx = state.activeTooltipIndex;
      if (idx >= 0 && idx < processedData.length) {
        clickLabel = processedData[idx]?.label || null;
      }
    }

    if (clickLabel) {
      setSelectedLabel(clickLabel);
      setIsManualSelection(true);
    }
  }, [processedData]);

  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.5, 1));
  const handleResetZoom = () => setZoomLevel(1);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !containerRef.current) return;
    mouseMovedRef.current = false;
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragScrollLeftRef.current = containerRef.current.scrollLeft;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const dx = Math.abs(e.clientX - dragStartXRef.current);
    if (dx > 3) mouseMovedRef.current = true;
    e.preventDefault();
    const walk = (e.clientX - dragStartXRef.current) * 1.5;
    containerRef.current.scrollLeft = dragScrollLeftRef.current - walk;
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    setTimeout(() => { mouseMovedRef.current = false; }, 0);
  };

  const handleMouseLeave = () => {
    isDraggingRef.current = false;
    mouseMovedRef.current = false;
  };

  if (!isMounted) {
    return <div style={{ height: `${height}px` }} className="w-full bg-transparent" />;
  }

  return (
    <div className="relative w-full flex flex-col gap-2">
      <div className="flex justify-between items-center px-1 shrink-0">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center space-x-1 ${
          theme === 'dark'
            ? 'text-cyan-300 bg-slate-800 border border-slate-700 shadow-sm'
            : 'text-indigo-900 bg-indigo-100 border border-indigo-200'
        }`}>
          <span>↔️ เลื่อนดูกราฟย้อนหลัง (ซ้าย-ขวา)</span>
        </span>
        <div className="flex items-center gap-1 bg-slate-100/80 backdrop-blur-xs p-1 rounded-xl border border-slate-200/50 shadow-sm">
          <button
            onClick={handleZoomOut}
            disabled={zoomLevel === 1}
            className={`p-1.5 rounded-lg transition-all active:scale-95 ${
              zoomLevel === 1
                ? "text-slate-350 cursor-not-allowed"
                : "text-slate-650 hover:bg-zinc-200/70 hover:text-slate-900 cursor-pointer"
            }`}
            title="ซูมออก"
          >
            <ZoomOut size={13} />
          </button>
          <button
            onClick={handleResetZoom}
            disabled={zoomLevel === 1}
            className={`p-1.5 rounded-lg transition-all active:scale-95 ${
              zoomLevel === 1
                ? "text-slate-350 cursor-not-allowed"
                : "text-slate-650 hover:bg-zinc-200/70 hover:text-slate-900 cursor-pointer"
            }`}
            title="รีเซ็ตการซูม"
          >
            <RotateCcw size={13} />
          </button>
          <button
            onClick={handleZoomIn}
            disabled={zoomLevel === 4}
            className={`p-1.5 rounded-lg transition-all active:scale-95 ${
              zoomLevel === 4
                ? "text-slate-350 cursor-not-allowed"
                : "text-slate-650 hover:bg-zinc-200/70 hover:text-slate-900 cursor-pointer"
            }`}
            title="ซูมเข้า"
          >
            <ZoomIn size={13} />
          </button>
        </div>
      </div>
      <div className={`flex w-full overflow-hidden rounded-2xl border shadow-sm p-3 pb-6 ${theme === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200/80'}`}>

        {/* Frozen Left Y-Axis */}
        <div style={{ width: "40px", height: `${height - 75}px`, position: "relative" }} className={`shrink-0 select-none pointer-events-none z-10 ${theme === 'dark' ? 'bg-slate-950' : 'bg-white'}`}>

          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
            <AreaChart data={processedData} margin={{ top: 15, right: 0, left: 0, bottom: 35 }}>
              <XAxis dataKey="label" hide />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 9, fontWeight: 700, fill: "#94a3b8" }}
                width={36}
                domain={[yMin, yMax]}
                tickFormatter={(v: number) => v.toFixed(0)}
              />
              <Area type="monotone" dataKey="value" stroke="transparent" fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Scrollable Area Chart Container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          className="flex-1 min-w-0 no-scrollbar overflow-x-auto cursor-grab active:cursor-grabbing"
        >
          <div
            style={{ width: chartWidth, height: `${height - 75}px`, minWidth: "100%", position: "relative" }}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <AreaChart
                key={`${zoomLevel}_${showRawLine}`}
                data={processedData}
                margin={{ top: 15, right: 25, left: 10, bottom: 35 }}
                onClick={handleChartClick}
              >
                <ChartBase
                  data={processedData}
                  yMin={yMin}
                  yMax={yMax}
                  gradientId={gradientId}
                  warningThresh={warningThresh}
                  criticalThresh={criticalThresh}
                  emergencyThresh={emergencyThresh}
                  showRawLine={showRawLine}
                />
                <Tooltip
                  trigger="click"
                  active={safeSelectedIdx !== null ? true : undefined}
                  defaultIndex={safeSelectedIdx ?? undefined}
                  cursor={{ stroke: "#4f46e5", strokeWidth: 1.5, strokeDasharray: "4 3" }}
                  content={({ active, payload, label }) => {
                    if (!payload || payload.length === 0) return null;
                    const dataPoint = payload[0]?.payload as WaterChartDataItem | undefined;
                    if (!dataPoint) return null;

                    const netVal = dataPoint.value;
                    const rawVal = dataPoint.rawValue;
                    const rawDist = dataPoint.rawDistance;
                    const filterStatus = dataPoint.filterStatus || 'NORMAL';

                    return (
                      <div className={`rounded-xl border backdrop-blur-md p-3 shadow-2xl text-xs space-y-2 min-w-[210px] ${theme === 'dark' ? 'bg-slate-900/95 border-slate-700 text-white' : 'bg-white/95 border-indigo-100 text-slate-800'}`}>

                        <div className="font-bold text-slate-700 border-b border-slate-100 pb-1 flex items-center justify-between gap-2">
                          <span className="truncate">⏰ {dataPoint.fullLabel || label}</span>
                          {filterStatus && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black shrink-0 ${
                              filterStatus === 'DRY_ROAD' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                              filterStatus === 'VEHICLE_BLOCKED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                              filterStatus === 'FLASH_FLOOD_BYPASS' ? 'bg-indigo-100 text-indigo-800 border border-indigo-300 animate-pulse' :
                              'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}>
                              {filterStatus}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5 font-bold text-indigo-700">
                              <span className="w-2 h-2 rounded-full bg-indigo-600 inline-block" />
                              ระดับน้ำคำนวณ (Net):
                            </span>
                            <span className="font-black text-indigo-900 font-mono text-sm">
                              {netVal !== null && netVal !== undefined ? `${netVal.toFixed(1)} cm` : '-'}
                            </span>
                          </div>
                          {rawVal !== null && rawVal !== undefined && (
                            <div className="flex items-center justify-between gap-3 text-slate-600">
                              <span className="flex items-center gap-1.5 font-semibold text-amber-700">
                                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                                ระดับน้ำดิบ (Raw):
                              </span>
                              <span className="font-bold text-amber-900 font-mono">
                                {`${rawVal.toFixed(1)} cm`}
                              </span>
                            </div>
                          )}
                          {rawDist !== null && rawDist !== undefined && (
                            <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-100 flex justify-between">
                              <span>ระยะเซนเซอร์:</span>
                              <span>{`${rawDist.toFixed(1)} cm`}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />

                {selectedPoint && selectedPoint.value !== null && (
                  <>
                    <ReferenceLine
                      x={selectedPoint.label}
                      stroke="#4f46e5"
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      ifOverflow="extendDomain"
                    />
                    <ReferenceLine
                      y={selectedPoint.value}
                      stroke="#4f46e5"
                      strokeWidth={1}
                      strokeDasharray="4 3"
                      strokeOpacity={0.45}
                      ifOverflow="extendDomain"
                    />
                    <ReferenceDot
                      x={selectedPoint.label}
                      y={selectedPoint.value}
                      r={12}
                      fill="#4f46e5"
                      fillOpacity={0.15}
                      stroke="#4f46e5"
                      strokeWidth={2}
                      ifOverflow="extendDomain"
                    />
                    <ReferenceDot
                      x={selectedPoint.label}
                      y={selectedPoint.value}
                      r={6}
                      fill="#ffffff"
                      stroke="#4f46e5"
                      strokeWidth={3}
                      ifOverflow="extendDomain"
                    >
                      <Label
                        value={`${selectedPoint.value.toFixed(1)} cm`}
                        position="top"
                        offset={14}
                        fontSize={11}
                        fontWeight={800}
                        fill="#4f46e5"
                      />
                    </ReferenceDot>
                  </>
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
