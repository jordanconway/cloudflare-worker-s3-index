/**
 * Main Cloudflare Worker entry point
 * Scheduled hourly to generate S3 index HTMLs
 */

import { loadConfig, type Env } from "./config";
import {
  createS3Client,
  listObjectsWithPrefix,
  fetchMetadataBatch,
} from "./services/s3-client";
import { S3Index, type S3Object } from "./services/index-generator";
import { generateSimplePackageHtml } from "./generators/simple-package-html";
import { generateSimplePackagesHtml } from "./generators/simple-packages-html";
import { generateLibtorchHtml } from "./generators/libtorch-html";

/**
 * Discover packages from R2 that have standalone index.html files
 */
async function discoverR2Packages(
  bucket: R2Bucket,
  subdirs: Set<string>
): Promise<Map<string, Set<string>>> {
  const packagesBySubdir = new Map<string, Set<string>>();

  for (const subdir of subdirs) {
    const packages = new Set<string>();
    const prefix = `${subdir}/`;

    // List objects in R2 to find packagename/index.html patterns
    const listed = await bucket.list({ prefix });

    for (const obj of listed.objects) {
      const relativePath = obj.key.substring(prefix.length);
      const parts = relativePath.split("/");

      // Check for packagename/index.html pattern
      if (parts.length === 2 && parts[1] === "index.html") {
        const packageName = parts[0].replace(/-/g, "_");
        packages.add(packageName);
      }
    }

    if (packages.size > 0) {
      packagesBySubdir.set(subdir, packages);
      console.log(
        `INFO: Found ${packages.size} standalone packages in R2 for ${subdir}`
      );
    }
  }

  return packagesBySubdir;
}

/**
 * Upload HTML content to R2 buckets
 */
async function uploadToR2(
  buckets: R2Bucket[],
  key: string,
  html: string
): Promise<void> {
  const httpMetadata = {
    contentType: "text/html",
    cacheControl: "no-cache,no-store,must-revalidate",
  };

  await Promise.all(
    buckets.map((bucket) => bucket.put(key, html, { httpMetadata }))
  );
}

/**
 * Process a single prefix
 */
