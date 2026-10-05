/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useProductionStore } from './context/useProductionStore';
import { AuthProvider } from './context/AuthContext';
import { OpeningScreen } from './components/OpeningScreen';
import { SupervisorEntry } from './components/SupervisorEntry';
import { AdminDashboard } from './components/AdminDashboard';
import { AIAssistantChat } from './components/AIAssistantChat';
import { AIErrorPopup } from './components/AIErrorPopup';

function MainApp() {
  const store = useProductionStore();

  // If not authenticated, display role selection opening screen
  if (!store.currentRole) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-600 selection:text-white">
        <OpeningScreen
          onSelectRole={(targetRole) => {
            store.login(targetRole);
          }}
          isLive={store.isLive}
          companyName={store.db.settings.companyName}
        />

        <AIAssistantChat store={store} />
        <AIErrorPopup store={store} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-blue-600 selection:text-white antialiased">
      {store.currentRole === 'SUPERVISOR' ? (
        <SupervisorEntry store={store} />
      ) : (
        <AdminDashboard store={store} />
      )}

      {/* Persistent Grounded AI Assistant & Diagnostic Error Recovery */}
      <AIAssistantChat store={store} />
      <AIErrorPopup store={store} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
