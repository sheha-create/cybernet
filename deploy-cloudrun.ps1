$ProjectID = "cybernet-510115"
$ServiceName = "cybernet"
$Region = "us-central1"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " Deploying CYBERNET to Google Cloud Run" -ForegroundColor Cyan
Write-Host " Project: $ProjectID ($ServiceName)"
Write-Host " Region:  $Region"
Write-Host "=========================================="

# Build frontend
npm run build

# Deploy directly from source to Cloud Run
gcloud run deploy $ServiceName `
  --source . `
  --project $ProjectID `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --set-env-vars NODE_ENV=production,PORT=8080,TRUST_PROXY=true

Write-Host ""
Write-Host " Deployment Complete! Your Cybernet service is live on Cloud Run." -ForegroundColor Green
