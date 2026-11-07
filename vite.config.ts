import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { dirname, resolve } from "path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
   
    dts({ include: ["src"] })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.ts"),
      name: "ReactDesignCursor",
      fileName: "react-design-cursor",
    },
    rollupOptions: {
      // Ensure external dependencies aren't bundled into your library
      external: ["react", "react/jsx-runtime", "react-dom"],
      output: {
        globals: {
          react: "React",
          "react-dom": "ReactDOM",
          "react/jsx-runtime": "jsxRuntime",
        },
      },
    },
  },
});