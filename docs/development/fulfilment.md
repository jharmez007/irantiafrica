# Manual fulfilment — Phase 3I

Baseline v1.0 — 2026-09-24. See [shipping storage/configuration](shipping.md) and the [verification report](phase-3i-report.md).

## Staff workflow

1. Open the paid order under `/admin/orders/{id}`. Its historical delivery address remains the destination. Payment success leaves PAID until staff starts processing.
2. **Begin processing**. Requires verified applied payment, COMMITTED inventory reservation, no financial hold and PAID status. Server records processing time, staff history, audit and internal event.
3. Create a PREPARED shipment with carrier name; optionally save tracking number, approved HTTPS link and internal packing notes. Correct these before dispatch. Saved changes increment the shared order version.
4. **Mark dispatched** after reviewing saved carrier/tracking details. Requires PROCESSING, no hold, complete tracking and PREPARED shipment. Server records shipment SHIPPED, dispatch time and order SHIPPED atomically. Unsaved UI edits must be saved before dispatch.
5. **Confirm delivered**, supplying internal staff evidence such as the carrier receipt reference. Server records DELIVERED and timestamp atomically. Financial review discovered after dispatch does not erase the physical delivery fact or prevent recording it; it still remains unresolved financially.

There is no post-payment cancellation through the unpaid cancellation path. Shipping never restores stock or issues refunds. No notification is sent by these commands; optional processing/shipping/delivery templates and event delivery remain Phase 3K review per architecture 21.

## Permissions and API

Existing approved grants are unchanged. Owner and Order Processing staff use `orders.read`, `orders.prepare`, `shipments.record`, `delivery.record`; Inventory staff has none of these. Staff requires current authentication and TOTP MFA. Browser origin, CSRF and existing order throttles apply. Actor status/permission are rechecked under the actor lock for mutations.

All paths are under `/api/v1/admin/orders/{id}`:

| Method/path | Input and permission |
| --- | --- |
| GET `/shipment` | `orders.read`; private operational projection/action capabilities |
| POST `/processing` | `orders.prepare`; integer `expected_version`, optional `note` up to 500 |
| POST `/shipment` | `shipments.record`; `expected_version`, required `provider_label`, nullable `tracking_number`, `tracking_url`, `operational_notes` |
| PATCH `/shipment` | Same complete editable field set; only PREPARED/PROCESSING; omitted nullable fields clear them |
| POST `/ship` | `shipments.record`; `expected_version`, optional `note` up to 1000 |
| POST `/deliver` | `delivery.record`; `expected_version`, required `note` up to 1000 |

Commands return 200 with current order and private `fulfilment` projection. Unknown fields, arbitrary statuses, ownership IDs and caller timestamps are rejected. Stale version/state is 409; field validation is 422. Server UTC timestamps are authoritative. Repeated completed processing/dispatch/delivery milestones return the current record without effects, even after later progression. Repeated identical creation returns the existing shipment; conflicting creation returns 409. Ordinary draft edits require the current version and create an audit/history entry.

The service locks actor → order → shipment, with bounded PostgreSQL transaction retries. The order lock serializes different staff and payment finalization. A draft update racing dispatch invalidates the losing expected version, requiring refresh and review. Audit, status histories and durable event hooks commit with the command. No external call runs in that transaction.

## Customer and guest views

Existing owned `/api/v1/orders/{id}` and account list authorization is unchanged. Detail includes safe shipment status, provider label, tracking number/link and timestamps only after dispatch. The initial secure guest order capability still expires after its approved absolute lifetime; this phase does not renew it or introduce order-number/email access or email recovery.

The shared account/guest order UI renders only recorded milestones in an ordered list, named external tracking links and readable timestamps. Staff-only notes/evidence/audit context are excluded from customer and guest responses. The staff panel uses server action capabilities, not role-name checks. All mutation controls have labels, error association, pending states, duplicate-submission protection and focused live feedback. Existing brand tokens and responsive order layout are retained.

## Event and audit boundary

`OrderProcessingStarted`, `ShipmentCreated`, `OrderShipped`, `OrderDelivered` are durable internal journal entries unique per order/event. They are hooks for a later outbox/notification consumer, not a claim of queued or delivered email. `ShipmentUpdated` is an immutable operational history entry rather than a notification trigger. Audit actions `fulfilment.processing/create/update/ship/deliver` record actor, order, version and state; tracking change context stays in private shipment history. No request bodies, addresses, credentials or tracking links are written to application logs.
