'use client';

import React, { useState, useEffect } from 'react';
import { X, Download, CheckSquare, Square, FileSpreadsheet, Loader2, Database } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export interface ColumnMeta {
  key: string;
  label: string;
  label_en: string;
  category: string;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedSerials: Set<string>;
  isSelectAllMatching: boolean;
  totalMatchingCount: number;
  filterCriteria: {
    search: string;
    status: string;
    tab: 'online' | 'offline';
  };
}

export default function ExportModal({
  isOpen,
  onClose,
  selectedSerials,
  isSelectAllMatching,
  totalMatchingCount,
  filterCriteria,
}: ExportModalProps) {
  const { apiFetch } = useAuth();
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Fetch Columns Metadata
  useEffect(() => {
    if (!isOpen) return;

    const fetchSchema = async () => {
      setLoadingSchema(true);
      try {
        const res = await apiFetch(`${API_BASE_URL}/river/export/columns`);
        if (res.ok) {
          const data: ColumnMeta[] = await res.json();
          setColumns(data || []);
          // Default select all columns
          setSelectedKeys(new Set(data.map((c) => c.key)));
        }
      } catch (err) {
        console.error('Failed to fetch exportable columns', err);
      } finally {
        setLoadingSchema(false);
      }
    };

    fetchSchema();
  }, [isOpen, apiFetch]);

  if (!isOpen) return null;

  // Categorize columns
  const categories = Array.from(new Set(columns.map((c) => c.category)));

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleCategory = (catName: string) => {
    const catKeys = columns.filter((c) => c.category === catName).map((c) => c.key);
    const allSelected = catKeys.every((k) => selectedKeys.has(k));

    setSelectedKeys((prev) => {
      const next = new Set(prev);
      catKeys.forEach((k) => {
        if (allSelected) {
          next.delete(k);
        } else {
          next.add(k);
        }
      });
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedKeys(new Set(columns.map((c) => c.key)));
  };

  const handleDeselectAll = () => {
    setSelectedKeys(new Set());
  };

  const handleDownloadCSV = async () => {
    if (selectedKeys.size === 0) return;
    setExporting(true);

    try {
      const payload = {
        serials: Array.from(selectedSerials),
        search: filterCriteria.search,
        status: filterCriteria.status,
        tab: filterCriteria.tab,
        select_all: isSelectAllMatching || selectedSerials.size === 0,
        columns: Array.from(selectedKeys),
      };

      const res = await apiFetch(`${API_BASE_URL}/river/export/csv`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Export failed with status ' + res.status);
      }

      // Handle CSV File Download Stream
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `river_telemetry_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      onClose();
    } catch (err) {
      console.error('Export CSV failed', err);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลด CSV กรุณาลองใหม่อีกครั้ง');
    } finally {
      setExporting(false);
    }
  };

  const exportCountText = isSelectAllMatching || selectedSerials.size === 0
    ? `${totalMatchingCount} รายการทั้งหมดที่ตรงตามเงื่อนไข`
    : `${selectedSerials.size} รายการที่เลือกข้ามหน้า`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-650">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-lg">Export DB Columns Configuration</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                เลือกคอลัมน์จาก Database ที่ต้องการส่งออกเป็นไฟล์ CSV (กำลังส่งออก {exportCountText})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Quick Select Controls */}
          <div className="flex items-center justify-between bg-slate-100/70 p-3 rounded-2xl">
            <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
              <Database className="w-4 h-4 text-indigo-600" />
              เลือกคอลัมน์ ({selectedKeys.size}/{columns.length})
            </span>
            <div className="flex items-center space-x-2 text-xs font-bold">
              <button
                onClick={handleSelectAll}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-indigo-650 transition shadow-sm"
              >
                เลือกทั้งหมด
              </button>
              <button
                onClick={handleDeselectAll}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-600 transition shadow-sm"
              >
                ยกเลิกทั้งหมด
              </button>
            </div>
          </div>

          {loadingSchema ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              <span className="text-xs font-medium">กำลังโหลด Schema คอลัมน์จาก Database...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {categories.map((cat) => {
                const catCols = columns.filter((c) => c.category === cat);
                const allSelected = catCols.every((c) => selectedKeys.has(c.key));

                return (
                  <div key={cat} className="border border-slate-200/80 rounded-2xl p-4 bg-white shadow-xs">
                    <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                        {cat}
                      </span>
                      <button
                        onClick={() => toggleCategory(cat)}
                        className="text-[11px] font-bold text-indigo-600 hover:underline"
                      >
                        {allSelected ? 'ยกเลิกหมวดนี้' : 'เลือกทั้งหมวดนี้'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {catCols.map((col) => {
                        const isChecked = selectedKeys.has(col.key);
                        return (
                          <label
                            key={col.key}
                            onClick={() => toggleKey(col.key)}
                            className={`flex items-start space-x-2.5 p-2.5 rounded-xl border cursor-pointer transition select-none ${
                              isChecked
                                ? 'bg-indigo-50/50 border-indigo-200 text-slate-900'
                                : 'bg-slate-50/50 border-slate-200/60 text-slate-500 hover:bg-slate-100/50'
                            }`}
                          >
                            <div className="mt-0.5 text-indigo-600">
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-indigo-650" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                            <div className="flex-1">
                              <span className="text-xs font-bold block">{col.label}</span>
                              <span className="text-[10px] font-mono text-slate-400 block">{col.key}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            ระบบจะสร้างไฟล์ UTF-8 CSV รองรับการใช้งานใน Microsoft Excel
          </span>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-650 hover:bg-slate-200/60 rounded-xl transition"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleDownloadCSV}
              disabled={selectedKeys.size === 0 || exporting}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-5 py-2 rounded-xl text-xs font-bold transition shadow-md shadow-indigo-200"
            >
              {exporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>กำลัง Generate CSV...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>เริ่มส่งออก CSV ({selectedKeys.size} คอลัมน์)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
