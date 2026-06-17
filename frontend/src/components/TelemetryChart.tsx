"use client";

import React, { useMemo, useState, useRef, useEffect, useCallback } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
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

interface MetricConfig {
  name: string;
  color: string;
  unit: string;
  type?: "line" | "area";
}

interface TelemetryChartProps {
  data: Array<any>;
  xAxisKey?: string;
  activeMetrics: Array<string>;
  metricMetadata: { [key: string]: MetricConfig };
  height?: number;
  warningThresh?: number;
  criticalThresh?: number;
  emergencyThresh?: number;
  gradientId?: string;
}

const ChartBase = React.memo(function ChartBase({
  data,
  xAxisKey,
  yMin,
  yMax,
  gradientId,
  activeMetrics,
  metricMetadata,
  warningThresh,
  criticalThresh,
  emergencyThresh,
}: {
  data: Array<any>;
  xAxisKey: string;
  yMin: number;
  yMax: number;
  gradientId: string;
  activeMetrics: Array<string>;
  metricMetadata: { [key: string]: MetricConfig };
  warningThresh?: number;
  criticalThresh?: number;
  emergencyThresh?: number;
}) {
  const isSingleArea = activeMetrics.length === 1 && metricMetadata[activeMetrics[0]]?.type === "area";

  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={metricMetadata[activeMetrics[0]]?.color || "#4f46e5"} stopOpacity={0.15} />
          <stop offset="95%" stopColor={metricMetadata[activeMetrics[0]]?.color || "#4f46e5"} stopOpacity={0.0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
      <XAxis
        dataKey={xAxisKey}
        tickLine={false}
        axisLine={false}
        tick={{ fontSize: 9, fontWeight: 700, fill: "#94a3b8" }}
      />
      {isSingleArea ? (
        <YAxis hide width={0} domain={[yMin, yMax]} />
      ) : (
        <YAxis
          stroke="#94a3b8"
          fontSize={9}
          tickLine={false}
          axisLine={false}
          domain={[yMin, yMax]}
          tickFormatter={(v: number) => v.toFixed(1)}
        />
      )}

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

      {activeMetrics.map((key) => {
        const meta = metricMetadata[key];
        if (!meta) return null;
        if (meta.type === "area") {
          return (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={meta.color}
              strokeWidth={2}
              fillOpacity={1}
              fill={`url(#${gradientId})`}
              isAnimationActive={true}
              animationDuration={300}
              dot={{ r: 4.5, strokeWidth: 1.5, fill: meta.color, stroke: '#ffffff' }}
              activeDot={{ r: 6.5, strokeWidth: 0, fill: meta.color }}
            />
          );
        } else {
          return (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={meta.name}
              stroke={meta.color}
              strokeWidth={2.5}
              dot={{ r: 5, strokeWidth: 1.5, fill: meta.color, stroke: '#ffffff' }}
              activeDot={{ r: 7.5, strokeWidth: 0, fill: meta.color }}
            />
          );
        }
      })}
    </>
  );
}, (prev, next) => {
  return prev.data === next.data
    && prev.xAxisKey === next.xAxisKey
    && prev.yMin === next.yMin
    && prev.yMax === next.yMax
    && prev.gradientId === next.gradientId
    && JSON.stringify(prev.activeMetrics) === JSON.stringify(next.activeMetrics)
    && prev.warningThresh === next.warningThresh
    && prev.criticalThresh === next.criticalThresh
    && prev.emergencyThresh === next.emergencyThresh;
});

