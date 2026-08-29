import path from "node:path";
import { defineConfig } from "vite";

const root = path.resolve(__dirname, "../..");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@nightmarket\/sanwei\/plugins\/ai\/navigation$/,
        replacement: path.join(root, "src/plugins/ai/NavigationPlugin.ts"),
      },
      {
        find: /^@nightmarket\/sanwei\/plugins\/environment$/,
        replacement: path.join(root, "src/plugins/environment.ts"),
      },
      {
        find: /^@nightmarket\/sanwei\/plugins\/(.*)$/,
        replacement: path.join(root, "src/plugins/$1/index.ts"),
      },
      {
        find: /^@nightmarket\/sanwei\/three-webgpu$/,
        replacement: path.join(root, "src/three-webgpu/index.ts"),
      },
      {
        find: /^@nightmarket\/sanwei\/three$/,
        replacement: path.join(root, "src/three/index.ts"),
      },
      {
        find: /^@nightmarket\/sanwei$/,
        replacement: path.join(root, "src/index.ts"),
      },
    ],
  },
  optimizeDeps: {
    exclude: ["@nightmarket/sanwei"],
  },
  server: {
    port: 5174,
  },
});
