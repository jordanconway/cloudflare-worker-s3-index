import { describe, it, expect } from "vitest";
import { generateSimplePackageHtml } from "../simple-package-html";
import type { S3Object } from "../../services/index-generator";

describe("generateSimplePackageHtml", () => {
  const createObject = (
    key: string,
    checksum?: string,
    pep658?: string
  ): S3Object => ({
    key,
    origKey: key.replace(/%2B/g, "+"),
    checksum,
    size: 1000,
    pep658,
  });

  it("should generate valid HTML structure", () => {
    const objects = [createObject("whl/torch-2.0.0-py3-none-any.whl")];
    const html = generateSimplePackageHtml(objects, "torch", false);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html>");
    expect(html).toContain("<body>");
    expect(html).toContain("</body>");
    expect(html).toContain("</html>");
    expect(html).toContain("<h1>Links for torch</h1>");
  });

  it("should include checksum fragment for non-nightly packages", () => {
    const objects = [
      createObject("whl/torch-2.0.0-py3-none-any.whl", "abc123def456"),
    ];
    const html = generateSimplePackageHtml(objects, "torch", false);

    expect(html).toContain("#sha256=abc123def456");
  });

  it("should exclude checksum fragment for nightly packages", () => {
    const objects = [
      createObject(
        "whl/nightly/torch-2.0.0.dev20231120-py3-none-any.whl",
        "abc123def456"
      ),
    ];
    const html = generateSimplePackageHtml(objects, "torch", true);

    expect(html).not.toContain("#sha256=");
  });

  it("should include PEP 658/714 metadata attributes", () => {
    const objects = [
      createObject(
        "whl/torch-2.0.0-py3-none-any.whl",
        "abc123",
        "def456"
      ),
    ];
    const html = generateSimplePackageHtml(objects, "torch", false);

    expect(html).toContain('data-dist-info-metadata="sha256=def456"');
    expect(html).toContain('data-core-metadata="sha256=def456"');
  });

  it("should add Python 3.10+ requirement for networkx 3.3", () => {
    const objects = [createObject("whl/networkx-3.3-py3-none-any.whl")];
    const html = generateSimplePackageHtml(objects, "networkx", false);

    expect(html).toContain('data-requires-python="&gt;=3.10"');
  });

  it("should add Python 3.10+ requirement for networkx 3.4.2", () => {
    const objects = [createObject("whl/networkx-3.4.2-py3-none-any.whl")];
    const html = generateSimplePackageHtml(objects, "networkx", false);

    expect(html).toContain('data-requires-python="&gt;=3.10"');
  });

  it("should convert %2B to + in display names", () => {
    const objects = [
      createObject("whl/torch-2.0.0%2Bcu118-py3-none-any.whl"),
    ];
    const html = generateSimplePackageHtml(objects, "torch", false);

    expect(html).toContain(">torch-2.0.0+cu118-py3-none-any.whl</a>");
  });

  it("should normalize package names with underscores", () => {
    const objects = [
      createObject("whl/typing_extensions-4.0.0-py3-none-any.whl"),
    ];
    const html = generateSimplePackageHtml(objects, "typing_extensions", false);

    expect(html).toContain("<h1>Links for typing-extensions</h1>");
  });

  it("should include timestamp comment", () => {
    const objects = [createObject("whl/torch-2.0.0-py3-none-any.whl")];
    const html = generateSimplePackageHtml(objects, "torch", false);

    expect(html).toMatch(/<!--TIMESTAMP \d+-->/);
  });

  it("should sort objects by key", () => {
    const objects = [
      createObject("whl/torch-2.1.0-py3-none-any.whl"),
      createObject("whl/torch-2.0.0-py3-none-any.whl"),
      createObject("whl/torch-2.0.1-py3-none-any.whl"),
    ];
    const html = generateSimplePackageHtml(objects, "torch", false);

    const indexOf20 = html.indexOf("torch-2.0.0");
    const indexOf201 = html.indexOf("torch-2.0.1");
    const indexOf21 = html.indexOf("torch-2.1.0");

    expect(indexOf20).toBeLessThan(indexOf201);
    expect(indexOf201).toBeLessThan(indexOf21);
  });
});
