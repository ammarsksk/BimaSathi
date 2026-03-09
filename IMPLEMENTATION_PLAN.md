# Operator Dashboard Implementation Plan

## 1. Purpose

Build an operator-facing dashboard that allows a BimaSathi official to assist a farmer with the same claim lifecycle that already exists in the chatbot, but through a UI instead of WhatsApp chat.

The dashboard must:

- let an operator authenticate and enter the system
- let the operator access a farmer only after farmer consent is confirmed
- let the operator view and edit the same claim data the chatbot uses
- reflect all changes both ways between chatbot and dashboard
- support operator-driven claim completion, review, submission, appeal, and follow-up
- avoid changing chatbot behavior or making the dashboard the source of truth

The chatbot remains the primary conversational surface. The operator dashboard becomes an alternate UI on top of the same underlying claim, user, consent, audit, and document records.

## 2. Product Principles

- Shared source of truth: claims, documents, form schema, identity verification, photos, deadlines, and audit logs stay in the existing backend tables.
- Operator is an assisted actor, not a separate claim owner.
- Farmer consent is mandatory before operator claim access.
- Every operator action must be auditable.
- Dashboard flow should mirror chatbot stages where possible, but use richer UI instead of conversation prompts.
- No voice input or voice interpretation is needed on the operator side.

## 3. Current Bot Capability Inventory To Bring Into Dashboard

These already exist in the bot/backend and should be surfaced in operator UI instead of rebuilt from scratch:

### 3.1 Claim lifecycle

- create new claim draft
- resume draft
- delete draft
- abandon draft
- save draft
- complete farmer details
- complete crop details
- complete date/location
- upload and validate supporting documents
- identity verification from uploaded documents
- collect missing schema fields
- upload and validate photo evidence
- select insurer form template
- generate insurer form
- review and submit claim
- status tracking
- appeal generation
- deadline reminders and stalled-claim re-engagement

### 3.2 Validation and automation

- claim completeness checks
- deadline calculation
- photo AI validation
- identity matching from documents
- form schema generation for insurer templates
- PDF generation
- audit logging

### 3.3 Existing dashboard/backend pieces

- operator dashboard shell
- dashboard login flow
- claims queue
- claim detail page
- analytics page
- operator API lambda

These are currently shallow and need to be expanded to cover the bot’s real workflow.

## 4. Target Operator Role Model

The operator’s main job is not only reviewing submitted claims. The operator should be able to act as a guided assisted-filing agent for a farmer.

Two operator modes are needed:

### 4.1 Queue mode

Used for:

- reviewing claims already visible to the operator queue
- triaging urgency
- checking evidence
- submitting or escalating
- handling stalled claims
- reviewing rejected claims and appeals

### 4.2 Assisted filing mode

Used for:

- starting a claim on behalf of a farmer
- resuming the farmer’s existing chatbot claim
- completing missing sections
- correcting invalid data
- uploading missing evidence
- generating insurer forms
- helping the farmer reach submission

This assisted filing mode is the main new surface.

## 5. Consent and Access Control Model

This is the core functional requirement.

An operator must not automatically see or edit a farmer’s claims just by typing the farmer’s phone number.

### 5.1 Required flow

1. Operator logs into dashboard.
2. Operator enters the farmer phone number.
3. System checks whether valid consent already exists.
4. If no consent exists:
   - send a consent request to the farmer’s BimaSathi WhatsApp chat
   - optionally send an OTP to the farmer phone as a second factor
5. Farmer confirms from their own BimaSathi chat.
6. Consent is recorded in the shared consent table.
7. Operator gains scoped access to that farmer’s claims for a limited session window.

### 5.2 Consent states

- `not_requested`
- `pending_farmer_confirmation`
- `otp_sent`
- `verified`
- `expired`
- `revoked`

### 5.3 Access rules

- operator can only see farmers they have valid consent for
- operator access should be farmer-scoped, not global-edit by default
- consent must be auditable with actor, timestamp, channel, and expiry

## 6. Shared State Strategy

The dashboard must not create a parallel claim engine.

### 6.1 Source of truth

Keep using:

- claims table
- conversations table where needed for session recovery
- users table
- consents table
- documents and photos in S3
- form schema on the claim
- audit log records

### 6.2 Dashboard editing model

The dashboard should edit claim fields directly through backend APIs using the same field names the chatbot uses.

That means:

