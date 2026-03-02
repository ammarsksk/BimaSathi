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

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const _Bedrock_Region = process.env.BEDROCK_REGION || 'us-east-1';
const _Model_Id = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
const _Bedrock_Client = new BedrockRuntimeClient({ region: _Bedrock_Region });


// ═════════════════════════════════════════════════════════════
//  CORE INVOCATION
// ═════════════════════════════════════════════════════════════

/**
 * Invoke Amazon Bedrock with a system prompt and user message
 * Returns the raw text response from the model
 *
 * @param {string} _System_Prompt — system-level instruction
 * @param {string} _User_Message — user's input
 * @param {number} _Max_Tokens — max response length (default 1024)
 * @returns {string} Model response text
 */
async function _Invoke_Model(_System_Prompt, _User_Message, _Max_Tokens = 1024) {
    const _Request_Body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: _Max_Tokens,
        system: _System_Prompt,
        messages: [{ role: 'user', content: _User_Message }],
        temperature: 0.3,
    });

    try {
        const _Response = await _Bedrock_Client.send(new InvokeModelCommand({
            modelId: _Model_Id,
            body: _Request_Body,
            contentType: 'application/json',
            accept: 'application/json',
        }));

        const _Response_Body = JSON.parse(new TextDecoder().decode(_Response.body));
        return _Response_Body.content?.[0]?.text || '';
    } catch (_Error) {
        console.error('Bedrock invocation failed:', _Error.message);

        // Retry with fallback model if primary model unavailable
        if (_Error.name === 'ModelNotReadyException' || _Error.name === 'ThrottlingException') {
            return _Invoke_Fallback(_System_Prompt, _User_Message, _Max_Tokens);
        }
        throw _Error;
    }
}

/**
 * Fallback model invocation (Claude 3 Haiku — cheaper, faster)
 */
async function _Invoke_Fallback(_System_Prompt, _User_Message, _Max_Tokens) {
    const _Fallback_Model = 'anthropic.claude-3-haiku-20240307-v1:0';
    const _Request_Body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: _Max_Tokens,
        system: _System_Prompt,
        messages: [{ role: 'user', content: _User_Message }],
        temperature: 0.3,
    });

    const _Response = await _Bedrock_Client.send(new InvokeModelCommand({
        modelId: _Fallback_Model,
        body: _Request_Body,
        contentType: 'application/json',
        accept: 'application/json',
    }));

    const _Response_Body = JSON.parse(new TextDecoder().decode(_Response.body));
    return _Response_Body.content?.[0]?.text || '';
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


// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────
module.exports = {
    _Invoke_Model,
    _System_Prompts,
    _Detect_Intent,
    _Extract_Claim_Data,
    _Generate_Claim_Summary,
    _Generate_Appeal_Letter,
    _Parse_Date,
    _Parse_Location,
    _Generate_Response,
};
