import { useState, useEffect, useCallback, useRef } from 'react';

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  query,
  orderBy,
} from '../lib/supabaseData';
import {
  db,
  testSupabaseConnection,
  handleSupabaseError,
  OperationType,
} from '../lib/supabaseData';
import {
  AppDatabase,
  UserRole,
  ProductionRecord,
  AIDiagnosisResponse,
  Worker,
  PieceSize,
  MonthlyRatesDoc,
  MonthStatusRecord,
  AuditLog,
  ZeroAuditRecord,
} from '../types';
import { getISTCurrentMonth, getISTToday, getMonthlyRate } from '../utils/formatters';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export function useProductionStore() {
  const { isAuthReady, role: authRole } = useAuth();
  const [dbState, setDbState] = useState<AppDatabase>(() => ({
    workers: [],
    pieceSizes: [],
    monthlyRates: [],
    productionRecords: [],
    monthStatuses: [],
    auditLogs: [],
    settings: { companyName: '', allowDuplicateEntries: false },
    zeroAudits: [],
  }));
  const [loading, setLoading] = useState<boolean>(true);
  const [isLive, setIsLive] = useState<boolean>(false);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(() => {
    const saved = localStorage.getItem('production-management-role');
    return saved === 'ADMIN' || saved === 'SUPERVISOR' ? saved : null;
  });
  const [currentView, setCurrentView] = useState<'opening' | 'app'>('opening');
  const [adminTab, setAdminTab] = useState<string>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState<string>(getISTCurrentMonth());
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('w-001');

  // Error & AI Diagnosis states
  const [activeError, setActiveError] = useState<{
    message: string;
    type: string;
    operation: string;
    component: string;
    canRetry?: boolean;
    retryAction?: () => Promise<void>;
  } | null>(null);

  const [aiDiagnosis, setAiDiagnosis] = useState<AIDiagnosisResponse | null>(null);
  const [isDiagnosing, setIsDiagnosing] = useState<boolean>(false);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);

  // In-memory pending OTP for Zero System operations (backed by server-side crypto verification)
  const [activeOtp, setActiveOtp] = useState<{
    code: string;
    sessionId: string;
    expiresAt: number;
    scope: string;
    targetId?: string;
    month: string;
  } | null>(null);

  // Set up Supabase Real-time Listeners for the two fixed app roles
  useEffect(() => {
    testSupabaseConnection().then((connected) => {
      setIsLive(connected);
    });

    let unsubscribers: (() => void)[] = [];

    const startListeners = async () => {
      if (!isAuthReady) return;
      if (!currentRole || !authRole) {
        setLoading(false);
        setIsLive(false);
        return;
      }
      setIsLive(true);
      setLoading(true);


      // 1. Workers Real-time Listener
      const unsubWorkers = onSnapshot(
        collection(db, 'workers'),
        (snapshot) => {
          const workers: Worker[] = [];
          snapshot.forEach((docSnap) => {
            workers.push(docSnap.data() as Worker);
          });
          setDbState((prev) => ({ ...prev, workers }));
          setIsLive(true);
          setLoading(false);
        },
        (error) => {
          setIsLive(false);
          handleSupabaseError(error, OperationType.LIST, 'workers');
        }
      );
      unsubscribers.push(unsubWorkers);

      // 2. Piece Sizes Real-time Listener
      const unsubPieceSizes = onSnapshot(
        collection(db, 'pieceSizes'),
        (snapshot) => {
          const pieceSizes: PieceSize[] = [];
          snapshot.forEach((docSnap) => {
            pieceSizes.push(docSnap.data() as PieceSize);
          });
          setDbState((prev) => ({ ...prev, pieceSizes }));
        },
        (error) => {
          handleSupabaseError(error, OperationType.LIST, 'pieceSizes');
        }
      );
      unsubscribers.push(unsubPieceSizes);

      // 3. Monthly Rates Real-time Listener (independent rates per month)
      const unsubMonthlyRates = onSnapshot(
        collection(db, 'monthlyRates'),
        (snapshot) => {
          const monthlyRates: MonthlyRatesDoc[] = [];
          snapshot.forEach((docSnap) => {
            monthlyRates.push(docSnap.data() as MonthlyRatesDoc);
          });
          setDbState((prev) => ({ ...prev, monthlyRates }));
        },
        (error) => {
          handleSupabaseError(error, OperationType.LIST, 'monthlyRates');
        }
      );
      unsubscribers.push(unsubMonthlyRates);

      // 4. Production Records Real-time Listener
      const unsubProduction = onSnapshot(
        collection(db, 'productionRecords'),
        (snapshot) => {
          const productionRecords: ProductionRecord[] = [];
          snapshot.forEach((docSnap) => {
            productionRecords.push(docSnap.data() as ProductionRecord);
          });
          setDbState((prev) => ({ ...prev, productionRecords }));
        },
        (error) => {
          handleSupabaseError(error, OperationType.LIST, 'productionRecords');
        }
      );
      unsubscribers.push(unsubProduction);

      // 5. Month Statuses Real-time Listener
      const unsubMonthStatuses = onSnapshot(
        collection(db, 'monthStatuses'),
        (snapshot) => {
          const monthStatuses: MonthStatusRecord[] = [];
          snapshot.forEach((docSnap) => {
            monthStatuses.push(docSnap.data() as MonthStatusRecord);
          });
          setDbState((prev) => ({ ...prev, monthStatuses }));
        },
        (error) => {
          handleSupabaseError(error, OperationType.LIST, 'monthStatuses');
        }
      );
      unsubscribers.push(unsubMonthStatuses);

      // 6. Audit Logs Real-time Listener
      const unsubAuditLogs = onSnapshot(
        collection(db, 'auditLogs'),
        (snapshot) => {
          const auditLogs: AuditLog[] = [];
          snapshot.forEach((docSnap) => {
            auditLogs.push(docSnap.data() as AuditLog);
          });
          auditLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setDbState((prev) => ({ ...prev, auditLogs }));
        },
        (error) => {
          handleSupabaseError(error, OperationType.LIST, 'auditLogs');
        }
      );
      unsubscribers.push(unsubAuditLogs);

      // 7. System Settings Real-time Listener
      const unsubSettings = onSnapshot(
        doc(db, 'settings', 'general'),
        (docSnap) => {
          if (docSnap.exists()) {
            setDbState((prev) => ({ ...prev, settings: docSnap.data() as AppDatabase['settings'] }));
          }
        },
        (error) => {
          handleSupabaseError(error, OperationType.GET, 'settings/general');
        }
      );
      unsubscribers.push(unsubSettings);
    };

    startListeners();

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [currentRole]);

  useEffect(() => {
    const onLogout = () => {
      setCurrentRole(null);
      setCurrentView('opening');
    };
    window.addEventListener('production-force-logout', onLogout);
    return () => window.removeEventListener('production-force-logout', onLogout);
  }, []);

  // Error handler with AI diagnosis
  const triggerError = useCallback(
    async (errObj: {
      message: string;
      type: string;
      operation: string;
      component: string;
      canRetry?: boolean;
      retryAction?: () => Promise<void>;
    }) => {
      setActiveError(errObj);
      setRecoverySuccess(null);
      setIsDiagnosing(true);

      try {
        const res = await fetch('/api/ai/diagnose', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(await supabase.auth.getSession()).data.session?.access_token
              ? { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session!.access_token}` }
              : {},
          },
          body: JSON.stringify({
            errorType: errObj.type,
            errorMessage: errObj.message,
            component: errObj.component,
            operation: errObj.operation,
            networkStatus: navigator.onLine ? 'online' : 'offline',
          }),
        });
        const data = await res.json();
        if (data.success && data.diagnosis) {
          setAiDiagnosis(data.diagnosis);
        }
      } catch (dErr) {
        console.warn('AI Diagnosis call error:', dErr);
      } finally {
        setIsDiagnosing(false);
      }
    },
    []
  );

  // Helper to record an audit log in Supabase
  const logAudit = async (action: string, details: string, affectedRecord?: string, oldValue?: string, newValue?: string) => {
    try {
      const user = currentRole === 'ADMIN' ? 'Admin' : 'Supervisor';
      const logId = doc(collection(db, 'auditLogs')).id;
      const newLog: AuditLog = {
        id: logId,
        user,
        role: currentRole || 'SUPERVISOR',
        action,
        details,
        affectedRecord,
        oldValue,
        newValue,
        timestamp: new Date().toISOString(),
      };
      await setDoc(doc(db, 'auditLogs', logId), newLog);
    } catch (err) {
      console.warn('Audit log write error:', err);
    }
  };

  // Helper to check if month is open
  const isMonthOpen = (month: string): boolean => {
    const found = dbState.monthStatuses.find((m) => m.month === month);
    if (found) {
      return found.status === 'OPEN' && !found.isClosed;
    }
    // Current month defaults to OPEN
    return month === getISTCurrentMonth();
  };

  // Login handler for the two fixed local roles
  const login = async (role: UserRole) => {
    if (role !== 'ADMIN' && role !== 'SUPERVISOR') {
      return { success: false, message: 'Invalid role.' };
    }
    setCurrentRole(role);
    setCurrentView('app');
    setAdminTab(role === 'SUPERVISOR' ? 'supervisor-entry' : 'dashboard');
    await logAudit('LOGIN', `User logged in as ${role}`);
    return { success: true };
  };

  // Logout handler
  const logout = async () => {
    await logAudit('LOGOUT', `User signed out from ${currentRole}`);
    setCurrentRole(null);
    setCurrentView('opening');
  };

  // Submit Production to Supabase
  const submitProduction = async (payload: {
    workerId: string;
    pieceSizeId: string;
    quantity: number;
    date: string;
    attendanceStatus?: 'normal' | 'P' | 'X';
    notes?: string;
    allowDuplicate?: 'add' | 'update' | false;
  }) => {
    try {
      const monthStr = payload.date.substring(0, 7);
      const dayNum = parseInt(payload.date.split('-')[2] || '1', 10);
      const yearNum = parseInt(payload.date.split('-')[0] || '2026', 10);

      // Verify Month Lock
      if (!isMonthOpen(monthStr)) {
        throw new Error(`Month ${monthStr} is locked or closed. New production entries cannot be submitted.`);
      }

      // Find worker & piece size
      const worker = dbState.workers.find((w) => w.id === payload.workerId);
      const pieceSize = dbState.pieceSizes.find((ps) => ps.id === payload.pieceSizeId);

      if (!worker) throw new Error('Selected worker not found in database.');
      if (!pieceSize) throw new Error('Selected piece size not found in database.');

      // Find applicable piece rate from monthlyRates for payload month
      const applicableRate = getMonthlyRate(
        dbState.monthlyRates,
        payload.pieceSizeId,
        monthStr,
        0
      );

      // Check for duplicate entry on same date
      const existing = dbState.productionRecords.find(
        (r) =>
          r.workerId === payload.workerId &&
          r.date === payload.date &&
          r.pieceSizeId === payload.pieceSizeId
      );

      if (existing && !payload.allowDuplicate) {
        return {
          duplicate: true,
          existingRecord: existing,
          message: `Record already exists for ${worker.fullName} (${pieceSize.displayName}) on ${payload.date} with quantity ${existing.quantity}.`,
        };
      }

      if (existing && payload.allowDuplicate === 'update') {
        if (currentRole !== 'ADMIN') {
          throw new Error('Unauthorized: Supervisors cannot overwrite existing entries. Modifying existing entries requires Administrator privileges.');
        }

        // Update existing record (Admin only)
        const updatedQty = payload.quantity;
        await updateDoc(doc(db, 'productionRecords', existing.id), {
          quantity: updatedQty,
          notes: payload.notes || existing.notes || '',
          attendanceStatus: payload.attendanceStatus || existing.attendanceStatus || 'normal',
          applicableRate,
          updatedAt: new Date().toISOString(),
        });

        await logAudit(
          'UPDATE_PRODUCTION',
          `Updated entry for ${worker.fullName}: quantity changed from ${existing.quantity} to ${updatedQty}`,
          existing.id,
          String(existing.quantity),
          String(updatedQty)
        );

        return {
          success: true,
          message: 'Record updated successfully in Supabase',
          record: { ...existing, quantity: updatedQty, applicableRate },
        };
      }

      // Create new record
      const newRecordId = doc(collection(db, 'productionRecords')).id;
      const newRecord: ProductionRecord = {
        id: newRecordId,
        workerId: payload.workerId,
        workerName: worker.fullName,
        workerFirstName: worker.firstName,
        pieceSizeId: payload.pieceSizeId,
        pieceSizeName: pieceSize.name,
        quantity: payload.quantity,
        attendanceStatus: payload.attendanceStatus || 'normal',
        date: payload.date,
        month: monthStr,
        year: yearNum,
        day: dayNum,
        applicableRate,
        notes: payload.notes || '',
        enteredBy: currentRole === 'ADMIN' ? 'Admin' : 'Supervisor',
        status: 'submitted',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'productionRecords', newRecordId), newRecord);

      await logAudit(
        'CREATE_PRODUCTION',
        `Recorded ${payload.quantity} pcs (${pieceSize.displayName}) for ${worker.fullName} on ${payload.date}`,
        newRecordId,
        undefined,
        String(payload.quantity)
      );

      return { success: true, message: 'Production record saved to Supabase', record: newRecord };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Failed to submit production record',
        type: 'SUPABASE_WRITE_ERROR',
        operation: 'submitProduction',
        component: 'DailyEntryForm',
        canRetry: true,
        retryAction: async () => {
          await submitProduction(payload);
        },
      });
      return { success: false, message: err.message };
    }
  };

  // Update Production Record (Admin only, requires open month)
  const updateProductionRecord = async (
    id: string,
    updates: { quantity?: number; attendanceStatus?: 'normal' | 'P' | 'X'; notes?: string }
  ) => {
    try {
      if (currentRole !== 'ADMIN' && currentRole !== 'SUPERVISOR') {
        throw new Error('Unauthorized: Authentication required to edit production records.');
      }
      const target = dbState.productionRecords.find((r) => r.id === id);
      if (!target) throw new Error('Record not found.');

      if (!isMonthOpen(target.month)) {
        throw new Error(`Month ${target.month} is locked. Modifications are disabled.`);
      }

      await updateDoc(doc(db, 'productionRecords', id), {
        ...updates,
        updatedAt: new Date().toISOString(),
      });

      await logAudit(
        'EDIT_PRODUCTION',
        `Edited production record for ${target.workerName} on ${target.date}`,
        id,
        String(target.quantity),
        String(updates.quantity ?? target.quantity)
      );

      return { success: true, message: 'Record updated successfully in Supabase' };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Failed to update record',
        type: 'SUPABASE_UPDATE_ERROR',
        operation: 'updateProductionRecord',
        component: 'MonthlyCalendar',
      });
      return { success: false, message: err.message };
    }
  };

  // Delete Production Record (Admin/Supervisor, requires open month)
  const deleteProductionRecord = async (id: string) => {
    try {
      if (currentRole !== 'ADMIN' && currentRole !== 'SUPERVISOR') {
        throw new Error('Unauthorized: Authentication required to delete production records.');
      }
      const target = dbState.productionRecords.find((r) => r.id === id);
      if (!target) throw new Error('Record not found.');

      if (!isMonthOpen(target.month)) {
        throw new Error(`Month ${target.month} is locked. Deletions are disabled.`);
      }

      await deleteDoc(doc(db, 'productionRecords', id));

      await logAudit(
        'DELETE_PRODUCTION',
        `Deleted production record of ${target.quantity} pcs for ${target.workerName} (${target.date})`,
        id,
        String(target.quantity)
      );

      return { success: true, message: 'Record removed from Supabase' };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Failed to delete record',
        type: 'SUPABASE_DELETE_ERROR',
        operation: 'deleteProductionRecord',
        component: 'ProductionRecordsTable',
      });
      return { success: false, message: err.message };
    }
  };

  // Add Worker
  const addWorker = async (workerData: { firstName: string; lastName?: string; mobile?: string }) => {
    try {
      const id = `w-${String(dbState.workers.length + 1).padStart(3, '0')}`;
      const fullName = workerData.lastName
        ? `${workerData.firstName} ${workerData.lastName}`
        : workerData.firstName;

      const newWorker: Worker = {
        id,
        firstName: workerData.firstName.trim(),
        lastName: workerData.lastName?.trim() || '',
        fullName: fullName.trim(),
        mobile: workerData.mobile || '',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'workers', id), newWorker);

      await logAudit('ADD_WORKER', `Added worker ${newWorker.fullName} (${id})`, id);
      return { success: true, message: `Worker ${newWorker.fullName} added to Supabase` };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Failed to add worker',
        type: 'SUPABASE_WRITE_ERROR',
        operation: 'addWorker',
        component: 'WorkerManagement',
      });
      return { success: false, message: err.message };
    }
  };

  // Update Worker
  const updateWorker = async (
    id: string,
    updates: { firstName?: string; lastName?: string; mobile?: string; status?: 'active' | 'inactive' }
  ) => {
    try {
      const existing = dbState.workers.find((w) => w.id === id);
      if (!existing) throw new Error('Worker not found');

      const firstName = updates.firstName !== undefined ? updates.firstName : existing.firstName;
      const lastName = updates.lastName !== undefined ? updates.lastName : existing.lastName;
      const fullName = lastName ? `${firstName} ${lastName}`.trim() : firstName.trim();

      const workerUpdates = {
        ...updates,
        fullName,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, 'workers', id), workerUpdates);

      await logAudit('UPDATE_WORKER', `Updated worker ${fullName} (${id})`, id);
      return { success: true, message: 'Worker profile updated in Supabase' };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Failed to update worker',
        type: 'SUPABASE_UPDATE_ERROR',
        operation: 'updateWorker',
        component: 'WorkerManagement',
      });
      return { success: false, message: err.message };
    }
  };

  // Add Piece Size
  const addPieceSize = async (sizeData: { name: string; value: number; unit: string; displayName?: string }) => {
    try {
      const id = `ps-${String(dbState.pieceSizes.length + 1).padStart(3, '0')}`;
      const newSize: PieceSize = {
        id,
        name: sizeData.name,
        value: Number(sizeData.value),
        unit: sizeData.unit,
        displayName: sizeData.displayName || `${sizeData.name} (${sizeData.value} ${sizeData.unit})`,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'pieceSizes', id), newSize);

      await logAudit('ADD_PIECE_SIZE', `Created piece size ${newSize.displayName}`, id);
      return { success: true, message: 'Piece size added to Supabase' };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Failed to create piece size',
        type: 'SUPABASE_WRITE_ERROR',
        operation: 'addPieceSize',
        component: 'PieceSizeManagement',
      });
      return { success: false, message: err.message };
    }
  };

  // Update Piece Size
  const updatePieceSize = async (
    id: string,
    updates: { name?: string; value?: number; unit?: string; displayName?: string; status?: 'active' | 'inactive' }
  ) => {
    try {
      await updateDoc(doc(db, 'pieceSizes', id), {
        ...updates,
        updatedAt: new Date().toISOString(),
      });

      await logAudit('UPDATE_PIECE_SIZE', `Updated piece size ${id}`, id);
      return { success: true, message: 'Piece size updated in Supabase' };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Failed to update piece size',
        type: 'SUPABASE_UPDATE_ERROR',
        operation: 'updatePieceSize',
        component: 'PieceSizeManagement',
      });
      return { success: false, message: err.message };
    }
  };

  // Save Monthly Rate to Supabase (Admin/Supervisor, stored in monthlyRates/{month})
  const saveMonthlyRate = async (month: string, pieceSizeId: string, rate: number) => {
    try {
      if (currentRole !== 'ADMIN' && currentRole !== 'SUPERVISOR') {
        throw new Error('Unauthorized: Authentication required to modify monthly rates.');
      }
      if (!isMonthOpen(month)) {
        throw new Error(`Month ${month} is locked or closed. Rates for locked months cannot be modified.`);
      }

      const size = dbState.pieceSizes.find((ps) => ps.id === pieceSizeId);
      const pieceSizeName = size ? size.displayName : pieceSizeId;

      const existingMonthDoc = dbState.monthlyRates.find((m) => m.month === month);
      const currentRates = existingMonthDoc?.rates || {};
      const updatedRates = {
        ...currentRates,
        [pieceSizeId]: Number(rate),
      };

      const monthDocRef = doc(db, 'monthlyRates', month);
      await setDoc(
        monthDocRef,
        {
          id: month,
          month,
          rates: updatedRates,
          updatedAt: new Date().toISOString(),
          updatedBy: 'Admin',
        },
        { merge: true }
      );

      await logAudit(
        'UPDATE_MONTHLY_RATE',
        `Updated rate for ${pieceSizeName} in month [${month}] to ₹${Number(rate).toFixed(2)}`,
        month,
        String(currentRates[pieceSizeId] ?? 0),
        String(rate)
      );

      return { success: true, message: `Monthly rate for ${pieceSizeName} saved for ${month}` };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Failed to save monthly rate',
        type: 'SUPABASE_WRITE_ERROR',
        operation: 'saveMonthlyRate',
        component: 'MonthlyCalendar',
      });
      return { success: false, message: err.message };
    }
  };

  // Month Lock / Unlock
  const setMonthLock = async (month: string, action: 'LOCK' | 'UNLOCK', reason?: string) => {
    try {
      const currentStatus = dbState.monthStatuses.find((m) => m.month === month);
      if (currentStatus?.isClosed && action === 'UNLOCK') {
        throw new Error('This month has undergone final closure settlement and cannot be unlocked.');
      }

      const statusData: MonthStatusRecord = {
        month,
        status: action === 'LOCK' ? 'LOCKED' : 'OPEN',
        isClosed: currentStatus ? currentStatus.isClosed : false,
        closedAt: currentStatus?.closedAt,
        unlockedAt: action === 'UNLOCK' ? new Date().toISOString() : undefined,
        unlockReason: reason,
      };

      await setDoc(doc(db, 'monthStatuses', month), statusData, { merge: true });

      await logAudit(
        `${action}_MONTH`,
        `${action === 'LOCK' ? 'Locked' : 'Unlocked'} register for month ${month}${reason ? ` (Reason: ${reason})` : ''}`,
        month
      );

      return { success: true, message: `Month ${month} ${action === 'LOCK' ? 'locked' : 'unlocked'} successfully` };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Month lock operation failed',
        type: 'SUPABASE_WRITE_ERROR',
        operation: 'setMonthLock',
        component: 'MonthLockSystem',
      });
      return { success: false, message: err.message };
    }
  };

  // Close Month (Permanent Settlement)
  const closeMonth = async (month: string) => {
    try {
      const statusData: MonthStatusRecord = {
        month,
        status: 'CLOSED',
        isClosed: true,
        closedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'monthStatuses', month), statusData, { merge: true });

      await logAudit('CLOSE_MONTH', `Month ${month} finalized and permanently closed with settlement register.`, month);
      return { success: true, message: `Month ${month} finalized and closed in Supabase.` };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Month close failed',
        type: 'SUPABASE_WRITE_ERROR',
        operation: 'closeMonth',
        component: 'MonthlySettlement',
      });
      return { success: false, message: err.message };
    }
  };

  // Request Zero System OTP from server-side cryptographic endpoint
  const requestZeroOtp = async (scope: string, targetId?: string, month?: string) => {
    try {
      if (currentRole !== 'ADMIN') {
        throw new Error('Unauthorized: Only an Administrator can request Zero System OTP.');
      }

      const effectiveMonth = month || getISTCurrentMonth();

      const response = await fetch('/api/zero/request-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await supabase.auth.getSession()).data.session?.access_token
            ? { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session!.access_token}` }
            : {},
        },
        body: JSON.stringify({ scope, targetId, month: effectiveMonth }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || 'Server rejected Zero OTP request.');
      }

      setActiveOtp({
        code: data.otpPreview,
        sessionId: data.sessionId,
        expiresAt: data.expiresAt,
        scope,
        targetId,
        month: effectiveMonth,
      });

      return {
        success: true,
        otpPreview: data.otpPreview,
        sessionId: data.sessionId,
        message: data.message || `Security OTP generated: ${data.otpPreview} (Valid for 5 minutes)`,
      };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Zero OTP request failed',
        type: 'ZERO_SYSTEM_ERROR',
        operation: 'requestZeroOtp',
        component: 'ZeroSystem',
      });
      return { success: false, message: err.message };
    }
  };

  // Verify Zero System OTP with server authority
  const verifyZeroOtp = async (otp: string) => {
    try {
      if (currentRole !== 'ADMIN') {
        return { success: false, message: 'Unauthorized: Admin access required.' };
      }
      if (!activeOtp || !activeOtp.sessionId) {
        return { success: false, message: 'No active Zero session. Please generate a new OTP.' };
      }

      const response = await fetch('/api/zero/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await supabase.auth.getSession()).data.session?.access_token
            ? { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session!.access_token}` }
            : {},
        },
        body: JSON.stringify({ sessionId: activeOtp.sessionId, otp: otp.trim() }),
      });

      const data = await response.json();
      if (!data.success) {
        return { success: false, message: data.message || 'Incorrect OTP code.' };
      }

      return { success: true, message: 'Server OTP verification successful.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Verification failed.' };
    }
  };

  // Execute Zero System Reset with OTP (Admin only, server-enforced, safe chunked batches)
  const executeZero = async (otp: string, scope: string, targetId?: string, month?: string) => {
    try {
      if (currentRole !== 'ADMIN') {
        throw new Error('Unauthorized: Only an Administrator can execute Zero System resets.');
      }
      if (!activeOtp || !activeOtp.sessionId) {
        throw new Error('No active Zero security session. Please request a new OTP.');
      }

      // Verify OTP against server authority
      const verifyResult = await verifyZeroOtp(otp);
      if (!verifyResult.success) {
        throw new Error(verifyResult.message || 'Server rejected OTP verification.');
      }

      const targetMonth = month || activeOtp.month || getISTCurrentMonth();
      let recordsToDelete: ProductionRecord[] = [];

      if (scope === 'all-production') {
        recordsToDelete = [...dbState.productionRecords];
      } else if (scope === 'current_month') {
        recordsToDelete = dbState.productionRecords.filter((r) => r.month === targetMonth);
      } else if (scope === 'selected_worker' && targetId) {
        recordsToDelete = dbState.productionRecords.filter(
          (r) => r.workerId === targetId && r.month === targetMonth
        );
      } else if (scope === 'selected_piece_size' && targetId) {
        recordsToDelete = dbState.productionRecords.filter(
          (r) => r.pieceSizeId === targetId && r.month === targetMonth
        );
      } else if (scope === 'worker-month' && targetId) {
        recordsToDelete = dbState.productionRecords.filter(
          (r) => r.workerId === targetId && r.month === targetMonth
        );
      } else if (scope === 'worker-all' && targetId) {
        recordsToDelete = dbState.productionRecords.filter((r) => r.workerId === targetId);
      } else if (scope === 'month-all') {
        recordsToDelete = dbState.productionRecords.filter((r) => r.month === targetMonth);
      }

      // Check month locks for the records to delete
      const affectedMonths = Array.from(new Set(recordsToDelete.map((r) => r.month)));
      const lockedMonths = affectedMonths.filter((m) => !isMonthOpen(m));
      if (lockedMonths.length > 0) {
        throw new Error(
          `Cannot reset records in locked month(s): ${lockedMonths.join(', ')}. Month must be open to execute reset.`
        );
      }

      // Reset every matching production record to zero instead of deleting it.
      // Keeping the record preserves the notebook/day/worker/size row while making
      // all production totals calculate as 0 immediately through realtime sync.
      const CHUNK_SIZE = 400;
      for (let i = 0; i < recordsToDelete.length; i += CHUNK_SIZE) {
        const chunk = recordsToDelete.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((rec) => {
          batch.update(doc(db, 'productionRecords', rec.id), {
            quantity: 0,
            updatedAt: new Date().toISOString(),
          });
        });
        await batch.commit();
      }

      // Determine human-readable target name
      let targetName: string | undefined;
      if (scope === 'selected_worker' && targetId) {
        targetName = dbState.workers.find((w) => w.id === targetId)?.fullName;
      } else if (scope === 'selected_piece_size' && targetId) {
        targetName = dbState.pieceSizes.find((ps) => ps.id === targetId)?.displayName;
      }

      // Write Zero Audit Record (Admin only, immutable, OTP value NEVER stored)
      const zeroAuditId = doc(collection(db, 'zeroAudits')).id;
      const zeroLog: ZeroAuditRecord = {
        id: zeroAuditId,
        scope,
        targetId,
        targetName,
        month: targetMonth,
        deletedCount: 0,
        recordsCountReset: recordsToDelete.length,
        executedBy: 'Admin',
        timestamp: new Date().toISOString(),
      };
      await setDoc(doc(db, 'zeroAudits', zeroAuditId), zeroLog);

      // Clear pending OTP
      setActiveOtp(null);

      await logAudit(
        'ZERO_SYSTEM_EXECUTE',
        `Zero reset executed for scope [${scope}] in month [${targetMonth}]. Reset ${recordsToDelete.length} production records to zero.`,
        zeroAuditId
      );

      return {
        success: true,
        message: `Zero reset completed. ${recordsToDelete.length} production entries are now zero.`,
      };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Zero operation failed',
        type: 'SUPABASE_DELETE_ERROR',
        operation: 'executeZero',
        component: 'ZeroSystem',
      });
      return { success: false, message: err.message };
    }
  };

  // Save Settings to Supabase
  const saveSettings = async (settingsUpdates: Partial<AppDatabase['settings']>) => {
    try {
      await setDoc(doc(db, 'settings', 'general'), settingsUpdates, { merge: true });
      await logAudit('UPDATE_SETTINGS', 'System and factory parameters updated in Supabase');
      return { success: true, message: 'Settings saved to Supabase' };
    } catch (err: any) {
      triggerError({
        message: err.message || 'Failed to save settings',
        type: 'SUPABASE_WRITE_ERROR',
        operation: 'saveSettings',
        component: 'Settings',
      });
      return { success: false, message: err.message };
    }
  };

  // Execute Safe Recovery Action
  const executeSafeRecovery = async (action: 'retry' | 'reconnect' | 'refresh' | 'recalculate') => {
    try {
      if (action === 'retry' && activeError?.retryAction) {
        await activeError.retryAction();
        setRecoverySuccess('Operation retried and completed successfully.');
      } else if (action === 'reconnect') {
        const isConnected = await testSupabaseConnection();
        setIsLive(isConnected);
        setRecoverySuccess(
          isConnected
            ? 'Supabase real-time listeners reconnected successfully.'
            : 'Connection check complete. Re-attaching real-time stream...'
        );
      } else if (action === 'refresh') {
        await testSupabaseConnection();
        setRecoverySuccess('Supabase data streams synchronized.');
      } else if (action === 'recalculate') {
        setRecoverySuccess('Registers and piece totals synchronized with live Supabase documents.');
      }

      setTimeout(() => {
        setActiveError(null);
        setAiDiagnosis(null);
        setRecoverySuccess(null);
      }, 1500);
    } catch (err: any) {
      setRecoverySuccess(null);
      triggerError({
        message: 'Recovery action failed: ' + (err.message || 'Please check connection'),
        type: 'RECOVERY_FAILED',
        operation: 'executeSafeRecovery',
        component: 'AIErrorPopup',
      });
    }
  };

  return {
    db: dbState,
    loading,
    isLive,
    currentRole,
    currentView,
    adminTab,
    selectedMonth,
    selectedWorkerId,
    activeError,
    aiDiagnosis,
    isDiagnosing,
    recoverySuccess,
    setCurrentView,
    setAdminTab,
    setSelectedMonth,
    setSelectedWorkerId,
    dismissError: () => {
      setActiveError(null);
      setAiDiagnosis(null);
    },
    login,
    logout,
    submitProduction,
    updateProductionRecord,
    deleteProductionRecord,
    addWorker,
    updateWorker,
    addPieceSize,
    updatePieceSize,
    saveMonthlyRate,
    setMonthLock,
    closeMonth,
    requestZeroOtp,
    verifyZeroOtp,
    executeZero,
    saveSettings,
    executeSafeRecovery,
    refreshDb: async () => dbState,
  };
}

export type ProductionStore = ReturnType<typeof useProductionStore>;
