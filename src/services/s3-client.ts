/**
 * S3 client service for listing objects and fetching metadata
 */

import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { fromEnv } from "@aws-sdk/credential-providers";
import type { S3Config } from "../config";

export interface ObjectMetadata {
  checksum?: string;
  size?: number;
  pep658?: string;
}

const MULTIPART_UPLOAD_REGEX = /^[A-Za-z0-9+/=]+=-[0-9]+$/;

/**
 * Create an S3 client with appropriate credentials
 */
export function createS3Client(config: S3Config): S3Client {
  const clientConfig: any = {
    region: config.region,
  };

  // Use explicit credentials if provided, otherwise use IAM role via fromEnv()
  if (config.accessKeyId && config.secretAccessKey) {
    clientConfig.credentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  } else {
    clientConfig.credentials = fromEnv();
  }

  return new S3Client(clientConfig);
}

/**
 * Check if a key matches accepted file extensions
 */
function hasAcceptedExtension(
  key: string,
  extensions: readonly string[]
): boolean {
  return extensions.some((ext) => key.endsWith(`.${ext}`));
}

/**
 * Check if a directory matches accepted subdirectory patterns
 */
function matchesSubdirPattern(
  dir: string,
  prefix: string,
  patterns: RegExp[]
): boolean {
  // Root level is always accepted
  if (dir === prefix) return true;

  // Check if it's a direct subdirectory of prefix
  const relativePath = dir.substring(prefix.length + 1);
  if (relativePath.includes("/")) return false;

  // Test against patterns
  return patterns.some((pattern) => pattern.test(relativePath));
}

/**
 * Sanitize S3 key by replacing + with %2B
 */
function sanitizeKey(key: string): string {
  return key.replace(/\+/g, "%2B");
}

/**
 * List objects from S3 with filtering
 */
export async function* listObjectsWithPrefix(
  client: S3Client,
  bucket: string,
  prefix: string,
  acceptedExtensions: readonly string[],
  acceptedSubdirPatterns: RegExp[]
): AsyncGenerator<string> {
  let continuationToken: string | undefined;
  const normalizedPrefix = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: normalizedPrefix,
      ContinuationToken: continuationToken,
    });

    const response = await client.send(command);

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (!obj.Key) continue;

        // Check file extension
        if (!hasAcceptedExtension(obj.Key, acceptedExtensions)) continue;

        // Get directory path
        const lastSlashIndex = obj.Key.lastIndexOf("/");
        const dir =
          lastSlashIndex >= 0 ? obj.Key.substring(0, lastSlashIndex) : "";

        // Check subdirectory pattern
        if (
          !matchesSubdirPattern(dir, normalizedPrefix, acceptedSubdirPatterns)
        ) {
          continue;
        }

        // Yield sanitized key
        yield sanitizeKey(obj.Key);
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);
}

/**
 * Parse SHA256 checksum from HeadObject response
 */
function parseChecksum(response: HeadObjectCommandOutput): string | undefined {
  // Try ChecksumSHA256 header
  if (response.ChecksumSHA256) {
    // Check for multipart upload pattern
    if (MULTIPART_UPLOAD_REGEX.test(response.ChecksumSHA256)) {
      console.warn(
        `Skipping multipart checksum for object (invalid): ${response.ChecksumSHA256}`
      );
      return undefined;
    }

    // Decode base64 to hex
    try {
      const buffer = Buffer.from(response.ChecksumSHA256, "base64");
      return buffer.toString("hex");
    } catch (error) {
      console.error("Failed to decode ChecksumSHA256:", error);
      return undefined;
    }
  }

  // Fallback to metadata fields
  if (response.Metadata) {
    return (
      response.Metadata["checksum-sha256"] ||
      response.Metadata["x-amz-meta-checksum-sha256"]
    );
  }

  return undefined;
}

/**
 * Fetch metadata for a single object
 */
async function fetchObjectMetadata(
  client: S3Client,
  bucket: string,
  key: string
): Promise<ObjectMetadata> {
  const metadata: ObjectMetadata = {};

  try {
    // Fetch object metadata
    const headCommand = new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
      ChecksumMode: "ENABLED",
    });

    const response = await client.send(headCommand);

    metadata.checksum = parseChecksum(response);
    metadata.size = response.ContentLength;

    // Try to fetch PEP 658 metadata file
    try {
      const metadataCommand = new HeadObjectCommand({
        Bucket: bucket,
        Key: `${key}.metadata`,
        ChecksumMode: "ENABLED",
      });

      const metadataResponse = await client.send(metadataCommand);
      if (metadataResponse.ChecksumSHA256) {
        const buffer = Buffer.from(metadataResponse.ChecksumSHA256, "base64");
        metadata.pep658 = buffer.toString("hex");
      }
    } catch (error: any) {
      // 404 is expected for files without PEP 658 metadata
      if (error.name !== "NotFound" && error.$metadata?.httpStatusCode !== 404) {
        console.error(`Error fetching PEP 658 metadata for ${key}:`, error);
      }
    }
  } catch (error) {
    console.error(`Error fetching metadata for ${key}:`, error);
  }

  return metadata;
}

/**
 * Fetch metadata for multiple objects in batches
 */
export async function fetchMetadataBatch(
  client: S3Client,
  bucket: string,
  keys: string[],
  batchSize: number = 50
): Promise<Map<string, ObjectMetadata>> {
  const result = new Map<string, ObjectMetadata>();

  // Process in batches
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);

    // Fetch metadata concurrently within batch
    const promises = batch.map((key) =>
      fetchObjectMetadata(client, bucket, key)
        .then((metadata) => ({ key, metadata }))
        .catch((error) => {
          console.error(`Failed to fetch metadata for ${key}:`, error);
          return { key, metadata: {} as ObjectMetadata };
        })
    );

    const batchResults = await Promise.all(promises);

    for (const { key, metadata } of batchResults) {
      result.set(key, metadata);
    }
  }

  return result;
}
