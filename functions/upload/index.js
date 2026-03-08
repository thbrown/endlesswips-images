const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const { OAuth2Client } = require('google-auth-library');
const sharp = require('sharp');
const Busboy = require('busboy');
const path = require('path');

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

functions.http('upload', async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    await verifyToken(req.headers.authorization);
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }

  return new Promise((resolve) => {
    const busboy = Busboy({ headers: req.headers });
    const uploads = [];
    const filePromises = [];

    busboy.on('file', (fieldname, fileStream, info) => {
      const { filename } = info;
      const chunks = [];

      fileStream.on('data', (chunk) => chunks.push(chunk));

      const filePromise = new Promise((resFile, rejFile) => {
        fileStream.on('end', async () => {
          try {
            const buffer = Buffer.concat(chunks);
            const webpBuffer = await sharp(buffer).webp({ quality: 85 }).toBuffer();

            const baseName = path.basename(filename, path.extname(filename));
            const destName = `${baseName}.webp`;
            const gcsFile = bucket.file(destName);

            await gcsFile.save(webpBuffer, { contentType: 'image/webp' });

            uploads.push({ name: destName, size: webpBuffer.length });
            resFile();
          } catch (err) {
            rejFile(err);
          }
        });

        fileStream.on('error', rejFile);
      });

      filePromises.push(filePromise);
    });

    busboy.on('finish', async () => {
      try {
        await Promise.all(filePromises);
        res.status(200).json({ uploaded: uploads });
        resolve();
      } catch (err) {
        console.error('upload error:', err);
        res.status(500).json({ error: 'Upload failed' });
        resolve();
      }
    });

    busboy.on('error', (err) => {
      console.error('busboy error:', err);
      res.status(500).json({ error: 'Parse error' });
      resolve();
    });

    req.pipe(busboy);
  });
});
