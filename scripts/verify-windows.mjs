import {
  fidelityBuiltAsar,
  fidelityBuiltAsarUnpacked,
  outputWindowsDir,
  outputWindowsExe,
} from "./lib/config.mjs";
import { resolveRuntimeApp } from "./lib/runtime.mjs";
import { verifyReconstructedWindowsPackage } from "./lib/windows-package-verification.mjs";

const verification = await verifyReconstructedWindowsPackage({
  officialRuntime: await resolveRuntimeApp(),
  reconstructedRoot: outputWindowsDir,
  reconstructedExecutable: outputWindowsExe,
  sourceAsar: fidelityBuiltAsar,
  sourceUnpackedRoot: fidelityBuiltAsarUnpacked,
});

console.log(JSON.stringify(verification, null, 2));
