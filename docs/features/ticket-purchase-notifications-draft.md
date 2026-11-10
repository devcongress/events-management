# Draft — Organizer notifications for ticket purchases

**Status:** Parked for later discussion. The Events channel is excluded. The organizer audience and delivery destination are still open.

Organizers want to hear when EMS confirms a live ticket purchase. Ticketing → Orders already holds the purchase details. A short notification could show the pass type, seat count, ticket total, and a link to the order for authorized organizers. Purchaser names and email addresses would stay in EMS.

Example: **DevCon 2026 · 2 regular passes purchased · GH₵300** · View order

When revisiting this, first identify who should receive the alert and where they already work. Confirm the actual destination and audience before choosing any existing webhook.

If the feature goes ahead, queue one notification per order when it first becomes paid. Browser verification and Paystack’s webhook can both confirm the same purchase. Deduplicate by order ID, exclude test purchases, and handle notification retries independently of ticket fulfillment. Verify that the order link opens the correct record after sign-in.
