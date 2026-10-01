'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  LogOut,
  ShieldAlert,
  Cpu,
  Database,
  ClipboardList,
  AlertOctagon,
  Waves,
  Anchor,
  Radio,
  Bell,
  Zap,
  Lock,
  Activity,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  // Collapsible state with LocalStorage persistence
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('fahfon_sidebar_collapsed');
      if (saved !== null) {
        setIsCollapsed(saved === 'true');
      }
    } catch (e) {
      // LocalStorage access guard
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('fahfon_sidebar_collapsed', String(next));
      } catch (e) {}
      return next;
    });
  };

  if (!user) return null;

  const menuGroups = [
    {
      title: 'FAHFON SENSE',
      items: [
        {
          name: 'Sense Dashboard',
          path: '/dashboard',
          icon: LayoutDashboard,
          roles: ['SuperAdmin', 'Admin', 'user'],
        },
        {
          name: 'Device Registrations',
          path: '/dashboard/registrations',
          icon: ClipboardList,
          roles: ['SuperAdmin', 'Admin'],
        },
        {
          name: 'Device Specifications',
          path: '/dashboard/specifications',
          icon: Database,
          roles: ['SuperAdmin', 'Admin'],
        },
        {
          name: 'Official Pages',
          path: '/dashboard/official-pages',
          icon: Users,
          roles: ['SuperAdmin', 'Admin'],
        },
        {
          name: 'Problematic Devices',
          path: '/dashboard/anomalies',
          icon: AlertOctagon,
          roles: ['SuperAdmin', 'Admin', 'user'],
        },
        {
          name: 'Sensor Thresholds',
          path: '/dashboard/thresholds',
          icon: AlertTriangle,
          roles: ['SuperAdmin', 'Admin'],
        },
      ],
    },
    {
      title: 'FAHFON RIVER',
      items: [
        {
          name: 'River War Room',
          path: '/dashboard/river/warroom',
          icon: Radio,
          roles: ['SuperAdmin', 'Admin', 'user'],
        },
        {
          name: 'River Monitor',
          path: '/dashboard/river',
          icon: Waves,
          roles: ['SuperAdmin', 'Admin', 'user'],
        },
        {
          name: 'River Stations',
          path: '/dashboard/river/stations',
          icon: Anchor,
          roles: ['SuperAdmin', 'Admin'],
        },
        {
          name: 'River Official Pages',
          path: '/dashboard/river/official-pages',
          icon: Users,
          roles: ['SuperAdmin', 'Admin'],
        },
        {
          name: 'Alert Logs',
          path: '/dashboard/river/history',
          icon: ClipboardList,
          roles: ['SuperAdmin', 'Admin', 'user'],
        },
        {
          name: 'Noise Audit Log',
          path: '/dashboard/river/noise-audit',
          icon: Activity,
          roles: ['SuperAdmin', 'Admin', 'user'],
        },
        {
          name: 'Webhook Subs',
          path: '/dashboard/river/subscriptions',
          icon: Zap,
          roles: ['SuperAdmin', 'Admin'],
        },
        {
          name: 'Station Health',
          path: '/dashboard/river/health',
          icon: ShieldAlert,
          roles: ['SuperAdmin', 'Admin', 'user'],
        },
        {
          name: 'Data Quality',
          path: '/dashboard/river/dq',
          icon: Database,
          roles: ['SuperAdmin', 'Admin'],
        },
        {
          name: 'Adaptive Frequency',
          path: '/dashboard/river/freq',
          icon: Cpu,
          roles: ['SuperAdmin', 'Admin'],
        },
      ],
    },
    {
      title: 'ADMINISTRATION',
      items: [
        {
          name: 'User Management',
          path: '/dashboard/users',
          icon: Users,
          roles: ['SuperAdmin', 'Admin'],
        },
        {
          name: 'Change Password',
          path: '/dashboard/change-password',
          icon: Lock,
          roles: ['SuperAdmin', 'Admin', 'user'],
        },
      ],
    },
  ];

  return (
    <aside
      className={`${
        isCollapsed ? 'w-20' : 'w-64'
      } bg-[#111827]/90 backdrop-blur-md border-r border-gray-800 flex flex-col h-screen sticky top-0 shrink-0 z-20 transition-all duration-300 ease-in-out select-none`}
    >
      {/* Brand logo & Collapse Toggle Button */}
      <div
        className={`h-16 flex items-center border-b border-gray-800 ${
          isCollapsed ? 'justify-center px-2' : 'justify-between px-5'
        }`}
      >
        {!isCollapsed ? (
          <>
            <div className="flex items-center space-x-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/logos/cps-agri-logo.png"
                alt="CPS AGRI"
                className="h-7 w-auto object-contain"
              />
              <div className="h-5 w-px bg-gray-700" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/logos/fahfon-logo.png"
                alt="FAHFON"
                className="h-7 w-auto object-contain"
              />
            </div>
            <button
              onClick={toggleCollapse}
              title="พับเก็บเมนูด้านข้าง (Collapse Sidebar)"
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="relative group flex items-center justify-center">
            <button
              onClick={toggleCollapse}
              title="ขยายเมนูด้านข้าง (Expand Sidebar)"
              className="p-2 rounded-xl bg-gray-800/60 hover:bg-indigo-600/30 text-indigo-400 hover:text-indigo-200 border border-gray-700/60 transition shadow"
            >
              <PanelLeftOpen className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      {/* User profile capsule */}
      <div className={`border-b border-gray-800/50 ${isCollapsed ? 'p-3' : 'px-4 py-4'}`}>
        {!isCollapsed ? (
          <div className="flex items-center space-x-3 bg-gray-800/30 border border-gray-800 rounded-xl p-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold uppercase text-xs flex-shrink-0">
              {user.username.slice(0, 2)}
            </div>
            <div className="overflow-hidden min-w-0">
              <h4 className="text-sm font-semibold text-white truncate">{user.username}</h4>
              <div className="flex items-center space-x-1 mt-0.5">
                <ShieldAlert className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-gray-400 truncate">{user.role}</span>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="w-10 h-10 mx-auto rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold uppercase text-xs shadow-inner cursor-pointer"
            title={`${user.username} (${user.role})`}
          >
            {user.username.slice(0, 2)}
          </div>
        )}
      </div>

      {/* Navigation menu */}
      <nav className={`flex-1 overflow-y-auto space-y-6 ${isCollapsed ? 'px-2 py-4' : 'px-3 py-4'}`}>
        {menuGroups.map((group) => {
          const visibleItems = group.items.filter((item) => item.roles.includes(user.role));
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title} className="space-y-1.5">
              {!isCollapsed ? (
                <h5 className="px-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  {group.title}
                </h5>
              ) : (
                <div className="w-6 h-px bg-gray-800 mx-auto my-2" />
              )}
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.path;
                  const isWarRoom = item.path === '/dashboard/river/warroom';

                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      title={isCollapsed ? item.name : undefined}
                      className={`flex items-center rounded-xl text-sm font-medium transition-all ${
                        isCollapsed
                          ? 'justify-center p-2.5 relative group'
                          : 'space-x-3 px-3.5 py-2.5'
                      } ${
                        isActive
                          ? isWarRoom
                            ? 'bg-gradient-to-r from-rose-600 to-indigo-600 text-white shadow-lg shadow-rose-900/30 border border-rose-400/40'
                            : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 border border-indigo-500/30'
                          : isWarRoom
                          ? 'text-rose-400 hover:bg-rose-950/30 hover:text-rose-300 border border-transparent'
                          : 'text-gray-400 hover:bg-gray-800/40 hover:text-white border border-transparent'
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 flex-shrink-0 ${
                          isActive
                            ? 'text-white'
                            : isWarRoom
                            ? 'text-rose-400 animate-pulse'
                            : 'text-gray-400'
                        }`}
                      />
                      {!isCollapsed && <span className="truncate">{item.name}</span>}

                      {/* Floating tooltip for collapsed mode */}
                      {isCollapsed && (
                        <span className="absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-slate-100 text-xs font-semibold rounded-lg shadow-xl border border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                          {item.name}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer sign out panel */}
      <div className={`border-t border-gray-800/80 ${isCollapsed ? 'p-2.5' : 'p-3'}`}>
        <button
          onClick={logout}
          title={isCollapsed ? 'Sign Out' : undefined}
          className={`w-full flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 font-medium rounded-xl text-sm transition-all ${
            isCollapsed ? 'p-2.5' : 'space-x-2 py-2.5'
          }`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!isCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );
}
