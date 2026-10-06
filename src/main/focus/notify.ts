import { Notification, shell } from 'electron';
import type { Notifier } from './timer-service';

export const electronNotifier: Notifier = {
  notify(title, body) {
    if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
  },
  beep() {
    shell.beep();
  },
};
