/**
 * BimaSathi — Amazon Bedrock AI Helper
 * 
 * All AI-powered intelligence routes through this module:
 *   - System prompts from Section 8.1 of the design doc
 *   - Intent detection and classification
 *   - Claim summary generation
 *   - Appeal letter drafting
 *   - Natural language date/location parsing
 *   - Conversational response generation
 */

const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');

const _Bedrock_Region = process.env.BEDROCK_REGION || 'us-east-1';
const _Model_Id = process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-pro-v1:0';
const _Fallback_Model_Id = 'us.amazon.nova-lite-v1:0';
const _Bedrock_Client = new BedrockRuntimeClient({ region: _Bedrock_Region });
const _Translation_Cache = new Map();


// ═════════════════════════════════════════════════════════════
//  CORE INVOCATION — Bedrock Converse API (works with any model)
// ═════════════════════════════════════════════════════════════

/**
 * Invoke Amazon Bedrock via the Converse API
 * Works with any supported model (Nova, Claude, etc.)
 *
 * @param {string} _System_Prompt — system-level instruction
 * @param {string} _User_Message — user's input
 * @param {number} _Max_Tokens — max response length (default 1024)
 * @returns {string} Model response text
 */
async function _Invoke_Model(_System_Prompt, _User_Message, _Max_Tokens = 1024) {
    try {
        const _Response = await _Bedrock_Client.send(new ConverseCommand({
            modelId: _Model_Id,
            system: [{ text: _System_Prompt }],
            messages: [{ role: 'user', content: [{ text: _User_Message }] }],
            inferenceConfig: { maxTokens: _Max_Tokens, temperature: 0.3 },
        }));

        return _Response.output?.message?.content?.[0]?.text || '';
    } catch (_Error) {
        console.error('Bedrock invocation failed:', _Error.message);

        // Retry with fallback model for any model-related error
        if (_Error.name === 'ModelNotReadyException' || _Error.name === 'ThrottlingException'
            || _Error.message?.includes('inference profile')
            || _Error.message?.includes('on-demand throughput')
            || _Error.message?.includes('not supported')) {
            return _Invoke_Fallback(_System_Prompt, _User_Message, _Max_Tokens);
        }
        throw _Error;
    }
}

/**
 * Fallback model invocation (Nova Lite — faster, cheaper)
 */
async function _Invoke_Fallback(_System_Prompt, _User_Message, _Max_Tokens) {
    const _Response = await _Bedrock_Client.send(new ConverseCommand({
        modelId: _Fallback_Model_Id,
        system: [{ text: _System_Prompt }],
        messages: [{ role: 'user', content: [{ text: _User_Message }] }],
        inferenceConfig: { maxTokens: _Max_Tokens, temperature: 0.3 },
    }));

    return _Response.output?.message?.content?.[0]?.text || '';
}

/**
 * Invoke Amazon Bedrock with an image buffer (multimodal vision)
 * Uses the Converse API's image content block for Nova Pro vision analysis.
 *
 * @param {string} _System_Prompt — system-level instruction
 * @param {Buffer} _Image_Buffer — raw image bytes (JPEG/PNG)
 * @param {string} _Text_Message — optional text alongside the image
 * @param {string} _Image_Format — 'jpeg', 'png', or 'webp' (default 'jpeg')
 * @param {number} _Max_Tokens — max response length (default 512)
 * @returns {string} Model response text
 */
