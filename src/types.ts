export type UserRole = 'ADMIN' | 'SUPERVISOR';

export interface Worker {
  id: string;
  firstName: string;
  lastName?: string;
  fullName: string;
  mobile?: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface PieceSize {
  id: string;
  name: string;
  value: number;
  unit: string;
  displayName: string;
  baseRate?: number; // Base rate fallback in ₹ INR
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyRatesDoc {
  id: string; // YYYY-MM
  month: string; // YYYY-MM
  rates: Record<string, number>; // map of pieceSizeId -> rate in ₹ INR
  updatedAt?: string;
  updatedBy?: string;
}

export interface ProductionRecord {
  id: string;
  workerId: string;
  workerName: string;
  workerFirstName: string;
  pieceSizeId: string;
  pieceSizeName: string;
  quantity: number;
  attendanceStatus?: 'normal' | 'P' | 'X'; // normal = pieces, P = Present, X = Absent
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  year: number;
  day: number; // 1-31
  applicableRate: number;
  enteredBy: string; // Admin / Supervisor
  status: 'submitted' | 'verified' | 'finalized';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthStatusRecord {
  month: string; // YYYY-MM
  status: 'OPEN' | 'LOCKED' | 'CLOSED';
  isClosed?: boolean;
  closedAt?: string;
  closedBy?: string;
  unlockedAt?: string;
  unlockedBy?: string;
  unlockReason?: string;
}

export interface AuditLog {
  id: string;
  user: string;
  role: UserRole;
  action: string;
  details: string;
  affectedRecord?: string;
  oldValue?: string;
  newValue?: string;
  timestamp: string;
}

export interface SystemSettings {
  companyName: string;
  allowDuplicateEntries: boolean;
}

export interface ZeroAuditRecord {
  id: string;
  performedBy?: string;
  executedBy?: string;
  scope: string;
  targetId?: string;
  targetName?: string;
  month: string;
  recordsCountReset?: number;
  deletedCount?: number;
  timestamp: string;
}

export interface AppDatabase {
  workers: Worker[];
  pieceSizes: PieceSize[];
  monthlyRates: MonthlyRatesDoc[];
  productionRecords: ProductionRecord[];
  monthStatuses: MonthStatusRecord[];
  auditLogs: AuditLog[];
  settings: SystemSettings;
  zeroAudits: ZeroAuditRecord[];
}

export interface SystemHealthReport {
  status: 'healthy' | 'degraded' | 'offline';
  connectedClients: number;
  lastSyncTime: string;
  totalRecords: number;
  geminiConfigured: boolean;
  activeWorkers: number;
  recentErrors: Array<{
    id: string;
    timestamp: string;
    type: string;
    message: string;
    resolved: boolean;
  }>;
}

export interface AIDiagnosisResponse {
  severity: 'low' | 'medium' | 'high';
  problem: string;
  likelyCause: string;
  recommendedAction: string;
  safeRecoveryAvailable: boolean;
  recoveryAction: 'retry' | 'reconnect' | 'refresh' | 'recalculate' | 'none';
  requiresUserConfirmation: boolean;
}
