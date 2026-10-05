import { useState } from 'react';
import { ProductionStore } from '../context/useProductionStore';
import { useAuth } from '../context/AuthContext';
import {
  Factory,
  LogOut,
  Users,
  Calendar,
  Layers,
  IndianRupee,
  Table,
  Calculator,
  Lock,
  AlertOctagon,
  ShieldCheck,
  Activity,
  Settings,
  Menu,
  X,
  TrendingUp,
  Clock,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { formatINR, formatNumber, getISTToday, getMonthName } from '../utils/formatters';
import { generateMonthlyPaymentPdf } from '../utils/pdfReport';

// Subcomponents
import { MonthlyCalendar } from './MonthlyCalendar';
import { WorkerManagement } from './WorkerManagement';
import { PieceSizeManagement } from './PieceSizeManagement';
import { MonthlySettlement } from './MonthlySettlement';
import { ProductionRecordsTable } from './ProductionRecordsTable';
import { MonthLockSystem } from './MonthLockSystem';
import { ZeroSystemModal } from './ZeroSystemModal';
import { AuditLogView } from './AuditLogView';
import { SystemHealthView } from './SystemHealthView';
import { SettingsView } from './SettingsView';

interface AdminDashboardProps {
  store: ProductionStore;
}

export function AdminDashboard({ store }: AdminDashboardProps) {
  const { db, adminTab, setAdminTab, logout, isLive, selectedMonth } = store;
  const { user, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const todayStr = getISTToday();
  const todayRecords = db.productionRecords.filter((r) => r.date === todayStr);
  const todayTotalPieces = todayRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);

  const monthRecords = db.productionRecords.filter((r) => r.month === selectedMonth);
  const monthTotalPieces = monthRecords.reduce((sum, r) => sum + (r.quantity || 0), 0);
  const monthTotalAmount = monthRecords.reduce((sum, r) => sum + (r.quantity || 0) * (r.applicableRate || 0), 0);

  const activeWorkersCount = db.workers.filter((w) => w.status === 'active').length;
  const monthStatusObj = db.monthStatuses.find((m) => m.month === selectedMonth);
  const isMonthLocked = monthStatusObj?.status === 'LOCKED' || monthStatusObj?.isClosed;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
    { id: 'calendar', label: 'Monthly Register', icon: FileSpreadsheet },
    { id: 'workers', label: 'Workers', icon: Users },
    { id: 'pieces', label: 'Piece Sizes', icon: Layers },
    { id: 'records', label: 'Records Database', icon: Table },
    { id: 'settlement', label: 'Monthly Settlement', icon: Calculator },
    { id: 'month-lock', label: 'Month Lock', icon: Lock },
    { id: 'zero', label: 'Zero System', icon: AlertOctagon, danger: true },
    { id: 'audit', label: 'Audit Log', icon: ShieldCheck },
    { id: 'health', label: 'Telemetry & Health', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNavSelect = (id: string) => {
    setAdminTab(id);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3 bg-slate-900 text-white border-b border-slate-700 shadow-sm">
        <div className="flex items-center space-x-4">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center space-x-3">
            <h1 className="text-base sm:text-lg font-bold tracking-tight uppercase text-white">
              {db.settings.companyName || 'PRODUCTION MANAGEMENT'}
            </h1>
            <div className="flex items-center space-x-2 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
              <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-500 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-xs font-mono text-green-400">{isLive ? 'LIVE' : 'CONNECTING'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-4 sm:space-x-6">
          <button
            type="button"
            onClick={() =>
              generateMonthlyPaymentPdf({
                companyName: db.settings.companyName || 'Factory Works',
                month: selectedMonth,
                workers: db.workers,
                pieceSizes: db.pieceSizes,
                monthlyRates: db.monthlyRates,
                productionRecords: db.productionRecords,
              })
            }
            className="hidden md:flex items-center space-x-1.5 py-1.5 px-3 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>GENERATE PDF</span>
          </button>

          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">
              {user?.email ? user.email.split('@')[0] : 'Role'}:
            </span>
            <span className="text-xs font-semibold text-white">ADMINISTRATOR</span>
          </div>

          <button
            type="button"
            onClick={async () => {
              await signOut();
              logout();
            }}
            className="bg-slate-700 hover:bg-slate-600 px-3 sm:px-4 py-1.5 sm:py-2 rounded text-xs font-bold text-white transition-colors cursor-pointer"
          >
            LOGOUT
          </button>
        </div>
      </header>

      {/* Main Responsive Layout */}
      <div className="flex-1 w-full flex overflow-hidden">
        {/* Desktop Sidebar Rail */}
        <aside className="hidden lg:flex w-64 bg-slate-800 flex-col p-4 space-y-1.5 border-r border-slate-700 select-none overflow-y-auto">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-3 mb-1">Navigation</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = adminTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavSelect(item.id)}
                className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? item.danger
                      ? 'bg-red-600 text-white shadow-md'
                      : 'bg-blue-600 text-white shadow-md'
                    : item.danger
                    ? 'text-red-400 hover:text-red-300 hover:bg-red-950/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs flex">
            <div className="w-64 max-w-[80vw] h-full bg-slate-800 border-r border-slate-700 p-4 space-y-1 overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-700 mb-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">Navigation</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = adminTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavSelect(item.id)}
                    className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? item.danger
                          ? 'bg-red-600 text-white'
                          : 'bg-blue-600 text-white'
                        : item.danger
                        ? 'text-red-400 hover:text-red-300 hover:bg-red-950/30'
                        : 'text-slate-400 hover:text-white hover:bg-slate-700/60'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 pb-24 overflow-y-auto bg-slate-50">
          {adminTab === 'dashboard' && (
            <div className="space-y-4 sm:space-y-6">
              {/* High Density Summary Cards Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Workers</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{activeWorkersCount}</p>
                  <p className="text-[10px] text-green-600 mt-1 font-medium">{todayRecords.length} worker shift submissions</p>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Today's Production</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1 font-mono">
                    {formatNumber(todayTotalPieces)} <span className="text-xs font-normal text-slate-400">pcs</span>
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Shift date: {todayStr}</p>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Estimated Amount</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1 font-mono">{formatINR(monthTotalAmount)}</p>
                  <p className="text-[10px] text-slate-400 mt-1">Based on active rates ({getMonthName(selectedMonth)})</p>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col justify-between">
                  <div className="flex justify-between items-start">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</p>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                        isMonthLocked ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {isMonthLocked ? 'LOCKED' : 'OPEN'}
                    </span>
                  </div>
                  <p className="text-xl font-bold text-slate-700 uppercase tracking-tight mt-2">
                    {getMonthName(selectedMonth)}
                  </p>
                </div>
              </div>

              {/* Quick Launch Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  onClick={() => setAdminTab('calendar')}
                  className="bg-white border border-slate-200 hover:border-blue-500 hover:shadow-md p-5 rounded-xl cursor-pointer transition-all shadow-sm group"
                >
                  <div className="flex items-center space-x-3 mb-2.5">
                    <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 group-hover:scale-105 transition-transform">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 uppercase tracking-tight">Monthly Notebook Register</h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Open the Excel-style digital production register matching your factory notebook with dates 1–31 and
                    instant totals.
                  </p>
                </div>

                <div
                  onClick={() => setAdminTab('settlement')}
                  className="bg-white border border-slate-200 hover:border-blue-500 hover:shadow-md p-5 rounded-xl cursor-pointer transition-all shadow-sm group"
                >
                  <div className="flex items-center space-x-3 mb-2.5">
                    <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 group-hover:scale-105 transition-transform">
                      <Calculator className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 uppercase tracking-tight">Settlement & PDF Reports</h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Review worker payment subtotals, export official PDF salary reports, and finalize month closures.
                  </p>
                </div>

                <div
                  onClick={() => setAdminTab('workers')}
                  className="bg-white border border-slate-200 hover:border-blue-500 hover:shadow-md p-5 rounded-xl cursor-pointer transition-all shadow-sm group"
                >
                  <div className="flex items-center space-x-3 mb-2.5">
                    <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 group-hover:scale-105 transition-transform">
                      <Users className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-sm text-slate-900 uppercase tracking-tight">Worker Profiles & Roster</h3>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Add new workers, update mobile contact details, toggle active/inactive status, and inspect piece
                    histories.
                  </p>
                </div>
              </div>

              {/* Integrated Monthly Calendar Preview */}
              <div className="pt-2">
                <MonthlyCalendar store={store} />
              </div>
            </div>
          )}

          {adminTab === 'calendar' && <MonthlyCalendar store={store} />}
          {adminTab === 'workers' && <WorkerManagement store={store} />}
          {adminTab === 'pieces' && <PieceSizeManagement store={store} />}
          {adminTab === 'records' && <ProductionRecordsTable store={store} />}
          {adminTab === 'settlement' && <MonthlySettlement store={store} />}
          {adminTab === 'month-lock' && <MonthLockSystem store={store} />}
          {adminTab === 'zero' && <ZeroSystemModal store={store} />}
          {adminTab === 'audit' && <AuditLogView store={store} />}
          {adminTab === 'health' && <SystemHealthView store={store} />}
          {adminTab === 'settings' && <SettingsView store={store} />}
        </main>
      </div>
    </div>
  );
}
