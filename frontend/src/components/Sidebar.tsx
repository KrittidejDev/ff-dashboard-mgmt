'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, Users, AlertTriangle, LogOut, ShieldAlert, Cpu, Database, ClipboardList, AlertOctagon, Waves, Anchor, Bell, Zap, Lock, Activity } from 'lucide-react';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();

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
    <aside className="w-64 bg-[#111827]/80 backdrop-blur-md border-r border-gray-800 flex flex-col h-screen sticky top-0 shrink-0 z-20">
      {/* Brand logo */}
      <div className="h-16 flex items-center px-6 border-b border-gray-800">
        <div className="flex items-center space-x-3 text-indigo-400">
          <Cpu className="w-6 h-6 animate-pulse" />
          <span className="font-bold text-white tracking-wide text-lg">FAHFON</span>
          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-semibold px-2 py-0.5 rounded-full border border-indigo-500/20 uppercase tracking-widest">v2.0</span>
        </div>
      </div>

      {/* User profile capsule */}
      <div className="px-4 py-5 border-b border-gray-800/50">
        <div className="flex items-center space-x-3 bg-gray-800/20 border border-gray-800 rounded-xl p-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold uppercase">
            {user.username.slice(0, 2)}
          </div>
          <div className="overflow-hidden">
            <h4 className="text-sm font-semibold text-white truncate">{user.username}</h4>
            <div className="flex items-center space-x-1 mt-0.5">
              <ShieldAlert className="w-3 h-3 text-emerald-400" />
              <span className="text-xs text-gray-400 truncate">{user.role}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation menu */}
      <nav className="flex-1 px-4 py-4 space-y-6 overflow-y-auto">
        {menuGroups.map((group) => {
          // Check if user has roles for at least one item in the group
          const visibleItems = group.items.filter((item) => item.roles.includes(user.role));
          if (visibleItems.length === 0) return null;

          return (
            <div key={group.title} className="space-y-2">
              <h5 className="px-4 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                {group.title}
              </h5>
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className={`flex items-center space-x-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 border border-indigo-500/30'
                          : 'text-gray-400 hover:bg-gray-800/40 hover:text-white border border-transparent'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-400'}`} />
                      <span>{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer logout panel */}
      <div className="p-4 border-t border-gray-800/80">
        <button
          onClick={logout}
          className="w-full flex items-center justify-center space-x-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 hover:text-red-300 font-medium py-2.5 rounded-xl text-sm transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
