# Deploy

To deploy the package, do the following steps:

1. Bump version in `package.json`
1. Verify `dependencies` and `peerDependencies` version ranges
1. Add a new header in `CHANGELOG.md` to separate the previously "Unreleased" changes from the "Unreleased" section (which should still stay there)
1. Make a PR + merge into `main` as usual

After a successful build on `main`, the package is automatically deploy to NPM. When this is done, do the following steps:

1. Tag the commit on GitHub:
    * Tag version = `vX.Y.Z`
    * Release title same as tag version
    * Description should be everything in the `CHANGELOG.md` for this version
