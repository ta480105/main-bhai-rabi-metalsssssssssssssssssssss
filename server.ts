import 'dotenv/config';
import express from 'express';
import path from 'path';
import crypto from 'crypto';

import { GoogleGenAI } from '@google/genai';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';




const PORT = Number(process.env.PORT) || 3000;

function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase server configuration is missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function getVerifiedUser(req: express.Request) {
  const authHeader = req.header('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return null;
    const { data: profile } = await admin.from('profiles').select('id,username,display_name,role,active').eq('id', data.user.id).maybeSingle();
    if (!profile?.active) return null;
    return { ...data.user, profile };
  } catch {
    return null;
  }
}

async function requireAuthenticated(req: express.Request) {
  return getVerifiedUser(req);
}

async function requireAdmin(req: express.Request) {
  const verified = await getVerifiedUser(req);
  if (!verified || verified.profile.role !== 'ADMIN' || !verified.profile.active) return null;
  return verified;
}

async function ensureAdminAccount() {
  const admin = getSupabaseAdmin();
  const username = (process.env.SUPABASE_ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const password = process.env.SUPABASE_ADMIN_PASSWORD || '1234';
  const email = `${username}@production.local`;

  const { data: existingProfile } = await admin.from('profiles').select('id').eq('username', username).maybeSingle();
  if (existingProfile?.id) return;

  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username, display_name: 'Administrator', role: 'ADMIN' } });
  if (error && !/already registered/i.test(error.message)) throw error;
  if (!data.user) {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const found = users.users.find((u) => u.email === email);
    if (!found) throw new Error('Unable to provision the Admin Supabase account.');
    await admin.from('profiles').upsert({ id: found.id, username, display_name: 'Administrator', role: 'ADMIN', active: true });
    return;
  }
  const { error: profileError } = await admin.from('profiles').insert({ id: data.user.id, username, display_name: 'Administrator', role: 'ADMIN', active: true });
  if (profileError) throw profileError;
}

