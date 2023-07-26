#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getInstallationPath() {
  const npmBinDir = String(execSync("npm prefix -g"));

  let dir;
  if (!npmBinDir || npmBinDir.length === 0) {
    let env = process.env;
    if (env && env.npm_config_prefix) {
      dir = path.join(env.npm_config_prefix, "bin");
    }
  } else {
    dir = npmBinDir.trim() + "/bin";
  }

  return dir;
}

const installationPath = getInstallationPath();

fs.unlink(path.join(installationPath, 'signet'), (err) => {
  if (err) {
    console.log("Info: Failed to remove 'signet' binary from npm global bin dir");
  }
});

fs.unlink(path.join(installationPath, "uninstall-signet-cli"), (err) => {
  if (err) {
    console.log("Info: Failed to remove 'uninstall-signet-cli' script from npm global bin dir");
  }
});

execSync("npm uninstall -g signet-cli");

console.log("Successfully uninstalled signet binary and signet-cli npm package");