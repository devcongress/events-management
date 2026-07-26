const BUTTON_SELECTOR = 'button:not(:disabled)';
const PRESS_DEPTH = '2px';
const PRESS_SCALE = '0.985';
const PRESS_DURATION_MS = 90;
const RELEASE_DURATION_MS = 140;
const PRESS_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';
const RELEASE_EASING = 'cubic-bezier(0.23, 1, 0.32, 1)';

function normalizedTranslate(value: string): string {
  return value === 'none' ? '0px 0px' : value;
}

function normalizedScale(value: string): string {
  return value === 'none' ? '1' : value;
}

export function installButtonPressFeedback(root: Document = document): () => void {
  const defaultView = root.defaultView;
  if (!defaultView) return () => undefined;
  const view: Window = defaultView;

  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const activePointers = new Map<number, HTMLButtonElement>();
  const activeButtons = new Set<HTMLButtonElement>();
  const animations = new WeakMap<HTMLButtonElement, Animation>();

  function buttonFromTarget(target: EventTarget | null): HTMLButtonElement | null {
    if (!(target instanceof Element)) return null;
    return target.closest<HTMLButtonElement>(BUTTON_SELECTOR);
  }

  function cancelAnimation(button: HTMLButtonElement) {
    animations.get(button)?.cancel();
    animations.delete(button);
  }

  function animateButton(button: HTMLButtonElement, pressed: boolean) {
    if (reducedMotion.matches) {
      cancelAnimation(button);
      return;
    }

    const computed = view.getComputedStyle(button);
    const fromTranslate = normalizedTranslate(computed.translate);
    const fromScale = normalizedScale(computed.scale);
    cancelAnimation(button);

    const animation = button.animate(
      [
        { translate: fromTranslate, scale: fromScale },
        {
          translate: pressed ? `0px ${PRESS_DEPTH}` : '0px 0px',
          scale: pressed ? PRESS_SCALE : '1',
        },
      ],
      {
        duration: pressed ? PRESS_DURATION_MS : RELEASE_DURATION_MS,
        easing: pressed ? PRESS_EASING : RELEASE_EASING,
        fill: 'forwards',
      },
    );

    animations.set(button, animation);
    void animation.finished
      .then(() => {
        if (animations.get(button) !== animation) return;
        animations.delete(button);
        if (!pressed) animation.cancel();
      })
      .catch(() => undefined);
  }

  function releasePointer(pointerId: number) {
    const button = activePointers.get(pointerId);
    if (!button) return;

    activePointers.delete(pointerId);
    activeButtons.delete(button);
    animateButton(button, false);
  }

  function releaseAll() {
    const buttons = new Set(activePointers.values());
    activePointers.clear();
    activeButtons.clear();
    buttons.forEach((button) => animateButton(button, false));
  }

  function handlePointerDown(event: PointerEvent) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;

    const button = buttonFromTarget(event.target);
    if (!button || activeButtons.has(button)) return;

    activePointers.set(event.pointerId, button);
    activeButtons.add(button);
    animateButton(button, true);
  }

  function handlePointerUp(event: PointerEvent) {
    releasePointer(event.pointerId);
  }

  function handleVisibilityChange() {
    if (root.visibilityState === 'hidden') releaseAll();
  }

  function handleReducedMotionChange() {
    if (!reducedMotion.matches) return;
    activeButtons.forEach(cancelAnimation);
  }

  root.addEventListener('pointerdown', handlePointerDown, { capture: true });
  root.addEventListener('pointerup', handlePointerUp, { capture: true });
  root.addEventListener('pointercancel', handlePointerUp, { capture: true });
  root.addEventListener('visibilitychange', handleVisibilityChange);
  view.addEventListener('blur', releaseAll);
  reducedMotion.addEventListener('change', handleReducedMotionChange);

  return () => {
    releaseAll();
    root.removeEventListener('pointerdown', handlePointerDown, { capture: true });
    root.removeEventListener('pointerup', handlePointerUp, { capture: true });
    root.removeEventListener('pointercancel', handlePointerUp, { capture: true });
    root.removeEventListener('visibilitychange', handleVisibilityChange);
    view.removeEventListener('blur', releaseAll);
    reducedMotion.removeEventListener('change', handleReducedMotionChange);
  };
}
