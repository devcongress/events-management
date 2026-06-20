import type { ExternalToast } from 'vue-sonner';
import { toast } from 'vue-sonner';

type NotifyOptions = ExternalToast;
type NotifyPromiseMessages<T> = Parameters<typeof toast.promise<T>>[1];

const APP_TOASTER_ID = 'app';
const APP_TOAST_STATUS_ID = 'app-status';

function withDefaults(options: NotifyOptions = {}): NotifyOptions {
  return {
    toasterId: APP_TOASTER_ID,
    id: APP_TOAST_STATUS_ID,
    ...options,
  };
}

export const notify = {
  message(message: string, options?: NotifyOptions) {
    return toast.message(message, withDefaults(options));
  },
  success(message: string, options?: NotifyOptions) {
    return toast.success(message, withDefaults(options));
  },
  info(message: string, options?: NotifyOptions) {
    return toast.info(message, withDefaults(options));
  },
  warning(message: string, options?: NotifyOptions) {
    return toast.warning(message, withDefaults(options));
  },
  error(message: string, options?: NotifyOptions) {
    return toast.error(message, withDefaults(options));
  },
  loading(message: string, options?: NotifyOptions) {
    return toast.loading(message, withDefaults(options));
  },
  promise<T>(promise: Promise<T> | (() => Promise<T>), messages: NotifyPromiseMessages<T>) {
    return toast.promise<T>(promise, {
      toasterId: APP_TOASTER_ID,
      id: APP_TOAST_STATUS_ID,
      ...messages,
    });
  },
  dismiss(id?: number | string) {
    return toast.dismiss(id);
  },
};

export type { NotifyOptions };