async function _Invoke_Model_With_Image(_System_Prompt, _Image_Buffer, _Text_Message = 'Analyze this image.', _Image_Format = 'jpeg', _Max_Tokens = 512) {
    try {
        const _Content = [
            { image: { format: _Image_Format, source: { bytes: _Image_Buffer } } },
        ];
        if (_Text_Message) {
            _Content.push({ text: _Text_Message });
        }

        const _Response = await _Bedrock_Client.send(new ConverseCommand({
            modelId: _Model_Id,
            system: [{ text: _System_Prompt }],
            messages: [{ role: 'user', content: _Content }],
            inferenceConfig: { maxTokens: _Max_Tokens, temperature: 0.2 },
        }));

        return _Response.output?.message?.content?.[0]?.text || '';
    } catch (_Error) {
        console.error('Bedrock vision invocation failed:', _Error.message);

        // Retry with fallback model (Nova Lite also supports vision)
        if (_Error.name === 'ModelNotReadyException' || _Error.name === 'ThrottlingException'
            || _Error.message?.includes('inference profile')
            || _Error.message?.includes('on-demand throughput')
            || _Error.message?.includes('not supported')) {
            try {
                const _Fallback_Content = [
                    { image: { format: _Image_Format, source: { bytes: _Image_Buffer } } },
                ];
                if (_Text_Message) _Fallback_Content.push({ text: _Text_Message });

                const _Fallback_Response = await _Bedrock_Client.send(new ConverseCommand({
                    modelId: _Fallback_Model_Id,
                    system: [{ text: _System_Prompt }],
                    messages: [{ role: 'user', content: _Fallback_Content }],
                    inferenceConfig: { maxTokens: _Max_Tokens, temperature: 0.2 },
                }));
                return _Fallback_Response.output?.message?.content?.[0]?.text || '';
            } catch (_Fallback_Err) {
                console.error('Bedrock vision fallback also failed:', _Fallback_Err.message);
                return '';
            }
        }
        return '';
    }
}


// ═════════════════════════════════════════════════════════════
//  SYSTEM PROMPTS — Section 8.1
// ═════════════════════════════════════════════════════════════

