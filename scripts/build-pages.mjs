#!/usr/bin/env node
/**
 * Builds the demo as static files and writes them to `docs/`, which is the
 * folder GitHub Pages serves (source: main, /docs). Commit the result.
 *
 *   npm run build:pages && git add docs && git commit -m "chore: rebuild pages"
 *
 * Angular 22's application builder writes to dist/<project>/browser, and the
 * site lives under a subpath, so the build needs an explicit --base-href.
 * Passing it here rather than in angular.json keeps `ng serve` at the root.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const PROJECT = "agent-approval-machine-demo-angular";
const BASE_HREF = `/${PROJECT}/`;
const BROWSER = `dist/${PROJECT}/browser`;
const DOCS = "docs";

execSync(`npx ng build --base-href ${BASE_HREF}`, { stdio: "inherit" });

if (!existsSync(`${BROWSER}/index.html`)) {
  console.error(`\nNo ${BROWSER}/index.html — did the output path change in angular.json?`);
  process.exit(1);
}

rmSync(DOCS, { recursive: true, force: true });
mkdirSync(DOCS, { recursive: true });
cpSync(BROWSER, DOCS, { recursive: true });

// Pages runs Jekyll, which silently drops any folder starting with `_`.
// Nothing here uses one today, but opting out keeps it that way.
writeFileSync(`${DOCS}/.nojekyll`, "");

console.log(`\nWrote ${DOCS}/ (served at ${BASE_HREF}). Commit it and Pages redeploys.`);
