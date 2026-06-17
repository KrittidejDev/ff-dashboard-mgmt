'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Shield, UserPlus, Trash2, AlertCircle, RefreshCw } from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081/api/v1';

export default function UserManagementPage() {
  const { apiFetch, user: currentUser } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');

  // Warning Emails State
  const [warningEmails, setWarningEmails] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [savingEmails, setSavingEmails] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/users`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data || []);
      }
      
      const emailRes = await apiFetch(`${API_BASE_URL}/settings/notifications`);
      if (emailRes.ok) {
        const data = await emailRes.json();
        setWarningEmails(data || []);
      }
    } catch (err) {
      console.error('Failed to load users/emails', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const res = await apiFetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, password, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create user');
      }

      setSuccess('User created successfully and logged on audit trails!');
      setUsername('');
      setEmail('');
      setPassword('');
      setRole('user');
      fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Connection failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string, targetName: string) => {
    if (id === currentUser?.id) {
      alert('Error: You cannot delete your own account.');
      return;
    }

    if (confirm(`Are you sure you want to permanently delete user "${targetName}"?`)) {
      try {
        const res = await apiFetch(`${API_BASE_URL}/users/${id}`, {
          method: 'DELETE',
        });

        if (res.ok) {
          fetchUsers();
        } else {
          const data = await res.json();
          alert(data.error || 'Failed to delete user.');
        }
      } catch (err) {
        alert('Connection error.');
      }
    }
  };

  // Warning Email Actions
  const handleAddEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || warningEmails.includes(newEmail)) return;
    setWarningEmails([...warningEmails, newEmail]);
    setNewEmail('');
  };

  const handleRemoveEmail = (target: string) => {
    setWarningEmails(warningEmails.filter((email) => email !== target));
  };

  const handleSaveEmails = async () => {
    setSavingEmails(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/settings/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emails: warningEmails }),
      });

      if (res.ok) {
        alert('Alert configurations saved successfully!');
      } else {
        alert('Failed to save settings.');
      }
    } catch (err) {
      alert('Connection error.');
    } finally {
      setSavingEmails(false);
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center space-y-4 md:space-y-0">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">User & Settings</h1>
          <p className="text-gray-400 text-sm mt-1">Manage system accounts and centralized email alert parameters.</p>
        </div>
        <button
          onClick={fetchUsers}
          className="flex items-center space-x-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-4 py-2 rounded-xl text-sm font-semibold transition"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh List</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <div className="space-y-8 lg:col-span-1">
          {/* Create user form (Left Column in Desktop) */}
          <div className="glass-panel p-6 rounded-2xl space-y-6">
            <div className="flex items-center space-x-2 text-white border-b border-gray-800 pb-3">
              <UserPlus className="w-5 h-5 text-indigo-400" />
              <span className="font-bold text-sm">Register New Account</span>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start space-x-2 text-red-400 text-xs">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 flex items-start space-x-2 text-emerald-400 text-xs">
                <Shield className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full bg-[#111827] border border-gray-800 rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full bg-[#111827] border border-gray-800 rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full bg-[#111827] border border-gray-800 rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">System Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-[#111827] border border-gray-800 rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-indigo-500 text-gray-300"
                >
                  <option value="user">User (View Dashboard/Details Only)</option>
                  <option value="Admin">Admin (Full access except user deletion)</option>
                  <option value="SuperAdmin">SuperAdmin (Unconditional master access)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full glowing-bg text-white font-semibold rounded-lg py-2 text-xs hover:opacity-95 transition disabled:opacity-50 flex items-center justify-center"
              >
                {submitting ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  'Create User Account'
                )}
              </button>
            </form>
          </div>

          {/* Central Alert Emails configurations */}
          <div className="glass-panel p-6 rounded-2xl space-y-6">
            <div className="flex items-center space-x-2 text-white border-b border-gray-800 pb-3">
              <AlertCircle className="w-5 h-5 text-indigo-400" />
              <span className="font-bold text-sm">System Warning Emails</span>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              Define the global destination emails for aggregated malfunction notifications from anomalies engine.
            </p>

            <form onSubmit={handleAddEmail} className="flex space-x-2">
              <input
                type="email"
                placeholder="alert@company.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1 bg-[#111827] border border-gray-800 rounded-lg py-2 px-3 text-xs focus:outline-none focus:border-indigo-500 text-gray-200"
              />
              <button
                type="submit"
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-lg text-xs transition"
              >
                Add
              </button>
            </form>

            <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-800 rounded-xl p-3 bg-gray-950/20">
              {warningEmails.length === 0 ? (
                <span className="text-[11px] text-gray-500 block text-center py-2">No warning emails configured.</span>
              ) : (
                warningEmails.map((email) => (
                  <div key={email} className="flex justify-between items-center bg-[#111827]/40 border border-gray-800/40 rounded-lg py-1.5 px-3">
                    <span className="text-xs text-gray-300 font-mono truncate mr-2">{email}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveEmail(email)}
                      className="text-red-400 hover:text-red-300 text-[10px] font-bold"
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={handleSaveEmails}
              disabled={savingEmails}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg py-2 text-xs transition disabled:opacity-50 flex items-center justify-center"
            >
              {savingEmails ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                'Save Alert Config'
              )}
            </button>
          </div>
        </div>

        {/* Current user list (Right Column in Desktop) */}
        <div className="glass-panel p-6 rounded-2xl lg:col-span-2 space-y-6">
          <div className="flex items-center space-x-2 text-white">
            <Shield className="w-5 h-5 text-indigo-400" />
            <span className="font-bold">Active System accounts</span>
          </div>

          <div className="overflow-x-auto border border-gray-800 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#111827]/80 text-gray-400 border-b border-gray-800">
                  <th className="py-3 px-4 font-semibold">Username</th>
                  <th className="py-3 px-4 font-semibold">Email</th>
                  <th className="py-3 px-4 font-semibold">Role</th>
                  <th className="py-3 px-4 font-semibold">Created Date</th>
                  <th className="py-3 px-4 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/40">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-500">
                      <div className="w-6 h-6 border-2 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mx-auto mb-1"></div>
                      Loading accounts...
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-500">No users found.</td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-800/10">
                      <td className="py-3 px-4 font-bold text-white flex items-center space-x-2">
                        <span>{u.username}</span>
                        {u.id === currentUser?.id && (
                          <span className="text-[9px] bg-indigo-500/20 text-indigo-400 font-semibold px-2 py-0.5 rounded border border-indigo-500/20">You</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-400">{u.email}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          u.role === 'SuperAdmin'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                            : u.role === 'Admin'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400 font-mono">
                        {new Date(u.created_at).toLocaleDateString('th-TH')}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          disabled={u.id === currentUser?.id}
                          onClick={() => handleDeleteUser(u.id, u.username)}
                          className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 rounded-lg border border-red-500/10 disabled:opacity-30 disabled:hover:bg-transparent transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
