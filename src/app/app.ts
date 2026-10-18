/**
 * The page shell: sticky header, one section per use case, a sticky table of
 * contents that highlights the section you are reading.
 *
 * There is deliberately no state here beyond which section is in view — each
 * `ApprovalSection` owns its own store instance through its own `ApprovalService`.
 */
import { ChangeDetectionStrategy, Component, signal, afterNextRender } from '@angular/core';
import { ApprovalSection } from './approval-section';
import { USE_CASES } from './use-cases';

interface NavLink {
  label: string;
  href: string;
}

@Component({
  selector: 'app-root',
  imports: [ApprovalSection],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  readonly useCases = USE_CASES;
  readonly version = '0.1.0';
  readonly activeId = signal<string>(this.useCases[0].id);

  /** Somewhere to go for the package and the sibling demos. */
  readonly links: NavLink[] = [
    { label: 'npm', href: 'https://www.npmjs.com/package/agent-approval-machine' },
    { label: 'GitHub', href: 'https://github.com/mzubairhassan18/agent-approval-machine' },
    {
      label: 'Next.js demo',
      href: 'https://github.com/mzubairhassan18/agent-approval-machine-demo-nextjs',
    },
    {
      label: 'Vue demo',
      href: 'https://github.com/mzubairhassan18/agent-approval-machine-demo-vue',
    },
    { label: 'Vanilla demo', href: 'https://mzubairhassan18.github.io/agent-approval-machine/' },
  ];

  constructor() {
    afterNextRender(() => this.observeSections());
  }

  number(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  /** Highlight the section currently under the sticky header. */
  private observeSections(): void {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.activeId.set(entry.target.id);
        }
      },
      { rootMargin: '-88px 0px -70% 0px', threshold: 0 },
    );

    for (const useCase of this.useCases) {
      const el = document.getElementById(useCase.id);
      if (el) observer.observe(el);
    }
  }
}
