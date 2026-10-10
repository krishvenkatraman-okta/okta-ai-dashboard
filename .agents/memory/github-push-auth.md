---
name: GitHub push verification
description: Verify GitHub shell access before pushing from this Repl.
---

Treat the GitHub connection card's “active” text as insufficient proof that the shell can access a repository. Verify the intended remote read-only before changing remotes or pushing, and never repurpose the internal backup remote.

**Why:** In this workspace, the connection text said active while the integration list still showed `not_added`, and both `gh auth status` and `git ls-remote` failed.

**How to apply:** For future GitHub push requests here, confirm project-level access and a successful read-only lookup of the intended repository before pushing. If either fails, stop and ask the user to restore GitHub access.
