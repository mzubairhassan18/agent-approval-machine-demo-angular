/**
 * ApprovalService — the whole Angular binding.
 *
 * `agent-approval-machine` is plain state with a `subscribe`, so the glue is a
 * signal plus a subscription: the store notifies, the signal is written, and
 * Angular's reactivity (zoneless, signal-based) schedules change detection.
 *
 * That is the point of the package — ~15 lines per framework, no binding to
 * install and no adapter to keep in sync. This file is short on purpose.
 *
 * ```ts
 * @Component({ providers: [ApprovalService], /* ... *\/ })
 * class Section {
 *   private service: ApprovalService<MyItem> = inject(ApprovalService);
 *   readonly snapshot = this.service.snapshot;
 *
 *   ngOnInit() {
 *     this.service.attach({ items, ...sendApproval, onExecute: run });
 *   }
 * }
 * ```
 */
import { Injectable, OnDestroy, signal } from '@angular/core';
import {
  createApprovalStore,
  type ApprovalResult,
  type ApprovalSnapshot,
  type ApprovalStore,
  type UseApprovalConfig,
} from 'agent-approval-machine';

@Injectable({ providedIn: 'root' })
export class ApprovalService<T extends { id: string }> implements OnDestroy {
  /** Last snapshot from the store, or null until `attach()` is called. */
  readonly snapshot = signal<ApprovalSnapshot<T> | null>(null);

  private store?: ApprovalStore<T>;
  private unsubscribe?: () => void;

  /** Creates the store and mirrors every change into the signal. */
  attach(config: UseApprovalConfig<T>): void {
    this.destroy();
    const store = createApprovalStore<T>(config);
    this.store = store;
    this.snapshot.set(store.getSnapshot());
    this.unsubscribe = store.subscribe(() => this.snapshot.set(store.getSnapshot()));
  }

  /* ---- verbs: straight pass-throughs, typed for the template ---- */

  select(id: string): void {
    this.store?.select(id);
  }
  selectAll(): void {
    this.store?.selectAll();
  }
  edit(id: string, patch: Partial<T>): void {
    this.store?.edit(id, patch);
  }
  approve(ids?: string[]): Promise<ApprovalResult<T>> {
    return this.store?.approve(ids) ?? Promise.resolve({ succeeded: [], failed: [] });
  }
  deny(ids?: string[]): void {
    this.store?.deny(ids);
  }
  undo(id?: string): void {
    this.store?.undo(id);
  }
  retryFailed(): Promise<ApprovalResult<T>> {
    return this.store?.retryFailed() ?? Promise.resolve({ succeeded: [], failed: [] });
  }
  addItems(items: T | T[]): void {
    this.store?.addItems(items);
  }
  clearQueue(): void {
    this.store?.clearQueue();
  }
  reset(items?: T[]): void {
    this.store?.reset(items);
  }

  private destroy(): void {
    this.unsubscribe?.();
    this.store?.destroy();
    this.unsubscribe = undefined;
    this.store = undefined;
  }

  /** Called by Angular when the component that provides it is destroyed. */
  ngOnDestroy(): void {
    this.unsubscribe?.();
    this.store?.destroy();
  }
}