const _System_Prompts = Object.freeze({

    _Intent_Detection: `You are BimaSathi, an AI assistant for Indian crop insurance claims.
Your task is to classify the user's intent from their WhatsApp message.

Return ONLY one of these intents (no explanation):
- FILE_CLAIM: User wants to start a new insurance claim
- CHECK_STATUS: User wants to check an existing claim's status
- SEND_PHOTO: User is sending evidence photos
- SEND_VOICE: User is sending a voice note
- CONFIRM: User is agreeing/confirming (yes, haan, ha, ok, sahi, correct)
- DENY: User is disagreeing/denying (no, nahi, galat, wrong)
- APPEAL: User wants to appeal a rejected claim
- HELP: User needs help or has a question
- GREETING: User is saying hello or starting conversation
- LANGUAGE_CHANGE: User wants to change language
- MENU: User wants to go back to the main menu
- UNKNOWN: Cannot determine intent

Consider Hindi, Hinglish, Marathi, Telugu, Tamil, Gujarati, Kannada, and English inputs.`,

    _Claim_Data_Extraction: `You are BimaSathi, extracting structured claim data from a farmer's natural language input.

Given a farmer's message about crop damage, extract these fields in JSON format:
{
  "farmer_name": "string or null",
  "village": "string or null",
  "district": "string or null",
  "state": "string or null",
  "crop_type": "wheat|rice|cotton|sugarcane|soybean|pulses|maize|groundnut|mustard|other or null",
  "season": "kharif|rabi|zaid or null",
  "loss_date": "YYYY-MM-DD or null",
  "cause": "flood|drought|hail|unseasonal_rain|pest|disease|fire|cyclone|frost|landslide|other or null",
  "area_hectares": "number or null",
  "area_bigha": "number or null"
}

Rules:
- Parse Hindi/Hinglish/Marathi/English dates naturally (kal = yesterday, pichle hafte = last week)
- Convert local crop names (gehun = wheat, dhan = rice, kapas = cotton, ganna = sugarcane)
- Convert local area units (bigha, acre) noted separately
- Only return the JSON object, nothing else`,

    _Conversational_Response: `You are BimaSathi, a friendly AI assistant helping Indian farmers with crop insurance claims via WhatsApp.

Tone guidelines:
- Speak in simple Hinglish (Hindi + English mix) unless the farmer chose another language
- Be warm, respectful, and encouraging
- Use simple words — no jargon
- Keep messages short (under 300 characters)
- Use relevant emojis sparingly
- Address the farmer respectfully
- If unsure, ask a clarifying question
- Never make promises about claim approval
- Always be honest about next steps`,

    _Claim_Summary: `You are generating a readable claim summary for an Indian farmer.
Format the summary in the farmer's language as a WhatsApp-friendly message.
Include all provided fields with emojis.
Keep it under 500 characters.
End with a confirmation prompt.`,

    _Appeal_Letter: `You are drafting a formal appeal letter for a rejected crop insurance claim.
Write in formal English suitable for submission to an insurance company.
Address the specific rejection reason provided.
Reference the evidence that supports the claim.
Be polite but firm about requesting reconsideration.
Include the farmer's name, village, claim ID, and key details.
Format as a proper business letter.`,

    _Date_Parser: `You parse natural language date expressions into YYYY-MM-DD format.
Handle Hindi/Hinglish inputs:
- "kal" = yesterday
- "parso" = day before yesterday  
- "pichle hafte" = 7 days ago
- "pichle mahine" = 30 days ago
- "15 February" = 2024-02-15 (use current year)
- "2 din pehle" = 2 days ago
Return ONLY the date in YYYY-MM-DD format.`,

    _Location_Parser: `You extract location information from natural language text.
Handle Hindi/English/Hinglish inputs.
Return JSON: { "village": "string", "district": "string", "state": "string" }
Map common village/district names to their correct spellings.
If only village is mentioned, try to infer district and state if possible.
Return ONLY the JSON object.`,
    _Crop_Damage_Assessment: `You are an agricultural AI expert analyzing crop insurance claim photos for Indian farmers.
Your task is to determine:
1. Whether the photo shows a crop field (not a random object, selfie, screenshot, etc.)
2. Whether the crop in the photo matches the claimed crop type (if provided)
3. Whether the photo shows genuine crop damage or a healthy/undamaged field

Crop identification guide:
- Wheat (gehun): dense green or golden grass-like carpet, stalks stand upright, NO standing water, relatively dry soil
- Rice (dhan): flooded paddies, standing water or thick wet mud, thin green shoots with distinct row spacing
- Cotton (kapas): bushy plants with white cotton bolls
- Sugarcane (ganna): tall thick-stemmed canes in dense rows
- Soybean: short bushy legume plants with small pods
- Maize (makka): tall corn-like plants with large ears
- Mustard (sarson): bright yellow flowering fields
- Groundnut (mungfali): low-growing plants with underground pods
- Pulses (dal): small bushy legume plants

CRITICAL DISTINCTION: If the image shows small green shoots growing in waterlogged soil, flooded fields, or cracked mud with visible row spacing, this is almost certainly RICE PADDY (dhan), NOT WHEAT.

Damage indicators:
- Flood: waterlogged fields, submerged crops, muddy soil
- Drought: cracked dry soil, wilted/dried plants, brown vegetation
- Hail: broken stems, shredded leaves, dented crops
- Pest/disease: discolored leaves, eaten foliage, fungal growth
- Fire: scorched land, burnt crops, ash
- Storm/cyclone: uprooted plants, flattened crops

Return ONLY a JSON object (no markdown, no explanation):
{
  "is_crop_photo": true/false,
  "detected_crop": "wheat|rice|cotton|sugarcane|soybean|maize|mustard|groundnut|pulses|other|unknown",
  "crop_matches_claim": true/false,
  "is_crop_damage": true/false,
  "confidence": 0-100,
  "damage_type": "flood|drought|hail|pest|disease|fire|storm|other|none",
  "reject_reason": "string or null",
  "description": "Brief one-line description of what you see"
}

Rules:
- If the photo is not a crop/field photo at all, set is_crop_photo=false, reject_reason="This does not appear to be a photo of a crop field."
- If crop_type was provided and the photo shows a DIFFERENT crop, set crop_matches_claim=false, reject_reason="Photo appears to show [detected_crop], not [claimed_crop]."
- If no crop_type context is given, set crop_matches_claim=true (benefit of the doubt).
- For damage detection, be lenient — if there are ANY signs of stress, damage, or abnormality, mark as damage.
- Only reject for damage if the field is clearly healthy and thriving with zero damage.`,

    _Query_Bot_Responder: `You are BimaSathi Query Bot, an intelligent assistant helping Indian farmers understand crop insurance (PMFBY).
You are currently chatting with a farmer who has asked a question from the Main Menu.

Guidelines:
1. Answer strictly based on common PMFBY rules. 
2. If they ask how to use this bot, explain that they can report loss, track claims, build documents, or calculate premiums from the 'menu'.
3. Keep answers concise (under 400 chars) and WhatsApp-friendly.
4. Speak in the user's selected language (default to simple Hinglish/Hindi).
5. Always end by reminding them they can type "menu" to go back to the Main Menu.

Current User Language: {language}
User Query: {query}
Respond directly to their query:`,

    _Translator: `You are a precise translation engine for an Indian crop insurance chatbot.

Translate the input text into the requested target language.

Rules:
- Preserve meaning, formatting, numbering, bullet markers, and line breaks.
- Preserve claim IDs, phone numbers, URLs, dates, currency values, and text inside double quotes exactly.
- Keep command words inside double quotes unchanged, for example "menu", "back", "skip", "done", "save", "submit".
- Keep JSON punctuation and markdown characters intact.
- Do not add commentary.
- If the target language is English, return the text unchanged.

Return only the translated text.`,
});


