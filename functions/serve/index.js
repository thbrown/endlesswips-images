const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const sharp = require('sharp');

const storage = new Storage();
const bucket = storage.bucket(process.env.BUCKET_NAME);

functions.http('serve', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }

  const imageName = req.path.slice(1);
  if (!imageName) {
    return res.status(400).send('Image name required');
  }

  const width = req.query.width ? parseInt(req.query.width, 10) : null;
  const height = req.query.height ? parseInt(req.query.height, 10) : null;
  const isStatic = req.query.static === 'true';

  try {
    const file = bucket.file(imageName);
    const [exists] = await file.exists();
    if (!exists) {
      return res.status(404).send('Not Found');
    }

    const [buffer] = await file.download();

    let pipeline = sharp(buffer, { animated: !isStatic });

    if (width && height) {
      pipeline = pipeline.resize(width, height, { fit: 'fill' });
    } else if (width) {
      pipeline = pipeline.resize(width, null);
    } else if (height) {
      pipeline = pipeline.resize(null, height);
    }

    const output = await pipeline.webp({ animated: !isStatic }).toBuffer();

    res.set('Content-Type', 'image/webp');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(output);
  } catch (err) {
    console.error('serve error:', err);
    return res.status(500).send('Internal Server Error');
  }
});
