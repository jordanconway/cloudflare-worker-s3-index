/**
 * Generate PEP 503 simple packages HTML index (package listing)
 */

/**
 * Generate HTML index listing all packages
 */
export function generateSimplePackagesHtml(packageNames: Set<string>): string {
  const lines: string[] = [];

  // HTML header
  lines.push("<!DOCTYPE html>");
  lines.push("<html>");
  lines.push("  <body>");

  // Sort package names
  const sortedNames = Array.from(packageNames).sort();

  // Generate links
  for (const pkgName of sortedNames) {
    const displayName = pkgName.replace(/_/g, "-");
    lines.push(`    <a href="${displayName}/">${displayName}</a><br/>`);
  }

  // HTML footer with timestamp
  lines.push("  </body>");
  lines.push("</html>");
  lines.push(`<!--TIMESTAMP ${Math.floor(Date.now() / 1000)}-->`);

  return lines.join("\n");
}
