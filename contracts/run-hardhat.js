#!/usr/bin/env node
const os = require("os");
const fs = require("fs");
const path = require("path");

try {
  const prefDir = path.join(os.homedir(), "Library", "Preferences");
  if (process.platform === "darwin") {
    if (!fs.existsSync(prefDir)) {
      process.env.HOME = os.tmpdir();
    } else {
      fs.accessSync(prefDir, fs.constants.W_OK);
    }
  }
} catch {
  process.env.HOME = os.tmpdir();
}

process.env.CI = process.env.CI || "1";

require("hardhat/internal/cli/cli");
