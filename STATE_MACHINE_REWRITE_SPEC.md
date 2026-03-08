# Chatbot State Machine Rewrite Spec

## Purpose

This document defines the cleaned conversation architecture for the BimaSathi bot.
It replaces the current mixed state machine with a single canonical model.

Goals:

- one runtime state machine only
- one source of truth for all states
- exact resume behavior, not heuristic resume
- safe navigation in every state
- consistent save, menu, back, abandon, language change, and help behavior
- no hidden string-only states outside constants
- no duplicated handlers
- no hardcoded mixed-language prompts inside state handlers

## Non-Negotiable Rules

1. Every reachable state must be declared in `src/shared/constants.js`.
2. Every declared state must have exactly one handler.
3. A state handler may only mutate the context keys it owns.
4. All user-facing content is authored in English and localized in one output layer.
5. `back` restores a checkpointed prompt/context pair. It must not re-run a prior handler with empty text.
6. `save and exit` persists the current draft state and returns to `MAIN_MENU`.
7. `abandon` must always go through an explicit confirmation state before deleting the active draft.
8. `resume` must restore the saved draft state directly from claim/session data.
9. `skip` is only valid for optional fields and must be rejected everywhere else.
10. Parallel inbound messages must not corrupt session state or claim counters.

## Canonical State Set

These are the target states for the cleaned bot.

| Target State | Keep / Add / Rename | Current Source | Purpose |
| --- | --- | --- | --- |
| `WELCOME` | Keep | `WELCOME` | First contact only. Shows intro and immediately routes to language selection. |
| `LANGUAGE_SELECT` | Keep | `LANGUAGE_SELECT` | Choose or change language. Must preserve active claim context. |
| `MAIN_MENU` | Keep | `MAIN_MENU` | Main routing surface for new claim, status, drafts, helper mode, query bot, premium calculator, language change. |
| `CLAIM_HUB` | Keep | `CLAIM_HUB` | Overview of one active claim and progress across sections. |
| `CLAIM_FARMER_DETAILS` | Rename | `LOSS_REPORT_START` | Collect farmer name, village, district, state, and any missing identity/location basics. |
| `CLAIM_CROP_DETAILS` | Rename | `CROP_DETAILS` | Collect crop, season, cause, affected area, policy type if needed. |
| `CLAIM_DATE_LOCATION` | Rename | `DATE_LOCATION` | Collect loss date and exact location, including WhatsApp shared location. |
| `CLAIM_DOCUMENTS` | Rename | `DOCUMENT_INTAKE` | Upload optional documents, review what was received, and continue when done. |
| `CLAIM_MISSING_FIELDS` | Rename | `SCHEMA_COLLECTION` | Fill required missing fields extracted from forms or business rules. |
| `CLAIM_PHOTOS` | Rename | `PHOTO_EVIDENCE` | Upload and verify damage photos until minimum evidence is met. |
| `CLAIM_REVIEW` | Rename | `REVIEW_CONFIRM` | Show final summary, allow edit, submit, or cancel back to hub. |
| `STATUS_LIST` | Add | split from `TRACK_STATUS` | Show selectable list of claims for the current farmer. |
| `STATUS_DETAIL` | Add | split from `TRACK_STATUS` | Show one claim’s details, next actions, and rejection-specific options. |
| `DRAFT_RESUME_LIST` | Add | split from `RESUME_DRAFT` | Show selectable saved drafts to resume. |
| `DRAFT_DELETE_LIST` | Add | split from `DELETE_DRAFTS` | Show selectable drafts to delete. |
| `DISCARD_CLAIM_CONFIRM` | Add | none | Confirm abandon/delete for the active claim. |
| `QUERY_BOT` | Keep but formalize | `QUERY_BOT` | Free-form insurance Q&A, isolated from claim filing. |
| `PREMIUM_CALCULATOR` | Rename | `PREMIUM_CALCULATOR_START` | Multi-step premium estimate flow. |
| `HELPER_PHONE_CAPTURE` | Add | split from `HELPER_MODE` | Ask helper for farmer phone number. |
| `HELPER_OTP_VERIFY` | Add | split from `HELPER_MODE` | Verify farmer OTP and establish helper context. |
| `OPERATOR_HANDOFF` | Rename | `OPERATOR_BRIDGE` | Persist escalation, explain next steps, and allow return. |
| `APPEAL_START` | Rename | `APPEAL_FLOW` | Start appeal only from a rejected claim detail view. |
| `ERROR_RECOVERY` | Rename | `ERROR_STATE` | Graceful recovery state that returns user to a safe location. |

