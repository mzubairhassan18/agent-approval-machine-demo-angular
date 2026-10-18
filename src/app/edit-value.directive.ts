/**
 * EditValueDirective — writes a value into an input/textarea unless the user is
 * typing in it.
 *
 * The stores' `edit()` round-trips the payload back into the row, so a plain
 * `[value]` binding would rewrite "12." to "12" mid-keystroke on a number field.
 * The vanilla demo guards this with `document.activeElement !== row.edit`; this
 * directive is the same guard, in Angular.
 *
 * Usage: `<textarea [appEditValue]="record.item.body" (input)="onEdit($event)">`
 */
import { Directive, ElementRef, HostListener, effect, inject, input } from '@angular/core';

@Directive({ selector: '[appEditValue]' })
export class EditValueDirective {
  readonly appEditValue = input<string | number | null | undefined>('');

  private readonly el = inject<ElementRef<HTMLInputElement | HTMLTextAreaElement>>(ElementRef);
  private focused = false;

  constructor() {
    effect(() => {
      const value = this.appEditValue();
      if (this.focused) return;
      const next = value == null ? '' : String(value);
      if (this.el.nativeElement.value !== next) this.el.nativeElement.value = next;
    });
  }

  @HostListener('focus')
  onFocus(): void {
    this.focused = true;
  }

  @HostListener('blur')
  onBlur(): void {
    this.focused = false;
  }
}
