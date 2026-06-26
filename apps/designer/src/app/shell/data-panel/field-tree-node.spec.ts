import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/angular';
import type { FieldNode } from '@rendara/report-engine';
import { FieldTreeNode } from './field-tree-node';

const scalar = (name: string, scalarType: FieldNode['scalarType']): FieldNode => ({
  name,
  path: name,
  kind: 'scalar',
  scalarType,
});

describe('FieldTreeNode', () => {
  it('renders the scalar type as a chip', async () => {
    await render(FieldTreeNode, { inputs: { node: scalar('amount', 'number') } });
    expect(screen.getByText('amount')).toBeTruthy();
    expect(screen.getByText('Number')).toBeTruthy();
  });

  it('marks an array node with the [ ] chip', async () => {
    const node: FieldNode = {
      name: 'lineItems',
      path: 'lineItems',
      kind: 'array',
      children: [scalar('[]', 'string')],
    };
    await render(FieldTreeNode, { inputs: { node } });
    expect(screen.getByText('[ ]')).toBeTruthy();
  });

  it('exposes treeitem semantics with an aria-level', async () => {
    const view = await render(FieldTreeNode, {
      inputs: { node: scalar('id', 'string'), level: 3 },
    });
    // testing-library mounts the component host as the container itself.
    expect(view.container.getAttribute('role')).toBe('treeitem');
    expect(view.container.getAttribute('aria-level')).toBe('3');
  });

  it('exposes a bindable field row as a drag handle (drag-to-bind, E6-S7)', async () => {
    const view = await render(FieldTreeNode, { inputs: { node: scalar('amount', 'number') } });
    const grip = screen.getByLabelText(/Drag amount to bind an element/i);
    expect(grip).toBeTruthy();
    // The row itself is a CDK drag source.
    expect(view.container.querySelector('.cdk-drag')).not.toBeNull();
  });

  it('does not make the array-element placeholder ([]) draggable', async () => {
    const view = await render(FieldTreeNode, {
      inputs: { node: { name: '[]', path: 'lineItems', kind: 'object', children: [] } },
    });
    expect(view.container.querySelector('.rdr-field__grip--disabled')).not.toBeNull();
    expect(screen.queryByLabelText(/to bind an element/i)).toBeNull();
  });

  it('expands and collapses a container via its twisty button', async () => {
    const node: FieldNode = {
      name: 'customer',
      path: 'customer',
      kind: 'object',
      children: [scalar('name', 'string')],
    };
    const view = await render(FieldTreeNode, { inputs: { node } });

    // Starts expanded: the child group is present and the child is shown.
    expect(view.container.querySelector('[role="group"]')).not.toBeNull();
    expect(screen.getByText('name')).toBeTruthy();

    const twisty = screen.getByRole('button', { name: 'Collapse customer' });
    await fireEvent.click(twisty);
    view.detectChanges();

    expect(view.container.querySelector('[role="group"]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Expand customer' })).toBeTruthy();
  });
});
