const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const { OAuth2Client } = require('google-auth-library');

const storage = new Storage();
const bucket = storage.bucket(process.env.BUCKET_NAME);

const ALLOWED_ORIGINS = [
  'https://images.endlesswips.com',
  'http://localhost:5500',
];

async function verifyToken(authHeader) {
  const token = authHeader?.replace('Bearer ', '');
  if (!token) throw new Error('Missing token');
  const client = new OAuth2Client(process.env.OAUTH_CLIENT_ID);
  const ticket = await client.verifyIdToken({ idToken: token, audience: process.env.OAUTH_CLIENT_ID });
  const payload = ticket.getPayload();
  const allowed = process.env.ALLOWED_EMAILS.split(',').map(e => e.trim());
  if (!allowed.includes(payload.email)) throw new Error('Forbidden');
  return payload;
}

functions.http('listImages', async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    await verifyToken(req.headers.authorization);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  try {
    const [files] = await bucket.getFiles();
    const result = files
      .map((f) => ({
        name: f.name,
        size: parseInt(f.metadata.size, 10),
        updated: f.metadata.updated,
      }))
      .sort((a, b) => new Date(b.updated) - new Date(a.updated));

    return res.status(200).json(result);
  } catch (err) {
    console.error('list error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});
