#!/bin/bash
set -e

PROJECT_ID="cybernet-510115"
SERVICE_NAME="cybernet"
REGION="us-central1"

echo "=========================================="
echo " Deploying CYBERNET to Google Cloud Run"
echo " Project: $PROJECT_ID ($SERVICE_NAME)"
echo " Region:  $REGION"
echo "=========================================="

# Build frontend
npm run build

# Deploy directly from source to Cloud Run
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production,PORT=8080,TRUST_PROXY=true

echo ""
echo " Deployment Complete! Your Cybernet service is live on Cloud Run."