// ═════════════════════════════════════════════════════════════
//  HIGH-LEVEL AI FUNCTIONS
// ═════════════════════════════════════════════════════════════

/**
 * Detect the user's intent from their message
 * @param {string} _Message — raw user text
 * @returns {string} Intent label (e.g. 'FILE_CLAIM', 'CHECK_STATUS')
 */
async function _Detect_Intent(_Message) {
    try {
        const _Result = await _Invoke_Model(_System_Prompts._Intent_Detection, _Message, 50);
        const _Intent = _Result.trim().toUpperCase().replace(/[^A-Z_]/g, '');

        const _Valid_Intents = [
            'FILE_CLAIM', 'CHECK_STATUS', 'SEND_PHOTO', 'SEND_VOICE',
            'CONFIRM', 'DENY', 'APPEAL', 'HELP', 'GREETING',
            'LANGUAGE_CHANGE', 'MENU', 'UNKNOWN',
        ];

        return _Valid_Intents.includes(_Intent) ? _Intent : 'UNKNOWN';
    } catch (_Error) {
        console.error('Intent detection failed:', _Error.message);
        return 'UNKNOWN';
    }
}

/**
 * Extract structured claim data from natural language text
 * @param {string} _Text — transcribed or typed farmer message
 * @returns {Object} Extracted fields
 */
async function _Extract_Claim_Data(_Text) {
    try {
        const _Result = await _Invoke_Model(_System_Prompts._Claim_Data_Extraction, _Text, 512);
        const _Json_Match = _Result.match(/\{[\s\S]*\}/);
        if (_Json_Match) return JSON.parse(_Json_Match[0]);
        return {};
    } catch (_Error) {
        console.error('Claim data extraction failed:', _Error.message);
        return {};
    }
}

/**
 * Generate a WhatsApp-friendly claim summary for the farmer
 * @param {Object} _Claim_Data — claim fields
 * @param {string} _Language — language code
 * @returns {string} Formatted summary text
 */
async function _Generate_Claim_Summary(_Claim_Data, _Language = 'hi') {
    const _Prompt = `Claim data: ${JSON.stringify(_Claim_Data)}\nLanguage: ${_Language}`;
    try {
        return await _Invoke_Model(_System_Prompts._Claim_Summary, _Prompt, 600);
    } catch (_Error) {
        console.error('Summary generation failed:', _Error.message);
        return _Build_Fallback_Summary(_Claim_Data);
    }
}

/**
 * Draft a formal appeal letter for a rejected claim
 * @param {Object} _Claim_Data — claim details including rejection reason
 * @returns {string} Appeal letter text
 */
