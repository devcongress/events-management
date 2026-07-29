export {};

declare global {
  interface ImportMetaEnv {
    readonly VITE_TURNSTILE_SITE_KEY?: string;
  }

  interface TurnstileRenderOptions {
    sitekey: string;
    action?: string;
    theme?: 'auto' | 'light' | 'dark';
    size?: 'normal' | 'flexible' | 'compact';
    callback?: (token: string) => void;
    'error-callback'?: (code?: string) => void;
    'expired-callback'?: () => void;
    'timeout-callback'?: () => void;
  }

  interface TurnstileGlobal {
    render: (container: string | HTMLElement, options: TurnstileRenderOptions) => string;
    reset: (widgetId: string) => void;
    remove: (widgetId: string) => void;
  }

  interface Window {
    turnstile?: TurnstileGlobal;
  }
}
