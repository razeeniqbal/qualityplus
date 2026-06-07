# AWS Setup Guide — Quality Plus POC

## Folder Structure

```
aws/
  nginx.conf                  — nginx config for serving React app
  docker-compose.yml          — local Docker test
  ecs-task-definition.json    — ECS Fargate task config
  iam/
    execution-role.json       — allows ECS to pull image from ECR
    task-role.json            — allows container to call Bedrock & CloudWatch
  scripts/
    1-setup-ecr.ps1           — create ECR repository
    2-build-push.ps1          — build & push Docker image
    3-deploy-ecs.ps1          — create IAM roles, ECS cluster & task definition

Dockerfile                    — at project root, builds React app with nginx
.dockerignore                 — files excluded from Docker build
```

---

## Prerequisites

- AWS account (aws.amazon.com)
- AWS CLI installed: `winget install Amazon.AWSCLI`
- Docker Desktop installed: `winget install Docker.DockerDesktop`
- AWS CLI configured: `aws configure`

---

## Step by Step

### 1. Configure AWS CLI
```powershell
aws configure
# Enter: Access Key ID, Secret Access Key, Region (ap-southeast-1), output format (json)
```

### 2. Test Docker locally
```powershell
cd aws
docker compose up
# Open http://localhost:8080 to verify the app runs
```

### 3. Create ECR repository
```powershell
cd aws/scripts
.\1-setup-ecr.ps1
```

### 4. Update config placeholders
Before running the next scripts, replace these placeholders:
- `<YOUR_ACCOUNT_ID>` — your 12-digit AWS account ID
- `<YOUR_REGION>` — e.g. `ap-southeast-1`
- `<YOUR_SUPABASE_URL>` — from Supabase project settings
- `<YOUR_SUPABASE_ANON_KEY>` — from Supabase project settings

Files to update:
- `aws/scripts/2-build-push.ps1`
- `aws/scripts/3-deploy-ecs.ps1`
- `aws/ecs-task-definition.json`

### 5. Build & push Docker image to ECR
```powershell
.\2-build-push.ps1
```

### 6. Deploy to ECS
```powershell
.\3-deploy-ecs.ps1
```

### 7. Run the task
- Go to AWS Console → ECS → Clusters → quality-plus-cluster
- Click **Run new task**
- Select FARGATE, use the registered task definition
- Use default VPC and any subnet
- Enable public IP

---

## Estimated Cost (POC)

| Service | Cost |
|---|---|
| ECR (500 MB) | Free (12 months) |
| ECS Fargate (0.25 vCPU / 512 MB) | ~$0.01/hour |
| CloudWatch Logs | ~$0.50/GB |

> Stop the ECS task when not in use to avoid charges.
