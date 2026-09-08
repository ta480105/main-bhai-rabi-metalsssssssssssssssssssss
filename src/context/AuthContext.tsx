import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserRole } from '../types';
import { supabase } from '../lib/supabase';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  updatedAt: string;
}

interface LocalUser {
  uid: string;
  email: string;
  displayName: string;
}

interface SupervisorAccount {
  id: string;
  username: string;
  displayName: string;
  active: boolean;
}

interface AuthContextType {
  user: LocalUser | null;
  role: UserRole | null;
  userProfile: UserProfile | null;
  isAuthReady: boolean;
  signInFixed: (targetRole: UserRole, id: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  signInWithEmailPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  createAccountWithEmailPassword: () => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  switchPerspective: (targetRole: UserRole) => { success: boolean; error?: string };
  assignUserRole: () => Promise<{ success: boolean; error?: string }>;
  listSupervisors: () => Promise<SupervisorAccount[]>;
  createSupervisor: (name: string, username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  setSupervisorActive: (username: string, active: boolean) => Promise<{ success: boolean; error?: string }>;
  changeSupervisorPassword: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logoutSupervisor: (username: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const STORAGE_KEY = 'production-management-role';
const USER_KEY = 'production-management-user';

// Kept compatible with the existing hard-coded Admin login.
const ADMIN_CREDENTIALS = { id: 'admin', password: '1234', name: 'Administrator' };
const LOGIN_DOMAIN = 'production.local';
const syntheticEmail = (username: string) => `${username.trim().toLowerCase()}@${LOGIN_DOMAIN}`;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<UserRole | null>(null);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const clearLocal = () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_KEY);
    setRole(null);
    setUser(null);
    setUserProfile(null);
  };

  const loadSessionProfile = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session?.user) {
      clearLocal();
      setIsAuthReady(true);
      return;
    }

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id,username,display_name,role,active,updated_at')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error || !profile || !profile.active) {
      await supabase.auth.signOut();
      clearLocal();
      setIsAuthReady(true);
      return;
    }

    const nextRole = profile.role as UserRole;
    const nextUser: LocalUser = {
      uid: session.user.id,
      email: session.user.email || syntheticEmail(profile.username),
      displayName: profile.display_name || profile.username,
    };
    setRole(nextRole);
    setUser(nextUser);
    setUserProfile({
      uid: session.user.id,
      email: session.user.email || null,
      displayName: nextUser.displayName,
      photoURL: null,
      role: nextRole,
      updatedAt: profile.updated_at || new Date().toISOString(),
    });
    localStorage.setItem(STORAGE_KEY, nextRole);
    localStorage.setItem(USER_KEY, profile.username);
    setIsAuthReady(true);
  };

  useEffect(() => {
    void loadSessionProfile();
    const { data } = supabase.auth.onAuthStateChange(() => {
      window.setTimeout(() => { void loadSessionProfile(); }, 0);
    });

    // Keep an already-open Supervisor session synchronized with Admin actions.
    // Admin disable/logout/password-change updates the profile row, which is
    // delivered through Supabase Realtime and causes the client to re-check the session.
    const profileChannel = supabase
      .channel('profile-session-control')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
        const changedId = String((payload.new as { id?: string } | null)?.id || '');
        window.setTimeout(async () => {
          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData.session?.user || sessionData.session.user.id !== changedId) return;
          await loadSessionProfile();
        }, 0);
      })
      .subscribe();

    const forcedLogout = () => { void supabase.auth.signOut().finally(clearLocal); };
    window.addEventListener('production-force-logout', forcedLogout);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('production-force-logout', forcedLogout);
      void supabase.removeChannel(profileChannel);
    };
  }, []);

  const signInFixed = async (targetRole: UserRole, id: string, password: string) => {
    if (targetRole === 'ADMIN' && (id.trim().toLowerCase() !== ADMIN_CREDENTIALS.id || password !== ADMIN_CREDENTIALS.password)) {
      return { success: false, error: 'Invalid Admin ID or password.' };
    }
    if (targetRole !== 'ADMIN' && targetRole !== 'SUPERVISOR') {
      return { success: false, error: 'Invalid role.' };
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: syntheticEmail(id), password });
    if (error || !data.user) return { success: false, error: error?.message || 'Invalid ID or password.' };
    await loadSessionProfile();
    return { success: true };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearLocal();
    window.dispatchEvent(new CustomEvent('production-force-logout'));
  };

  const adminRequest = async (path: string, body?: unknown) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { success: false, error: 'Authentication required.' };
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    return result;
  };

  const listSupervisors = async () => {
    const result = await adminRequest('/api/admin/supervisors/list');
    return result.success ? result.supervisors : [];
  };

  return (
    <AuthContext.Provider value={{
      user, role, userProfile, isAuthReady, signInFixed,
      signInWithGoogle: async () => ({ success: false, error: 'Google login is disabled.' }),
      signInWithEmailPassword: async () => ({ success: false, error: 'Email login is disabled. Use username and password.' }),
      createAccountWithEmailPassword: async () => ({ success: false, error: 'Account creation is Admin-only.' }),
      signOut,
      switchPerspective: () => ({ success: false, error: 'Role switching is disabled.' }),
      assignUserRole: async () => ({ success: false, error: 'Use Admin Supervisor Management.' }),
      listSupervisors,
      createSupervisor: (name, username, password) => adminRequest('/api/admin/supervisors/create', { name, username, password }),
      setSupervisorActive: (username, active) => adminRequest('/api/admin/supervisors/status', { username, active }),
      changeSupervisorPassword: (username, password) => adminRequest('/api/admin/supervisors/password', { username, password }),
      logoutSupervisor: (username) => adminRequest('/api/admin/supervisors/logout', { username }),
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
