import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    // 画面のテストだけファイル先頭の `// @vitest-environment jsdom` で切り替える
    environment: "node",
    exclude: [...configDefaults.exclude, ".next/**", ".claude/**", ".omc/**"],
  },
});
