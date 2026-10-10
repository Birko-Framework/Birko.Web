# Birko.Web — repo rules

Each package has its own CLAUDE.md (`Birko.Web.Core/`, `.Components/`, `.Shell/`, `.Testing/`). This file holds the
rules for the repo as a whole.

## Versioning — tag every push of shipped code

Consumers (FlowerFurStudio CI, others) build against a **tag**, not `main`. Scheme and meaning: [README.md § Versions](README.md#versions).

- When you push `main` with a change to shipped code (anything under a package's `src/`, `css/`, `locales/`, or its
  `package.json` exports), also: decide the bump (pre-1.0: **breaking → MINOR, anything else → PATCH**), add a
  `## vX.Y.Z — date` entry at the top of [CHANGELOG.md](CHANGELOG.md) listing the tasks in the push (mark a breaking
  one **BREAKING** with its migration), set the four `package.json` `version` fields to match, commit, then
  `git tag -a vX.Y.Z -m "vX.Y.Z"` and `git push origin main vX.Y.Z`.
- One tag per push, covering every task in it. Docs- or tests-only pushes need no tag.
- Never move or delete a pushed tag — a consumer's CI may be pinned to it. A mistake gets a new PATCH.
