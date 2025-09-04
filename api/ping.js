// 目的: クライアントから叩いて 200 を返すだけの疎通確認 API
export const config = { api: { bodyParser: false } };

export default function handler(req, res) {
  if (req.method === 'GET' && 'health' in (req.query || {})) {
    return res.status(200).json({ ok: true, route: '/api/ping' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  return res.status(200).json({ ok: true, ts: Date.now() });
}
