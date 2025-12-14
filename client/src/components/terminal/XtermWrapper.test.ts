import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { debounce } from './XtermWrapper';

const originalGetContext = HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn() as any;
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

describe('XtermWrapper debounce', () => {
  it('debounces calls within the wait period', () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    const debounced = debounce(handler, 100);

    debounced();
    debounced();

    vi.advanceTimersByTime(50);
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(60);
    expect(handler).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });
});