async function _Generate_Appeal_Letter(_Claim_Data) {
    const _Prompt = `Claim details: ${JSON.stringify(_Claim_Data)}\nRejection reason: ${_Claim_Data.rejectionReason || 'Not specified'}`;
    try {
        return await _Invoke_Model(_System_Prompts._Appeal_Letter, _Prompt, 1200);
    } catch (_Error) {
        console.error('Appeal generation failed:', _Error.message);
        return _Build_Fallback_Appeal(_Claim_Data);
    }
}

/**
 * Parse a natural language date into YYYY-MM-DD
 * @param {string} _Date_Text — e.g. "kal", "15 February", "pichle hafte"
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
async function _Parse_Date(_Date_Text) {
    const _Today = new Date().toISOString().split('T')[0];
    try {
        const _Result = await _Invoke_Model(
            _System_Prompts._Date_Parser,
            `Today is ${_Today}. Parse: "${_Date_Text}"`,
            20
        );
        const _Date_Match = _Result.match(/\d{4}-\d{2}-\d{2}/);
        return _Date_Match ? _Date_Match[0] : _Today;
    } catch (_Error) {
        return _Today;
    }
}

/**
 * Parse a natural language location into structured village/district/state
 * @param {string} _Location_Text — e.g. "Kamptee, Nagpur"
 * @returns {Object} { village, district, state }
 */
async function _Parse_Location(_Location_Text) {
    try {
        const _Result = await _Invoke_Model(_System_Prompts._Location_Parser, _Location_Text, 200);
        const _Json_Match = _Result.match(/\{[\s\S]*\}/);
        if (_Json_Match) return JSON.parse(_Json_Match[0]);
        return { village: _Location_Text, district: null, state: null };
    } catch (_Error) {
        return { village: _Location_Text, district: null, state: null };
    }
}

/**
 * Generate a conversational response in the farmer's language
 * @param {string} _Context — current conversation context
 * @param {string} _User_Message — what the farmer said
 * @param {string} _Language — language code
 * @returns {string} Bot response
 */
async function _Generate_Response(_Context, _User_Message, _Language = 'hi') {
    const _Prompt = `Language: ${_Language}\nContext: ${_Context}\nFarmer says: ${_User_Message}`;
    try {
        return await _Invoke_Model(_System_Prompts._Conversational_Response, _Prompt, 400);
    } catch (_Error) {
        console.error('Response generation failed:', _Error.message);
        return _Language === 'en'
            ? 'I\'m having trouble understanding. Could you please try again?'
            : 'Mujhe samajhne mein dikkat ho rahi hai. Kripya dobara try karein.';
    }
}

/**
 * Translate chatbot copy into the selected language.
 * Translation is cached per warm Lambda container to reduce repeated Bedrock calls.
 *
 * @param {string} _Text - source text
 * @param {string} _Language - target language code
 * @returns {string} translated text
 */
async function _Translate_Text(_Text, _Language = 'en') {
    if (!_Text || typeof _Text !== 'string') return _Text;
    if (_Language === 'en') return _Text;

    const _Cache_Key = `${_Language}::${_Text}`;
    if (_Translation_Cache.has(_Cache_Key)) {
        return _Translation_Cache.get(_Cache_Key);
    }

    const _Lang_Map = {
        hi: 'Hindi',
        mr: 'Marathi',
        te: 'Telugu',
        ta: 'Tamil',
        gu: 'Gujarati',
        kn: 'Kannada',
        en: 'English',
    };
    const _Target_Name = _Lang_Map[_Language] || 'Hindi';
    const _Prompt = `Target language: ${_Target_Name} (${_Language})\n\nText:\n${_Text}`;

    try {
        const _Translated = await _Invoke_Model(_System_Prompts._Translator, _Prompt, 1024);
        const _Value = (_Translated || _Text).trim() || _Text;
        _Translation_Cache.set(_Cache_Key, _Value);
        return _Value;
    } catch (_Error) {
        console.error('Translation failed:', _Error.message);
        return _Text;
    }
}


