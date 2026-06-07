# ── CONFIG ────────────────────────────────────────────────────────────────────
$REGION     = "ap-southeast-1"
$REPO_NAME  = "quality-plus"
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "Creating ECR repository..."
aws ecr create-repository `
  --repository-name $REPO_NAME `
  --region $REGION

Write-Host "Done. Copy the repositoryUri from above — you will need it in the next script."
