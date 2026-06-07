# ── CONFIG — fill these in ────────────────────────────────────────────────────
$ACCOUNT_ID     = "<YOUR_ACCOUNT_ID>"
$REGION         = "ap-southeast-1"
$CLUSTER_NAME   = "quality-plus-cluster"
$SERVICE_NAME   = "quality-plus-service"
$TASK_FAMILY    = "quality-plus"
# ─────────────────────────────────────────────────────────────────────────────

Write-Host "Creating IAM execution role..."
aws iam create-role `
  --role-name quality-plus-execution-role `
  --assume-role-policy-document file://../iam/execution-role.json

aws iam attach-role-policy `
  --role-name quality-plus-execution-role `
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

Write-Host "Creating IAM task role..."
aws iam create-role `
  --role-name quality-plus-task-role `
  --assume-role-policy-document file://../iam/execution-role.json

aws iam put-role-policy `
  --role-name quality-plus-task-role `
  --policy-name quality-plus-task-policy `
  --policy-document file://../iam/task-role.json

Write-Host "Creating ECS cluster..."
aws ecs create-cluster `
  --cluster-name $CLUSTER_NAME `
  --region $REGION

Write-Host "Registering task definition..."
aws ecs register-task-definition `
  --cli-input-json file://../ecs-task-definition.json `
  --region $REGION

Write-Host "Done. Go to AWS Console -> ECS -> Clusters -> $CLUSTER_NAME -> Run new task to start the container."
