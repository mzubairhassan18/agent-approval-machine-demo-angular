import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { ApprovalService } from './approval-store.service';
import { USE_CASES } from './use-cases';

interface Row {
  id: string;
}

describe('App', () => {
  it('renders one section per use case', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('app-approval-section').length).toBe(USE_CASES.length);
    expect(el.querySelector('h1')?.textContent).toContain('Ten approval flows');
  });

  it('renders money, slots, risk badges and on/off flags', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const refunds = el.querySelector('#refunds') as HTMLElement;
    expect(refunds.querySelectorAll('li.row').length).toBe(3);
    expect(refunds.textContent).toContain('€4,120.50');
    expect(refunds.querySelector('.risk.high')?.textContent?.trim()).toBe('high');

    // Refunds are recallable (30s) but not editable — exactly one chip is off.
    const refundOff = [...refunds.querySelectorAll('.flag.off')].map((f) =>
      f.textContent?.trim().split(' ')[0],
    );
    expect(refundOff).toEqual(['canEdit']);

    // Cancellations switch both flags off, which also takes undoMs with them.
    const cancellations = el.querySelector('#account-cancellations') as HTMLElement;
    const cancelOff = [...cancellations.querySelectorAll('.flag.off')].map((f) =>
      f.textContent?.trim().split(' ')[0],
    );
    expect(cancelOff).toEqual(['canEdit', 'canUndo', 'undoMs']);

    const meetings = el.querySelector('#meetings') as HTMLElement;
    expect(meetings.textContent).toContain('slot: Thu 15:00 CET');
    expect(meetings.querySelector('input[type="text"].row-edit')).toBeTruthy();

    const replies = el.querySelector('#support-replies') as HTMLElement;
    expect(replies.querySelector('textarea.row-edit')).toBeTruthy();

    const orders = el.querySelector('#purchase-orders') as HTMLElement;
    expect(orders.querySelector('input[type="number"].row-edit')).toBeTruthy();
  });

  it('runs a batch end to end: execute, partial failure, queue promotion, undo window', async () => {
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const section = el.querySelector('#support-replies') as HTMLElement;
    const approve = section.querySelector('.toolbar button.primary') as HTMLButtonElement;
    expect(approve.textContent).toContain('Approve all open (4)');

    approve.click();

    // The arrival lands at 420ms; the provider answers at 700 + 4 * 260 = 1740ms.
    await wait(700);
    expect(section.querySelectorAll('.row.queued').length).toBe(1);
    expect(section.querySelector('.queue')?.textContent).toContain('1 new item');
    expect(section.querySelectorAll('.row.executing').length).toBe(4);

    await wait(2000);
    expect(section.querySelectorAll('.row.queued').length).toBe(0);
    expect(section.querySelectorAll('.row.undoing').length).toBe(3);
    expect(section.querySelectorAll('.row.failed').length).toBe(1);
    expect(section.querySelector('.countdown')?.textContent?.trim()).toMatch(/^\d+\.\ds$/);

    // Reset forgets the arrival and restores the four initial items.
    const reset = [...section.querySelectorAll('.toolbar button')].find((b) =>
      b.textContent?.includes('Reset'),
    ) as HTMLButtonElement;
    reset.click();
    await wait(50);
    expect(section.querySelectorAll('li.row').length).toBe(4);
    expect(section.querySelectorAll('.row.needs_approval').length).toBe(4);
  });
});

describe('ApprovalService', () => {
  it('mirrors the store snapshot into a signal and forwards verbs', () => {
    const service = TestBed.inject(ApprovalService) as unknown as ApprovalService<Row>;

    expect(service.snapshot()).toBeNull();

    service.attach({ items: [{ id: 'a' }, { id: 'b' }] });
    expect(service.snapshot()?.summary.total).toBe(2);

    service.select('a');
    expect(service.snapshot()?.selectedIds).toEqual(['a']);

    service.deny(['a']);
    expect(service.snapshot()?.summary.total).toBe(1);

    service.reset([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    expect(service.snapshot()?.summary.total).toBe(3);
  });
});
