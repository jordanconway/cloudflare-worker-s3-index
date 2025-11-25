/**
 * Generate libtorch HTML index (simple file listing)
 */

import type { S3Object } from "../services/index-generator";

/**
 * Generate HTML index for libtorch files
 */
export function generateLibtorchHtml(
  objects: S3Object[],
  subdir: string,
  prefix: string
): string {
  const lines: string[] = [];
  const isRoot = subdir === prefix;

  // Filter and prepare entries
  const entries: string[] = [];

  for (const obj of objects) {
    // Skip root objects if not at root
    const objDir = obj.key.substring(0, obj.key.lastIndexOf("/"));
    if (!isRoot && objDir === prefix) {
      continue;
    }

    // Strip prefix from key
    let sanitized = obj.key;
    if (sanitized.startsWith(subdir)) {
      sanitized = sanitized.substring(subdir.length);
    }
    if (sanitized.startsWith("/")) {
      sanitized = sanitized.substring(1);
    }

    entries.push(`<a href="/${obj.key}">${sanitized}</a><br/>`);
  }

  // Sort entries
  entries.sort();

  // Combine all lines
  lines.push(...entries);

  return lines.join("\n");
}
