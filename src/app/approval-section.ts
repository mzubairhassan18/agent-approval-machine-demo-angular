/**
 * One section per use case.
 *
 * The component owns no state: it attaches an `ApprovalService` to the store,
 * renders whatever `snapshot()` says, and forwards clicks back as verbs. All ten
 * sections are the same component driven by data, which is why the flags read
 * straight off `useCase().flags`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import type { ApprovalRecord, ApprovalStatus } from 'agent-approval-machine';
import { ApprovalService } from './approval-store.service';
import { EditValueDirective } from './edit-value.directive';
import type { ApprovalItem, UseCase } from './use-cases';

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  needs_approval: 'needs approval',
  editing: 'edited',
  executing: 'sending…',
  success: 'done',
  failed: 'failed',
  undoing: 'sent · recallable',
  queued: 'queued',
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const money = (value: number): string =>
  '€' + Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function isOpen(status: ApprovalStatus): boolean {
  return status === 'needs_approval' || status === 'editing';
}

@Component({
  selector: 'app-approval-section',
  imports: [MatCheckboxModule, MatTooltipModule, EditValueDirective],
  templateUrl: './approval-section.html',
  styleUrl: './approval-section.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ApprovalService],
  host: {
    class: 'uc',
    '[class.is-executing]': 'isExecuting()',
  },
})
export class ApprovalSection implements OnInit, OnDestroy {
  readonly useCase = input.required<UseCase>();
  readonly index = input.required<number>();

  readonly service = inject(ApprovalService) as unknown as ApprovalService<ApprovalItem>;
  readonly snapshot = this.service.snapshot;

  /** A ~150 ms clock so undo countdowns tick without re-rendering rows. */
  private readonly now = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;

  /** The arrival must only fire on the first execute of this section. */
  private arrived = false;

  /** Items that already burned their one failing attempt, so a retry recovers. */
  private readonly failedOnce = new Set<string>();

  /* ---- derived toolbar state ------------------------------------------ */

  private readonly summary = computed(() => this.snapshot()?.summary);
  readonly selectedCount = computed(() => this.summary()?.selected ?? 0);
  readonly openCount = computed(() => {
    const s = this.summary();
    return s ? s.needsApproval + s.editing : 0;
  });
  readonly failedCount = computed(() => this.summary()?.failed ?? 0);
  readonly isExecuting = computed(() => this.snapshot()?.isExecuting ?? false);

  readonly number = computed(() => String(this.index() + 1).padStart(2, '0'));

  readonly approveLabel = computed(() =>
    this.selectedCount()
      ? `Approve selected (${this.selectedCount()})`
      : `Approve all open (${this.openCount()})`,
  );
  readonly approveDisabled = computed(
    () => this.openCount() === 0 && this.failedCount() === 0,
  );
  readonly retryLabel = computed(() =>
    this.failedCount() ? `Retry ${this.failedCount()} failed` : 'Retry failed',
  );
  readonly summaryLine = computed(() => {
    const s = this.summary();
    if (!s) return '';
    return (
      `${s.needsApproval} open · ${s.editing} edited · ` +
      `${s.executing} sending · ${s.undoing} recallable · ${s.failed} failed`
    );
  });

  /* ---- lifecycle ------------------------------------------------------ */

  ngOnInit(): void {
    const uc = this.useCase();
    this.service.attach({
      items: uc.items.map((item) => ({ ...item })),
      ...uc.flags,
      onExecute: (batch) => this.execute(batch),
      onUndo: async () => {
        await sleep(260);
      },
    });
    this.timer = setInterval(() => {
      if ((this.snapshot()?.summary.undoing ?? 0) > 0) this.now.set(Date.now());
    }, 150);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /* ---- executor: a fake provider -------------------------------------- */

  private async execute(batch: ApprovalItem[]) {
    const uc = this.useCase();

    // First run: an item lands mid-flight and must be held as `queued`.
    if (uc.arrival && !this.arrived) {
      this.arrived = true;
      const arrival = uc.arrival;
      setTimeout(() => this.service.addItems([{ ...arrival.item }]), arrival.after);
    }

    // Pretend the provider takes a moment and answers per item.
    await sleep(700 + batch.length * 260);

    const succeeded: ApprovalItem[] = [];
    const failed: { item: ApprovalItem; error: string }[] = [];
    for (const item of batch) {
      const error = uc.fail?.[item.id];
      // A provider that rate-limits: the first attempt fails, the retry goes
      // through — which is what the failure messages promise.
      if (error && !this.failedOnce.has(item.id)) {
        this.failedOnce.add(item.id);
        failed.push({ item, error });
      } else {
        succeeded.push(item);
      }
    }
    return { succeeded, failed };
  }

  /* ---- template helpers ----------------------------------------------- */

  statusLabel(status: ApprovalStatus): string {
    return STATUS_LABEL[status];
  }

  isOpen = isOpen;

  isSelected(id: string): boolean {
    return this.snapshot()?.selectedIds.includes(id) ?? false;
  }

  subtitle(record: ApprovalRecord<ApprovalItem>): string {
    const item = record.item;
    const parts: string[] = [];
    if (item.subtitle) parts.push(item.subtitle);
    if (item.amount != null) parts.push(money(item.amount));
    if (item.slot) parts.push(`slot: ${item.slot}`);
    return parts.join(' · ');
  }

  editValue(record: ApprovalRecord<ApprovalItem>): string | number {
    const edit = this.useCase().edit;
    if (!edit) return '';
    return record.item[edit.key] ?? '';
  }

  countdown(record: ApprovalRecord<ApprovalItem>): string {
    const deadline = record.undoDeadline ?? Date.now();
    return ((deadline - this.now()) / 1000).toFixed(1) + 's';
  }

  /* ---- verbs ---------------------------------------------------------- */

  toggle(id: string): void {
    this.service.select(id);
  }

  onEdit(record: ApprovalRecord<ApprovalItem>, event: Event): void {
    const edit = this.useCase().edit;
    if (!edit) return;
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    const value = edit.kind === 'number' ? Number(target.value) : target.value;
    this.service.edit(record.item.id, { [edit.key]: value } as Partial<ApprovalItem>);
  }

  approve(): void {
    void this.service.approve();
  }

  deny(): void {
    this.service.deny();
  }

  retry(): void {
    void this.service.retryFailed();
  }

  clearQueue(): void {
    this.service.clearQueue();
  }

  undo(id: string): void {
    this.service.undo(id);
  }

  reset(): void {
    this.arrived = false;
    this.failedOnce.clear();
    this.service.reset(this.useCase().items.map((item) => ({ ...item })));
  }
}
