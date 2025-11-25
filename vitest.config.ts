import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          r2Buckets: ["DEST_BUCKET", "DEST_BUCKET_META_CDN"],
          r2Persist: true,
        },
      },
    },
  },
});