## States To Delete Completely

These should not survive the rewrite.

| State / Concept | Delete Reason |
| --- | --- |
| `AUTH_OTP` | Dead state. Declared but not used in the actual flow. |
| `VOICE_INPUT` | Voice is an input modality, not a user-visible state. |
| legacy duplicate handlers in `conversation-engine/index.js` | They are dead code and create false behavior assumptions. |
| string-only ad hoc states not declared in constants | Hidden states break traceability and tests. |
| legacy “build document” company flow baked into main claim flow | This is a second completion architecture and should not block claim submission. |

## States To Remove From The Filing State Machine

These can exist as background jobs or future features, but should not stay as interactive claim-filing states in the rewrite.

| Current State | Decision | Replacement |
| --- | --- | --- |
| `COMPANY_SELECT` | Remove from chat filing path | Determine template or insurer after submission or in operator workflow |
| `TEMPLATE_FILL` | Remove from chat filing path | Missing form fields belong in `CLAIM_MISSING_FIELDS` |

## Required Context Model

Session state must be minimal and explicit.

```json
{
  "phoneNumber": "plain phone",
  "language": "en|hi|mr|te|ta|gu|kn",
  "state": "CANONICAL_STATE",
  "revision": 1,
  "history": [
    {
      "state": "PRIOR_STATE",
      "promptKey": "prompt identifier",
      "checkpoint": {}
    }
  ],
  "context": {
    "activeClaimId": "BMS-2026-1234",
    "actorPhone": "helper or farmer phone",
    "farmerPhone": "actual farmer phone",
    "userId": "farmer user id",
    "helperMode": false,
    "helperPhone": null,
    "cachedPrompt": null,
    "sectionStep": null
  }
}
```

Claim draft state must live on the claim record, not only in the conversation session.

```json
{
  "claimId": "BMS-2026-1234",
  "status": "Draft",
  "draftState": "CLAIM_DATE_LOCATION",
  "draftCheckpoint": {},
  "intake": {},
  "documentCount": 0,
  "photoCount": 0,
  "approvedPhotoCount": 0,
  "pendingFields": [],
  "selectedStatusClaimId": null
}
```

## Global Commands

These commands must be centrally handled before state dispatch.

| Command | Allowed In | Behavior |
| --- | --- | --- |
| `back` | All states except `WELCOME` | Restore previous checkpoint and replay cached prompt. |
| `repeat` | All states | Replay current cached prompt without mutating state. |
| `menu` | All states except `WELCOME` and `LANGUAGE_SELECT` | Save active draft if one exists, then go to `MAIN_MENU`. |
| `save and exit` | Any active-claim state | Persist draft and go to `MAIN_MENU`. |
| `change language` | All states | Go to `LANGUAGE_SELECT`, preserve active claim context, then return to prior state after selection. |
| `help` | All states | Route to `OPERATOR_HANDOFF`, preserving current claim context. |
| `abandon` | Active-claim states only | Go to `DISCARD_CLAIM_CONFIRM`. |
| `skip` | Only optional-field states | Mark field skipped, move to next field in same section. |
| `done` | Upload/list states only | Complete that section if requirements are satisfied. |
| `exit helper mode` | Any state while `helperMode = true` | Clear helper context and return to `MAIN_MENU`. |

## Canonical Transition Table

### Entry and Menu Flow

| From | Input / Event | To | Notes |
| --- | --- | --- | --- |
| `WELCOME` | initial contact | `LANGUAGE_SELECT` | No branching. |
| `LANGUAGE_SELECT` | valid language | `MAIN_MENU` | Persist language and replay menu in selected language. |
| `MAIN_MENU` | `1` or file-claim intent | `CLAIM_HUB` | Create or reuse one active draft after duplicate-draft check. |
| `MAIN_MENU` | `2` or status intent | `STATUS_LIST` | List claims for current farmer. |
| `MAIN_MENU` | `3` or resume intent | `DRAFT_RESUME_LIST` | List drafts. |
| `MAIN_MENU` | `4` or delete-draft intent | `DRAFT_DELETE_LIST` | List drafts. |
| `MAIN_MENU` | `5` or query intent | `QUERY_BOT` | No claim mutation. |
| `MAIN_MENU` | `6` or premium intent | `PREMIUM_CALCULATOR` | Start calculator flow. |
| `MAIN_MENU` | `7` or helper intent | `HELPER_PHONE_CAPTURE` | Start helper consent flow. |
| `MAIN_MENU` | `8` or change-language intent | `LANGUAGE_SELECT` | Preserve current identity context. |

