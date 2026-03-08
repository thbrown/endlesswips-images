# endlesswips-images

GCS image hosting + Cloud Functions + admin UI for endlesswips.com.

## Architecture

- **GCS bucket**: `endlesswips-images` — source of truth for all images
- **4 Cloud Functions** (Node.js 20, Gen 2): `serve`, `list`, `upload`, `delete`
- **Admin UI**: `web/` — static page hosted at `images.endlesswips.com`

### Function URLs

| Function | Auth | Description |
|----------|------|-------------|
| `serve`  | Public | Serve images with optional WebP resize |
| `list`   | Google ID token | List all images |
| `upload` | Google ID token | Upload + convert to WebP |
| `delete` | Google ID token | Delete an image |

---

## GCP Setup

### 1. Create OAuth 2.0 Client ID

1. Google Cloud Console → **APIs & Services** → **Credentials**
2. **Create credentials** → **OAuth 2.0 Client ID** → Web Application
3. Add authorized JavaScript origins:
   - `https://images.endlesswips.com`
   - `http://localhost:5500`
4. Copy the client ID — you'll need it for env vars and `web/app.js`

### 2. Service Account IAM

Grant the Cloud Functions service account `Storage Object Admin` on the
`endlesswips-images` bucket:

```bash
# Find your project's default CF service account
gcloud iam service-accounts list --project=YOUR_PROJECT_ID

# Grant Storage Object Admin
gcloud storage buckets add-iam-policy-binding gs://endlesswips-images \
  --member="serviceAccount:YOUR_SA@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

### 3. Deploy Cloud Functions

Replace `YOUR_PROJECT_ID`, `YOUR_REGION`, `YOUR_CLIENT_ID`, and `YOUR_EMAIL`:

```bash
# serve (public)
gcloud functions deploy serve \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region=us-central1 \
  --source=functions/serve \
  --entry-point=serve \
  --set-env-vars BUCKET_NAME=endlesswips-images

# list
gcloud functions deploy list \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region=us-central1 \
  --source=functions/list \
  --entry-point=listImages \
  --set-env-vars BUCKET_NAME=endlesswips-images,OAUTH_CLIENT_ID=YOUR_CLIENT_ID,ALLOWED_EMAIL=YOUR_EMAIL

# upload
gcloud functions deploy upload \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region=us-central1 \
  --source=functions/upload \
  --entry-point=upload \
  --set-env-vars BUCKET_NAME=endlesswips-images,OAUTH_CLIENT_ID=YOUR_CLIENT_ID,ALLOWED_EMAIL=YOUR_EMAIL

# delete
gcloud functions deploy delete \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --region=us-central1 \
  --source=functions/delete \
  --entry-point=deleteImage \
  --set-env-vars BUCKET_NAME=endlesswips-images,OAUTH_CLIENT_ID=YOUR_CLIENT_ID,ALLOWED_EMAIL=YOUR_EMAIL
```

**Note**: `--allow-unauthenticated` is correct — auth is handled inside the function
(Google ID token verification), not by GCP IAP.

### 4. Configure the Admin UI

Edit `web/app.js` and fill in the `CONFIG` block at the top:

```js
const CONFIG = {
  ADMIN_URL_LIST:   'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/list',
  ADMIN_URL_UPLOAD: 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/upload',
  ADMIN_URL_DELETE: 'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/delete',
  SERVE_URL:        'https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/serve',
  GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
};
```

### 5. Host the Admin UI

Upload `web/` to a GCS bucket for static hosting or use Firebase Hosting,
pointed at `images.endlesswips.com`.

**GCS static hosting example:**
```bash
gsutil mb gs://images.endlesswips.com
gsutil web set -m index.html gs://images.endlesswips.com
gsutil iam ch allUsers:objectViewer gs://images.endlesswips.com
gsutil -m cp web/* gs://images.endlesswips.com/
```

---

## Serve URL format

```
GET https://.../serve/{image-name}.webp
GET https://.../serve/{image-name}.webp?width=400
GET https://.../serve/{image-name}.webp?height=300
GET https://.../serve/{image-name}.webp?width=400&height=300
```

- `width` only → scales width, preserves aspect ratio
- `height` only → scales height, preserves aspect ratio
- Both → resizes to exact dimensions (`fit: fill`)
- Neither → serves original as WebP

---

## Environment Variables

| Variable | Functions | Description |
|----------|-----------|-------------|
| `BUCKET_NAME` | all | `endlesswips-images` |
| `OAUTH_CLIENT_ID` | list, upload, delete | Google OAuth 2.0 client ID |
| `ALLOWED_EMAIL` | list, upload, delete | Your Google account email |

---

## Verification

1. Deploy all 4 functions
2. Open `web/index.html` (locally via Live Server or hosted), sign in with Google
3. Drag an image onto the upload zone → confirm it appears in the grid as `.webp`
4. Click **Copy URL** → paste in browser → image loads
5. Append `?width=400` → confirm width is 400px, height scales proportionally
6. Append `?width=400&height=300` → confirm exact 400×300 fill
7. Click **Delete** → confirm it disappears and the serve URL returns 404
8. Try hitting `/upload` without an `Authorization` header → should get 401
9. From the main endlesswips site, fetch a serve URL in DevTools → no CORS error
