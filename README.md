# agent-approval-machine — Angular demo

Ten real-world approval flows built on [`agent-approval-machine`](https://www.npmjs.com/package/agent-approval-machine),
in Angular (standalone components, signals, `@if` / `@for`) with Angular Material.
This is the Angular sibling of the [Next.js](./README.md#links) and Vue demos: same
ten use cases, same ids, same data, same failure messages, same timings.

The point of the page is that the hard parts of agent approvals are **not** UI work:

| The five conditions every agent rebuilds | Where you see it here |
| --- | --- |
| Select one / select all | every row has a checkbox; the toolbar switches between `Approve selected (n)` and `Approve all open (n)` |
| Edit before approving | reply bodies, post copy, meeting slots and budgets are editable in the row, and the edited payload is what `onExecute` receives |
| Partial failure + retry | one item per use case is rejected by the fake provider; `Retry n failed` re-runs only that item |
| Undo window with a timer | successes stay `undoing` with a live countdown (`4.3s`) and a `Recall` button, then settle on expiry |
| Items arriving mid-flight | the queue banner: a new item lands while a batch is running, is held as `queued`, and is promoted when the batch settles |

None of that is in this repo. It is in the package. The whole Angular binding is
**one 15-line service** (`src/app/approval-store.service.ts`) plus a component that
renders `snapshot()` and forwards clicks back as verbs.

## Run it

```bash
npm install          # installs agent-approval-machine ^0.1.0 from npm
npm start            # ng serve -> http://localhost:4200
npm run build        # ng build (production)
npm test             # unit tests (Angular's vitest builder)
npm run store:check  # headless proof of the store, no DOM, no browser
npm run build:pages  # builds, then writes the site to docs/ for GitHub Pages
```

### Where the live demo comes from

No CI and no external host. `npm run build:pages` builds the site and writes it to `docs/`, which
GitHub Pages serves (source: `main`, `/docs`):

```bash
npm run build:pages
git add docs && git commit -m "chore: rebuild pages" && git push
```

Angular 22's application builder writes to `dist/<project>/browser`, and the site is served from a
subpath, so the script passes `--base-href /agent-approval-machine-demo-angular/` (rather than
putting it in `angular.json`, which would also move `ng serve` off the root). It also writes
`docs/.nojekyll`, so Pages' Jekyll step cannot silently drop files.

`agent-approval-machine` comes from npm:

```json
"agent-approval-machine": "^0.1.0"
```

### Headless store check

`npm run store:check` runs `scripts/store-check.mjs`, which drives the store with no
DOM, no Angular and no test framework. It asserts:

- `approve()` on 3 items against an executor that fails one → **2 succeeded / 1 failed**
- `retryFailed()` sends a batch containing **only** the failed item
- the undo window transitions: `undoing` → `needs_approval` on recall, `undoing` → `success` on expiry
- `edit()` lands in the payload `onExecute` receives
- `getSnapshot()` is referentially stable between changes

```
  approve() -> 2 succeeded / 1 failed
  statuses: a=undoing b=failed c=undoing
  retryFailed() -> batch [b] -> 1 succeeded
  after 200ms window: a=success b=success c=needs_approval
  edit() -> onExecute received the rewritten body
  getSnapshot() returned the same object twice with no change

store-check: all assertions passed
```

## The ten use cases

Every section is the same component (`ApprovalSection`) driven by one entry in
`src/app/use-cases.ts`. The `flags` are a preset spread straight into the store, so
the chips in the UI are literally the config.

| # | id | Use case | canSelect | canEdit | canUndo | undoMs | Exercises |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | `support-replies` | Support replies | ✅ | ✅ | ✅ | 5000 | the full machine: edit the reply body, a mailbox `429`, and a new ticket arriving mid-send |
| 02 | `refunds` | Refunds and payments | ✅ | ❌ | ✅ | 30000 | money is not editable; a long window because moving money is expensive |
| 03 | `publishing` | Multi-platform publishing | ✅ | ✅ | ✅ | 5000 | one post fanning out to X / LinkedIn / Bluesky, a `422` payload rejection, a platform mirrored in mid-flight |
| 04 | `meetings` | Meeting scheduling | ✅ | ✅ | ✅ | 5000 | booking needs a human to choose a `slot`; the executor sees the chosen time; calendar conflict on one row |
| 05 | `account-cancellations` | Account cancellations | ✅ | ❌ | ❌ | — | the flags switched off: irreversible, so no undo and no editing |
| 06 | `deploys` | CI/CD deploy approvals | ✅ | ❌ | ❌ | — | roll forward, not back; a failed smoke test lands on that one deployment |
| 07 | `gdpr` | GDPR deletion requests | ✅ | ❌ | ❌ | — | erasure cannot be recalled or rewritten; identity reference kept for audit |
| 08 | `purchase-orders` | Purchase orders | ✅ | ✅ | ✅ | 30000 | a human corrects the amount; an approval limit rejects the row above €10,000 |
| 09 | `contracts` | Contract signing | ✅ | ❌ | ❌ | — | final on both sides: no undo, no edit |
| 10 | `ad-campaigns` | Ad campaign launches | ✅ | ✅ | ✅ | 30000 | edit the daily budget, a spend limit rejects one campaign, a fourth campaign arrives while launching |

The demo deliberately makes every failure real instead of theoretical: `fail` maps an
item id to the message the provider would return, and `arrival` is an item that shows
up `after` N milliseconds — which lands inside the executing batch and is therefore
held as `queued`.

## Using `agent-approval-machine` in Angular

### 1. Install

```bash
npm install agent-approval-machine
```

### 2. Wrap it in a service (signals)

The store is plain state with `subscribe()`, so the binding is a signal plus a
subscription. `src/app/approval-store.service.ts` in full — this is the reusable part:

```ts
import { Injectable, OnDestroy, signal } from '@angular/core';
import {
  createApprovalStore,
  type ApprovalSnapshot,
  type ApprovalStore,
  type UseApprovalConfig,
} from 'agent-approval-machine';

@Injectable({ providedIn: 'root' })
export class ApprovalService<T extends { id: string }> implements OnDestroy {
  readonly snapshot = signal<ApprovalSnapshot<T> | null>(null);

  private store?: ApprovalStore<T>;
  private unsubscribe?: () => void;

  attach(config: UseApprovalConfig<T>): void {
    this.destroy();
    const store = createApprovalStore<T>(config);
    this.store = store;
    this.snapshot.set(store.getSnapshot());
    this.unsubscribe = store.subscribe(() => this.snapshot.set(store.getSnapshot()));
  }

  // select / edit / approve / deny / undo / retryFailed / addItems / clearQueue / reset
  // are one-line pass-throughs to the same verbs on the store.

  private destroy(): void {
    this.unsubscribe?.();
    this.store?.destroy();
  }

  ngOnDestroy(): void {
    this.destroy();
  }
}
```

### 3. Attach it in a component

`ApprovalService` is `providedIn: 'root'`, but each section needs its **own** store, so
the component re-provides it. That is the only DI subtlety:

```ts
@Component({
  selector: 'app-approval-section',
  imports: [MatCheckboxModule, MatTooltipModule, EditValueDirective],
  templateUrl: './approval-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ApprovalService],           // <- one store per section
})
export class ApprovalSection implements OnInit {
  readonly useCase = input.required<UseCase>();
  private readonly service = inject(ApprovalService) as unknown as ApprovalService<MyItem>;
  readonly snapshot = this.service.snapshot;   // signal the template renders

  ngOnInit(): void {
    this.service.attach({
      items: this.useCase().items,
      ...this.useCase().flags,                 // canSelect / canEdit / canUndo / undoMs
      onExecute: (batch) => this.execute(batch),
    });
  }
}
```

Then the template is just `@if (snapshot(); as snap) { @for (row of snap.itemsWithState; track row.item.id) { … } }`,
and every button calls a verb.

### 4. Subscribe and dispose

- **Subscribe.** `attach()` calls `store.subscribe(...)`, and the listener writes the
  snapshot into a signal. Because *that signal* is read by the template, Angular
  schedules change detection for you — no `NgZone.run`, no `markForCheck`, no
  `ChangeDetectorRef`.
- **Dispose.** `ApprovalService` implements `OnDestroy` and calls `store.destroy()`,
  which clears the pending undo timers. Angular tears it down with the component that
  provides it, so unmounting a section leaves no timers behind.

> This project runs Angular zoneless (the framework default in this version). The
> store notifies from ordinary callbacks — a `setTimeout`, a resolved promise — which
> write to the signal, and the signal schedules the render. The identical service also
> works under `zone.js`: the subscription still writes the signal, and the signal is
> still what the template depends on. Zone.js is a scheduling detail; signals are the
> contract.

### 5. The one directive worth copying

`src/app/edit-value.directive.ts` writes a store value into an `<input>`/`<textarea>`
**unless the user is typing in it**. Without it, a number field round-trips `12.` back
to `12` mid-keystroke, because `edit()` echoes the payload into the store.

## File layout

```
agent-approval-machine-demo-angular/
├── src/
│   ├── index.html                     # app shell, title, meta
│   ├── main.ts                        # bootstrapApplication(App, appConfig)
│   ├── styles.css                     # the visual language (tokens, panels, rows, badges)
│   └── app/
│       ├── app.ts / app.html / app.css   # sticky header + anchors, section list, TOC sidebar
│       ├── use-cases.ts                  # the 10 use cases — ids, labels, flags, items, fail, arrival
│       ├── approval-store.service.ts     # the ~15-line signals binding (the reusable part)
│       ├── edit-value.directive.ts       # focus-safe value binding for edit fields
│       ├── approval-section.ts/.html/.css# one section per use case, driven by data
│       ├── app.config.ts                 # ApplicationConfig
│       └── app.spec.ts                   # unit + end-to-end-ish tests on real DOM
├── scripts/
│   └── store-check.mjs                # headless store proof (npm run store:check)
├── angular.json                       # includes Material's azure-blue prebuilt theme, then styles.css
└── README.md
```

### Angular-specific notes

- **Material.** `@angular/material` is installed directly (no `ng add`). This demo uses
  `MatCheckbox` for row selection and `MatTooltip` on the flag chips; the
  `azure-blue.css` prebuilt theme is loaded first in `angular.json`, then `src/styles.css`
  overrides the Material tokens (checkbox colours, tooltip surface) so Material blends
  into the dark palette instead of fighting it.
- **`ChangeDetectionStrategy.OnPush` everywhere.** Correct because state is signals, not
  mutable fields.
- **`@if` / `@for`** are used throughout; there is no `CommonModule`, no `*ngIf`, no
  `*ngFor`.
- **One store per section** comes from `providers: [ApprovalService]` on the component.

## Links

- **npm:** <https://www.npmjs.com/package/agent-approval-machine>
- **GitHub:** <https://github.com/mzubairhassan18/agent-approval-machine>
- **Vanilla JS demo (GitHub Pages):** <https://mzubairhassan18.github.io/agent-approval-machine/>
- **Next.js demo:** <https://github.com/mzubairhassan18/agent-approval-machine-demo-nextjs>
- **Vue demo:** <https://github.com/mzubairhassan18/agent-approval-machine-demo-vue>

## License

MIT
