#!/usr/bin/env node

"use strict";

/*
This script is adapted from an open source repository:
https://github.com/sanathkr/go-npm

This Signet team refactored the script to add the following features:
- support for GOARCH=arm64 golang binaries
- support for npm v9 which deprecated `npm bin`

Inspiration was also derived from this article:
https://blog.xendit.engineer/how-we-repurposed-npm-to-publish-and-distribute-our-go-binaries-for-internal-cli-23981b80911b
for the purpose of pulling binaries from the npm package rather than github.
*/

import { exec } from 'child_process';
import path from 'path';
import mkdirp from 'mkdirp';
import fs from 'fs';

// Mapping from Node's `process.arch` to Golang's `$GOARCH`
const ARCH_MAPPING = {
    "ia32": "386",
    "x64": "amd64_v1",
    "arm": "arm",
    "arm64": "arm64",
};

// Mapping between Node's `process.platform` to Golang's $GOOS
const PLATFORM_MAPPING = {
    "darwin": "darwin",
    "linux": "linux",
    "win32": "windows",
    "freebsd": "freebsd"
};

const CURRENT_RELEASE_NAME = "signet-cli"

async function getInstallationPath() {
  const npmBinDir = await execCmdAsPromise("npm prefix -g");

  let dir;
  if (!npmBinDir || npmBinDir.length === 0) {
    let env = process.env;
    if (env && env.npm_config_prefix) {
      dir = path.join(env.npm_config_prefix, "bin");
    }
  } else {
    dir = npmBinDir.trim() + "/bin";
  }

  await mkdirp(dir);
  return dir;
}

async function verifyAndPlaceBinary(binName, binPath) {
  if (!fs.existsSync(path.join(binPath, binName))) {
    throw(new Error('Downloaded binary does not contain the binary specified in configuration - ' + binName));
  }

  const installationPath = await getInstallationPath();

  fs.rename(path.join(binPath, binName), path.join(installationPath, binName), (err) => {
    if (!err) {
      console.log("Installed cli successfully");
    } else {
      throw(new Error(err));
    }
  });
}

function validateConfiguration(packageJson) {
  if (!packageJson.version) {
    return "'version' property must be specified";
  }

  if (!packageJson.goBinary || typeof(packageJson.goBinary) !== "object") {
    return "'goBinary' property must be defined and be an object";
  }

  if (!packageJson.goBinary.name) {
    return "'name' property is necessary";
  }

  if (!packageJson.goBinary.path) {
    return "'path' property is necessary";
  }
}

function parsePackageJson() {
  if (!(process.arch in ARCH_MAPPING)) {
    console.error("Installation is not supported for this architecture: " + process.arch);
    return;
  }

  if (!(process.platform in PLATFORM_MAPPING)) {
    console.error("Installation is not supported for this platform: " + process.platform);
    return;
  }

  const packageJsonPath = path.join(".", "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.error("Unable to find package.json. " + "Please run this script at root of the package you want to be installed");
    return;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath));
  const error = validateConfiguration(packageJson);
  if (error && error.length > 0) {
    console.error("Invalid package.json: " + error);
    return;
  }

  const binName = packageJson.goBinary.name;
  const binPath = packageJson.goBinary.path;
  const version = packageJson.version;
  if (version[0] === 'v') version = version.substr(1); // strip the 'v' if necessary v0.0.1 => 0.0.1

  // Binary name on Windows has .exe suffix
  if (process.platform === "win32") {
    binName += ".exe";
  }

  return {
    binName: binName,
    binPath: binPath,
    version: version
  };
}

let INVALID_INPUT = "Invalid inputs";
async function install() {
  const opts = parsePackageJson();
  if (!opts) {
    return INVALID_INPUT;
  };
  mkdirp.sync(opts.binPath);

  console.log(`Copying the binary for ${process.platform}`);
  const src = `./dist/${CURRENT_RELEASE_NAME}_${process.platform}_${ARCH_MAPPING[process.arch]}/${CURRENT_RELEASE_NAME}`;

  await execCmdAsPromise(`cp ${src} ${opts.binPath}/${opts.binName}`);
  await verifyAndPlaceBinary(opts.binName, opts.binPath);
}

async function uninstall(callback) {
  const opts = parsePackageJson();
  const installationPath = await getInstallationPath();

  fs.unlink(path.join(installationPath, opts.binName), (err) => {
    if (err) {
      throw(new Error('Unable to remove binary from npm global executables directory'));
    }
  });

  console.log("Uninstalled cli successfully");
}

function execCmdAsPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.log(stderr);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

// Parse command line arguments and call the right method
const actions = {
  "install": install,
  "uninstall": uninstall
};

const argv = process.argv;
if (argv && argv.length > 2) {
  const cmd = process.argv[2];

  if (!actions[cmd]) {
    console.log("Invalid command. `install` and `uninstall` are the only supported commands");
    process.exit(1);
  }

  try {
    await actions[cmd]();
  } catch (e) {
    console.log(e);
    process.exit(1);
  }
}