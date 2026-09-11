/** Keyboard navigation shared by the single- and multi-choice listboxes. */
export function focusDropdownOption(panel: HTMLElement | null, edge: 'first' | 'last' = 'first') {
  const options = panel?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)');

  if (!options?.length) return;
  (edge === 'last' ? options[options.length - 1] : panel?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]:not(:disabled)') ?? options[0]).focus();
}

export function navigateDropdown(event: KeyboardEvent, panel: HTMLElement | null, close: () => void, trigger: HTMLElement | null) {
  if (event.key === 'Tab' && trigger) {
    // A leaving inline menu stays mounted for a frame. Skip its options rather
    // than letting native Tab move focus into the departing panel.
    const dialog = trigger.closest<HTMLElement>('[role="dialog"]');
    const scope = dialog ?? document;
    const fields = [...scope.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])')]
      .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && !element.closest('[inert]') && !panel?.contains(element));
    const offset = event.shiftKey ? -1 : 1;
    const index = fields.indexOf(trigger) + offset;
    const target = fields[index] ?? (dialog ? fields[event.shiftKey ? fields.length - 1 : 0] : undefined);

    close();
    if (target) {
      event.preventDefault();
      event.stopPropagation();
      target.focus();
    } else trigger.focus();

    return;
  }
  if (event.key === 'Escape' || event.key === 'Tab') {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
    close();
    trigger?.focus();

    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
  const options = [...(panel?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? [])];

  if (!options.length) return;
  const current = options.findIndex(option => option === document.activeElement);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
    : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;

  options[index]?.focus();
}
