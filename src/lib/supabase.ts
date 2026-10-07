import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

export const isConfigured = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost:54321', key || 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
  realtime: { params: { eventsPerSecond: 20 } },
});

/** Connexion anonyme : un pseudo suffit, pas d'inscription. */
export async function ensureSession(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error || !signIn.user) {
    throw new Error(
      "Connexion impossible. Vérifiez que les connexions anonymes sont activées dans Supabase (Authentication > Sign In / Providers).",
    );
  }
  return signIn.user.id;
}
