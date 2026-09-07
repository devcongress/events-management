import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyTextToClipboard } from './clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyTextToClipboard', () => {
  it('resolves only after the Clipboard API confirms the write', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyTextToClipboard('https://example.com')).resolves.toBeUndefined();
    expect(writeText).toHaveBeenCalledWith('https://example.com');
  });

  it('uses the legacy fallback and removes its temporary control', async () => {
    const textarea = {
      value: '',
      style: { position: '', opacity: '' },
      setAttribute: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
    };
    const execCommand = vi.fn(() => true);
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: vi.fn(() => textarea),
      body: { appendChild: vi.fn() },
      execCommand,
    });

    await expect(copyTextToClipboard('fallback value')).resolves.toBeUndefined();
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(textarea.remove).toHaveBeenCalledOnce();
  });

  it('rejects instead of reporting success when the fallback fails', async () => {
    const textarea = {
      value: '',
      style: { position: '', opacity: '' },
      setAttribute: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
    };
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: vi.fn(() => textarea),
      body: { appendChild: vi.fn() },
      execCommand: vi.fn(() => false),
    });

    await expect(copyTextToClipboard('not copied')).rejects.toThrow('did not copy');
    expect(textarea.remove).toHaveBeenCalledOnce();
  });
});
