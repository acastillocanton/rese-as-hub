import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "_design_package/**"],
    coverage: {
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      // `server-only` es un marker de Next que solo debería resolverse en
      // un bundle server. En unit tests con Vitest no aporta, lo stubbeo.
      "server-only": path.resolve(__dirname, "./test/server-only-stub.ts"),
    },
  },
});
