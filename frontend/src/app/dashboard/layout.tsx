'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const isWarRoom = pathname?.includes('/warroom');

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-[#0b0f19] flex items-center justify-center">
        <div className="relative w-16 h-16">
          <div className="absolute top-0 left-0 w-full h-full border-4 border-indigo-500/20 rounded-full"></div>
          <div className="absolute top-0 left-0 w-full h-full border-4 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f19] flex overflow-hidden">
      {/* Collapsible Sidebar navigation */}
      <Sidebar />

      {/* Main dashboard content container */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto">
        <div className={`flex-1 ${isWarRoom ? 'p-2 sm:p-3' : 'p-8'}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
