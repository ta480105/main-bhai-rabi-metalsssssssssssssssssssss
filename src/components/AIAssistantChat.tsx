import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ProductionStore } from '../context/useProductionStore';
import { Bot, Send, X, Sparkles, MessageSquare, Loader2, ShieldCheck, HardHat } from 'lucide-react';
import { getMonthlyRate } from '../utils/formatters';

interface AIAssistantChatProps {
  store: ProductionStore;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  source?: string;
  timestamp: string;
}

export function AIAssistantChat({ store }: AIAssistantChatProps) {
  const { currentRole, selectedMonth, db } = store;
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'm-1',
      sender: 'assistant',
      text: `Hello! I am your Production Management AI Assistant. I have live access to active worker records, piece rates, and daily shift logs for ${selectedMonth}. How can I assist you?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const quickPrompts =
    currentRole === 'SUPERVISOR'
      ? [
          "What is today's total production count?",
          'List active workers for daily entry',
          'What bottle piece sizes are active?',
        ]
      : [
          'How much did Tabish produce this month?',
          "What is today's total production across workers?",
          'Show current piece rates and tariffs',
          'Is the current month open or locked?',
        ];

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const activeWorkers = db.workers.filter((w) => w.status === 'active');
      const monthRecords = db.productionRecords.filter((r) => r.month === selectedMonth);
      const activeSizes = db.pieceSizes.filter((p) => p.status === 'active');
      const ratesSummary = activeSizes.map((p) => {
        const rate = getMonthlyRate(db.monthlyRates, p.id, selectedMonth, 0);
        return `${p.displayName}: ₹${rate.toFixed(2)}`;
      });

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await supabase.auth.getSession()).data.session?.access_token
            ? { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session!.access_token}` }
            : {},
        },
        body: JSON.stringify({
          message: query,
          role: currentRole || 'ADMIN',
          currentMonth: selectedMonth,
          supabaseContext: {
            activeWorkers: activeWorkers.map((w) => ({ id: w.id, name: w.fullName, firstName: w.firstName })),
            pieceSizes: activeSizes.map((p) => ({ id: p.id, name: p.name, displayName: p.displayName })),
            ratesSummary,
            monthRecordsCount: monthRecords.length,
            monthTotalPieces: monthRecords.reduce((s, r) => s + r.quantity, 0),
            monthRecords: monthRecords.map((r) => ({
              workerId: r.workerId,
              workerName: r.workerName,
              workerFirstName: r.workerFirstName,
              pieceSizeId: r.pieceSizeId,
              pieceSizeName: r.pieceSizeName,
              quantity: Number(r.quantity || 0),
              date: r.date,
              day: r.day,
            })),
          },
        }),
      });
      const data = await res.json();
      const aiReply = data.reply || "I couldn't retrieve that information.";

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'assistant',
          text: aiReply,
          source: data.source,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: 'Unable to connect to AI assistant server. Please check connection.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          type="button"
          id="btn-ai-assistant"
          onClick={() => setIsOpen(true)}
          className="group flex items-center space-x-2 py-2.5 px-3.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-lg border border-blue-500 cursor-pointer active:scale-95 transition-all"
        >
          <div className="relative">
            <Bot className="w-4 h-4 text-blue-100" />
            <span className="w-2 h-2 rounded-full bg-green-400 absolute -top-0.5 -right-0.5 animate-pulse" />
          </div>
          <span className="tracking-wide">AI ASSISTANT</span>
        </button>
      </div>

      {/* Slide-over Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md h-full bg-white border-l border-slate-200 text-slate-800 flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-sm text-slate-900">Gemini Production Assistant</h3>
                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-green-100 text-green-700 border border-green-200">
                      LIVE
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Role context: <strong className="text-slate-900">{currentRole}</strong> • Grounded in real data
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Prompts Bar */}
            <div className="p-2.5 bg-slate-50/80 border-b border-slate-200 overflow-x-auto scrollbar-none flex space-x-2">
              {quickPrompts.map((qp, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(qp)}
                  className="whitespace-nowrap px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-blue-700 text-[11px] font-bold border border-slate-200 shadow-2xs flex items-center space-x-1 active:scale-95 transition-all cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 text-blue-500" />
                  <span>{qp}</span>
                </button>
              ))}
            </div>

            {/* Chat Messages List */}
            <div className="flex-1 p-3.5 overflow-y-auto space-y-2.5 bg-slate-50/40">
              {messages.map((m) => {
                const isUser = m.sender === 'user';
                return (
                  <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[85%] rounded-xl p-3 text-xs leading-relaxed space-y-1 ${
                        isUser
                          ? 'bg-blue-600 text-white shadow-xs rounded-tr-none'
                          : 'bg-white text-slate-800 border border-slate-200 rounded-tl-none shadow-xs'
                      }`}
                    >
                      <div className="whitespace-pre-line">{m.text}</div>
                      <div
                        className={`text-[10px] text-right ${isUser ? 'text-blue-100' : 'text-slate-400'}`}
                      >
                        {m.timestamp}
                      </div>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 p-2.5 rounded-xl rounded-tl-none text-xs text-slate-500 flex items-center space-x-2 shadow-xs">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                    <span>Analyzing real database records...</span>
                  </div>
                </div>
              )}
            </div>

            {/* Input Bar */}
            <div className="p-3 border-t border-slate-200 bg-white">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center space-x-2"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask a question about worker counts or rates..."
                  className="flex-1 py-2 px-3 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-400 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
