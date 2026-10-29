# Assignment #5: Interface Between Groups - Integration Evidence

## Submission Information

| Item | Value |
|---|---|
| Our group | Team 10 |
| Our project | Maintenance |
| Partner group | Team 12 |
| Partner project | Campus Events and Clubs |
| Evidence date | 21 September 2026 |
| Time zone used in terminal evidence | UTC (`Z`) |

## Integration Summary

Team 10 integrates with Team 12 in both directions:

- Team 10 consumes Team 12's published-activities API.
- Team 10 receives Team 12's `activity.published` webhook.
- Team 10 sends `maintenance.status_changed` webhooks to Team 12.
- Team 10 exposes an authenticated partner-health endpoint for controlled availability testing.

| Interface | Method and URL | Authentication |
|---|---|---|
| Team 12 activities provider | `GET https://pd-project-events-clubs.onrender.com/partner/activities?limit=20` | `X-Partner-Key` |
| Team 10 consumer adapter | `GET https://maintenanceteam10.vercel.app/api/integrations/team12/activities` | Supabase staff bearer token |
| Team 10 partner-health provider | `GET https://maintenanceteam10.vercel.app/api/partner/health` | `X-Partner-Key` |
| Team 10 webhook receiver | `POST https://maintenanceteam10.vercel.app/api/integrations/team12/webhook` | `X-Webhook-Secret`, `X-Event-ID` |
| Team 12 webhook receiver | `POST https://pd-project-events-clubs.onrender.com/webhooks/partner` | `X-Webhook-Secret`, `X-Event-ID` |

The Team 10 sender also calculates an HMAC-SHA256 signature over the exact JSON body and sends it as `X-Webhook-Signature: sha256=<redacted>`.

## Evidence Status Summary

| Rubric item | Status from available evidence | Summary |
|---|---|---|
| 1. Consumer Proof | Complete | Partner URL, UTC request timestamp, HTTP 200, response body, and request ID are visible. |
| 2. Provider Proof | Partial | Team 10 endpoint and responses are visible, but no Team 10 internal request log or Team 12 confirmation is attached. |
| 3. Webhook Receiver | Complete with implementation context | Incoming payload, accepted response, duplicate response, and stored database row are shown. A `201` is returned only after the shared-secret check succeeds. |
| 4. Webhook Sender | Partial | Outgoing payload and Team 12 responses are shown, but the screenshot uses a direct test script rather than showing the originating work-order API action and its internal log. |
| 5. Idempotency Proof | Complete | The same event returns `201/false` and then `200/true`; Supabase shows one matching row. |
| 6. Degradation Proof | Partial | Failure and restoration timestamps plus JSON responses are shown, but an automatic retry/recovery log is not present. |

No API key, webhook secret, Supabase key, JWT, password, or service-role credential is printed in the screenshots or examples.

## 1. Consumer Proof

### Request

```http
GET https://pd-project-events-clubs.onrender.com/partner/activities?limit=20
X-Partner-Key: <redacted>
Accept: application/json
```

### Primary captured result

| Evidence | Captured value |
|---|---|
| Request timestamp | `2026-09-21T12:25:57.0625821Z` |
| HTTP status | `200` |
| Response request ID | `362f2309-030c-4aef-b046-de5b465a5a9e` |
| Response generated time | `2026-09-21T12:25:57.869Z` |
| Response summary | Published Team 12 activities, including Campus Welcome Event and Backend Workshop |

![Primary Team 12 consumer request showing URL, timestamp, status 200, and response body](evidence/a5/01-consumer-primary.png)

### Repeated successful request

A second captured request returned another successful response and a different correlation ID.

| Evidence | Captured value |
|---|---|
| Request timestamp | `2026-09-21T12:26:11.5147222Z` |
| HTTP status | `200` |
| Response request ID | `2565d16e-057c-4a26-a457-aa591b3fabc2` |
| Response generated time | `2026-09-21T12:26:11.870Z` |

![Second successful Team 12 consumer request](evidence/a5/01-consumer-secondary.png)

