# JMCP Web Release Process

1. Start from a clean worktree on the reviewed integration branch.
2. Run `just check`.
3. Review `target/jankurai/` receipts, `.jankurai/repo-score.json`, and
   `.jankurai/repo-score.md`.
4. Merge through Jeryu only after score, caps, security, and rendered UX proof
   are green.
5. Mirror to GitHub after Jeryu `main` advances.
