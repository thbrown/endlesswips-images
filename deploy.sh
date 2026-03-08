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
for var in PROJECT_ID REGION BUCKET_NAME ALLOWED_EMAIL OAUTH_CLIENT_ID; do
  if [[ -z "${!var:-}" || "${!var}" == YOUR_* ]]; then
    echo "ERROR: $var is not set in .env"
    exit 1
  fi
done

echo "Deploying to project=$PROJECT_ID region=$REGION"
echo ""

# ---- serve (public) -------------------------------------------------------
echo ">>> Deploying: serve"
gcloud functions deploy serve \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --source=functions/serve \
  --entry-point=serve \
  --set-env-vars "BUCKET_NAME=$BUCKET_NAME"

# ---- list -----------------------------------------------------------------
echo ""
echo ">>> Deploying: list"
gcloud functions deploy list \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --source=functions/list \
  --entry-point=listImages \
  --set-env-vars "BUCKET_NAME=$BUCKET_NAME,OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID,ALLOWED_EMAIL=$ALLOWED_EMAIL"

# ---- upload ---------------------------------------------------------------
echo ""
echo ">>> Deploying: upload"
gcloud functions deploy upload \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --source=functions/upload \
  --entry-point=upload \
  --set-env-vars "BUCKET_NAME=$BUCKET_NAME,OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID,ALLOWED_EMAIL=$ALLOWED_EMAIL"

# ---- delete ---------------------------------------------------------------
echo ""
echo ">>> Deploying: delete"
gcloud functions deploy delete \
  --gen2 \
  --runtime=nodejs20 \
  --trigger-http \
  --allow-unauthenticated \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --source=functions/delete \
  --entry-point=deleteImage \
  --set-env-vars "BUCKET_NAME=$BUCKET_NAME,OAUTH_CLIENT_ID=$OAUTH_CLIENT_ID,ALLOWED_EMAIL=$ALLOWED_EMAIL"

# ---- fetch URLs and update web/config.js ----------------------------------
echo ""
echo "=== Deployed! Fetching function URLs ==="

get_url() {
  gcloud functions describe "$1" \
    --gen2 --project="$PROJECT_ID" --region="$REGION" \
    --format="value(serviceConfig.uri)" 2>/dev/null
}

URL_SERVE=$(get_url serve)
URL_LIST=$(get_url list)
URL_UPLOAD=$(get_url upload)
URL_DELETE=$(get_url delete)

echo "  serve:  $URL_SERVE"
echo "  list:   $URL_LIST"
echo "  upload: $URL_UPLOAD"
echo "  delete: $URL_DELETE"

CONFIG_JS="$SCRIPT_DIR/docs/config.js"
cat > "$CONFIG_JS" <<EOF
window.CONFIG = {
  ADMIN_URL_LIST:   '$URL_LIST',
  ADMIN_URL_UPLOAD: '$URL_UPLOAD',
  ADMIN_URL_DELETE: '$URL_DELETE',
  SERVE_URL:        '$URL_SERVE',
  GOOGLE_CLIENT_ID: '$OAUTH_CLIENT_ID',
};
EOF

echo ""
echo "web/config.js updated."
