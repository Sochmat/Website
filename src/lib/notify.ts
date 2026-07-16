/**
 * Scheduling-reminder seam. PHASE 2.
 *
 * The plan is: a Vercel Cron hits a `CRON_SECRET`-guarded
 * `GET /api/cron/subscription-reminders` at 14:30 UTC (20:00 IST) daily, finds
 * tomorrow's unscheduled plans, and nudges each customer over WhatsApp twice.
 *
 * Nothing in the app depends on this. Rule: we never auto-book — a missed cron
 * costs a nudge, not a meal. Swap the no-op for a WhatsApp (Kaleyra) channel
 * behind this interface when the WABA and message templates are approved.
 */

export interface SubscriptionReminder {
  phone: string;
  planNumber: string;
  date: string;
  itemName: string | null;
}

export interface NotificationChannel {
  sendSchedulingReminder(reminder: SubscriptionReminder): Promise<void>;
}

export const notify: NotificationChannel = {
  async sendSchedulingReminder() {
    // no-op until Phase 2
  },
};