export function TelemetryChart({
  data,
  xAxisKey = "label",
  activeMetrics,
  metricMetadata,
  height = 350,
  warningThresh,
  criticalThresh,
  emergencyThresh,
  gradientId = "telemetryChartGradient"
}: TelemetryChartProps) {
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragScrollLeftRef = useRef(0);
  const mouseMovedRef = useRef(false);

  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [isManualSelection, setIsManualSelection] = useState(false);

  const firstDataLabel = data?.[0]?.[xAxisKey];
  const [prevFirstDataLabel, setPrevFirstDataLabel] = useState(firstDataLabel);

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
    const activeSelLabel = isManualSelection ? selectedLabel : (selectedLabel || processedData[processedData.length - 1]?.[xAxisKey] || null);
    if (activeSelLabel !== null) {
      const index = processedData.findIndex(d => d[xAxisKey] === activeSelLabel);
      if (index !== -1) return index;
    }
    return null;
  }, [processedData, selectedLabel, isManualSelection, xAxisKey]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const performScroll = () => {
      const scrollWidth = container.scrollWidth;
      const clientWidth = container.clientWidth;

      if (safeSelectedIdx !== null && processedData.length > 1) {
        const ratio = safeSelectedIdx / (processedData.length - 1);
        if (isManualSelection) {
          container.scrollLeft = (ratio * scrollWidth) - (clientWidth / 2);
        } else {
          container.scrollLeft = scrollWidth - clientWidth;
        }
      } else {
        container.scrollLeft = scrollWidth - clientWidth;
      }
    };

    const rafId1 = requestAnimationFrame(() => {
      requestAnimationFrame(performScroll);
    });

    return () => {
      cancelAnimationFrame(rafId1);
    };
  }, [processedData, zoomLevel, safeSelectedIdx, isManualSelection]);

  const chartWidth = useMemo(() => {
    return `${Math.max(1200, processedData.length * 10 * zoomLevel)}px`;
  }, [processedData, zoomLevel]);

  const selectedPoint = useMemo(() => {
    if (safeSelectedIdx === null || !processedData[safeSelectedIdx]) return null;
    return processedData[safeSelectedIdx];
  }, [processedData, safeSelectedIdx]);

  const { yMin, yMax } = useMemo(() => {
    if (!processedData || processedData.length === 0) return { yMin: 0, yMax: 100 };
    
    let allValues: number[] = [];
    processedData.forEach(d => {
      activeMetrics.forEach(key => {
        const v = d[key];
        if (v !== null && v !== undefined && !isNaN(v) && v !== -999.0) {
          allValues.push(v);
        }
      });
    });

    if (allValues.length === 0) return { yMin: 0, yMax: 100 };
    
    let minVal = Math.min(...allValues);
    let maxVal = Math.max(...allValues);
    
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
  }, [processedData, activeMetrics, warningThresh, criticalThresh, emergencyThresh]);

  const handleChartClick = useCallback((state: any) => {
    if (mouseMovedRef.current) return;

    let clickLabel: string | null = null;

    if (state && typeof state.activeLabel === "string") {
      clickLabel = state.activeLabel;
    }

    if (!clickLabel && state && Array.isArray(state.activePayload) && state.activePayload.length > 0) {
      const payloadItem = state.activePayload[0];
      const p = payloadItem?.payload;
      if (p && typeof p[xAxisKey] === "string") {
        clickLabel = p[xAxisKey];
      }
    }

    if (!clickLabel && state && typeof state.activeTooltipIndex === "number") {
      const idx = state.activeTooltipIndex;
      if (idx >= 0 && idx < processedData.length) {
        clickLabel = processedData[idx]?.[xAxisKey] || null;
      }
    }

    if (clickLabel) {
      setSelectedLabel(clickLabel);
      setIsManualSelection(true);
    }
  }, [processedData, xAxisKey]);

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

  const isSingleArea = activeMetrics.length === 1 && metricMetadata[activeMetrics[0]]?.type === "area";

  return (
    <div className="relative w-full flex flex-col gap-2">
      <div className="flex justify-between items-center px-1 shrink-0">
        <span className="text-[10px] font-black text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-md animate-pulse">
          ↔️ ปัดหรือลากเพื่อเลื่อนดูแผนภูมิ (ซ้าย-ขวา)
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
      <div className="flex w-full overflow-hidden">
        {/* Frozen Left Y-Axis (only if single area, otherwise we display standard inline YAxis) */}
        {isSingleArea && (
          <div style={{ width: "36px", height: `${height}px`, position: "relative" }} className="shrink-0 select-none pointer-events-none z-10 bg-transparent">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              <AreaChart data={processedData} margin={{ top: 15, right: 0, left: 0, bottom: 5 }}>
                <XAxis dataKey={xAxisKey} hide />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 9, fontWeight: 700, fill: "#94a3b8" }}
                  width={32}
                  domain={[yMin, yMax]}
                  tickFormatter={(v: number) => v.toFixed(0)}
                />
                <Area type="monotone" dataKey={activeMetrics[0]} stroke="transparent" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Scrollable Chart Container */}
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          className="flex-1 min-w-0 no-scrollbar rounded-r-2xl overflow-x-auto cursor-grab active:cursor-grabbing border border-slate-150/65 shadow-inner"
        >
          <div
            style={{ width: chartWidth, height: `${height}px`, minWidth: "100%", position: "relative" }}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
              {isSingleArea ? (
                <AreaChart
                  key={zoomLevel}
                  data={processedData}
                  margin={{ top: 15, right: 15, left: 10, bottom: 5 }}
                  onClick={handleChartClick}
                >
                  <ChartBase
                    data={processedData}
                    xAxisKey={xAxisKey}
                    yMin={yMin}
                    yMax={yMax}
                    gradientId={gradientId}
                    activeMetrics={activeMetrics}
                    metricMetadata={metricMetadata}
                    warningThresh={warningThresh}
                    criticalThresh={criticalThresh}
                    emergencyThresh={emergencyThresh}
                  />
                  <Tooltip
                    trigger="click"
                    active={safeSelectedIdx !== null ? true : undefined}
                    defaultIndex={safeSelectedIdx ?? undefined}
                    cursor={{ stroke: "#4f46e5", strokeWidth: 2, strokeDasharray: "4 3" }}
                    contentStyle={{
                      borderRadius: "12px",
                      border: "1px solid #bfdbfe",
                      backgroundColor: "#eff6ff",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#1e40af",
                      boxShadow: "0 4px 12px rgba(79, 70, 229, 0.15)",
                    }}
                    labelFormatter={(label, payload) => {
                      const matched = payload?.[0]?.payload;
                      return matched ? matched.fullLabel : String(label);
                    }}
                    formatter={(value) => [`${Number(value).toFixed(1)} ${metricMetadata[activeMetrics[0]]?.unit || ""}`, metricMetadata[activeMetrics[0]]?.name]}
                  />

                  {selectedPoint && selectedPoint[activeMetrics[0]] !== null && (
                    <>
                      <ReferenceLine
                        x={selectedPoint[xAxisKey]}
                        stroke="#4f46e5"
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        ifOverflow="extendDomain"
                      />
                      <ReferenceLine
                        y={selectedPoint[activeMetrics[0]]}
                        stroke="#4f46e5"
                        strokeWidth={1}
                        strokeDasharray="4 3"
                        strokeOpacity={0.45}
                        ifOverflow="extendDomain"
                      />
                      <ReferenceDot
                        x={selectedPoint[xAxisKey]}
                        y={selectedPoint[activeMetrics[0]]}
                        r={12}
                        fill="#4f46e5"
                        fillOpacity={0.15}
                        stroke="#4f46e5"
                        strokeWidth={2}
                        ifOverflow="extendDomain"
                      />
                      <ReferenceDot
                        x={selectedPoint[xAxisKey]}
                        y={selectedPoint[activeMetrics[0]]}
                        r={6}
                        fill="#ffffff"
                        stroke="#4f46e5"
                        strokeWidth={3}
                        ifOverflow="extendDomain"
                      >
                        <Label
                          value={`${Number(selectedPoint[activeMetrics[0]]).toFixed(1)} ${metricMetadata[activeMetrics[0]]?.unit || ""}`}
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
              ) : (
                <LineChart
                  key={zoomLevel}
                  data={processedData}
                  margin={{ top: 15, right: 15, left: 10, bottom: 5 }}
                  onClick={handleChartClick}
                >
                  <ChartBase
                    data={processedData}
                    xAxisKey={xAxisKey}
                    yMin={yMin}
                    yMax={yMax}
                    gradientId={gradientId}
                    activeMetrics={activeMetrics}
                    metricMetadata={metricMetadata}
                  />
                  <Tooltip
                    trigger="click"
                    active={safeSelectedIdx !== null ? true : undefined}
                    defaultIndex={safeSelectedIdx ?? undefined}
                    cursor={{ stroke: "#4f46e5", strokeWidth: 2, strokeDasharray: "4 3" }}
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid rgba(15, 23, 42, 0.08)',
                      borderRadius: '12px',
                      fontSize: '11px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                      color: '#0f172a',
                    }}
                    labelFormatter={(label, payload) => {
                      const matched = payload?.[0]?.payload;
                      return matched ? (matched.fullLabel || String(label)) : String(label);
                    }}
                    formatter={(value, name, props) => {
                      const key = props.dataKey as string;
                      const unit = metricMetadata[key]?.unit || "";
                      return [`${Number(value).toFixed(1)} ${unit}`, name];
                    }}
                  />

                  {selectedPoint && (
                    <>
                      <ReferenceLine
                        x={selectedPoint[xAxisKey]}
                        stroke="#4f46e5"
                        strokeWidth={2}
                        strokeDasharray="4 3"
                        ifOverflow="extendDomain"
                      />
                      {activeMetrics.map((key) => {
                        const val = selectedPoint[key];
                        const meta = metricMetadata[key];
                        if (val === null || val === undefined || isNaN(val) || val === -999.0 || !meta) return null;
                        return (
                          <React.Fragment key={key}>
                            <ReferenceDot
                              x={selectedPoint[xAxisKey]}
                              y={val}
                              r={10}
                              fill={meta.color}
                              fillOpacity={0.15}
                              stroke={meta.color}
                              strokeWidth={2}
                              ifOverflow="extendDomain"
                            />
                            <ReferenceDot
                              x={selectedPoint[xAxisKey]}
                              y={val}
                              r={5}
                              fill="#ffffff"
                              stroke={meta.color}
                              strokeWidth={3}
                              ifOverflow="extendDomain"
                            >
                              <Label
                                value={`${Number(val).toFixed(1)} ${meta.unit || ""}`}
                                position="top"
                                offset={12}
                                fontSize={10}
                                fontWeight={800}
                                fill={meta.color}
                              />
                            </ReferenceDot>
                          </React.Fragment>
                        );
                      })}
                    </>
                  )}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