// Lazy initialization of Gemini Client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (aiClient) return aiClient;
  const key = process.env.GEMINI_API_KEY;
  if (key && key.trim().length > 0) {
    try {
      aiClient = new GoogleGenAI({ apiKey: key });
    } catch (err) {
      console.warn('Failed to initialize GoogleGenAI client:', err);
    }
  }
  return aiClient;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  try { await ensureAdminAccount(); } catch (err) { console.warn('Supabase Admin bootstrap skipped:', err instanceof Error ? err.message : err); }

  // -------------------------------------------------------------
  // HEALTH & TELEMETRY API
  // -------------------------------------------------------------
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      database: 'Supabase PostgreSQL',
      auth: 'Supabase username/password login',
      listeners: 'Supabase Realtime',
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // -------------------------------------------------------------
  // GEMINI AI ASSISTANT PROXY API
  // -------------------------------------------------------------
  app.post('/api/ai/chat', async (req, res) => {
    const verifiedUser = await requireAuthenticated(req);
    if (!verifiedUser) return res.status(401).json({ success: false, reply: 'Authentication required.' });
    const { message, role, currentMonth, supabaseContext } = req.body;
    const isSupervisor = role === 'SUPERVISOR';
    const month = currentMonth || 'Current Month';

    // Build the AI context from the live client data and also include a compact
    // worker/piece-size production summary so questions like "Tabish total pieces"
    // and "Tabish 250 ml data" can be answered from actual records.
    const activeWorkers = supabaseContext?.activeWorkers || [];
    const ratesSummary = supabaseContext?.ratesSummary || [];
    const monthRecords = Array.isArray(supabaseContext?.monthRecords) ? supabaseContext.monthRecords : [];
    const monthTotalPieces = Number(supabaseContext?.monthTotalPieces || 0);

    const workerSummary = new Map<string, { total: number; bySize: Record<string, number> }>();
    for (const record of monthRecords) {
      const workerName = String(record.workerName || record.workerFirstName || '').trim();
      const sizeName = String(record.pieceSizeName || '').trim();
      const quantity = Number(record.quantity || 0);
      if (!workerName) continue;
      const existing = workerSummary.get(workerName) || { total: 0, bySize: {} };
      existing.total += quantity;
      if (sizeName) existing.bySize[sizeName] = (existing.bySize[sizeName] || 0) + quantity;
      workerSummary.set(workerName, existing);
    }

    const workerProductionSummary = Array.from(workerSummary.entries())
      .map(([workerName, value]) => `${workerName}: total ${value.total.toLocaleString()} pcs; ${Object.entries(value.bySize).map(([size, qty]) => `${size}=${qty.toLocaleString()}`).join(', ')}`)
      .join('\n');

    const groundingContext = `
LIVE PRODUCTION DATABASE CONTEXT (authoritative; ${month}):
- Role: ${role}
- Active Workers: ${activeWorkers.map((w: any) => w.name || w.firstName).join(', ') || 'None'}
- Total Month Pieces: ${monthTotalPieces.toLocaleString()}
- Piece Rates: ${ratesSummary.join(' | ') || 'None'}
- Worker production summary:
${workerProductionSummary || 'No production records.'}
`;

    const answerFromLocalData = () => {
      const q = String(message || '').toLowerCase();
      const workerMatch = activeWorkers.find((w: any) => {
        const name = String(w.name || w.firstName || '').toLowerCase();
        return name && q.includes(name);
      });

      if (workerMatch) {
        const workerName = String(workerMatch.name || workerMatch.firstName);
        const summary = workerSummary.get(workerName) ||
          Array.from(workerSummary.entries()).find(([name]) => name.toLowerCase() === workerName.toLowerCase())?.[1];
        if (summary) {
          const sizeMatch = Object.keys(summary.bySize).find((size) => {
            const normalized = size.toLowerCase().replace(/\s+/g, '');
            return q.includes(normalized) || q.includes(normalized.replace('ml', ''));
          });
          if (sizeMatch) return `${workerName} ${sizeMatch}: ${summary.bySize[sizeMatch].toLocaleString()} pcs.`;
          return `${workerName}: ${summary.total.toLocaleString()} pcs.`;
        }
        return `${workerName}: 0 pcs.`;
      }

      if (/total.*(production|pieces|pcs)|total.*(ban|piece)/i.test(q)) {
        return `Total production for ${month}: ${monthTotalPieces.toLocaleString()} pcs.`;
      }
      return null;
    };

    const ai = getGeminiClient();

    if (!ai) {
      const localAnswer = answerFromLocalData();
      return res.json({
        success: true,
        reply: localAnswer || `No matching production data found for ${month}.`,
        source: 'grounded-local',
      });
    }

    try {
      const systemInstruction = `You are the Production Management AI Assistant for an industrial manufacturing and piece-rate facility.
Role: Responding to ${role}.
${isSupervisor ? 'You are talking to a SUPERVISOR. Keep answers focused on daily entry, attendance, and piece specifications.' : 'You are talking to an ADMINISTRATOR. You have access to worker production, rates, settlements, and locking states.'}
Rules:
1. Use ONLY the live database context below. Never invent or estimate numbers.
2. Answer ONLY what the user asks. Do not add unrelated totals, rates, explanations, or suggestions.
3. If the user asks for a worker's total pieces, give that worker's total pieces.
4. If the user asks for a worker + bottle size (for example 250 ml), give only that worker/size quantity.
5. If the requested data is not present, say "No matching data found."
6. Keep answers concise and use pcs for piece counts.
7. Format currency with ₹ when currency is requested.

${groundingContext}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: String(message || '').trim(),
        config: {
          systemInstruction,
          temperature: 0,
          maxOutputTokens: 200,
        },
      });

      const reply = String(response.text || '').trim();
      if (reply) return res.json({ success: true, reply, source: 'gemini' });

      const localAnswer = answerFromLocalData();
      return res.json({ success: true, reply: localAnswer || 'No matching data found.', source: 'grounded-local' });
    } catch (err: any) {
      console.error('Gemini API error:', err);
      // Keep the assistant useful even if Gemini itself is unavailable/quota-limited.
      const localAnswer = answerFromLocalData();
      return res.json({
        success: true,
        reply: localAnswer || 'No matching data found.',
        source: 'grounded-local',
      });
    }
  });

  // -------------------------------------------------------------
  // GEMINI AI ERROR DIAGNOSTIC & SAFE RECOVERY API
  // -------------------------------------------------------------
  app.post('/api/ai/diagnose', async (req, res) => {
    const verifiedUser = await requireAuthenticated(req);
    if (!verifiedUser) return res.status(401).json({ success: false, diagnosis: null, message: 'Authentication required.' });
    const { errorType, errorMessage, component, operation, networkStatus } = req.body;

    const ai = getGeminiClient();
    if (!ai) {
      let recoveryAction: 'retry' | 'reconnect' | 'refresh' | 'recalculate' | 'none' = 'retry';
      let likelyCause = 'Network or client-side temporary state disconnect.';
      if (errorMessage?.includes('Failed to fetch') || networkStatus === 'offline') {
        recoveryAction = 'reconnect';
        likelyCause = 'Internet connection temporarily disconnected.';
      } else if (errorMessage?.includes('locked')) {
        recoveryAction = 'none';
        likelyCause = 'Operation attempted on a locked month.';
      }

      return res.json({
        success: true,
        diagnosis: {
          severity: 'medium',
          problem: errorMessage || 'An unexpected application operation failure occurred.',
          likelyCause,
          recommendedAction: 'Retry the operation or reconnect the Cloud Supabase real-time listener.',
          safeRecoveryAvailable: recoveryAction !== 'none',
          recoveryAction,
          requiresUserConfirmation: false,
        },
      });
    }

    try {
      const prompt = `Analyze this industrial web application error and provide a structured JSON diagnosis:
Error Type: ${errorType}
Error Message: ${errorMessage}
Component: ${component}
Operation: ${operation}
Network Status: ${networkStatus}

Return strictly valid JSON with this shape:
{
  "severity": "low" | "medium" | "high",
  "problem": "Clear 1-sentence description of the problem",
  "likelyCause": "Technical or connection root cause",
  "recommendedAction": "Concrete recommendation for the user or system",
  "safeRecoveryAvailable": true | false,
  "recoveryAction": "retry" | "reconnect" | "refresh" | "recalculate" | "none",
  "requiresUserConfirmation": true | false
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      const diagnosis = JSON.parse(response.text || '{}');
      res.json({ success: true, diagnosis });
    } catch (err: any) {
      console.error('Error diagnosing with Gemini:', err);
      res.json({
        success: true,
        diagnosis: {
          severity: 'medium',
          problem: errorMessage || 'Temporary operational failure',
          likelyCause: 'Cloud Supabase or connection latency',
          recommendedAction: 'Verify connection and retry',
          safeRecoveryAvailable: true,
          recoveryAction: 'retry',
          requiresUserConfirmation: false,
        },
      });
    }
  });

  // -------------------------------------------------------------
  // ZERO SYSTEM SERVER-SIDE OTP & CRYPTOGRAPHIC VERIFICATION
  // -------------------------------------------------------------
  interface ZeroOtpSession {
    otpHash: string;
    scope: string;
    targetId?: string;
    month: string;
    requestedBy: string;
    requestedByUid: string;
    expiresAt: number;
    verified: boolean;
  }
  const zeroSessions = new Map<string, ZeroOtpSession>();

  app.post('/api/zero/request-otp', async (req, res) => {
    const { scope, targetId, month } = req.body;

    const adminUser = await requireAdmin(req);
    if (!adminUser) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Administrator privileges required for Zero System operation.',
      });
    }

    // Generate cryptographically secure 6-digit OTP using crypto.randomInt (NOT Math.random)
    const otpNumber = crypto.randomInt(100000, 1000000);
    const otpCode = String(otpNumber);
    const sessionId = crypto.randomUUID();
    const otpHash = crypto.createHash('sha256').update(`${sessionId}:${otpCode}`).digest('hex');
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    zeroSessions.set(sessionId, {
      otpHash,
      scope: scope || 'current_month',
      targetId,
      month: month || '',
      requestedBy: adminUser.email || adminUser.uid,
      requestedByUid: adminUser.uid,
      expiresAt,
      verified: false,
    });

    // Automatically clean up memory after 6 minutes
    setTimeout(() => {
      zeroSessions.delete(sessionId);
    }, 6 * 60 * 1000);

    return res.json({
      success: true,
      sessionId,
      // The OTP is returned only to the already-authenticated Administrator because
      // this application has no configured email/SMS delivery channel. It is never
      // stored or logged. Authorization still depends on the verified Supabase access token.
      otpPreview: otpCode,
      expiresAt,
      message: 'Security OTP generated for the authenticated Administrator (valid for 5 minutes).',
    });
  });

  app.post('/api/zero/verify-otp', async (req, res) => {
    const { sessionId, otp } = req.body;

    const adminUser = await requireAdmin(req);
    if (!adminUser) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Administrator privileges required.',
      });
    }

    const session = zeroSessions.get(sessionId);
    if (!session) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired Zero session. Please generate a new OTP.',
      });
    }

    if (session.requestedByUid !== adminUser.uid) {
      return res.status(403).json({ success: false, message: 'Zero session belongs to a different authenticated Administrator.' });
    }

    if (Date.now() > session.expiresAt) {
      zeroSessions.delete(sessionId);
      return res.status(400).json({
        success: false,
        message: 'Security OTP expired. Please generate a new OTP.',
      });
    }

    if (session.verified) {
      return res.json({ success: true, message: 'Zero session was already verified for this Administrator.' });
    }

    const candidateHash = crypto.createHash('sha256').update(`${sessionId}:${String(otp).trim()}`).digest('hex');
    if (candidateHash !== session.otpHash) {
      return res.status(400).json({
        success: false,
        message: 'Incorrect OTP entered. Server verification failed.',
      });
    }

    session.verified = true;
    session.requestedBy = adminUser.email || adminUser.uid;

    return res.json({
      success: true,
      message: 'Server OTP verification successful.',
    });
  });

  // -------------------------------------------------------------
  // ADMIN SUPERVISOR MANAGEMENT
  // -------------------------------------------------------------
  app.post('/api/admin/supervisors/list', async (req, res) => {
    const adminUser = await requireAdmin(req);
    if (!adminUser) return res.status(403).json({ success: false, error: 'Admin access required.' });
    const db = getSupabaseAdmin();
    const { data, error } = await db.from('profiles').select('id,username,display_name,active').eq('role', 'SUPERVISOR').order('username');
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.json({ success: true, supervisors: (data || []).map((p) => ({ id: p.id, username: p.username, displayName: p.display_name, active: p.active })) });
  });

  app.post('/api/admin/supervisors/create', async (req, res) => {
    const adminUser = await requireAdmin(req);
    if (!adminUser) return res.status(403).json({ success: false, error: 'Admin access required.' });
    const { name, username, password } = req.body || {};
    const cleanUsername = String(username || '').trim().toLowerCase();
    const cleanName = String(name || '').trim();
    if (!cleanUsername || !/^[a-z0-9._-]{3,40}$/.test(cleanUsername)) return res.status(400).json({ success: false, error: 'Username must be 3-40 characters using letters, numbers, dot, underscore or hyphen.' });
    if (String(password || '').length < 6) return res.status(400).json({ success: false, error: 'Supervisor password must be at least 6 characters.' });
    if (!cleanName) return res.status(400).json({ success: false, error: 'Supervisor name is required.' });
    const db = getSupabaseAdmin();
    const { data: existing } = await db.from('profiles').select('id').eq('username', cleanUsername).maybeSingle();
    if (existing) return res.status(409).json({ success: false, error: 'That supervisor username already exists.' });
    const email = `${cleanUsername}@production.local`;
    const { data: created, error: createError } = await db.auth.admin.createUser({ email, password: String(password), email_confirm: true, user_metadata: { username: cleanUsername, display_name: cleanName, role: 'SUPERVISOR' } });
    if (createError || !created.user) return res.status(400).json({ success: false, error: createError?.message || 'Unable to create supervisor account.' });
    const { error: profileError } = await db.from('profiles').insert({ id: created.user.id, username: cleanUsername, display_name: cleanName, role: 'SUPERVISOR', active: true });
    if (profileError) {
      await db.auth.admin.deleteUser(created.user.id);
      return res.status(500).json({ success: false, error: profileError.message });
    }
    return res.json({ success: true, message: `Supervisor ${cleanUsername} created successfully.` });
  });

  app.post('/api/admin/supervisors/status', async (req, res) => {
    const adminUser = await requireAdmin(req);
    if (!adminUser) return res.status(403).json({ success: false, error: 'Admin access required.' });
    const username = String(req.body?.username || '').trim().toLowerCase();
    const active = Boolean(req.body?.active);
    const db = getSupabaseAdmin();
    const { data: profile } = await db.from('profiles').select('id').eq('username', username).eq('role', 'SUPERVISOR').maybeSingle();
    if (!profile) return res.status(404).json({ success: false, error: 'Supervisor not found.' });
    const { error } = await db.from('profiles').update({ active, updated_at: new Date().toISOString() }).eq('id', profile.id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    if (!active) await db.auth.admin.signOut(profile.id, 'global');
    return res.json({ success: true, message: active ? 'Supervisor enabled.' : 'Supervisor disabled and logged out.' });
  });

  app.post('/api/admin/supervisors/password', async (req, res) => {
    const adminUser = await requireAdmin(req);
    if (!adminUser) return res.status(403).json({ success: false, error: 'Admin access required.' });
    const username = String(req.body?.username || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (password.length < 6) return res.status(400).json({ success: false, error: 'Password must be at least 6 characters.' });
    const db = getSupabaseAdmin();
    const { data: profile } = await db.from('profiles').select('id').eq('username', username).eq('role', 'SUPERVISOR').maybeSingle();
    if (!profile) return res.status(404).json({ success: false, error: 'Supervisor not found.' });
    const { error } = await db.auth.admin.updateUserById(profile.id, { password });
    if (error) return res.status(400).json({ success: false, error: error.message });
    await db.auth.admin.signOut(profile.id, 'global');
    await db.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', profile.id);
    return res.json({ success: true, message: 'Password changed. Supervisor must login again.' });
  });

  app.post('/api/admin/supervisors/logout', async (req, res) => {
    const adminUser = await requireAdmin(req);
    if (!adminUser) return res.status(403).json({ success: false, error: 'Admin access required.' });
    const username = String(req.body?.username || '').trim().toLowerCase();
    const db = getSupabaseAdmin();
    const { data: profile } = await db.from('profiles').select('id').eq('username', username).eq('role', 'SUPERVISOR').maybeSingle();
    if (!profile) return res.status(404).json({ success: false, error: 'Supervisor not found.' });
    const { error } = await db.auth.admin.signOut(profile.id, 'global');
    if (error) return res.status(400).json({ success: false, error: error.message });
    const { error: profileError } = await db.from('profiles').update({ updated_at: new Date().toISOString() }).eq('id', profile.id);
    if (profileError) return res.status(500).json({ success: false, error: profileError.message });
    return res.json({ success: true, message: 'Supervisor logged out from all sessions.' });
  });

  // -------------------------------------------------------------
  // Vite Middleware Setup for Dev & Production Static Serving
  // -------------------------------------------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