- farmer details edited in dashboard update the same fields chatbot reads
- missing fields completed in dashboard clear the same pending schema entries
- uploaded documents/photos on dashboard count for chatbot too
- claim status changes by operator appear in chatbot status tracking

### 6.3 Session boundaries

Do not reuse chatbot conversational session state for operator UI navigation.

Use:

- shared claim data
- shared draft state metadata where meaningful
- independent dashboard UI state locally in the browser

The dashboard should not depend on chatbot cached prompts.

## 7. Operator Dashboard Information Architecture

### 7.1 Main areas

- Dashboard Home
- Claim Queue
- Claim Workspace
- Farmer Access / Consent Center
- Appeals
- Documents & Forms
- Analytics
- Operator Activity / Audit

### 7.2 Claim Workspace tabs

Each claim should open into a workspace with tabs:

- Overview
- Farmer
- Crop
- Date & Location
- Documents
- Identity Verification
- Missing Fields
- Photos
- Insurer Form
- Review & Submit
- Status & Timeline
- Audit Log

This mirrors the bot flow while making editing explicit and structured.

## 8. Detailed Feature Plan

### 8.1 Authentication and operator access

#### Phase 1

- reliable operator login
- fallback OTP for deployment/testing
- proper logout/session restore

#### Phase 2

- real OTP only
- role-based access enforcement
- JWT validation in operator API

### 8.2 Farmer lookup and consent

Add a new operator flow:

- search farmer by phone number
- show whether farmer exists
- show whether consent exists
- if no consent:
  - trigger farmer approval on WhatsApp
  - show consent pending status in dashboard
- once verified:
  - open farmer profile and claims

UI needed:

- Farmer phone lookup form
- Consent status card
- Pending consent timeline
- Retry / revoke / refresh actions

Backend needed:

- operator API routes for:
  - request access
  - get consent status
  - list accessible farmers
  - revoke access

### 8.3 Claims queue improvements

Current queue is generic and shallow.

Need:

- filters persisted in URL
- urgency sort
- search by farmer, claim ID, village, crop
- claim ownership/access scoping
- separate tabs for:
  - my assisted claims
  - waiting for operator
  - stalled drafts
  - rejected / appealable
  - ready to submit

### 8.4 Claim workspace editing

The operator must be able to do every claim-completion task the bot does.

#### Farmer section

- edit farmer name
- edit village, district, state
- see identity verification state
- if farmer name changes, force re-verification

#### Crop section

- crop type
- season
- cause
- area
- policy type

#### Date/location section

- loss date
- exact location text
- map pin if GPS exists
- manual correction UI

#### Documents section

- upload PDF/image documents
- show classification result
- show extracted fields
- reject invalid identity docs
- prevent document acceptance if farmer name mismatch
- show verification status and reason

#### Missing fields section

- render pending schema fields from `formSchema`
- support text, number, date, and choice widgets
- show source of prefilled values
- allow operator override with audit entry

#### Photos section

- upload crop damage photos
- show AI result per photo
- show approved/rejected counts
- retry/delete photo
- surface confidence and reason

#### Insurer form section

- choose SBI or ICICI Lombard
- show template readiness
- show prefilled values
- ask only pending template fields
- generate insurer form PDF
- preview/download generated PDF

#### Review & submit section

- section completion summary
- blockers list
- identity verified status
- document count
- approved photo count
- template status
- submit action

### 8.5 Operator-assisted creation

Add a new operator flow:

- create claim for farmer
- choose whether to open existing draft or create new
- step through the same sections as bot flow
- save at any time
- pick up where chatbot left off

This is separate from queue review. This is the UI equivalent of chatbot filing.

### 8.6 Status and appeal operations

Add:

- claim timeline view
- insurer acknowledgement tracking
- rejection reason view
- appeal eligibility indicator
- appeal creation button
- appeal PDF access

### 8.7 Audit and traceability

Every operator change should log:

- operator id
- farmer id
- claim id
- field changed
- old value
- new value
- source screen
- timestamp

Audit log should clearly distinguish:

- chatbot update
- system automation
- operator update
- document extraction
- AI inference

## 9. Backend/API Work Needed

The current operator API is not enough.

### 9.1 New API groups

