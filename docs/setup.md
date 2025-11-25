# Cloudflare Worker S3 Index Generator - Setup Guide

This guide covers setting up the Cloudflare Worker to generate S3 HTML indices for PyTorch packages.

## Prerequisites

- Node.js 18+ and npm
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account with Workers and R2 enabled
- AWS S3 bucket with PyTorch packages
- AWS credentials or IAM role

## Installation

1. **Clone and install dependencies:**

```bash
git clone <repository-url>
cd cloudflare-worker-s3-index
npm install
```

2. **Configure R2 buckets:**

Edit `wrangler.toml` and update the R2 bucket names:

```toml
[[r2_buckets]]
binding = "DEST_BUCKET"
bucket_name = "your-bucket-name"

[[r2_buckets]]
binding = "DEST_BUCKET_META_CDN"
bucket_name = "your-mirror-bucket-name"
```

3. **Configure S3 source:**

Edit `wrangler.toml` to set your S3 bucket and region:

```toml
[vars]
SOURCE_S3_BUCKET = "your-s3-bucket"
SOURCE_S3_REGION = "us-east-1"
```

## AWS Credentials Configuration

You have two options for authenticating with AWS S3:

### Option 1: Access Keys (Recommended for Development)

Store AWS credentials as Wrangler secrets:

```bash
wrangler secret put S3_ACCESS_KEY_ID
# Enter your AWS access key ID when prompted

wrangler secret put S3_SECRET_ACCESS_KEY
# Enter your AWS secret access key when prompted
```

**Required IAM Permissions:**

Attach the following policy to your IAM user/role (replace `SOURCE_BUCKET_NAME` with your actual bucket name):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowListBucket",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::SOURCE_BUCKET_NAME"]
    },
    {
      "Sid": "AllowGetObject",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:GetObjectAttributes"],
      "Resource": ["arn:aws:s3:::SOURCE_BUCKET_NAME/*"]
    }
  ]
}
```

See `docs/iam-policy.json` for the complete policy template.

### Option 2: IAM Role with Cloudflare OIDC (Recommended for Production)

Use Cloudflare's AWS integration to assume an IAM role without storing credentials.

**Step 1: Create IAM Role**

1. In AWS IAM, create a new role with custom trust policy (see `docs/iam-trust-policy.json`)
2. Replace `ACCOUNT_ID` with your AWS account ID
3. Replace `YOUR_CLOUDFLARE_ACCOUNT_ID` with your Cloudflare account ID

**Step 2: Attach Policy**

Attach the same permissions policy from Option 1 to this role.

**Step 3: Configure Worker**

Set the role ARN as an environment variable in `wrangler.toml`:

```toml
[vars]
AWS_ROLE_ARN = "arn:aws:iam::ACCOUNT_ID:role/cloudflare-worker-s3-access"
```

**Note:** When using IAM roles, do NOT set `S3_ACCESS_KEY_ID` or `S3_SECRET_ACCESS_KEY` secrets.

## Testing Locally

Run the worker in development mode:

```bash
npm run dev
```

To trigger the scheduled event locally, use `wrangler`:

```bash
wrangler dev --test-scheduled
```

## Running Tests

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

The worker will automatically run every hour based on the cron trigger in `wrangler.toml`:

```toml
[triggers]
crons = ["0 * * * *"]
```

## Configuration

### Prefixes

The worker processes the following prefixes by default (configured in `src/config.ts`):

- `whl` - Wheel files
- `whl/nightly` - Nightly wheel builds (with filtering)
- `whl/test` - Test builds
- `libtorch` - LibTorch distributions
- `libtorch/nightly` - Nightly LibTorch builds
- `whl/test/variant` - Test variant builds
- `whl/variant` - Variant builds
- `whl/preview/forge` - Forge preview builds

### Package Allow List

The `whl/nightly` prefix applies filtering to keep only the 60 most recent versions of each allowed package. The allow list contains 245+ packages including PyTorch core packages, CUDA libraries, and dependencies.

To modify the package list, edit `PACKAGE_ALLOW_LIST_ARRAY` in `src/config.ts`.

### Keep Threshold

By default, the worker keeps the 60 most recent versions of each package in `whl/nightly`. To change this, modify `keepThreshold` in `src/config.ts`.

## Monitoring

View logs in the Cloudflare dashboard:

1. Go to Workers & Pages
2. Select your worker
3. Click on "Logs" tab
4. Enable real-time logs to see execution details

Key metrics logged:
- Objects processed per prefix
- Execution time per prefix
- CPU time warnings (at 20s and 40s)
- Upload confirmations
- Errors and warnings

## Troubleshooting

### CPU Time Limit Exceeded

If processing takes longer than 50 seconds (Cloudflare's CPU time limit), the worker will log warnings at 20s and 40s. After 40s, metadata fetching is skipped to ensure completion.

**Solutions:**
- Reduce the number of prefixes processed per run
- Increase `batchSize` in metadata fetching (trade-off: more memory usage)
- Consider splitting large prefixes across multiple workers

### Authentication Errors

**Error: "Either provide both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither"**

This means you've set only one of the two required secrets. Either:
- Set both secrets for access key authentication
- Remove both secrets to use IAM role authentication

### R2 Write Failures

Ensure your Cloudflare account has sufficient R2 storage and the bucket bindings in `wrangler.toml` match your actual R2 bucket names.

## Architecture

```
┌─────────────────┐
│  Cron Trigger   │ (Every hour)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   S3 Client     │ List objects with prefix
│                 │ Fetch metadata (checksums, PEP 658)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Index Gen      │ Filter nightly packages (top 60)
│                 │ Group by subdirectory
│                 │ Extract package names
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ HTML Generators │ PEP 503 simple package index
│                 │ PEP 503 simple packages index
│                 │ LibTorch file listings
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   R2 Upload     │ Write to both R2 buckets
│                 │ (main + META CDN mirror)
└─────────────────┘
```

## Support

For issues and questions, please open a GitHub issue.