The following earlier capture is supporting evidence of the same successful provider response:

![Supporting Team 12 consumer response](evidence/a5/01-consumer-supporting.png)

Confirmation prepared for Team 12:

```text
Team 10 successfully consumed Team 12's endpoint at
2026-09-21T12:25:57.0625821Z.
Request ID: 362f2309-030c-4aef-b046-de5b465a5a9e
```

## 2. Provider Proof

Team 10 exposes this authenticated provider endpoint:

```http
GET https://maintenanceteam10.vercel.app/api/partner/health
X-Partner-Key: <redacted>
```

The captured degraded response proves the deployed endpoint was externally reachable and enforcing the configured degradation state.

| Evidence | Captured value |
|---|---|
| Request timestamp | `2026-09-21T15:18:54.9106775Z` |
| HTTP status | `503` |
| Error code | `PARTNER_UNAVAILABLE` |
| Message | `Maintenance partner health check is temporarily unavailable` |

```json
{
  "error": {
    "code": "PARTNER_UNAVAILABLE",
    "message": "Maintenance partner health check is temporarily unavailable"
  }
}
```

![Team 10 provider endpoint returning the controlled unavailable response](evidence/a5/02-provider-degraded.png)

The restored deployment later returned `200` with the service-health body below. The recovery screenshot does not display the complete requested URL, so it is treated as service-restoration evidence rather than proof that Team 12 called the provider endpoint.

| Evidence | Captured value |
|---|---|
| Restoration timestamp | `2026-09-21T15:25:54.4152953Z` |
| HTTP status | `200` |
| Response | `{"status":"ok","service":"maintenance-team10-api"}` |

![Team 10 deployment restored and returning status 200](evidence/a5/02-provider-restored.png)

### Remaining provider-proof evidence

This section is not complete under the rubric because the available screenshots do not show:

1. an internal Team 10 request/access log for a successful partner request; and
2. a Team 12 message confirming that Team 12 called the Team 10 endpoint.

## 3. Webhook Receiver

Team 12 sends `activity.published` events to:

```http
POST https://maintenanceteam10.vercel.app/api/integrations/team12/webhook
Content-Type: application/json
X-Webhook-Secret: <redacted>
X-Event-ID: <event-id>
```

The first captured request used event ID `team12-test-a057b4c1-677c-4791-828d-58d4f1615df0`. The incoming body contained an `activity.published` event for the Campus Welcome Event. It was accepted at `2026-09-21T13:17:47.6549185Z` with HTTP `201`.

```json
{
  "received": true,
  "duplicate": false,
  "eventId": "team12-test-a057b4c1-677c-4791-828d-58d4f1615df0"
}
```

![First accepted Team 12 webhook delivery](evidence/a5/03-webhook-receiver-first.png)

The same event ID was sent again at `2026-09-21T13:18:08.9690363Z`. The receiver returned HTTP `200` and identified it as a duplicate.

```json
{
  "received": true,
  "duplicate": true,
  "eventId": "team12-test-a057b4c1-677c-4791-828d-58d4f1615df0"
}
```

![Repeated Team 12 webhook delivery identified as a duplicate](evidence/a5/03-webhook-receiver-duplicate.png)

The receiver checks `X-Webhook-Secret` with a timing-safe comparison before reading or storing the body. An invalid secret returns `401 INVALID_WEBHOOK_SECRET`; therefore, the captured `201` accepted response demonstrates that the supplied secret passed verification. The secret value itself is not displayed.

The stored-row evidence appears in Section 5. It uses another `activity.published` test event and shows the same receiver storing exactly one row in `public.partner_webhook_events`.

## 4. Webhook Sender

Team 10 sends this event type to Team 12:

```json
{
  "id": "a95db2cc-99b2-4e23-ba2e-979319ef7538",
  "type": "maintenance.status_changed",
  "occurredAt": "2026-09-21T14:55:52.6173967Z",
  "data": {
    "workOrderId": "88888888-8888-4888-8888-888888888888",
    "fromStatus": "OPEN",
    "toStatus": "ASSIGNED"
  }
}
```

