# BimaSathi — Complete Product Walkthrough

Everything that happens, step by step, in plain language.

---

## Part 1: The Farmer's Journey on WhatsApp

### Scene 1: First Time Opening the Chat

The farmer opens WhatsApp. They go to the BimaSathi number (the Twilio sandbox number). **They see an empty chat** — just like any new WhatsApp conversation. There's no app to install, no website to visit.

They type anything — "Hi", "Namaste", "Hello".

**What the bot sends back:**

```
🌾 BimaSathi mein aapka swagat hai!
Fasal bima claim assistant.

Choose your language:
1. हिन्दी (Hindi)
2. मराठी (Marathi)
3. తెలుగు (Telugu)
4. தமிழ் (Tamil)
5. ગુજરાતી (Gujarati)
6. ಕನ್ನಡ (Kannada)
7. English
```

The farmer types **"1"** for Hindi, **"7"** for English, etc.

> **Known bug (to fix):** If the farmer types English text like "Hello" instead of a number, the bot does NOT detect English. It runs `_Detect_Language()` which falls back to **Hindi** by default. The fix is to improve the detection — check for English keywords like "hello", "english", "hi" and map them to English. Currently, the farmer MUST press a number to select language reliably.

### Scene 2: OTP Verification

The bot sends an SMS to the farmer's phone with a **6-digit code** (via Twilio Verify). The bot says:

```
✅ हिन्दी selected!
📱 Aapke phone par OTP bheja hai. 6-digit code yahan type karein:
```

The farmer checks their SMS inbox. They see something like `105226`. They type it into the WhatsApp chat.

**If correct:**
```
✅ Login ho gaya!

📋 Main Menu:
1. 🆕 Nayi claim file karein
2. 📊 Claim status dekhein
3. 🔧 Madad chahiye

Apna choice type karein ya voice mein bolein:
```

**If wrong:** Bot says "❌ Galat OTP. Dobara try karein." and waits. No limit on retries.

### Scene 3: Returning User

When the farmer comes back later (could be hours, days), they open the **same WhatsApp chat**. They see all their old messages — WhatsApp preserves chat history on the phone.

