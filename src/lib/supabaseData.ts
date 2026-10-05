import { supabase, testSupabaseConnection } from './supabase';
export { testSupabaseConnection } from './supabase';

export const db = supabase;

export interface CompatDocSnapshot<T = any> {
  id: string;
  exists: () => boolean;
  data: () => T;
}

export interface CompatCollectionRef { table: string; }
export interface CompatDocRef { table: string; id: string; }

export const collection = (_db: unknown, table: string): CompatCollectionRef => ({ table });

export const doc = (ref: CompatCollectionRef | unknown, tableOrId?: string, maybeId?: string): CompatDocRef => {
  if (typeof ref === 'object' && ref && 'table' in ref) {
    return { table: (ref as CompatCollectionRef).table, id: tableOrId || crypto.randomUUID() };
  }
  return { table: tableOrId || '', id: maybeId || crypto.randomUUID() };
};

export const getDocs = async (ref: CompatCollectionRef) => {
  const { data, error } = await supabase.from(ref.table).select('id,data');
  if (error) throw error;
  return {
    empty: !data || data.length === 0,
    docs: (data || []).map((row: any) => ({ id: row.id, data: () => row.data, exists: () => true })),
    forEach: (fn: (snap: CompatDocSnapshot) => void) => (data || []).forEach((row: any) => fn({ id: row.id, data: () => row.data, exists: () => true })),
  };
};

export const setDoc = async (ref: CompatDocRef, value: any, options?: { merge?: boolean }) => {
  let payload = value;
  if (options?.merge) {
    const { data: existing, error: readError } = await supabase.from(ref.table).select('data').eq('id', ref.id).maybeSingle();
    if (readError) throw readError;
    payload = { ...(existing?.data || {}), ...value };
  }
  const { error } = await supabase.from(ref.table).upsert({ id: ref.id, data: payload, updated_at: new Date().toISOString() });
  if (error) throw error;
};

export const updateDoc = async (ref: CompatDocRef, value: any) => {
  const { data: existing, error: readError } = await supabase.from(ref.table).select('data').eq('id', ref.id).maybeSingle();
  if (readError) throw readError;
  if (!existing) throw new Error(`Document ${ref.table}/${ref.id} not found.`);
  const { error } = await supabase.from(ref.table).update({ data: { ...existing.data, ...value }, updated_at: new Date().toISOString() }).eq('id', ref.id);
  if (error) throw error;
};

export const deleteDoc = async (ref: CompatDocRef) => {
  const { error } = await supabase.from(ref.table).delete().eq('id', ref.id);
  if (error) throw error;
};

export const writeBatch = (_db: unknown) => {
  const operations: Array<() => Promise<void>> = [];
  return {
    set: (ref: CompatDocRef, data: any) => operations.push(() => setDoc(ref, data)),
    delete: (ref: CompatDocRef) => operations.push(() => deleteDoc(ref)),
    update: (ref: CompatDocRef, data: any) => operations.push(() => updateDoc(ref, data)),
    commit: async () => { for (const operation of operations) await operation(); },
  };
};

export const onSnapshot = (
  ref: CompatCollectionRef | CompatDocRef,
  next: (snapshot: any) => void,
  error?: (err: unknown) => void,
) => {
  const table = ref.table;
  const isDocument = 'id' in ref;

  const emit = async () => {
    try {
      if (isDocument) {
        const { data, error: queryError } = await supabase.from(table).select('id,data').eq('id', ref.id).maybeSingle();
        if (queryError) throw queryError;
        next({
          exists: () => !!data,
          data: () => data?.data,
          id: ref.id,
        });
      } else {
        const result = await getDocs(ref);
        next(result);
      }
    } catch (err) {
      error?.(err);
    }
  };

  void emit();
  const channel = supabase.channel(`realtime:${table}:${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, () => { void emit(); })
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR') error?.(new Error(`Realtime subscription failed for ${table}.`));
    });

  return () => { void supabase.removeChannel(channel); };
};

export const query = (...args: any[]) => args[0];
export const orderBy = (...args: any[]) => args;

export enum OperationType {
  CREATE = 'create', UPDATE = 'update', DELETE = 'delete', LIST = 'list', GET = 'get', WRITE = 'write',
}

export interface SupabaseErrorInfo { error: string; operationType: OperationType; path: string | null; authInfo: Record<string, unknown>; }

export function handleSupabaseError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: SupabaseErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {},
  };
  console.error('Supabase Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
