# Publishing checklist

The `codex/clean` branch removes generated recovery material from its tree, but
its parent commit still contains that material. Do not push the branch and
assume the deleted files are absent from Git history.

Create a new repository from an archive of the clean commit:

```sh
git archive --format=tar codex/clean | tar -xf - -C /path/to/empty-export
cd /path/to/empty-export
git init
git add .
git commit -m "Initial reconstructed source import"
```

For a reviewed working tree that is intentionally not committed on the old
history, export tracked and non-ignored untracked source files into a new empty
directory instead:

```sh
npm run publication:export -- /path/to/empty-export
```

The preserved installer uses Git LFS. Install LFS before the initial `git add`,
then push the objects after adding the remote:

```sh
git lfs install
git add .
git commit -m "Initial reconstructed source import"
git push -u origin main
git lfs push --all origin
```

If the hosting service offers downloadable source archives, enable its option
to include Git LFS objects in those archives; otherwise generated ZIP/tarball
downloads may contain only LFS pointer files.

Before adding a public remote:

1. Run `npm run publication:ready` against the working tree. This scans tracked
   and untracked source files for common credentials and personal machine paths,
   then runs typechecks, tests, and the editable frontend build.
2. Commit the reviewed tree, then run `npm run publication:check` on that clean
   commit. It performs
   the archive/init/add flow above and requires the new index to have the exact
   same Git tree.
3. From a fresh clone/export, run the Windows flow (`npm ci`,
   `npm run bootstrap:windows`, `npm run check`, `npm run package:windows`, and
   `npm run verify:windows`) on Windows x64.
4. Confirm `git status --ignored` shows no generated payload selected for Git.
5. Run `git lfs ls-files` and verify the preserved 0.18.0 Windows installer
   appears.
6. Scan the exported tree and full new history for credentials and absolute
   machine paths.
7. Review `NOTICE.md` and obtain an independent rights review. No upstream
   license is supplied by this repository.
8. Decide on a license only for material you have authority to license; do not
   imply that license covers the upstream application or trademarks.
