// Secret set with `wrangler secret put WARDROBE_TOKEN` (not in wrangler.jsonc, so `wrangler types` can't see it).
interface Env {
  WARDROBE_TOKEN?: string;
}