// ═════════════════════════════════════════════════════════════
//  FALLBACK GENERATORS — used when Bedrock calls fail
// ═════════════════════════════════════════════════════════════

function _Build_Fallback_Summary(_Claim) {
    return [
        `📋 Claim Summary:`,
        `👤 Name: ${_Claim.farmerName || 'N/A'}`,
        `🏘 Village: ${_Claim.village || 'N/A'}, ${_Claim.district || ''}`,
        `🌾 Crop: ${_Claim.cropType || 'N/A'}`,
        `📅 Loss: ${_Claim.lossDate || 'N/A'}`,
        `⚡ Cause: ${(_Claim.cause || 'N/A').replace(/_/g, ' ')}`,
        `📐 Area: ${_Claim.areaHectares || 'N/A'} ha`,
        `\n✅ Sab sahi hai? "Haan" bolein.`,
    ].join('\n');
}

function _Build_Fallback_Appeal(_Claim) {
    return `To The Claims Manager,\n\nI, ${_Claim.farmerName || 'the undersigned'}, from village ${_Claim.village || 'N/A'}, ${_Claim.district || ''}, ${_Claim.state || ''}, submit this appeal against the rejection of claim ${_Claim.claimId || 'N/A'}.\n\nRejection reason: "${_Claim.rejectionReason || 'Not stated'}"\n\nI request reconsideration based on the AI-verified evidence submitted.\n\nYours faithfully,\n${_Claim.farmerName || 'Farmer'}`;
}


// ═════════════════════════════════════════════════════════════
//  AI-POWERED OPTION ROUTING — replaces all keyword matching
// ═════════════════════════════════════════════════════════════

/**
 * Interpret what the farmer wants based on current state and available actions.
 * This is the core AI routing function — every message goes through here.
 *
 * @param {string} _State — current conversation state name
 * @param {string} _User_Text — what the farmer typed/said
 * @param {Array} _Available_Actions — [{ key, description }]
 * @param {string} _Language — farmer's language code
 * @returns {Object} { action: string, data: string|null }
 */
async function _Interpret_Message(_State, _User_Text, _Available_Actions, _Language = 'hi') {
    const _Actions_List = _Available_Actions.map(a => `- ${a.key}: ${a.description}`).join('\n');

    const _System = `You are BimaSathi's conversation router for Indian crop insurance.

Current state: ${_State}
Farmer's language: ${_Language}

Available actions:
${_Actions_List}

The farmer sent a message. Determine which action they want.
Consider:
- They may type a number (1, 2, 3) matching an option
- They may describe what they want in Hindi, Hinglish, English, Marathi, Telugu, Tamil, Gujarati, or Kannada
- They may use slang, misspellings, abbreviations, or informal language
- They may be providing free-form data (name, village, crop type, date, etc.)
- If providing data, use action DATA_INPUT and extract the data

Return ONLY valid JSON — no markdown, no explanation:
{"action": "<ACTION_KEY>", "data": "<extracted data or null>"}`;

    try {
        const _Result = await _Invoke_Model(_System, _User_Text, 100);
        // Strip any markdown fencing if present
        const _Clean = _Result.trim().replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
        const _Parsed = JSON.parse(_Clean);
        return {
            action: (_Parsed.action || 'UNKNOWN').toUpperCase(),
            data: _Parsed.data || _Parsed.extracted_data || null,
        };
    } catch (_Err) {
        console.error('_Interpret_Message parse error:', _Err.message);
        return { action: 'UNKNOWN', data: null };
    }
}


// ═════════════════════════════════════════════════════════════
//  DOCUMENT BUILDER AGENT — Bedrock AI Functions
// ═════════════════════════════════════════════════════════════

/**
 * Extract a form schema from document text — identifies fields that need filling
 * @param {string} _Extracted_Text — raw text from Textract
 * @returns {Array} Array of { field_name, field_label, field_type, is_required, accepted_values }
 */