### Claim Filing Flow

| From | Input / Event | To | Notes |
| --- | --- | --- | --- |
| `CLAIM_HUB` | choose farmer section | `CLAIM_FARMER_DETAILS` | Resume from exact missing field in section. |
| `CLAIM_HUB` | choose crop section | `CLAIM_CROP_DETAILS` | Resume from exact missing field in section. |
| `CLAIM_HUB` | choose date/location section | `CLAIM_DATE_LOCATION` | Resume from exact missing field in section. |
| `CLAIM_HUB` | choose documents | `CLAIM_DOCUMENTS` | Documents are optional. |
| `CLAIM_HUB` | choose missing details | `CLAIM_MISSING_FIELDS` | Only if pending required fields exist. |
| `CLAIM_HUB` | choose photos | `CLAIM_PHOTOS` | Only after crop and date/location are complete. |
| `CLAIM_HUB` | choose review | `CLAIM_REVIEW` | Only if all required non-photo fields and minimum photos are complete. |
| `CLAIM_HUB` | save and exit | `MAIN_MENU` | Persist exact draft state as `CLAIM_HUB`. |
| `CLAIM_HUB` | abandon | `DISCARD_CLAIM_CONFIRM` | Never delete immediately. |
| `CLAIM_FARMER_DETAILS` | section complete | `CLAIM_HUB` | Persist exact checkpoint. |
| `CLAIM_CROP_DETAILS` | section complete | `CLAIM_HUB` | Persist exact checkpoint. |
| `CLAIM_DATE_LOCATION` | section complete | `CLAIM_HUB` | Accept typed location or WhatsApp location share. |
| `CLAIM_DOCUMENTS` | `done` | `CLAIM_HUB` | Keep uploaded documents and doc count. |
| `CLAIM_DOCUMENTS` | insurance form extracted with required missing fields | `CLAIM_MISSING_FIELDS` | Optional fast-path after user accepts “continue to missing details”. |
| `CLAIM_MISSING_FIELDS` | all required fields complete | `CLAIM_HUB` | Do not reset photo counters. |
| `CLAIM_PHOTOS` | minimum approved photos reached and user says `done` or auto-complete enabled | `CLAIM_HUB` | Preserve exact counts from DB. |
| `CLAIM_REVIEW` | edit | `CLAIM_HUB` | Return to hub, not to an orphan edit state. |
| `CLAIM_REVIEW` | submit | `MAIN_MENU` | Persist submitted state, clear draft state, send async claim doc when ready. |
| `DISCARD_CLAIM_CONFIRM` | confirm | `MAIN_MENU` | Delete only active claim. |
| `DISCARD_CLAIM_CONFIRM` | cancel | `CLAIM_HUB` | Restore claim hub. |

### Draft Flow

| From | Input / Event | To | Notes |
| --- | --- | --- | --- |
| `DRAFT_RESUME_LIST` | choose draft | saved `draftState` | Must resume exact saved draft state and checkpoint. |
| `DRAFT_DELETE_LIST` | choose draft | `MAIN_MENU` | Delete only selected draft, then show menu. |

### Status and Appeal Flow

| From | Input / Event | To | Notes |
| --- | --- | --- | --- |
| `STATUS_LIST` | choose claim | `STATUS_DETAIL` | Persist selected claim id in state context only. |
| `STATUS_DETAIL` | back | `STATUS_LIST` | Return to the list, not main menu. |
| `STATUS_DETAIL` | rejected claim and choose appeal | `APPEAL_START` | Appeal only for rejected claims. |
| `STATUS_DETAIL` | menu | `MAIN_MENU` | Standard behavior. |
| `APPEAL_START` | confirm appeal creation | `STATUS_DETAIL` | Generate appeal job and return to claim detail. |

### Helper, Query, Premium, Support

| From | Input / Event | To | Notes |
| --- | --- | --- | --- |
| `HELPER_PHONE_CAPTURE` | valid farmer phone | `HELPER_OTP_VERIFY` | Send OTP to farmer. |
| `HELPER_OTP_VERIFY` | valid OTP | `MAIN_MENU` | Set helper context and act on behalf of farmer. |
| `QUERY_BOT` | free-form question | `QUERY_BOT` | Stay in bot until menu/help/back. |
| `PREMIUM_CALCULATOR` | flow complete | `MAIN_MENU` | Show estimate, then menu. |
| `OPERATOR_HANDOFF` | handoff created | previous safe state or `MAIN_MENU` | Depends on whether escalation is blocking or non-blocking. |
| `ERROR_RECOVERY` | recovery message sent | `MAIN_MENU` or previous safe state | Must not leave stale corrupted context behind. |

