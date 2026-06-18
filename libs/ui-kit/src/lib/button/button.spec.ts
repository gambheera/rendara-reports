import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/angular';
import { Button } from './button';

describe('Button', () => {
  it('defaults to the secondary variant', async () => {
    await render('<button rdr-button>Save</button>', { imports: [Button] });

    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn.classList).toContain('rdr-button');
    expect(btn.classList).toContain('rdr-button--secondary');
  });

  it('applies the requested variant class exclusively', async () => {
    await render('<button rdr-button variant="primary">Go</button>', {
      imports: [Button],
    });

    const btn = screen.getByRole('button', { name: 'Go' });
    expect(btn.classList).toContain('rdr-button--primary');
    expect(btn.classList).not.toContain('rdr-button--secondary');
  });

  it('renders the ghost variant', async () => {
    await render('<button rdr-button variant="ghost">Cancel</button>', {
      imports: [Button],
    });

    expect(screen.getByRole('button', { name: 'Cancel' }).classList).toContain('rdr-button--ghost');
  });

  it('projects content and fires the native click', async () => {
    const onClick = vi.fn();
    await render('<button rdr-button (click)="onClick()">Press</button>', {
      imports: [Button],
      componentProperties: { onClick },
    });

    screen.getByRole('button', { name: 'Press' }).click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('keeps native disabled semantics', async () => {
    await render('<button rdr-button disabled>Nope</button>', { imports: [Button] });

    expect((screen.getByRole('button', { name: 'Nope' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
