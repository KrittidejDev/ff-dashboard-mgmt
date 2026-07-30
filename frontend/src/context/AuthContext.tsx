'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export type UserRole = 'SuperAdmin' | 'Admin' | 'user';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  apiFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const storedToken = localStorage.getItem('ff_dashboard_token');
    if (storedToken) {
      setToken(storedToken);
      // eslint-disable-next-line react-hooks/immutability
      fetchUserProfile(storedToken);
    } else {
      setLoading(false);
      if (pathname !== '/login') {
        router.replace('/login');
      }
    }
  }, []);

  // Sync route validation on path change
  useEffect(() => {
    if (!loading) {
      if (!token && pathname !== '/login') {
        router.replace('/login');
      } else if (token && pathname === '/login') {
        router.replace('/dashboard');
      } else if (token && user) {
        // Enforce role-based limits for "user" role
        if (user.role === 'user' && (
          pathname === '/dashboard/users' || 
          pathname === '/dashboard/conflicts' ||
          pathname === '/dashboard/registrations' ||
          pathname === '/dashboard/specifications' ||
          pathname === '/dashboard/thresholds'
        )) {
          router.replace('/dashboard');
        }
      }
    }
  }, [pathname, token, user, loading]);

  const fetchUserProfile = async (authToken: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
      } else {
        // Token expired or invalid
        logout();
      }
    } catch (err) {
      console.error('Failed to load profile', err);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await res.json();
      localStorage.setItem('ff_dashboard_token', data.token);
      setToken(data.token);
      setUser(data.user);
      router.push('/dashboard');
      return true;
    } catch (err) {
      console.error('Login error', err);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('ff_dashboard_token');
    setToken(null);
    setUser(null);
    router.replace('/login');
  };

  const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const fetchWithTimeout = async (attempt = 0): Promise<Response> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      try {
        const res = await fetch(url, {
          ...options,
          headers,
          signal: options.signal || controller.signal,
        });
        clearTimeout(timeoutId);
        return res;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (attempt < 1 && (err.name === 'AbortError' || err.name === 'TypeError')) {
          // Retry once on timeout or network drop
          return fetchWithTimeout(attempt + 1);
        }
        throw err;
      }
    };

    return fetchWithTimeout();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
