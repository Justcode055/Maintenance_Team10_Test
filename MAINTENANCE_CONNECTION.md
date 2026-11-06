# Maintenance connection and Team 10 handoff

Updated 2026-11-06. This describes implemented behavior and the remaining partner
agreement; it does not claim a new live Team 10 request was created or tested.

## Where it appears

**Create/Edit activity → Facilities support (optional)** saves private Organizer
requirements such as a projector, microphones or room setup. These are notes in
Campus Pulse. Saving/publishing does not create a maintenance work order or reserve
a venue. The form review summary explicitly says no request was sent.

**Organizer → My activities → activity title → Facilities support** shows those
notes, an existing linked work-order ID, its latest received status and update
time. It handles no linked request, waiting for an update, disabled webhook
configuration, uncertain status, loading, network error and refresh/retry.
Students, Admins and other Organizers cannot access this private panel/API.

## Existing integration and the new link

1. Publishing still queues the existing `activity.published` notification in the
   same transaction as publication. Its current data is activity ID, title, type,
   start time, location and published status. Facilities notes/capacity/new timing
   fields are not silently added to Team 10's payload.
2. Team 10's existing `maintenance.status_changed` webhook carries a work-order
   ID and status transition. Our receiver verifies `X-Webhook-Secret`, validates
   the envelope, stores the inbox event, and projects a bounded latest status in
   the same transaction. Duplicate deliveries are idempotent; conflicting event
   IDs retain the existing 409 behavior.
3. An operator confirms which **existing real work order** belongs to which
   published activity, then records that association with server credentials.
   No association is inferred from event title, location or an arbitrary incoming
   `activityId`. Ordinary users cannot link other work orders to their events.
4. The owning Organizer refreshes the activity's panel to see the received status.
   An update received before linking can be shown after its trusted association.
   This status is a received snapshot, not current room availability or a booking
   guarantee. A disabled local webhook can still display previously stored data.

The local `npm run dev:api` launcher deliberately disables partner integrations.
It will report updates disabled, and it will not call Team 10 on publication.
Deployment must use the existing persistent API with its privately configured
integration credentials/URLs. No worker migration or external call was performed
for this implementation. Earlier supplied exchange evidence is separate:
[A5 integration evidence](A5-Team12-Integration-Evidence.md).

## Trusted operator setup

Obtain the activity document ID from its URL and confirm the work-order ID with
the campus coordinator/Team 10. Use the existing server-only Firebase setup:

```sh
npm run maintenance:link -- --activity ACTIVITY_ID --work-order WORK_ORDER_ID
```

This defaults to a dry run. Verify the project and both IDs, then explicitly apply:

```sh
npm run maintenance:link -- --activity ACTIVITY_ID --work-order WORK_ORDER_ID --apply
```

The tool requires an existing PUBLISHED/CLOSED activity. Links and reverse claims
are transactional, unique and idempotent; it rejects a work order already bound to
another activity or replacement of an established link. No arbitrary relinking,
unlinking, work-order creation or public role/status management endpoint is added.
It makes no request to Team 10. It was tested only against demo emulators; no real
project link has been created during this work.

Private collections are `maintenanceBindings/{activityId}`,
`maintenanceWorkOrderLinks/{sha256(workOrderId)}` and
`maintenanceWorkOrders/{sha256(workOrderId)}`. Direct browser access stays denied.
The API exposes only the owner's work-order ID, bounded status and timestamps,
never integration logs, secret headers or the complete webhook payload.

## Message/questions for Team 10

We want optional facilities support while an Organizer creates a campus activity.
Our current publish notification announces the event; we want to agree on a
separate work-order creation/association flow before sending facilities notes.

- Do you offer a create-work-order endpoint? Please provide method/path, required
  fields, allowed equipment/support categories, response and error examples.
- Can a request carry our stable `activityId`, and will you return your
  `workOrderId`? Who verifies the association and handles incorrect links?
- What authentication, authorization and idempotency-key rules should our
  **backend** use? Share credentials privately, not in docs/chat/source.
- Which statuses are supported? Can status webhooks include a monotonic version
  or sequence, unique event ID and timezone-qualified occurrence time? We
  currently flag equal-millisecond conflicting updates as uncertain.
- How are rejected requests, cancellation, activity rescheduling and venue changes
  handled? How does facility availability differ from an actual room reservation?
- What isolated/sandbox endpoint can both teams use for a coordinated test,
  including retries, duplicate deliveries and an unavailable partner?

Until that agreement exists, Campus Pulse saves requirements and displays trusted
linked status only. No guessed endpoint, automatic approval or “request sent”
claim is added. A future extension should reuse the persistent outbox/idempotency
pattern after the creation contract and data-sharing rules are confirmed.

## Verification boundaries

The backend emulator suite exercises secret rejection, accepted/duplicate/older
updates, equal-time conflicts, trusted link uniqueness, owner-only reads and
ignored untrusted correlation claims. The browser test uses a guarded local
fixture process to link a demo event and invoke the actual receiver projection;
it creates no real work order and makes no partner HTTP call. API tests separately
exercise the actual HTTP webhook receiver. No current production connectivity,
real-user facilities request or cross-team acceptance is claimed.
