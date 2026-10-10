# Birko.Web

Source-only frontend libraries for Birko apps, consumed through esbuild aliases (no npm package):

| Package | Path |
|---|---|
| `birko-web-core` | [Birko.Web.Core](Birko.Web.Core/) — HTTP, SSE, i18n, router, state, storage, `BaseComponent` |
| `birko-web-components` | [Birko.Web.Components](Birko.Web.Components/) — the `b-*` web components, `tokens.css` |
| `birko-web-shell` | [Birko.Web.Shell](Birko.Web.Shell/) — app shell |
| `birko-web-testing` | [Birko.Web.Testing](Birko.Web.Testing/) — test helpers |

## Versions

The repo is versioned **as a whole** with git tags `vMAJOR.MINOR.PATCH` on `main` — one tag covers all four packages.
Consumers pin a version by checking out the tag (`git checkout v0.1.0`, or a CI checkout `ref: v0.1.0`); nothing is
packaged or published. What each version changed is in [CHANGELOG.md](CHANGELOG.md).

**What a number means.** A *breaking change* is one that can break a consumer's build or behaviour without the
consumer changing anything: a removed or changed export (function, class, type, method signature), a custom
element's attribute, event, slot or part renamed / removed / changed in meaning, a `--b-*` token in `tokens.css`
renamed or removed, or a `bwc.*` / `common.*` i18n key renamed.

| | Before 1.0 (now) | From 1.0 |
|---|---|---|
| Breaking change | **MINOR** (`0.1.x` → `0.2.0`) | MAJOR |
| New feature, additive | PATCH | MINOR |
| Fix | PATCH | PATCH |

So before 1.0 **a MINOR bump always means "read the migration in CHANGELOG.md"**, and moving between PATCH versions of
the same MINOR is safe. A breaking entry in the changelog is marked **BREAKING** and carries its migration.

**When a tag is made.** Every push to `main` that changes shipped code gets a tag — one tag per push, covering every
task in it (tasks are batched by push, not tagged one by one). A push that only touches docs or tests needs none. A
breaking change is never left on `main` untagged. `package.json` `version` fields follow the tag.

**Upgrading as a consumer:** read the CHANGELOG entries between your tag and the new one, then move the pin.
