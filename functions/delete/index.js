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
  if (payload.email !== process.env.ALLOWED_EMAIL) throw new Error('Forbidden');
  return payload;
}

functions.http('deleteImage', async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'DELETE') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    await verifyToken(req.headers.authorization);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  const name = req.query.name;
  if (!name) {
    return res.status(400).json({ error: 'Query param "name" is required' });
  }

  try {
    const file = bucket.file(name);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).json({ error: 'File not found' });
    }

    await file.delete();
    return res.status(200).json({ deleted: name });
  } catch (err) {
    console.error('delete error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});
