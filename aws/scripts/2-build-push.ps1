# ── CONFIG — fill these in ────────────────────────────────────────────────────
$ACCOUNT_ID = "<YOUR_ACCOUNT_ID>"
$REGION     = "ap-southeast-1"
$REPO_NAME  = "quality-plus"
# ─────────────────────────────────────────────────────────────────────────────

$ECR_URI = "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME"

Write-Host "Logging in to ECR..."
aws ecr get-login-password --region $REGION | `
  docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

Write-Host "Building Docker image..."
docker build -t $REPO_NAME ../..

Write-Host "Tagging image..."
docker tag "${REPO_NAME}:latest" "${ECR_URI}:latest"

Write-Host "Pushing image to ECR..."
docker push "${ECR_URI}:latest"

Write-Host "Done. Image pushed to: ${ECR_URI}:latest"
