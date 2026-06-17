'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import ConflictResolver from '@/components/ConflictResolver';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function ConflictResolverPage() {
  const { apiFetch } = useAuth();
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConflicts = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/fahfon-sense/conflicts`);
      if (res.ok) {
        const data = await res.json();
        setConflicts(data || []);
      }
    } catch (err) {
      console.error('Failed to load conflicts report', err);
    } finally {
      setLoading(false);
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
        fetchConflicts();
      } else {
        alert('Failed to delete duplicate document.');
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchConflicts();
  }, []);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">Conflict Resolver</h1>
          <p className="text-gray-400 text-sm mt-1">Deduplicate and clean up registration entries across MongoDB and PostgreSQL.</p>
        </div>
        <button
          onClick={fetchConflicts}
          className="flex items-center space-x-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-4 py-2 rounded-xl text-sm font-semibold transition"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Conflicts</span>
        </button>
      </div>

      {/* Warning Box */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex items-start space-x-4">
        <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
        <div className="space-y-1.5">
          <h4 className="font-bold text-white text-sm">Deduplication Optimization Strategy</h4>
          <p className="text-gray-400 text-xs leading-relaxed">
            Data specifications ('iotDeviceInfo') and registrations ('iotRegistedIMEI') are pulled automatically from MongoDB. 
            If duplicate 'IMEI' or 'Station' entries are found, they will cause duplicated records in the dashboard mappings.
            To resolve these, please **edit or clean up the duplicated rows in the MongoDB collections**, and 'ff-preprocess-raw's sync worker will automatically sync the clean states.
          </p>
        </div>
      </div>

      {/* Reusable Conflict Resolver component */}
      <ConflictResolver
        conflicts={conflicts}
        loading={loading}
        type="sql"
        onDeleteConflict={handleDeleteConflict}
      />
    </div>
  );
}
