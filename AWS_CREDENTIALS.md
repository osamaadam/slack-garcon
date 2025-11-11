# AWS Credentials Setup for Lambda Deployment

This document explains what AWS credentials you need to deploy Garçon to AWS Lambda.

## Required Credentials

### 1. AWS Access Key ID and Secret Access Key

These are used to authenticate your deployment to AWS.

## How to Create AWS Credentials

### Step 1: Create an IAM User

1. Log into your AWS Console
2. Navigate to **IAM** (Identity and Access Management)
3. Click **Users** in the left sidebar
4. Click **Add Users**
5. Enter a username (e.g., `garcon-deployer`)
6. Select **Access key - Programmatic access**
7. Click **Next: Permissions**

### Step 2: Attach Policies

You need the following AWS managed policies:

- **AWSLambdaFullAccess** - To create and manage Lambda functions
- **IAMFullAccess** - To create Lambda execution roles
- **CloudFormationFullAccess** - Serverless Framework uses CloudFormation
- **AmazonAPIGatewayAdministrator** - For Lambda Function URLs
- **CloudWatchLogsFullAccess** - For function logs

You can either:

**Option A: Attach policies directly**

1. On the "Set permissions" page, select **Attach existing policies directly**
2. Search for and check each policy listed above
3. Click **Next: Tags** → **Next: Review** → **Create user**

**Option B: Create custom policy** (least privilege)

Create a custom policy with these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:*",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:GetRole",
        "iam:PassRole",
        "cloudformation:*",
        "apigateway:*",
        "logs:*",
        "s3:*"
      ],
      "Resource": "*"
    }
  ]
}
```

### Step 3: Save Your Credentials

After creating the user, you'll see:

- **Access key ID** (e.g., `AKIAIOSFODNN7EXAMPLE`)
- **Secret access key** (e.g., `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`)

⚠️ **IMPORTANT**: Save these immediately! The secret key is only shown once.

## Setting Up GitHub Actions

Add these as **GitHub Secrets** in your repository:

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** and add each of these:

### Required Secrets

| Secret Name             | Description             | Example                    |
| ----------------------- | ----------------------- | -------------------------- |
| `AWS_ACCESS_KEY_ID`     | Your AWS access key     | `AKIAIOSFODNN7EXAMPLE`     |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key     | `wJalrXUtnFEMI/K7MDENG...` |
| `AWS_REGION`            | AWS region to deploy to | `eu-central-1`             |
| `SLACK_BOT_TOKEN`       | Slack bot OAuth token   | `xoxb-...`                 |
| `SLACK_SIGNING_SECRET`  | Slack signing secret    | `abc123...`                |
| `GEMINI_API_KEY`        | Google Gemini API key   | `AIza...`                  |
| `GEMINI_MODEL`          | (Optional) Gemini model | `gemini-2.5-pro`           |

## Local Deployment (Alternative)

If you prefer to deploy from your local machine instead of GitHub Actions:

### Option 1: AWS CLI Configuration

```bash
aws configure
# Enter your Access Key ID
# Enter your Secret Access Key
# Enter your default region (e.g., eu-central-1)
# Enter default output format (json)
```

### Option 2: Environment Variables

```bash
export AWS_ACCESS_KEY_ID=your-access-key
export AWS_SECRET_ACCESS_KEY=your-secret-key
export AWS_REGION=eu-central-1
```

Then deploy:

```bash
export SLACK_BOT_TOKEN=xoxb-your-token
export SLACK_SIGNING_SECRET=your-secret
export GEMINI_API_KEY=your-key
export GEMINI_MODEL=gemini-2.5-pro

npx serverless deploy
```

## Security Best Practices

1. **Never commit credentials** to your repository
2. **Use GitHub Secrets** for CI/CD
3. **Rotate keys regularly** (every 90 days recommended)
4. **Use least privilege** - only grant permissions needed
5. **Enable MFA** on your AWS account
6. **Monitor CloudTrail** for unauthorized access

## Estimated AWS Costs

With AWS Lambda Free Tier:

- **1M requests/month** free
- **400,000 GB-seconds compute** free
- For a typical Slack bot: **$0-5/month** after free tier

Most small teams will stay within the free tier limits.

## Troubleshooting

### Error: "User is not authorized to perform: iam:CreateRole"

Your IAM user needs the `IAMFullAccess` policy or permission to create roles.

### Error: "Unable to resolve AWS credentials"

Make sure your credentials are set either via:

- AWS CLI configuration (`aws configure`)
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- GitHub Secrets (for Actions)

### Error: "The security token included in the request is invalid"

Your credentials may be incorrect or expired. Verify:

1. Access key ID is correct
2. Secret access key is correct
3. No extra spaces or quotes in the values

## Getting Help

If you encounter issues:

1. Check AWS CloudWatch Logs for Lambda errors
2. Verify your IAM permissions
3. Ensure all environment variables are set correctly
4. Check the GitHub Actions logs for deployment errors