They type "Hi" again. **The system checks DynamoDB:**
- If their session is still alive (hasn't expired via TTL) → they go straight to the **Main Menu**, no OTP needed again.
- If the session expired → bot greets them fresh, asks language, sends a new OTP.

> **Key point:** The farmer doesn't "sign in" like a website. WhatsApp itself is the identity — their phone number IS their username. OTP just verifies it's really them the first time.

### Scene 4: Navigation Commands — Reset, Go Back, Skip

At **any point** in the conversation, the farmer can type these commands to move freely:

**"reset" / "naya shuru" / "shuru se"** — Start completely fresh
```
🔄 Naya shuru! Sab kuch reset ho gaya.

🌾 BimaSathi mein aapka swagat hai!
Choose your language:
1. हिन्दी  2. मराठी  3. తెలుగు ...
```
Everything is wiped — claim data, photos, state. Clean slate.

**"back" / "peeche" / "wapas"** — Go back one step
```
⬅️ Peeche ja rahe hain. Dobara batayein:

🏘 Aapka khet kis gaon mein hai?
```
The bot restores the data from the previous step. Farmer re-enters just that one field. Can type "back" multiple times to go further back.

**"skip" / "chhodo"** — Skip the current optional question
```
⏭️ Chhod diya. Agle step par chalte hain.
```
Only works for non-required fields. Required fields (name, crop, photos) cannot be skipped.

**Why this matters:** If photos aren't processing, the farmer can type "back" to go to date/location, or "reset" to start a completely new claim. They're never stuck.

> The bot shows a hint at key moments: `"back" = peeche | "reset" = naya shuru`

---

## Part 2: Filing a Claim (Use Case 1 — Happy Path)

### Step 1: Farmer Details

Farmer types **"1"** or says "Nayi claim file karein".

```
📝 Claim filing shuru karte hain.
Sabse pehle — aapka pura naam batayein:
```

Farmer: **"Jugendar Sharma"**

```
🏘 Aapka khet kis gaon mein hai?
```

Farmer: **"Sultanpur"**

```
🏛 Kaun sa district?
```

Farmer: **"Sultanpur"** (or "Zila Sultanpur" — both work)

### Step 2: Crop Details

```
🌾 Kaun si fasal ka nuksan hua hai?

1. Gehun (Wheat)
2. Dhan (Rice)
3. Kapas (Cotton)
4. Ganna (Sugarcane)
5. Soybean
6. Dal (Pulses)
```

Farmer: **"2"** (Rice)

```
⚡ Nuksan ka karan kya hai?

1. Baadh
2. Sukha
3. Ole
4. Beseasonal Baarish
5. Keet/Rog
6. Aag
7. Aur
```

Farmer: **"2"** (Drought)

```
📐 Kitne hectare (ya bigha) fasal ko nuksan hua?
```

Farmer: **"3"** (or "3 bigha" — the bot converts bigha to hectares automatically)

### Step 3: Date and Location

```
📅 Nuksan kab hua? Tarikh batayein ya bolein (jaise: "kal", "15 February", "pichle hafte"):
```

Farmer: **"4 hafte pehle"** → Bot uses AI to parse this into an actual date.

```
📍 Kripya apni location share karein ya apne gaon ka naam batayein:
```

The farmer can either:
- **Share their GPS location** using WhatsApp's 📎 → Location button (best option — gives exact coordinates)
- **Type their village name** — "Sultanpur" (bot stores it and tries to geocode)

At this point, **the claim is created in DynamoDB** with a unique Claim ID (like `BMS-2026-0003-UP`). A deadline is calculated (72 hours from the loss date per PMFBY rules).

### Step 4: Photo Evidence

```
📸 Ab kripya apne khet ki photos bhejein.

Kam se kam 3 photos chahiye:
• Nuksan dikhe aise
• Alag-alag angle se
• Puri fasal bhi dikhe

Photo bhejein 👇
```

The farmer takes photos and sends them one by one (or multiple at once).

**Per photo, this happens behind the scenes:**
1. Bot downloads the photo from Twilio's servers
2. Uploads to S3 evidence bucket under the claim ID
3. Computes SHA-256 hash (tamper detection for court/legal purposes)
4. Checks image resolution (minimum 640×480)
5. Sends to **Amazon Rekognition** → gets labels like "Crop", "Field", "Drought", "Vegetation", "Flood"
6. Checks for damage-related labels
7. Runs content moderation (rejects inappropriate images)
8. Checks EXIF GPS (if available — usually stripped by WhatsApp)
9. Checks EXIF timestamp vs. loss date

**If photo is ACCEPTED:**
```
✅ Photo accept ho gayi!
Pata chala: Crop, Drought, Field
Quality: 80/100

📊 Progress: 1/3 accept hui. Aur 2 bhejein.
```

**If another photo is ACCEPTED:**
```
✅ Photo accept ho gayi!
Pata chala: Vegetation, Flood
Quality: 75/100

📊 Progress: 2/3 accept hui. Aur 1 bhejein.
```

The bot does **NOT** say "Photo #1", "Photo #2" — it simply says "Photo accept/reject ho gayi" and shows a **progress bar** (`1/3`, `2/3`, `3/3`). This avoids confusion when multiple photos are sent at once, since WhatsApp processes them in parallel.

> **Bug fix applied:** Previously, the bot said "Photo #1 rejected", "Photo #2 rejected" etc., but the numbers were wrong when multiple photos were sent at once (race condition — all reads happened before any write). Now it uses progress-style messaging and `message_sid` deduplication.

**If photo is REJECTED** (shown in the farmer's selected language):

| Rejection Reason | Hindi Message | English Message |
|-----------------|---------------|-----------------|
| Low resolution | ❌ Photo chhoti hai. Kam se kam 640×480 honi chahiye. | ❌ Image resolution too low. Min: 640×480. |
| No crop/damage found | ❌ Fasal ya nuksan nahi dikha. Khet ki photo bhejein. | ❌ No crop or damage detected. Send a field photo. |
| Inappropriate content | ❌ Photo mein galat content hai. Sirf khet ki photo bhejein. | ❌ Inappropriate content detected. |
| GPS too far | ❌ Photo ki location bahut door hai aapke gaon se. | ❌ Photo location too far from village. |
| Photo too old | ❌ Photo bahut purani hai (nuksan ki tarikh se 72 ghante se zyada). | ❌ Photo timestamp too old (>72h from loss date). |
| Processing error | ❌ Photo process nahi ho payi. Dobara bhejein. | ❌ Internal processing error. Please resend. |

Every rejection message also shows progress:
```
❌ Photo reject ho gayi.
Wajah: Photo chhoti hai. Kam se kam 640×480 honi chahiye.

📊 Progress: 1/3 accept hui. Nayi photo bhejein.
```

Rejected photos **don't count** toward the 3 required. The farmer can retry unlimited times. Only approved photos are counted.

### Step 5: Review and Confirm

Once 3 photos are approved, **AI generates a claim summary**:

```
📋 Aapki claim ka summary:

👤 Naam: Jugendar Sharma
🏘 Gaon: Sultanpur
🏛 Zila: Sultanpur
🌾 Fasal: Rice
⚡ Karan: Drought
📐 Area: 3 hectare
📅 Nuksan ki tarikh: 4 Feb 2026
📸 Photos: 3 approved

Kya sab sahi hai? "Haan" ya kya badalna hai batayein.
```

**If farmer says "Haan" / "Yes" / "OK" / "1":**
→ Claim is **SUBMITTED**. System generates a full PDF claim pack.

**If farmer says something like "Naam galat hai":**
→ Bot asks "Kya badalna hai? Batayein, main update karunga." The farmer tells what's wrong, bot updates it.

### Step 6: Final Submission

```
🎉 Claim submit ho gayi!

📄 Claim ID: BMS-2026-0003-UP
📋 PDF Claim Pack: [Download Link]
⏰ Deadline: 7 Feb 2026

Status check karne ke liye "2" type karein.
```

The "PDF Claim Pack" is a **pre-signed S3 URL** (expires in 1 hour) containing:
1. **Cover Letter PDF** — formal letter addressed to the insurance company
2. **Claim Form PDF** — PMFBY-style form with all farmer details filled in
3. **Evidence Report PDF** — AI analysis results, Rekognition labels, quality scores, photo hashes

The farmer goes back to the **Main Menu**. They can file another claim or check status.

---

## What Details Are Required for Actual PMFBY Insurance Filing?

Under the **Pradhan Mantri Fasal Bima Yojana (PMFBY)** guidelines, the following information is needed for a valid crop insurance claim. BimaSathi collects ALL of these:

| Field | Collected By BimaSathi | How |
|-------|----------------------|-----|
| Farmer's full name | ✅ | Asked in LOSS_REPORT step |
| Phone number | ✅ | WhatsApp number (auto) |
| Village / Gram Panchayat | ✅ | Asked in LOSS_REPORT step |
| District | ✅ | Asked in LOSS_REPORT step |
| State | ✅ | Parsed from location via AI |
| Crop name & type (Kharif/Rabi) | ✅ | Asked in CROP_DETAILS step |
| Cause of loss (peril type) | ✅ | Asked in CROP_DETAILS step |
| Area affected (hectares) | ✅ | Asked in CROP_DETAILS step |
| Date of loss | ✅ | Asked in DATE_LOCATION step |
| GPS coordinates of field | ✅ | WhatsApp location share or village name |
| Photographic evidence | ✅ | 3 verified photos via Rekognition |
| Intimation within 72 hours | ✅ | System calculates and tracks deadline |
| Bank account (for payout) | ❌ | **Not yet collected** — needs to be added |
| Aadhaar / farmer ID | ❌ | **Not yet collected** — needs to be added |
| Land ownership / khasra number | ❌ | **Not yet collected** — could be added |
| Insurance policy number | ❌ | **Not yet collected** — if farmer has existing policy |

> **What's missing:** Bank account, Aadhaar, and land records. These can be added as additional steps in the LOSS_REPORT flow. For a hackathon MVP, the current fields are sufficient to demonstrate the concept.

---

## Part 3: Checking Claim Status (Use Case 2)

Farmer types **"2"** from the Main Menu.

```
📊 Aapki Claims:

1. BMS-2026-0003-UP — Rice — Submitted
2. BMS-2025-0012-UP — Wheat — Approved
3. BMS-2025-0008-UP — Cotton — Rejected

"menu" type karein main menu ke liye.
```

Each claim shows its current status:
- **Draft** — farmer started but didn't finish
- **Submitted** — waiting for insurer/operator review
- **Under Review** — operator is checking
- **Approved** — claim accepted, payment coming
- **Rejected** — claim denied (farmer can appeal)
- **Paid** — money disbursed

---

## Part 4: Rejected Claim → Appeal (Use Case 3)

If a claim is rejected and the farmer asks about it, the bot offers:

```
⚖️ Aapki claim BMS-2025-0008-UP reject ho gayi thi.
Kya aap appeal file karna chahte hain? AI se appeal letter ban jayega.

"Haan" ya "Nahi" bolein.
```

**If "Haan":**
```
⚖️ AI se appeal letter bana rahe hain...
```
Then:
```
✅ Appeal letter taiyaar! Download: [Link]
```

The AI generates a formal appeal letter with legal language, referencing the specific claim details, evidence submitted, and grounds for reconsideration.

---

## Part 5: Getting Help (Use Case 4)

Farmer types **"3"** or "madad chahiye":

```
📞 Ek operator jaldi aapki madad karega.
Tab tak "menu" type karein.

📧 Phone bhi kar sakte hain: 1800-XXX-XXXX (free)
```

This is the **Operator Bridge** — it flags the farmer's session for the CSC operator to pick up from the dashboard.

---

## Part 6: Voice Note Input (Use Case 5)

At **any point** in the conversation, if the farmer sends a **voice note** instead of typing, the bot:
1. Downloads the audio from Twilio
2. Sends it to **AWS Transcribe** for speech-to-text
3. Gets the transcription in the farmer's **already selected language**
4. Proceeds as if the farmer typed that text

**How does the bot know which language the voice note is in?**

It uses the **language the farmer already selected in Step 1** (language selection). Each language has a corresponding AWS Transcribe locale code:

| Language | Transcribe Code |
|----------|----------------|
| Hindi | `hi-IN` |
| Marathi | `mr-IN` |
| Telugu | `te-IN` |
| Tamil | `ta-IN` |
| Gujarati | `gu-IN` |
| Kannada | `kn-IN` |
| English | `en-IN` |

So if the farmer selected Hindi at the start, all their voice notes are transcribed as Hindi. The bot does **not** auto-detect the spoken language — it relies on the selection. If a farmer speaks in a different language than what they selected, the transcription may be inaccurate.

This is critical — many farmers may not be comfortable typing. They just press-and-hold the microphone button, speak in their language, and the bot understands.

---

## Part 7: Helper Mode (Use Case 6)

A CSC (Common Service Centre) operator or village volunteer can file claims **on behalf** of a farmer. This is for farmers who need physical help.

**How does the system know it's a helper vs. a farmer?**

It doesn't — not automatically. WhatsApp doesn't have "roles." Here's how it works:

1. The helper opens WhatsApp and messages BimaSathi from **their own phone**
2. They go through the normal welcome + language + OTP flow (using their own number)
3. From the Main Menu, they choose **"3" (Madad / Help)** or a specific helper command
4. The bot enters **HELPER_MODE** — it asks: "Kisan ka phone number batayein jis ki claim file karni hai"
5. Bot sends OTP to the **farmer's phone** (not the helper's)
6. The farmer — sitting next to the helper physically — reads the OTP out loud
7. Helper types it into their WhatsApp → system verifies → consent is recorded in the `bimasathi-consent` DynamoDB table
8. Now the helper files the claim using their phone, but all data is tagged to the **farmer's identity**
9. The audit log records: `actor: helper_phone, on_behalf_of: farmer_phone`

**Why this design?** Indian government PMFBY rules require **consent proof** when someone files on another's behalf. The OTP-to-farmer flow provides a verifiable digital consent trail.

> **Key point:** The helper and farmer must be in the same physical location for the OTP handoff. This is by design — it prevents unauthorized filing.

---

## Part 8: The Operator's Journey (Dashboard)

### Who is the Operator?
A CSC (Common Service Centre) agent or insurance company representative. They use the **web dashboard** (not WhatsApp).

### Logging In
1. Open `localhost:5173` (dev) or the deployed URL
2. Enter phone number → receive 6-digit OTP via SMS → enter it → logged in

### Dashboard Home
Shows 4 KPI cards:
- **Total Claims** — all claims in the system
- **Pending Submission** — claims not yet fully submitted
- **Avg Completeness** — how complete claims are on average (%)
- **Due in 24 Hours** — urgent claims with approaching PMFBY deadlines

Plus: **Recent Claims** list and **Urgent Queue** (critical+warning claims).

### Claims Queue
Full table of all claims with columns: Claim ID, Farmer, Crop, Status, Deadline, Completeness %, Urgency dot.

Click any claim → **Claim Detail** page.

### Claim Detail
Shows everything about one claim:
- Farmer info (name, village, district, phone)
- Crop & damage details
- Photo evidence (thumbnails with AI labels)
- Quality scores
- Timeline / audit log (every action logged with timestamp)
- **Submit to Insurer** button (only enabled when completeness ≥ 80%)

### What the Operator Does
1. Reviews claims that farmers submitted via WhatsApp
2. Checks if evidence is sufficient
3. Clicks "Submit to Insurer" to forward the claim
4. Can see analytics (claims by status, crops affected, urgency trends)

### How Farmer and Operator Connect
```
Farmer (WhatsApp)                          Operator (Dashboard)
─────────────────                          ────────────────────
Files claim via chat          ───→         Claim appears in queue
Sends photos                  ───→         Photos visible in detail view
Confirms & submits             ───→         Status changes to "Submitted"
                               ←───         Operator reviews & submits to insurer
Receives status update via bot ←───         Status changes to "Approved"/"Rejected"
```

The farmer NEVER needs to visit the dashboard. The dashboard is for operators only.

---

## Part 9: Document Verification

### What Gets Verified (Automated):
| Check | How | Result |
|-------|-----|--------|
| Photo is a real crop field | Rekognition DetectLabels | Labels like "Vegetation", "Crop", "Rice Paddy" |
| Damage is visible | Rekognition checks for damage labels | "Flood", "Drought", "Fire", "Pest" |
| Photo is appropriate | Rekognition ModerationLabels | Rejects offensive/inappropriate content |
| Photo resolution | JPEG/PNG header parsing | Min 640×480 pixels |
| Photo not tampered | SHA-256 hash | Stored for audit trail |
| GPS matches field | EXIF GPS vs registered village | Within 50km (lenient if no GPS) |
| Photo is recent | EXIF timestamp vs loss date | Within 72 hours (lenient if no EXIF) |

### What Gets Generated (Documents):
1. **Claim Form PDF** — PMFBY-format form pre-filled with farmer details
2. **Evidence Report PDF** — AI analysis summary, Rekognition labels, quality scores, photo hashes
3. **Cover Letter PDF** — Formal letter to the insurance company
4. **Bundled Claim Pack** — All 3 PDFs merged into one document

These PDFs are stored in S3 and a download link is sent to the farmer via WhatsApp.

---

## Part 10: All Edge Cases

| Situation | What Happens |
|-----------|--------------|
| Farmer types garbage text | Bot repeats the current prompt |
| Farmer sends photo at wrong stage | Bot says "Pehle baaki details dein, phir photo bhejein" |
| Farmer goes silent for hours | Session expires via DynamoDB TTL. Next message starts fresh. |
| Farmer types "menu" at any point | Goes back to Main Menu |
| Farmer changes language mid-conversation | Types a language name or script → bot switches |
| Farmer sends a selfie instead of crop photo | Rekognition: no crop/damage labels → rejected |
| Internet drops during photo upload | Twilio retries the webhook. Bot processes when it arrives. |
| Farmer has multiple claims | Each has separate Claim ID. Status shows all of them. |
| Two people use same phone | Same WhatsApp number = same session. Only 1 user per phone. |
| Farmer sends low-res screenshot | Rejected: "Image resolution too low. Min: 640×480" |
| Farmer types text instead of number for language | ⚠️ Known bug — defaults to Hindi. Needs fix. |
| Farmer types "Nayi file claim" instead of "1" | Works if AI detects FILE_CLAIM intent. May sometimes fail — needs fuzzy matching fix. |
| Farmer sends 5 photos, 2 rejected | Only 3 approved count. Rejected ones are just skipped. |
| Farmer sends voice note in wrong language | Transcription may be inaccurate — uses selected language, not auto-detect. |
| Farmer sends 4 rapid text messages | ⚠️ **Known bug** — each message triggers identical reply (4 "send photos" prompts). Fix: DynamoDB optimistic locking + 5-second response throttle. After fix, only first message gets a reply; the rest are silently absorbed. |
| Farmer deletes chat and starts fresh | ⚠️ **Known bug** — bot resumes old session from DynamoDB (e.g., stays at PHOTO_EVIDENCE). Fix: GREETING intent resets session to WELCOME and clears old context. |

