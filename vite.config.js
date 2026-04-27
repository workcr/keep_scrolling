import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const localAssetsDir = path.join(rootDir, "src", "assets");
const distAssetsDir = path.join(rootDir, "dist", "assets");

const contentTypes = {
  ".gif": "image/gif",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff"
};

function serveLocalAssets() {
  return {
    name: "serve-local-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url?.split("?")[0] || "";
        if (!rawUrl.startsWith("/assets/")) {
          next();
          return;
        }

        const relativePath = decodeURIComponent(rawUrl.replace(/^\/assets\//, ""));
        const filePath = path.resolve(localAssetsDir, relativePath);
        if (!filePath.startsWith(`${localAssetsDir}${path.sep}`) || !fs.existsSync(filePath)) {
          next();
          return;
        }

        const contentType = contentTypes[path.extname(filePath).toLowerCase()];
        if (contentType) res.setHeader("Content-Type", contentType);
        fs.createReadStream(filePath).pipe(res);
      });
    }
  };
}

function copyLocalAssetsForBuild() {
  return {
    name: "copy-local-assets-for-build",
    closeBundle() {
      if (!fs.existsSync(localAssetsDir)) return;
      fs.cpSync(localAssetsDir, distAssetsDir, { recursive: true });
    }
  };
}

export default defineConfig({
  plugins: [react(), serveLocalAssets(), copyLocalAssetsForBuild()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    css: true
  }
});
