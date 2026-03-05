# AI-Powered Conversation Engine

## The Problem

The bot is a rigid state machine. Each state has hardcoded checks:
- MAIN_MENU: `if text === '1'` → FILE_CLAIM, keyword lists for fallback
- LANGUAGE_SELECT: `if text === '1'` → Hindi, `if text === '7'` → English
- REVIEW_CONFIRM: `if intent === 'CONFIRM'` → submit
- Every state: farmer must type **exactly** the expected format

This breaks constantly. "Peeche jao" doesn't match `=== 'peeche'`. "Track claim status" matches the wrong option. The bot feels robotic.

## The Solution: LLM-First Routing

**Every message the farmer sends** goes through a single LLM call that understands:
1. What **state** the bot is in
2. What **actions** are available in that state
3. What the **farmer said**
4. What **language** they're using

The LLM returns a structured action — which option they picked, or what data they provided.

### Architecture

```
Farmer message → _Interpret_Message(state, text, options) → { action, data }
```

#### New function: `_Interpret_Message` in `bedrock.js`

```javascript
async function _Interpret_Message(_State, _User_Text, _Available_Actions, _Language) {
    const _System = `You are BimaSathi's conversation router.

Current state: ${_State}
Farmer's language: ${_Language}

Available actions in this state:
${_Available_Actions.map(a => `- ${a.key}: ${a.description}`).join('\n')}

The farmer sent: "${_User_Text}"

Determine what the farmer wants. They may:
- Type a number matching an option
- Describe what they want in any language (Hindi, English, Hinglish, Marathi, Telugu, Tamil, Gujarati, Kannada)
- Use slang, misspellings, or abbreviations
- Provide data (name, village, crop type, date, etc.)

Return ONLY valid JSON:
{ "action": "<action_key>", "extracted_data": "<any data extracted, or null>" }

If the farmer is providing free-form data (like their name or village), use action "DATA_INPUT" and put the text in extracted_data.
If you truly cannot determine intent, use action "UNKNOWN".`;

    const _Result = await _Invoke_Model(_System, _User_Text, 100);
    try {
        return JSON.parse(_Result.trim());
    } catch {
        return { action: 'UNKNOWN', extracted_data: null };
    }
}
```

### How Each State Uses It

#### MAIN_MENU
```javascript
const _Result = await _Bedrock._Interpret_Message('MAIN_MENU', text, [
    { key: 'FILE_CLAIM', description: 'Start filing a new crop insurance claim' },
    { key: 'CHECK_STATUS', description: 'Check/track status of existing claims' },
    { key: 'GET_HELP', description: 'Get help, talk to operator, ask questions' },
], language);

if (_Result.action === 'FILE_CLAIM') → LOSS_REPORT
if (_Result.action === 'CHECK_STATUS') → TRACK_STATUS
if (_Result.action === 'GET_HELP') → OPERATOR_BRIDGE
```

#### LANGUAGE_SELECT
```javascript
const _Result = await _Bedrock._Interpret_Message('LANGUAGE_SELECT', text, [
    { key: 'hi', description: 'Hindi' },
    { key: 'mr', description: 'Marathi' },
    { key: 'te', description: 'Telugu' },
    { key: 'ta', description: 'Tamil' },
    { key: 'gu', description: 'Gujarati' },
    { key: 'kn', description: 'Kannada' },
    { key: 'en', description: 'English' },
], language);
// Farmer types "I want English" → { action: 'en' }
// Farmer types "मराठी" → { action: 'mr' }
// Farmer types "3" → { action: 'te' }
```

#### LOSS_REPORT / CROP_DETAILS / DATE_LOCATION (data collection)
```javascript
const _Result = await _Bedrock._Interpret_Message('LOSS_REPORT', text, [
    { key: 'DATA_INPUT', description: 'Farmer is providing their name / village / district' },
    { key: 'SKIP', description: 'Farmer wants to skip this question' },
], language);
// Farmer types "Ramesh Kumar" → { action: 'DATA_INPUT', extracted_data: 'Ramesh Kumar' }
// Farmer types "chhodo" → { action: 'SKIP' }
```

#### REVIEW_CONFIRM
```javascript
const _Result = await _Bedrock._Interpret_Message('REVIEW_CONFIRM', text, [
    { key: 'CONFIRM', description: 'Farmer confirms the summary is correct' },
    { key: 'DENY', description: 'Farmer says something is wrong' },
    { key: 'EDIT_FIELD', description: 'Farmer wants to change a specific field' },
], language);
// "haan sab sahi hai" → { action: 'CONFIRM' }
// "naam galat hai, Ramesh hona chahiye" → { action: 'EDIT_FIELD', extracted_data: 'naam: Ramesh' }
```

#### PHOTO_EVIDENCE (non-photo text)
```javascript
const _Result = await _Bedrock._Interpret_Message('PHOTO_EVIDENCE', text, [
    { key: 'QUESTION', description: 'Farmer is asking a question about photos' },
    { key: 'NAVIGATE', description: 'Farmer wants to go back or skip' },
], language);
// "kitne photo aur chahiye?" → { action: 'QUESTION' }
// "peeche jao" → already caught by nav commands
```

### What This Means

| Farmer types | Old behavior | New behavior |
|-------------|-------------|-------------|
| "mujhe nayi claim karni hai" | ❌ keyword miss | ✅ FILE_CLAIM |
| "bhai mera claim kahan tak aaya" | ❌ keyword miss | ✅ CHECK_STATUS |
| "I want to speak in Telugu" | ❌ no match | ✅ language = 'te' |
| "2 number wala option" | ❌ might work | ✅ CHECK_STATUS |
| "galti ho gayi naam mein" | ❌ shows error | ✅ EDIT_FIELD |

### Cost Impact
- ~1 extra Bedrock call per message (only when number shortcuts don't match)
- Claude Opus 4.6 at ~100 tokens per call = ~$0.002 per message
- Acceptable for production use

### Files Changed

#### [MODIFY] `src/shared/bedrock.js`
- Add `_Interpret_Message` function
- Export it

#### [MODIFY] `src/lambdas/conversation-engine/index.js`
- Replace ALL hardcoded keyword matching in every state handler
- Each state passes its available actions to `_Interpret_Message`
- Number shortcuts (1, 2, 3) kept as fast-path before LLM call

## Previous Fixes (already implemented)

| # | Error | Status |
|---|-------|--------|
| 1 | Bedrock model → Claude Opus 4.6 | ✅ Done |
| 2 | DynamoDB claims query crash | ✅ Done |
| 3 | Fuzzy match order (will be replaced by AI routing) | ✅ → superseded |
| 4 | Navigation `.includes()` | ✅ Done |
| 5 | Back handler menu fix | ✅ Done |
| 6 | Local intent fallback | ✅ Done |