- `POST /operator/access/request`
- `GET /operator/access/:phone/status`
- `POST /operator/access/:phone/revoke`
- `GET /operator/farmers`
- `GET /operator/farmers/:phone/claims`
- `POST /operator/claims`
- `PATCH /operator/claims/:id/fields`
- `POST /operator/claims/:id/documents`
- `POST /operator/claims/:id/photos`
- `POST /operator/claims/:id/template/select`
- `POST /operator/claims/:id/template/generate`
- `POST /operator/claims/:id/appeal`

### 9.2 Existing API enhancements

Enhance:

- `GET /claims`
- `GET /claims/:id`
- `POST /claims/:id/submit`

to return richer claim workspace data, not just queue summary data.

### 9.3 Auth hardening

Current operator API only checks for an auth header.

Need:

- proper Cognito JWT verification
- operator role validation
- scoped farmer-access validation on every claim fetch/edit

## 10. UI/UX Differences From Chatbot

The operator dashboard should not mimic chat UI.

It should improve on it:

- explicit section tabs
- field-level validation
- visible blockers
- file previews
- image galleries
- form readiness indicators
- timeline and audit context
- one-click navigation between incomplete sections

No voice.
No free-form conversational ambiguity.
No chat-style step memory required.

## 11. State Mapping From Bot To Dashboard

Map bot stages to dashboard workspace tabs:

- `CLAIM_FARMER_DETAILS` -> Farmer tab
- `CLAIM_CROP_DETAILS` -> Crop tab
- `CLAIM_DATE_LOCATION` -> Date & Location tab
- `CLAIM_DOCUMENTS` -> Documents tab
- `CLAIM_MISSING_FIELDS` -> Missing Fields tab
- `CLAIM_PHOTOS` -> Photos tab
- `CLAIM_TEMPLATE_SELECT` -> Insurer Form tab
- `CLAIM_REVIEW` -> Review & Submit tab
- `STATUS_LIST` / `STATUS_DETAIL` -> Status & Timeline tab
- `APPEAL_START` -> Appeal action panel

The dashboard should not need to emulate chatbot state transitions directly. It should infer completion from claim data and pending schema.

## 12. Data Model Changes Needed

These are likely needed for operator mode:

- operator-to-farmer access session record
- consent status and expiry metadata
- operator workspace locks or edit session markers
- structured claim section completeness metadata
- richer generated document metadata
- operator assignment metadata

Prefer additive fields on existing claim/user/consent records rather than parallel storage.

## 13. Phased Delivery Plan

### Phase 0: Access

- operator login works reliably
- fallback OTP for deployment/testing
- protected routes stable

### Phase 1: Consent and farmer access

- request farmer access by phone
- farmer confirms through chatbot
- operator sees only authorized farmers

### Phase 2: Read-only claim workspace

- queue
- claim detail
- documents/photos/audit/timeline
- no editing yet

### Phase 3: Editable assisted filing workspace

- edit farmer/crop/date fields
- complete missing schema fields
- upload docs/photos
- identity verification visibility

### Phase 4: Insurer forms and submission

- template selection
- template field completion
- PDF generation
- submission

### Phase 5: Appeals and re-engagement

- rejected claim handling
- appeal creation
- stalled claim operator interventions

### Phase 6: Hardening

- JWT enforcement
- proper access scoping
- audit completeness
- testing and regression coverage

## 14. Acceptance Criteria

- operator can log in reliably
- operator cannot access a farmer without farmer consent
- farmer consent via BimaSathi chat grants dashboard access
- operator can open the same claim the chatbot created
- operator edits are visible in chatbot flows and vice versa
- operator can upload documents and photos to the same claim
- operator can complete missing fields and identity verification blockers
- operator can generate insurer forms
- operator can submit claims
- operator can create appeals for rejected claims
- all operator actions are auditable

## 15. Non-Goals

- replacing the chatbot
- duplicating claim storage in a dashboard-only system
- voice input or voice output in operator UI
- separate business rules for operator versus chatbot

## 16. Immediate Build Order

1. Fix operator access with reliable login
2. Build farmer consent/access center
3. Build read-only claim workspace on real claim data
4. Add edit capability section-by-section
5. Add insurer form generation controls
6. Add final submission and appeal handling

## 17. Implementation Notes

- Do not tamper with chatbot state logic unless a shared backend bug must be fixed.
- Use the dashboard as a second surface over the same backend objects.
- Keep operator-only UX improvements in frontend and operator API layers.
- Keep all claim mutations backend-validated so chatbot and dashboard remain consistent.
