# Phase 3K notification matrix

Implementation baseline v1, 2026-09-24. Trace: FR-NOT-001; architecture 21; the client's Phase 3K authorization selects customer-meaningful transactional additions. EMAIL ONLY. No new commerce events or state transitions.

For every commerce row below: recipient is the **historical `orders.contact_email`**, whether guest or account holder; channel EMAIL; template identifier is the event name with version `v1`; sensitivity is confidential transactional data (order/reference, item names, quantities, amounts, and shipment/return reference where applicable). No address, internal notes, provider payload, credential, or guest capability is included. Retries use policy R; deduplication uses key D.

| Allocation | Durable event / template | Authoritative trigger and meaning |
| --- | --- | --- |
| REQUIRED V1 EMAIL | OrderCreated | `order_status_history`: committed placement, explicitly payment not yet confirmed |
| REQUIRED V1 EMAIL | PaymentSucceeded | `payment_events`: internally verified, applied payment; never browser callback alone |
| REQUIRED V1 EMAIL | PaymentRequiresReview | `payment_events`: verification requires review; expressly says do not pay again |
| REQUIRED V1 EMAIL | OrderShipped | `fulfilment_events`: recorded dispatch; carrier, tracking number, safe optional tracking URL and date |
| REQUIRED V1 EMAIL | OrderDelivered | `fulfilment_events`: confirmed delivery; no review solicitation |
| REQUIRED V1 EMAIL | ReturnRequested | `return_events`: valid request committed; acknowledgement, not approval |
| REQUIRED V1 EMAIL | ReturnApproved | `return_events`: accepted quantities; arrangements separately, no invented reverse-shipping policy |
| REQUIRED V1 EMAIL | ReturnRejected | `return_events`: decision; no internal decision notes |
| REQUIRED V1 EMAIL | ReturnReceived | `return_events`: physical receipt; neither refund nor saleable-inspection claim |
| REQUIRED V1 EMAIL | RefundInitiated | `return_events`: staff initiated processing; neither provider completion nor bank credit |
| REQUIRED V1 EMAIL | RefundSucceeded | `return_events`: successful provider observation finalized internally; historical refund amount |
| REQUIRED V1 EMAIL | RefundFailed | `return_events`: recorded failure needing staff follow-up; no false success or repayment instruction |

**R:** maximum five delivery attempts, explicit temporary rejection backoffs 60/300/900/3600 seconds; permanent rejection stops; ambiguous transport outcome or expired sending lease becomes UNKNOWN and is not automatically resent. Invalid configuration/recipient stops. Scheduler lag can add up to a minute plus queue delay. See [operations](notifications.md).

**D:** one canonical journal source row → one outbox event (unique real source FK); unique delivery `(outbox_event_id, template_code, recipient_hash)`, with fixed version on that delivery. Leased, locked claims prevent competing workers sending the same intent. Shipment/delivery are consumed from fulfilment only, not mirrored order history. SMTP does not guarantee physical exactly-once delivery.

| Allocation | Evaluated message | Decision |
| --- | --- | --- |
| EXISTING REQUIRED IDENTITY EMAIL | Password reset | Existing encrypted, after-commit `identity` Redis job and approved token-fragment URL; account recovery recipient, existing throttling and expiry. Separate security flow, not copied into commerce outbox. Existing Laravel reset template retained. |
| DEFERRED / not applicable | Account/email verification | Current identity model has no enabled mandatory verification workflow. Do not invent one in notifications. |
| DEFERRED | PaymentFailed / abandoned payment | Failure may be attempt-specific while another payment is pending; current order/payment UI communicates status. No email encouraging duplicate payment. |
| DEFERRED | Processing | Payment acknowledgement and dispatch provide meaningful milestones; omit internal processing noise. |
| DEFERRED | Cancellation / reservation expiry / inventory changes / inspection-only / generic internal review | No added notification trigger; existing pages remain authoritative. |
| DEFERRED | Guest email-link recovery | Explicitly deferred in approved Phase 3G. Emails contain no capability and do not extend guest access. |
| DEFERRED | Manual resend, notification center, email dashboard | No resend endpoint or new staff permission. Developer/operator CLI provides safe metadata. |
| DEFERRED | SMS, WhatsApp, push, abandoned-cart, newsletters, promotions | Outside V1 channel/scope. |

Recipient changes do not redirect historical commerce mail. Separate domain events can arrive out of chronological order after retries; each email states its event date and advises checking current order status. Delivery failure never changes payment, stock, return, refund or fulfilment state.