async function processPrefix(
  config: ReturnType<typeof loadConfig>,
  s3Client: any,
  prefix: string,
  startTime: number
): Promise<{
  objectCount: number;
  duration: number;
  error?: string;
}> {
  const prefixStartTime = performance.now();

  try {
    console.log(`INFO: Processing prefix '${prefix}'`);

    // List objects from S3
    const objectKeys: string[] = [];
    for await (const key of listObjectsWithPrefix(
      s3Client,
      config.sourceS3.bucket,
      prefix,
      config.acceptedFileExtensions,
      config.acceptedSubdirPatterns
    )) {
      objectKeys.push(key);
    }

    console.log(
      `INFO: Found ${objectKeys.length} objects for '${prefix}' in ${((performance.now() - prefixStartTime) / 1000).toFixed(2)}s`
    );

    // Check CPU time
    const elapsed = (performance.now() - startTime) / 1000;
    if (elapsed > 20) {
      console.warn(`WARNING: CPU time ${elapsed.toFixed(1)}s for prefix ${prefix}`);
    }

    // Create S3Object array
    let objects: S3Object[] = objectKeys.map((key) => ({
      key,
      origKey: key.replace(/%2B/g, "+"),
      checksum: undefined,
      size: undefined,
      pep658: undefined,
    }));

    // Apply nightly filtering if needed
    if (prefix === "whl/nightly") {
      const index = new S3Index(objects, prefix);
      objects = index.nightlyPackagesToShow(
        config.packageAllowList,
        config.keepThreshold
      );
      console.log(
        `INFO: After nightly filtering: ${objects.length} objects for '${prefix}'`
      );
    }

    // Fetch metadata for PEP503 prefixes
    const isPep503 = prefix.startsWith("whl");
    if (isPep503 && objects.length > 0) {
      // Check CPU time before metadata fetch
      const beforeMetadata = (performance.now() - startTime) / 1000;
      if (beforeMetadata > 40) {
        console.warn(
          `WARNING: CPU time ${beforeMetadata.toFixed(1)}s before metadata fetch - skipping checksums`
        );
      } else {
        const metadataMap = await fetchMetadataBatch(
          s3Client,
          config.sourceS3.bucket,
          objects.map((o) => o.origKey),
          50
        );

        // Merge metadata
        for (const obj of objects) {
          const metadata = metadataMap.get(obj.origKey);
          if (metadata) {
            obj.checksum = metadata.checksum;
            obj.size = metadata.size;
            obj.pep658 = metadata.pep658;
          }
        }

        console.log(
          `INFO: Fetched metadata in ${((performance.now() - prefixStartTime) / 1000).toFixed(2)}s`
        );
      }
    }

    // Create index
    const index = new S3Index(objects, prefix);
    const subdirs = index.getSubdirs();

    // Discover R2 packages once for this prefix
    const r2Packages = await discoverR2Packages(config.destR2Buckets[0], subdirs);

    // Generate and upload HTML for each subdir
    for (const subdir of subdirs) {
      if (isPep503) {
        // Generate package listing
        const packageNames = new Set(index.getPackageNames(subdir));

        // Merge with R2 standalone packages
        const r2PackagesInSubdir = r2Packages.get(subdir);
        if (r2PackagesInSubdir) {
          for (const pkg of r2PackagesInSubdir) {
            if (!Array.from(packageNames).some((p) => p.toLowerCase() === pkg.toLowerCase())) {
              packageNames.add(pkg);
              console.log(
                `INFO: Including standalone package '${pkg}' in ${subdir}`
              );
            }
          }
        }

        const packagesHtml = generateSimplePackagesHtml(packageNames);
        await uploadToR2(
          config.destR2Buckets,
          `${subdir}/index.html`,
          packagesHtml
        );
        console.log(`INFO: Uploaded ${subdir}/index.html`);

        // Generate per-package HTML
        for (const pkgName of packageNames) {
          const packageObjects = Array.from(
            index.genFileList(subdir, pkgName)
          );
          if (packageObjects.length === 0) continue;

          const isNightly = prefix === "whl/nightly";
          const packageHtml = generateSimplePackageHtml(
            packageObjects,
            pkgName,
            isNightly
          );

          const compatPkgName = pkgName.toLowerCase().replace(/_/g, "-");
          await uploadToR2(
            config.destR2Buckets,
            `${subdir}/${compatPkgName}/index.html`,
            packageHtml
          );
          console.log(`INFO: Uploaded ${subdir}/${compatPkgName}/index.html`);
        }
      } else {
        // Generate libtorch HTML
        const libtorchObjects = Array.from(
          index.genFileList(subdir, "libtorch")
        );
        if (libtorchObjects.length > 0) {
          const libtorchHtml = generateLibtorchHtml(
            libtorchObjects,
            subdir,
            prefix
          );
          await uploadToR2(
            config.destR2Buckets,
            `${subdir}/index.html`,
            libtorchHtml
          );
          console.log(`INFO: Uploaded ${subdir}/index.html (libtorch)`);
        }
      }
    }

    const duration = (performance.now() - prefixStartTime) / 1000;
    console.log(
      `INFO: Completed '${prefix}' in ${duration.toFixed(2)}s`
    );

    return {
      objectCount: objects.length,
      duration,
    };
  } catch (error) {
    const duration = (performance.now() - prefixStartTime) / 1000;
    console.error(`ERROR: Failed to process '${prefix}':`, error);
    return {
      objectCount: 0,
      duration,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Main scheduled handler
 */
export default {
  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const startTime = performance.now();
    console.log(`INFO: Starting scheduled index generation at ${new Date().toISOString()}`);

    try {
      // Load configuration
      const config = loadConfig(env);
      console.log(`INFO: Loaded config with ${config.prefixes.length} prefixes`);

      // Create S3 client
      const s3Client = createS3Client(config.sourceS3);

      // Process each prefix
      const results: Record<string, any> = {};

      for (const prefix of config.prefixes) {
        const result = await processPrefix(config, s3Client, prefix, startTime);
        results[prefix] = result;

        // Check overall CPU time
        const totalElapsed = (performance.now() - startTime) / 1000;
        if (totalElapsed > 40) {
          console.warn(
            `WARNING: Total CPU time ${totalElapsed.toFixed(1)}s after processing ${prefix}`
          );
        }
      }

      // Log final metrics
      const totalDuration = (performance.now() - startTime) / 1000;
      const totalObjects = Object.values(results).reduce(
        (sum: number, r: any) => sum + r.objectCount,
        0
      );
      const errors = Object.entries(results).filter(([_, r]: [string, any]) => r.error);

      console.log(`INFO: Completed all prefixes in ${totalDuration.toFixed(2)}s`);
      console.log(`INFO: Total objects processed: ${totalObjects}`);
      if (errors.length > 0) {
        console.error(`ERROR: ${errors.length} prefixes failed:`, errors);
      }
    } catch (error) {
      console.error("ERROR: Fatal error in scheduled handler:", error);
      throw error;
    }
  },
};
