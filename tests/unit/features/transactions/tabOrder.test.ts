import { describe, it, expect } from 'vitest';
import { navItems } from '../../../../src/App';

describe('Navigation tab order', () => {
  it('places transactions tab after stats tab', () => {
    const labels = navItems.map((item) => item.label);
    const statsIndex = labels.indexOf('Stats');
    const txnsIndex = labels.indexOf('Txns');

    expect(statsIndex).toBeGreaterThanOrEqual(0);
    expect(txnsIndex).toBeGreaterThanOrEqual(0);
    expect(txnsIndex).toBeGreaterThan(statsIndex);
  });

  it('has the correct tab order', () => {
    const labels = navItems.map((item) => item.label);
    expect(labels).toEqual(['Home', 'Stats', 'Txns', 'Import', 'Settings']);
  });
});
