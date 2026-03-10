#!/usr/bin/env bash
set -euo pipefail

# Load config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env not found at $ENV_FILE"
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

# Validate required vars
for var in PROJECT_ID REGION BUCKET_NAME ALLOWED_EMAILS OAUTH_CLIENT_ID; do
  if [[ -z "${!var:-}" || "${!var}" == YOUR_* ]]; then
    echo "ERROR: $var is not set in .env"
    exit 1
  fi
done

echo "Deploying to project=$PROJECT_ID region=$REGION"
echo ""

# ---- images-serve (public) -------------------------------------------------------
echo ">>> Deploying: images-serve"
gcloud functions deploy images-serve \
  --gen2 \
  --runtime=nodejs22 \
  --trigger-http \
  --allow-unauthenticated \
  --memory=2048MB \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --source=functions/serve \
  --entry-point=serve \
  --set-env-vars "BUCKET_NAME=$BUCKET_NAME"

# ---- images-list -----------------------------------------------------------------
echo ""
echo ">>> Deploying: images-list"
gcloud functions deploy images-list \
  --gen2 \
  --runtime=nodejs22 \
  --trigger-http \
  --allow-unauthenticated \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --source=functions/list \
  --entry-point=listImages \
  --set-env-vars "BUCKET_NAME=$BUCKET_NAME,OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID,ALLOWED_EMAILS=$ALLOWED_EMAILS"

# ---- images-upload ---------------------------------------------------------------
echo ""
echo ">>> Deploying: images-upload"
gcloud functions deploy images-upload \
  --gen2 \
  --runtime=nodejs22 \
  --trigger-http \
  --allow-unauthenticated \
  --memory=1024MB \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --source=functions/upload \
  --entry-point=upload \
  --set-env-vars "BUCKET_NAME=$BUCKET_NAME,OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID,ALLOWED_EMAILS=$ALLOWED_EMAILS"

# ---- images-delete ---------------------------------------------------------------
echo ""
echo ">>> Deploying: images-delete"
gcloud functions deploy images-delete \
  --gen2 \
  --runtime=nodejs22 \
  --trigger-http \
  --allow-unauthenticated \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --source=functions/delete \
  --entry-point=deleteImage \
  --set-env-vars "BUCKET_NAME=$BUCKET_NAME,OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID,ALLOWED_EMAILS=$ALLOWED_EMAILS"

# ---- fetch URLs and update web/config.js ----------------------------------
echo ""
echo "=== Deployed! Fetching function URLs ==="

get_url() {
  gcloud functions describe "$1" \
    --gen2 --project="$PROJECT_ID" --region="$REGION" \
    --format="value(serviceConfig.uri)" 2>/dev/null
}

URL_SERVE=$(get_url images-serve)
URL_LIST=$(get_url images-list)
URL_UPLOAD=$(get_url images-upload)
URL_DELETE=$(get_url images-delete)

echo "  images-serve:  $URL_SERVE"
echo "  images-list:   $URL_LIST"
echo "  images-upload: $URL_UPLOAD"
echo "  images-delete: $URL_DELETE"

CONFIG_JS="$SCRIPT_DIR/docs/config.js"
cat > "$CONFIG_JS" <<EOF
window.CONFIG = {
  ADMIN_URL_LIST:   '$URL_LIST',
  ADMIN_URL_UPLOAD: '$URL_UPLOAD',
  ADMIN_URL_DELETE: '$URL_DELETE',
  SERVE_URL:        'https://img.endlesswips.com',
  GOOGLE_CLIENT_ID: '$OAUTH_CLIENT_ID',
};
EOF

echo ""
echo "docs/config.js updated."