The direct sender test calculated the HMAC-SHA256 signature, sent the shared-secret and event-ID headers, and posted the body to Team 12's receiver.

| Attempt | Timestamp | HTTP status | Duplicate | Partner request ID |
|---|---|---|---|---|
| First | `2026-09-21T15:01:11.9626252Z` | `201` | `false` | `ce850655-28d2-42c9-9041-677b1f7a834f` |
| Second | `2026-09-21T15:01:13.2203466Z` | `200` | `true` | `4b2605ed-0882-4af0-b575-fb6335f2f4b4` |

![Team 10 outgoing webhook payload and successful Team 12 responses](evidence/a5/04-webhook-sender-partner-response.png)

The application implementation calls the same sender after successful work-order transitions in these route handlers:

- `POST /api/work-orders/{id}/assign`: `OPEN` to `ASSIGNED`
- `POST /api/work-orders/{id}/in-progress`: `ASSIGNED` to `IN_PROGRESS`
- `POST /api/work-orders/{id}/resolve`: `IN_PROGRESS` to `RESOLVED`
- `POST /api/work-orders/{id}/close`: `RESOLVED` to `CLOSED`

### Remaining webhook-sender evidence

The screenshot proves the outgoing contract and partner response, but the available evidence does not show a real work-order transition request followed by the matching internal `Team 12 webhook delivered` log. That correlated trigger/log capture is still required for strict completion of the rubric item.

## 5. Idempotency Proof

The receiver was called twice with the exact same event ID and payload:

```text
idempotency-67c52653-66d4-4d8c-9422-a1f5d0917f34
```

| Evidence | First request | Second request |
|---|---|---|
| Timestamp | `2026-09-21T13:32:04.6822960Z` | `2026-09-21T13:32:08.7668184Z` |
| Event ID | Same ID | Same ID |
| HTTP status | `201` | `200` |
| `received` | `true` | `true` |
| `duplicate` | `false` | `true` |

![First and second idempotency requests with the same event ID](evidence/a5/05-idempotency-two-requests.png)

The Supabase query returned one matching row in `public.partner_webhook_events`:

| Database field | Captured value |
|---|---|
| `event_id` | `idempotency-67c52653-66d4-4d8c-9422-a1f5d0917f34` |
| `event_type` | `activity.published` |
| `matching_rows` | `1` |
| `received_at` | `2026-09-21 13:32:08.761924+00` |

![Supabase query proving only one row exists for the repeated event ID](evidence/a5/05-idempotency-database-row.png)

The single-row result is also enforced by the primary key on `partner_webhook_events.event_id`. A repeated event is acknowledged but is not inserted a second time.

## 6. Degradation Proof

The controlled degradation request returned a timestamped JSON failure from Team 10:

| Evidence | Captured value |
|---|---|
| Breakage timestamp | `2026-09-21T15:18:54.9106775Z` |
| HTTP status | `503` |
| Fallback/error JSON | `PARTNER_UNAVAILABLE` |

![Controlled degradation response from Team 10](evidence/a5/02-provider-degraded.png)

The deployment later returned a healthy response:

| Evidence | Captured value |
|---|---|
| Restoration timestamp | `2026-09-21T15:25:54.4152953Z` |
| HTTP status | `200` |
| Body | `{"status":"ok","service":"maintenance-team10-api"}` |

![Restored Team 10 deployment returning status 200](evidence/a5/02-provider-restored.png)

A separate dependency-failure exercise recorded a DNS failure for an intentionally invalid partner host at `2026-09-21T13:42:32.6810972Z`, followed by a successful Team 12 health response at `2026-09-21T13:42:32.7337527Z`.

![Partner dependency failure and subsequent health recovery](evidence/a5/06-dependency-failure-recovery.png)

The Team 10 consumer implementation performs bounded attempts with delays of 0, 1, and 2 seconds and logs `recovered: true` if a later attempt succeeds. However, none of the supplied screenshots shows that internal automatic-retry log. The screenshots demonstrate failure and later restoration, but they must not be described as proof of automatic recovery.