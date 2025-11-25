/**
 * Generate PEP 503 simple package HTML index
 */

import type { S3Object } from "../services/index-generator";

/**
 * Generate HTML index for a single package
 */
export function generateSimplePackageHtml(
  objects: S3Object[],
  packageName: string,
  isNightly: boolean
): string {
  const lines: string[] = [];

  // HTML header
  lines.push("<!DOCTYPE html>");
  lines.push("<html>");
  lines.push("  <body>");
  lines.push(
    `    <h1>Links for ${packageName.toLowerCase().replace(/_/g, "-")}</h1>`
  );

  // Sort objects by key
  const sortedObjects = [...objects].sort((a, b) => a.key.localeCompare(b.key));

  for (const obj of sortedObjects) {
    // Extract filename for display
    const lastSlash = obj.key.lastIndexOf("/");
    const filename =
      lastSlash >= 0 ? obj.key.substring(lastSlash + 1) : obj.key;
    const displayName = filename.replace(/%2B/g, "+");

    // Build URL fragment for checksum
    // Skip checksum for nightly packages (see https://github.com/pytorch/test-infra/pull/6307)
    const maybeFragment =
      obj.checksum && !isNightly ? `#sha256=${obj.checksum}` : "";

    // Build attributes
    let attributes = "";

    // PEP 658/714 metadata attributes
    if (obj.pep658) {
      const pep658Sha = `sha256=${obj.pep658}`;
      attributes += ` data-dist-info-metadata="${pep658Sha}" data-core-metadata="${pep658Sha}"`;
    }

    // Ugly hack: mark networkx 3.3 and 3.4.2 as Python 3.10+ only
    // See: https://github.com/pytorch/pytorch/issues/152191
    if (
      obj.key.endsWith("networkx-3.3-py3-none-any.whl") ||
      obj.key.endsWith("networkx-3.4.2-py3-none-any.whl")
    ) {
      attributes += ' data-requires-python="&gt;=3.10"';
    }

    // Generate link
    lines.push(
      `    <a href="/${obj.key}${maybeFragment}"${attributes}>${displayName}</a><br/>`
    );
  }

  // HTML footer with timestamp
  lines.push("  </body>");
  lines.push("</html>");
  lines.push(`<!--TIMESTAMP ${Math.floor(Date.now() / 1000)}-->`);

  return lines.join("\n");
}