## Section Ownership Rules

Each section owns a bounded set of fields.

| State | Owned Fields |
| --- | --- |
| `CLAIM_FARMER_DETAILS` | `farmer_name`, `village`, `district`, `state`, farmer identity basics |
| `CLAIM_CROP_DETAILS` | `crop_type`, `season`, `cause`, `area_hectares`, `policy_type` |
| `CLAIM_DATE_LOCATION` | `loss_date`, `gps_coords`, normalized location metadata, deadline |
| `CLAIM_DOCUMENTS` | `documentsReceived`, `documentCount` |
| `CLAIM_MISSING_FIELDS` | `pendingFields`, field statuses, extracted form values |
| `CLAIM_PHOTOS` | `photoCount`, `approvedPhotoCount`, photo verification state |
| `CLAIM_REVIEW` | no new intake fields; only review/edit/submit decision |

No other state may directly mutate those fields except central persistence helpers.

## Resume Rules

Resume must use `claim.draftState` and `claim.draftCheckpoint`.

Do not:

- infer progress from partially filled fields
- guess the next state from photos/documents heuristics
- drop the user into `CLAIM_HUB` unless the saved draft state was actually `CLAIM_HUB`

Resume algorithm:

1. Load claim by selected draft id.
2. Load `draftState` and `draftCheckpoint`.
3. Hydrate fresh counters from DB.
4. Reconstruct the state context from the checkpoint.
5. Replay that state’s cached prompt.

## Navigation Semantics

### Back

- uses last checkpoint only
- restores prior state, prompt key, and checkpoint
- never re-submits empty text into the old handler

### Save And Exit

- allowed in any active-claim state
- writes exact `draftState` and `draftCheckpoint`
- keeps claim data intact
- returns to `MAIN_MENU`

### Abandon

- always opens `DISCARD_CLAIM_CONFIRM`
- delete occurs only after explicit confirmation
- deletes only the active draft, not all drafts

### Menu

- if claim exists, auto-save exact current state
- if no active claim exists, just route to `MAIN_MENU`

## Localization Rules

1. State handlers emit English semantic messages only.
2. `_Send_Engine_Messages` is the only localization layer.
3. List button text, section headers, and navigation hints must also be localized.
4. `languages.js` should no longer contain an alternate old menu architecture that disagrees with the live menu.

## Media and Evidence Rules

1. Voice notes are processed before state dispatch and must not map to a separate visible state.
2. WhatsApp shared location must populate the same normalized GPS shape used everywhere else.
3. Photo progress must come from atomic DB counters, not session guesses.
4. Document classification output must use one field name only: `documentType`.

## Implementation Order

### Phase 1: State Machine Cleanup

- remove dead legacy engine block
- remove duplicate state handlers
- formalize all remaining states in constants
- create one state registry and one transition map

### Phase 2: Navigation and Persistence

- implement central command handler
- replace recursive `_stateHistory` snapshots with bounded checkpoints
- persist `draftState` and `draftCheckpoint`
- version or patch conversation updates to prevent overwrites

### Phase 3: Claim Journey Rewrite

- rename and re-scope filing states
- move all missing-field collection into `CLAIM_MISSING_FIELDS`
- remove company/template branch from primary submission path
- add explicit `DISCARD_CLAIM_CONFIRM`

### Phase 4: Status, Appeal, Helper, Support

- split `TRACK_STATUS` into list/detail
- wire real `APPEAL_START`
- split helper mode into phone capture and OTP verify
- make operator handoff stateful

### Phase 5: Localization and Tests

- centralize localization
- localize WhatsApp list chrome
- add transition tests for every state and global command
- add concurrency tests for simultaneous photo uploads and overlapping inbound messages

## Acceptance Criteria

The rewrite is complete only when all of the following are true:

- every state is declared once and handled once
- no hidden string-only states remain
- `back`, `repeat`, `menu`, `save and exit`, `abandon`, `change language`, and `help` work in every supported context
- resume returns the user to the exact saved state
- deleting drafts deletes only the selected draft
- active claim abandon deletes only the active claim after confirmation
- photo uploads remain correct under parallel inbound images
- review is impossible while required fields are still pending
- all visible prompts in a non-English session are localized consistently
