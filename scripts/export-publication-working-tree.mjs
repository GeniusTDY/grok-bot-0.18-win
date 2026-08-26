import { copyFile, lstat, mkdir, readlink, readdir, symlink } from "node:fs/promises";
import path from "node:path";

import { capture } from "./lib/process.mjs";
import { repoRoot } from "./lib/config.mjs";

const destinationArgument = process.argv[2];
if (!destinationArgument) {
  throw new Error("Usage: npm run publication:export -- <empty-destination-directory>");
}

const destination = path.resolve(process.cwd(), destinationArgument);
const relativeToRepository = path.relative(repoRoot, destination);
if (!relativeToRepository || (!relativeToRepository.startsWith("..") && !path.isAbsolute(relativeToRepository))) {
  throw new Error("The publication destination must be outside the source repository.");
}

await mkdir(destination, { recursive: true });
if ((await readdir(destination)).length !== 0) {
  throw new Error(`The publication destination is not empty: ${destination}`);
}

const git = process.platform === "win32" ? "git.exe" : "git";
const listed = await capture(
  git,
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: repoRoot },
);
const files = listed.split("\0").filter(Boolean);

for (const relativeFile of files) {
  const source = path.join(repoRoot, relativeFile);
  const target = path.join(destination, relativeFile);
  const metadata = await lstat(source);
  await mkdir(path.dirname(target), { recursive: true });
  if (metadata.isSymbolicLink()) {
    await symlink(await readlink(source), target);
  } else if (metadata.isFile()) {
    await copyFile(source, target);
  }
}

console.log(`Exported ${files.length} publication files to ${destination}`);