async function _Extract_Form_Schema(_Extracted_Text) {
    const _Prompt = `You are an expert at analyzing Indian crop insurance application forms (PMFBY and state-level schemes).

Given the extracted text from an insurance form template, identify ALL fields that need to be filled in.

For each field, return:
- field_name: a snake_case identifier (e.g. "farmer_name", "aadhaar_number", "bank_ifsc")
- field_label: the human-readable label as it appears on the form
- field_type: one of "text", "number", "date", "choice", "photo"
- is_required: true/false based on whether the form marks it as mandatory
- accepted_values: array of valid options if field_type is "choice", otherwise null
- language_hint: a simple Hindi/Hinglish hint explaining what data is needed

Return a valid JSON array only. No explanation, no markdown fences.`;

    try {
        const _Result = await _Invoke_Model(_Prompt, _Extracted_Text, 2048);
        const _Clean = _Result.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        return JSON.parse(_Clean);
    } catch (_Err) {
        console.error('Form schema extraction failed:', _Err.message);
        return [];
    }
}


/**
 * Auto-fill form fields by matching extracted document data against pending fields
 * @param {Array} _Pending_Fields — fields with status 'pending'
 * @param {Array} _Document_Data — extracted key-value pairs from received documents
 * @returns {Array} Array of { field_name, value, confidence, source }
 */
async function _Auto_Fill_Fields(_Pending_Fields, _Document_Data) {
    const _Prompt = `You are a data matching expert for Indian crop insurance applications.

You have two inputs:
1. PENDING FORM FIELDS that need to be filled (each has a field_name and field_label)
2. EXTRACTED DATA from documents the farmer has already submitted (from Aadhaar, bank passbook, land records, etc.)

Match the extracted data to the pending fields using semantic understanding. Consider:
- Hindi/English field label variations (e.g. "नाम" = "Name" = "farmer_name")
- Common document field formats (e.g. "UID No" = Aadhaar number)
- Indian document conventions (IFSC codes, Khasra numbers, etc.)

For each match, return:
- field_name: the pending field's field_name
- value: the extracted value to fill
- confidence: a number between 0.0 and 1.0 indicating match confidence
- source: the document type or key where this data came from

Only return matches with confidence >= 0.5. Return a valid JSON array. No explanation, no markdown fences.`;

    const _User_Msg = `PENDING FIELDS:\n${JSON.stringify(_Pending_Fields, null, 2)}\n\nEXTRACTED DOCUMENT DATA:\n${JSON.stringify(_Document_Data, null, 2)}`;

    try {
        const _Result = await _Invoke_Model(_Prompt, _User_Msg, 2048);
        const _Clean = _Result.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        return JSON.parse(_Clean);
    } catch (_Err) {
        console.error('Auto-fill matching failed:', _Err.message);
        return [];
    }
}


/**
 * Generate a formal 3-paragraph claim narrative for PDF inclusion
 * @param {Object} _Claim_Data — all collected claim fields
 * @param {string} _Language — language code (output is always English for official documents)
 * @returns {string} Formal claim description
 */
async function _Generate_Claim_Narrative(_Claim_Data) {
    const _Prompt = `You are a professional insurance claim writer for the Indian crop insurance system (PMFBY).

Write a formal 3-paragraph claim description for an official insurance claim document:

Paragraph 1: Describe the farmer, their location, and the insured crop.
Paragraph 2: Detail the loss event — date, cause, extent of damage, area affected.
Paragraph 3: State the claim request, reference any supporting evidence (photos, documents), and note the filing timeline.

Use formal English suitable for an official government insurance claim document. Keep it factual and concise (200-300 words total).
Do not use markdown formatting. Write plain text paragraphs only.`;

    try {
        return await _Invoke_Model(_Prompt, JSON.stringify(_Claim_Data, null, 2), 1024);
    } catch (_Err) {
        console.error('Claim narrative generation failed:', _Err.message);
        return 'Claim narrative could not be generated. Please refer to the attached form data and evidence.';
    }
}


