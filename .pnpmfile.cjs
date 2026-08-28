/**
 * Keep transitive packages on patched releases when upstream packages still
 * publish an exact vulnerable dependency range. The hooks are applied by
 * pnpm during install and are reflected in pnpm-lock.yaml.
 */
function readPackage(pkg) {
  if (pkg.name === "@aws-sdk/xml-builder") {
    pkg.dependencies = {
      ...pkg.dependencies,
      "fast-xml-parser": "5.11.1"
    };
  }

  if (pkg.name === "express") {
    pkg.dependencies = {
      ...pkg.dependencies,
      "path-to-regexp": "0.1.13"
    };
  }

  return pkg;
}

module.exports = {
  hooks: {
    readPackage
  }
};
