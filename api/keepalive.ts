// Tâche planifiée Vercel (vercel.json > crons), 3 fois par jour.
// Elle envoie quelques requêtes à la base Supabase pour que le projet gratuit
// ne soit jamais considéré comme inactif (et donc jamais mis en pause).

interface CronRequest {
  headers: Record<string, string | string[] | undefined>;
}

interface CronResponse {
  status(code: number): CronResponse;
  json(body: unknown): void;
}

export default async function handler(req: CronRequest, res: CronResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false, error: 'Non autorisé' });
    return;
  }

  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_KEY;
  if (!url || !key) {
    res.status(500).json({ ok: false, error: 'VITE_SUPABASE_URL ou VITE_SUPABASE_KEY manquante' });
    return;
  }

  const headers = { apikey: key, 'Content-Type': 'application/json' };
  try {
    const responses = await Promise.all([
      fetch(`${url}/rest/v1/rpc/keep_alive`, { method: 'POST', headers, body: '{}' }),
      fetch(`${url}/rest/v1/categories?select=id,name&limit=3`, { headers }),
      fetch(`${url}/rest/v1/rpc/server_now`, { method: 'POST', headers, body: '{}' }),
    ]);
    const ok = responses.every((r) => r.ok);
    const lastPing = ok ? await responses[0].json() : await responses[0].text();
    res.status(ok ? 200 : 502).json({ ok, status: responses.map((r) => r.status), lastPing });
  } catch (e) {
    res.status(502).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}
