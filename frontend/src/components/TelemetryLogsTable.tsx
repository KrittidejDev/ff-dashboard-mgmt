"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Calendar, Clock, Database } from "lucide-react";
import { DashboardCard } from "./UI";

interface MetricConfig {
  name: string;
  color: string;
  unit: string;
}

interface TelemetryLogsTableProps {
  data: Array<any>;
  metricMetadata: { [key: string]: MetricConfig };
  title?: string;
}

export function TelemetryLogsTable({
  data,
  metricMetadata,
  title = "Historical Telemetry Raw Log Records"
}: TelemetryLogsTableProps) {
  const [visibleLogsCount, setVisibleLogsCount] = useState(50);
  const [selectedLogDate, setSelectedLogDate] = useState<string>(() => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  });

  // Automatically select the latest date from available data on mount or data change
  useEffect(() => {
    if (data && data.length > 0) {
      const dates = data.map(d => {
        const dateObj = new Date(d.time_onsite || d.time);
        return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
      });
      // Sort and pick unique latest
      const uniqueDates = Array.from(new Set(dates)).sort();
      if (uniqueDates.length > 0) {
        setSelectedLogDate(uniqueDates[uniqueDates.length - 1]);
      }
    }
  }, [data]);

  // Reset pagination count on date change
  useEffect(() => {
    setVisibleLogsCount(50);
  }, [selectedLogDate]);

  const filteredTableData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data
      .filter((point: any) => {
        const timeField = point.time_onsite || point.time;
        if (!timeField) return false;
        const d = new Date(timeField);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return dateStr === selectedLogDate;
      })
      .sort((a: any, b: any) => new Date(b.time_onsite || b.time).getTime() - new Date(a.time_onsite || a.time).getTime());
  }, [data, selectedLogDate]);

  return (
    <DashboardCard
      title={`${title} (${Object.keys(metricMetadata).length} parameters)`}
      icon={<Database className="w-5 h-5 text-indigo-650" />}
      badge={
        <div className="flex items-center space-x-3 bg-white border border-slate-200 px-3.5 py-1.5 rounded-xl shadow-sm">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-500 font-sans">เลือกวันที่:</span>
          <input
            type="date"
            value={selectedLogDate}
            onChange={(e) => setSelectedLogDate(e.target.value)}
            className="text-xs font-bold text-slate-800 bg-transparent border-none focus:outline-none cursor-pointer font-sans"
          />
        </div>
      }
    >
      <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-sm bg-white">
        <table className="w-full text-left text-[11px] border-collapse min-w-[2200px] align-middle">
          <thead>
            <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-extrabold font-sans">
              <th className="py-3.5 px-4 sticky left-0 bg-slate-50 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-slate-200">
                <Clock className="w-3.5 h-3.5 inline mr-1" />
                เวลาบันทึก
              </th>
              {Object.keys(metricMetadata).map((vKey) => (
                <th key={vKey} className="py-3.5 px-3.5">
                  {metricMetadata[vKey].name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
            {filteredTableData.length === 0 ? (
              <tr>
                <td
                  colSpan={Object.keys(metricMetadata).length + 1}
                  className="py-10 text-center text-slate-400 font-semibold font-sans"
                >
                  ไม่พบรายการตรวจวัดในช่วงที่เลือก
                </td>
              </tr>
            ) : (
              filteredTableData.slice(0, visibleLogsCount).map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-all">
                  <td className="py-2.5 px-4 font-bold text-slate-900 sticky left-0 bg-white hover:bg-slate-50/50 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)] border-r border-slate-150">
                    {new Date(row.time_onsite || row.time).toLocaleTimeString("th-TH", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit"
                    })} น.
                    <span className="text-[10px] text-slate-400 block font-normal font-sans">
                      {new Date(row.time_onsite || row.time).toLocaleDateString("th-TH", {
                        day: "2-digit",
                        month: "short"
                      })}
                    </span>
                  </td>
                  {Object.keys(metricMetadata).map((vKey) => {
                    const val = row[vKey];
                    const meta = metricMetadata[vKey];

                    let displayVal = "N/A";
                    if (val !== undefined && val !== null && val !== -999.0) {
                      if (typeof val === "number") {
                        if (vKey === "temp" || vKey === "uv" || vKey === "wind_speed" || vKey === "battery") {
                          displayVal = `${val.toFixed(1)}${meta.unit}`;
                        } else if (
                          vKey === "humid" ||
                          vKey === "co2" ||
                          vKey === "pm1" ||
                          vKey === "pm25" ||
                          vKey === "pm40" ||
                          vKey === "pm10" ||
                          vKey === "wind_direction"
                        ) {
                          displayVal = `${val.toFixed(0)}${meta.unit}`;
                        } else if (vKey === "latitude" || vKey === "longitude") {
                          displayVal = `${val.toFixed(5)}${meta.unit}`;
                        } else {
                          displayVal = `${val.toFixed(2)}${meta.unit}`;
                        }
                      } else {
                        displayVal = `${val}${meta.unit}`;
                      }
                    }

                    return (
                      <td key={vKey} className="py-2.5 px-3.5 font-bold" style={{ color: meta.color }}>
                        {displayVal}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {filteredTableData.length > visibleLogsCount && (
        <div className="flex justify-center mt-4 pt-4 border-t border-slate-100 font-sans">
          <button
            onClick={() => setVisibleLogsCount((p) => p + 50)}
            className="text-xs bg-slate-50 hover:bg-slate-100 text-indigo-700 border border-slate-200 px-4 py-2.5 rounded-xl font-bold transition shadow-sm"
          >
            แสดงข้อมูลเพิ่มเติม (+50 รายการ / มีทั้งหมด {filteredTableData.length} รายการ)
          </button>
        </div>
      )}
    </DashboardCard>
  );
}
