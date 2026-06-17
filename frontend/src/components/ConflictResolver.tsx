'use client';

import React, { useState } from 'react';
import { AlertTriangle, Search, Trash2, CheckCircle } from 'lucide-react';

interface ConflictRecord {
  mongo_id?: string;
  id?: string;
  station: string;
  serial?: string;
  imei: string;
  updated_at?: string;
  created_at?: string;
  owner?: string;
  commonSiteName?: string;
  site?: string;
}

interface ConflictDevice {
  field?: string;
  type?: string;
  value: string;
  count: number;
  device_ids?: string[];
  records?: ConflictRecord[];
  items?: ConflictRecord[];
}

interface ConflictResolverProps {
  conflicts: ConflictDevice[];
  loading: boolean;
  type: 'sql' | 'registrations' | 'specifications';
  onDeleteConflict: (field: string, id: string) => Promise<void>;
  onEditConflict?: (item: any) => void;
}

export default function ConflictResolver({
  conflicts,
  loading,
  type,
  onDeleteConflict,
  onEditConflict,
}: ConflictResolverProps) {
  const [search, setSearch] = useState('');

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

  const filteredConflicts = conflicts.filter((c) => {
    const valueMatch = c.value?.toLowerCase().includes(search.toLowerCase());
    const typeOrFieldMatch = (c.type || c.field)?.toLowerCase().includes(search.toLowerCase());
    
    // Check items/records
    const items = c.items || c.records || [];
    const itemsMatch = items.some((item: any) =>
      item.station?.toLowerCase().includes(search.toLowerCase()) ||
      item.serial?.toLowerCase().includes(search.toLowerCase()) ||
      item.imei?.includes(search) ||
      item.mongo_id?.toLowerCase().includes(search.toLowerCase()) ||
      item.id?.toLowerCase().includes(search.toLowerCase()) ||
      (type === 'registrations' && item.owner?.toLowerCase().includes(search.toLowerCase())) ||
      (type === 'specifications' && item.commonSiteName?.toLowerCase().includes(search.toLowerCase()))
    );

    return valueMatch || typeOrFieldMatch || itemsMatch;
  });

  const getTitle = () => {
    switch (type) {
      case 'sql':
        return `Fahfon-Sense SQL Deduplication Conflicts (${filteredConflicts.length})`;
      case 'registrations':
        return `MongoDB Registration Conflicts (${filteredConflicts.length})`;
      case 'specifications':
        return `MongoDB Hardware Specification Conflicts (${filteredConflicts.length})`;
    }
  };

  return (
    <div className="glass-panel p-6 rounded-2xl border border-gray-800/80">
      {/* Title block */}
      <h3 className="text-white font-bold text-lg mb-4 flex items-center space-x-2">
        <AlertTriangle className="w-5 h-5 text-amber-500 animate-pulse" />
        <span>{getTitle()}</span>
      </h3>
      <p className="text-xs text-gray-400 leading-relaxed mb-6">
        {type === 'sql' 
          ? 'The list below shows duplicate Master serials or IMEI records identified across master tables in TimescaleDB.'
          : 'Data specifications and registrations are pulled automatically from MongoDB. If duplicate IMEI or Station/Serial entries are found, they will cause conflicts.'}
        {' '}You can delete or edit the specific duplicate document directly to resolve the synchronization conflict.
      </p>

      {/* Search Input Box */}
      <div className="flex items-center space-x-4 max-w-md mb-6">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={
              type === 'sql'
                ? "Search conflicts by Serial, IMEI or Mongo ID..."
                : type === 'registrations'
                ? "Search conflicts by ID, IMEI, Owner or Station..."
                : "Search conflicts by ID, IMEI, Serial or Site..."
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#111827]/40 border border-gray-800 rounded-xl py-2 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
          />
        </div>
      </div>

      {/* Main List Rendering */}
      {loading ? (
        <div className="py-12 text-center text-gray-500">
          <div className="w-8 h-8 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3"></div>
          <span className="text-xs">Generating conflict reports...</span>
        </div>
      ) : filteredConflicts.length === 0 ? (
        <div className="py-12 text-center bg-gray-800/10 border border-gray-800/30 rounded-xl">
          <div className="flex flex-col items-center space-y-2.5">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
            <span className="font-bold text-white">Zero Conflicts!</span>
            <span className="text-gray-500 text-xs">All IMEI and Serials are perfectly unique and clean.</span>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredConflicts.map((c, idx) => (
            <div key={idx} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5 space-y-3">
              <div className="flex justify-between items-center">
                <span className="bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold px-2.5 py-1 rounded text-xs capitalize">
                  {type === 'sql' ? `Duplicate ${c.field}` : c.type}
                </span>
                <span className="text-xs text-gray-500 font-mono font-medium">Value: <strong className="text-gray-900 dark:text-white">{c.value}</strong></span>
              </div>

              <div className="space-y-2">
                {(c.items || c.records || []).map((item: any, itemIdx: number) => {
                  const isSql = type === 'sql';
                  const recordId = isSql ? item.mongo_id : item.id;
                  
                  // Extract fields dynamically
                  const stationText = isSql 
                    ? `Serial (Station): ${item.station}`
                    : type === 'registrations'
                    ? `Station ID: ${item.station}`
                    : `Serial Number: ${item.serial || item.station}`;

                  const subText = isSql
                    ? `IMEI: ${item.imei}`
                    : type === 'registrations'
                    ? `IMEI: ${item.imei} | Owner: ${item.owner || 'N/A'}`
                    : `IMEI: ${item.imei} | Site: ${item.commonSiteName || 'N/A'}`;

                  const createdTime = getTimestampFromObjectId(recordId);

                  return (
                    <div key={itemIdx} className="flex justify-between items-center bg-gray-800/20 border border-gray-800/50 rounded-xl p-3.5 text-xs hover:bg-gray-800/30 transition-all duration-200">
                      <div className="space-y-1">
                        <span className="font-bold text-white block">
                          {isSql ? `SQL Master Record #${itemIdx + 1}` : stationText}
                        </span>
                        
                        {!isSql && (
                          <div className="text-gray-400 font-mono text-[10.5px]">
                            {subText}
                          </div>
                        )}
                        
                        {isSql && (
                          <div className="flex flex-col sm:flex-row sm:items-center space-y-1 sm:space-y-0 sm:space-x-3 text-[10px] text-gray-400">
                            <span>{stationText}</span>
                            <span className="hidden sm:inline text-gray-300">|</span>
                            <span>{subText}</span>
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center space-y-0.5 sm:space-y-0 sm:space-x-3 text-[9px] text-gray-500">
                          {isSql ? (
                            <>
                              <span>Created: {createdTime}</span>
                              <span className="hidden sm:inline text-gray-300">|</span>
                              <span>Last Update Onsite: <strong className="text-indigo-400 font-semibold">{item.updated_at && !item.updated_at.startsWith('1970') ? new Date(item.updated_at).toLocaleString('th-TH') : 'N/A (ยังไม่มีสัญญาณ Onsite)'}</strong></span>
                            </>
                          ) : (
                            <span>Created: {createdTime}</span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <div className="flex flex-col items-end space-y-1">
                          <span className="text-[10px] bg-indigo-500/10 text-indigo-650 dark:text-indigo-350 px-2 py-0.5 rounded font-mono font-semibold">
                            {isSql ? 'Mongo ID: ' : 'ObjectID: '}{recordId}
                          </span>
                          
                          {!isSql && (
                            <div className="flex items-center space-x-2 text-[10.5px] font-bold pt-1">
                              {onEditConflict && (
                                <button
                                  onClick={() => onEditConflict(item)}
                                  className="text-indigo-400 hover:text-indigo-300 hover:underline transition-colors"
                                >
                                  Edit
                                </button>
                              )}
                              <span className="text-gray-650">|</span>
                              <button
                                onClick={() => onDeleteConflict(c.type || c.field || '', recordId || '')}
                                className="text-rose-400 hover:text-rose-300 hover:underline transition-colors font-bold"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>

                        {isSql && (
                          <button
                            onClick={() => onDeleteConflict(c.field || '', recordId || '')}
                            className="p-1 text-rose-500 hover:text-rose-650 dark:text-rose-400 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 border border-rose-500/20 rounded-md transition"
                            title="Delete this duplicate document from MongoDB"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
