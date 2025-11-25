# Cloudflare Worker S3 Index Generator

A Cloudflare Worker that generates PEP 503-compliant HTML indices for PyTorch packages stored in S3, mirroring them to R2 buckets for CDN delivery.

## Overview

This worker automatically:
- Lists objects from a source S3 bucket
- Filters and processes packages (with special handling for nightly builds)
- Fetches metadata including SHA256 checksums and PEP 658 metadata
- Generates PEP 503 HTML indices for pip/PyPI compatibility
- Uploads indices to R2 buckets for global CDN distribution

Runs hourly via Cloudflare Cron Triggers.

## Features

- **PEP 503 Compliance**: Generates HTML indices compatible with pip's simple repository API
- **PEP 658/714 Support**: Includes metadata file checksums for faster package resolution
- **Nightly Filtering**: Automatically keeps only the 60 most recent versions per package
- **Multi-bucket Support**: Uploads to multiple R2 buckets simultaneously
- **CPU Time Monitoring**: Warns and adapts when approaching Cloudflare's execution limits
- **Flexible Auth**: Supports both AWS access keys and IAM role assumption

## Quick Start

```bash
# Install dependencies
npm install

# Configure your buckets in wrangler.toml
# Set up AWS credentials (see docs/setup.md)

# Test locally
npm run dev

# Deploy
npm run deploy
```

## Documentation

- [Setup Guide](docs/setup.md) - Complete installation and configuration instructions
- [IAM Policy](docs/iam-policy.json) - Required AWS permissions
- [IAM Trust Policy](docs/iam-trust-policy.json) - For IAM role assumption

## Configuration

Key settings in `src/config.ts`:

- **Prefixes**: Directories to process (whl, libtorch, etc.)
- **Package Allow List**: 245+ allowed packages for nightly filtering
- **Keep Threshold**: Number of versions to retain per package (default: 60)
- **File Extensions**: Accepted file types (whl, zip, tar.gz, json)
- **Subdirectory Patterns**: Accepted GPU/platform subdirectories (cu*, rocm*, cpu, xpu)

## Architecture

```
S3 Source → List & Filter → Fetch Metadata → Generate HTML → Upload to R2
```

See [docs/setup.md](docs/setup.md) for detailed architecture diagram.

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

## Requirements

- Node.js 20+
- Cloudflare Workers account with R2 enabled
- AWS S3 bucket with read access
- AWS credentials or IAM role

## License

MIT

## Based On

Migrated from the Python-based [manage.py](original/manage.py) script used by PyTorch's download infrastructure.
