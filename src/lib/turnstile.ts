const TURNSTILE_SCRIPT_ID = 'cf-turnstile-api';
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const DEFAULT_ROUTE_FEEDBACK_TURNSTILE_SITE_KEY = '0x4AAAAAADlzD1Y7MkiKmIzL';

export const ROUTE_FEEDBACK_TURNSTILE_ACTION = 'route_feedback';
export const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || DEFAULT_ROUTE_FEEDBACK_TURNSTILE_SITE_KEY;

let turnstileScriptPromise: Promise<TurnstileGlobal> | null = null;

export function turnstileEnabled() {
  return turnstileSiteKey.length > 0;
}

export async function loadTurnstile(): Promise<TurnstileGlobal> {
  if (window.turnstile) {
    return window.turnstile;
  }

  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise<TurnstileGlobal>((resolve, reject) => {
      const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;

      const handleReady = () => {
        if (window.turnstile) {
          resolve(window.turnstile);

          return;
        }

        reject(new Error('Turnstile did not initialize'));
      };

      const handleError = () => {
        reject(new Error('Turnstile failed to load'));
      };

      if (existingScript) {
        existingScript.addEventListener('load', handleReady, { once: true });
        existingScript.addEventListener('error', handleError, { once: true });

        return;
      }

      const script = document.createElement('script');

      script.id = TURNSTILE_SCRIPT_ID;
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener('load', handleReady, { once: true });
      script.addEventListener('error', handleError, { once: true });
      document.head.appendChild(script);
    }).catch((error) => {
      turnstileScriptPromise = null;

      throw error;
    });
  }

  return turnstileScriptPromise;
}