/**
 * Generate a conversational question for a specific form field
 * @param {Object} _Field — field schema object with field_name, field_label, field_type, etc.
 * @param {string} _Language — farmer's preferred language code
 * @param {number} _Progress_Current — number of fields completed so far
 * @param {number} _Progress_Total — total required fields
 * @returns {string} A simple, farmer-friendly question
 */
async function _Generate_Field_Question(_Field, _Language = 'hi', _Progress_Current = 0, _Progress_Total = 0) {
    const _Lang_Map = { hi: 'Hindi/Hinglish', mr: 'Marathi', te: 'Telugu', ta: 'Tamil', gu: 'Gujarati', kn: 'Kannada', en: 'English' };
    const _Lang_Name = _Lang_Map[_Language] || 'Hindi/Hinglish';

    const _Prompt = `You are a friendly insurance assistant helping a rural Indian farmer fill an insurance claim form via WhatsApp.

Generate a single conversational question to collect the following information from the farmer:
- Field: ${_Field.field_label} (${_Field.field_name})
- Type: ${_Field.field_type}
- Required: ${_Field.is_required ? 'Yes' : 'No (optional)'}
${_Field.accepted_values ? `- Valid options: ${_Field.accepted_values.join(', ')}` : ''}
${_Field.language_hint ? `- Hint: ${_Field.language_hint}` : ''}

Rules:
1. Use simple ${_Lang_Name} language (mix with easy Hindi/English words if needed)
2. If the field is a choice, list the options with numbers
3. Add an appropriate emoji at the start
4. If the field is optional, mention that they can type "skip" to skip it
5. Keep it under 100 words
6. Do NOT add any prefix like "Question:" — just output the message directly

${_Progress_Total > 0 ? `Progress: ${_Progress_Current}/${_Progress_Total} fields completed.` : ''}`;

    try {
        return await _Invoke_Model(_Prompt, '', 256);
    } catch (_Err) {
        console.error('Field question generation failed:', _Err.message);
        // Fallback: use the language_hint or field_label
        return _Field.language_hint || `Please provide: ${_Field.field_label}`;
    }
}


// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────
module.exports = {
    _Invoke_Model,
    _Invoke_Model_With_Image,
    _System_Prompts,
    _Detect_Intent,
    _Interpret_Message,
    _Extract_Claim_Data, // Assuming this exists elsewhere or is a placeholder
    _Generate_Claim_Summary, // Assuming this exists elsewhere or is a placeholder
    _Generate_Appeal_Letter, // Assuming this exists elsewhere or is a placeholder
    _Parse_Date, // Assuming this exists elsewhere or is a placeholder
    _Parse_Location, // Assuming this exists elsewhere or is a placeholder
    _Generate_Response, // Assuming this exists elsewhere or is a placeholder
    _Translate_Text,
    // Document Builder Agent
    _Extract_Form_Schema,
    _Auto_Fill_Fields,
    _Generate_Claim_Narrative,
    _Generate_Field_Question,
};

/**
 * Handle user queries via the BimaSathi Query Bot
 * @param {string} _Query — User's question
 * @param {string} _Language — User's language code
 * @returns {string} Bot's answer
 */
async function _Query_Bot_Message(_Query, _Language) {
    const _Lang_Map = {
        'hi': 'Hindi / simple Hinglish',
        'en': 'English',
        'mr': 'Marathi',
        'te': 'Telugu',
        'ta': 'Tamil',
        'gu': 'Gujarati',
        'kn': 'Kannada'
    };

    const _Lang_Name = _Lang_Map[_Language] || 'Hinglish';
    const _Prompt = _System_Prompts._Query_Bot_Responder.replace('{language}', _Lang_Name).replace('{query}', _Query);

    try {
        return await _Invoke_Model(_Prompt, '', 512);
    } catch (_Err) {
        console.error('Query Bot error:', _Err.message);
        return _Language === 'en' ? 'I am currently unable to answer this question. Please type "menu" to go back.' : 'Abhi main is sawal ka jawab nahi de sakta. Wapas jaane ke liye "menu" type karein.';
    }
}
module.exports._Query_Bot_Message = _Query_Bot_Message;
