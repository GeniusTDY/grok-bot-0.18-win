import { copyFile, lstat, mkdir, readdir, readlink, rename, rm, stat, symlink, utimes } from "node:fs/promises";
import path from "node:path";

/**
 * Windows lets a process hold a file open without granting FILE_SHARE_DELETE.
 * Such a handle blocks deletion and renaming, but still permits opening the
 * file for writing, so the bytes can be replaced in place. Editors, indexers,
 * and antivirus scanners routinely create these handles on build artifacts, so
 * the packaging pipeline must not depend on being able to unlink or rename the
 * files it regenerates.
 */
const lockErrorCodes = new Set(["EBUSY", "EPERM", "EACCES"]);

/**
 * Races where a rename cannot land on the destination but the destination is
 * still replaceable by writing through it (an occupied directory, or a target
 * that only refused because it still exists).
 */
const occupiedTargetCodes = new Set(["EBUSY", "EPERM", "EACCES", "EEXIST", "ENOTEMPTY", "EISDIR"]);

export function isLockError(error) {
  return error != null && lockErrorCodes.has(error.code);
}

export async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes as much of the tree as the operating system allows. Returns false
 * when entries had to be left behind because another process holds them open;
 * callers are expected to overwrite those entries in place afterwards.
 */
export async function removeTreeTolerant(target) {
  if (!await pathExists(target)) return true;
  try {
    await rm(target, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (!isLockError(error)) throw error;
  }

  let entries;
  try {
    entries = await readdir(target, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR" || isLockError(error)) return false;
    throw error;
  }

  let cleared = true;
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (!await removeTreeTolerant(child)) cleared = false;
      continue;
    }
    try {
      await rm(child, { force: true });
    } catch (error) {
      if (!isLockError(error)) throw error;
      cleared = false;
    }
  }
  try {
    await rm(target, { recursive: true, force: true });
  } catch (error) {
    if (!isLockError(error)) throw error;
    cleared = false;
  }
  return cleared;
}

async function applyTimestamps(source, target) {
  try {
    const sourceStat = await stat(source);
    await utimes(target, sourceStat.atime, sourceStat.mtime);
  } catch {
    // Timestamp fidelity is best effort; the bytes already match.
  }
}

/**
 * Overwrites `target` through a truncating write instead of an unlink, which is
 * what keeps this working against a file another process holds open.
 */
export async function copyFileTolerant(source, target, { preserveTimestamps = false } = {}) {
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  if (preserveTimestamps) await applyTimestamps(source, target);
}

async function copySymbolicLink(source, target) {
  await mkdir(path.dirname(target), { recursive: true });
  const link = await readlink(source);
  try {
    await symlink(link, target);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    await removeTreeTolerant(target);
    await symlink(link, target);
  }
}

export async function copyTreeTolerant(source, target, { preserveTimestamps = false } = {}) {
  const info = await lstat(source);
  if (info.isSymbolicLink()) {
    await copySymbolicLink(source, target);
    return;
  }
  if (!info.isDirectory()) {
    await copyFileTolerant(source, target, { preserveTimestamps });
    return;
  }
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    await copyTreeTolerant(path.join(source, entry.name), path.join(target, entry.name), { preserveTimestamps });
  }
  if (preserveTimestamps) await applyTimestamps(source, target);
}

/**
 * Places `source` at `target`, preferring an atomic rename and falling back to
 * an in-place overwrite plus removal of the source when the target is locked.
 */
export async function moveTolerant(source, target) {
  try {
    await rename(source, target);
    return "renamed";
  } catch (error) {
    if (!occupiedTargetCodes.has(error?.code)) throw error;
  }
  await copyTreeTolerant(source, target, { preserveTimestamps: true });
  await removeTreeTolerant(source);
  return "copied";
}
