/**
 * S3 Index generator - handles package filtering and organization
 */

import * as semver from "semver";

export interface S3Object {
  key: string;
  origKey: string;
  checksum?: string;
  size?: number;
  pep658?: string;
}

/**
 * S3Index class for managing and filtering objects
 */
export class S3Index {
  public objects: S3Object[];
  public readonly prefix: string;

  constructor(objects: S3Object[], prefix: string) {
    this.objects = objects;
    this.prefix = prefix.replace(/\/$/, ""); // Remove trailing slash
  }

  /**
   * Get unique subdirectories from objects
   */
  getSubdirs(): Set<string> {
    const subdirs = new Set<string>();
    for (const obj of this.objects) {
      const dir = this.dirname(obj.key);
      if (dir && dir !== this.prefix) {
        subdirs.add(dir);
      }
    }
    return subdirs;
  }

  /**
   * Check if object is at root level
   */
  isObjAtRoot(obj: S3Object): boolean {
    return this.dirname(obj.key) === this.prefix;
  }

  /**
   * Get directory name from path
   */
  private dirname(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    return lastSlash >= 0 ? path.substring(0, lastSlash) : "";
  }

  /**
   * Get base name from path
   */
  private basename(path: string): string {
    const lastSlash = path.lastIndexOf("/");
    return lastSlash >= 0 ? path.substring(lastSlash + 1) : path;
  }

  /**
   * Extract package name from object
   */
  objToPackageName(obj: S3Object): string {
    const basename = this.basename(obj.key);
    const firstDash = basename.indexOf("-");
    return firstDash >= 0
      ? basename.substring(0, firstDash).toLowerCase()
      : basename.toLowerCase();
  }

  /**
   * Normalize package version for comparison
   * Removes GPU specifier and other metadata
   */
  normalizePackageVersion(obj: S3Object): string {
    const basename = this.basename(obj.key);
    const parts = basename.split("-");
    if (parts.length < 2) return basename;

    // Take first two parts (name and version)
    const normalized = `${parts[0]}-${parts[1]}`;
    // Remove GPU specifier (e.g., %2Bcu118)
    return normalized.replace(/%2B.*/, "");
  }

  /**
   * Filter nightly packages to keep only recent versions
   * Keeps top N versions per package based on threshold
   */
  nightlyPackagesToShow(
    packageAllowList: Set<string>,
    keepThreshold: number
  ): S3Object[] {
    // Get unique normalized versions
    const normalizedVersions = new Set<string>();
    for (const obj of this.objects) {
      normalizedVersions.add(this.normalizePackageVersion(obj));
    }

    // Sort by version (most recent first)
    const sortedPackages = Array.from(normalizedVersions).sort((a, b) => {
      const versionA = a.split("-")[1] || "0.0.0";
      const versionB = b.split("-")[1] || "0.0.0";

      // Use semver for comparison
      try {
        return semver.rcompare(versionA, versionB);
      } catch {
        // Fallback to string comparison if semver fails
        return versionB.localeCompare(versionA);
      }
    });

    // Track package counts and determine which to hide
    const packageCounts = new Map<string, number>();
    const toHide = new Set<string>();

    for (const normalized of sortedPackages) {
      const basename = this.basename(normalized);
      const packageName = basename.split("-")[0];

      // Reject if not in allow list
      if (!packageAllowList.has(packageName.toLowerCase())) {
        toHide.add(normalized);
        continue;
      }

      // Check threshold
      const count = packageCounts.get(packageName) || 0;
      if (count >= keepThreshold) {
        toHide.add(normalized);
      } else {
        packageCounts.set(packageName, count + 1);
      }
    }

    // Filter objects based on what to hide
    return this.objects.filter((obj) => {
      const normalized = this.normalizePackageVersion(obj);
      return !toHide.has(normalized);
    });
  }

  /**
   * Generate file list filtered by subdir and/or package name
   */
  *genFileList(subdir?: string, packageName?: string): Generator<S3Object> {
    const resolvedSubdir = subdir ? subdir.replace(/\/$/, "") : this.prefix;

    for (const obj of this.objects) {
      // Filter by package name if specified
      if (packageName && this.objToPackageName(obj) !== packageName) {
        continue;
      }

      // Check if object is in the target subdir
      const isRoot = this.isObjAtRoot(obj);
      const inSubdir = obj.key.startsWith(resolvedSubdir + "/");

      if (isRoot || inSubdir) {
        yield obj;
      }
    }
  }

  /**
   * Get unique package names in a subdirectory
   */
  getPackageNames(subdir?: string): string[] {
    const names = new Set<string>();
    for (const obj of this.genFileList(subdir)) {
      names.add(this.objToPackageName(obj));
    }
    return Array.from(names).sort();
  }
}
