export async function copyTextToClipboard(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
    throw new Error('Clipboard access is unavailable.');
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);

  try {
    textarea.select();
    if (!document.execCommand('copy')) {
      throw new Error('The browser did not copy the text.');
    }
  } finally {
    textarea.remove();
  }
}
