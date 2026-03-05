/**
 * BimaSathi — Twilio WhatsApp Integration
 * 
 * All WhatsApp messaging goes through Twilio:
 *   - Send text, interactive buttons, list messages, media
 *   - OTP send/verify via Twilio Verify
 *   - Webhook signature validation
 *   - Media download from Twilio URLs
 */

const _Account_Sid = process.env.TWILIO_ACCOUNT_SID;
const _Auth_Token = process.env.TWILIO_AUTH_TOKEN;
const _WhatsApp_Number = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
const _Verify_SID = process.env.TWILIO_VERIFY_SERVICE_SID;
const _Base_URL = 'https://api.twilio.com/2010-04-01';

const _Auth_Header = 'Basic ' + Buffer.from(`${_Account_Sid}:${_Auth_Token}`).toString('base64');


// ═════════════════════════════════════════════════════════════
//  MESSAGE SENDING
// ═════════════════════════════════════════════════════════════

/**
 * Send a plain text WhatsApp message
 * @param {string} _To_Number — recipient (with or without whatsapp: prefix)
 * @param {string} _Body — message body text
 */
async function _Send_Text_Message(_To_Number, _Body) {
    const _To = _Format_WhatsApp_Number(_To_Number);
    return _Send_Twilio_Message({ To: _To, From: _WhatsApp_Number, Body: _Body });
}

/**
 * Send an interactive button message
 * Buttons appear as quick-reply options below the text
 * @param {string} _To_Number — recipient
 * @param {string} _Body — message body
 * @param {Array} _Buttons — array of { id, title } objects (max 3)
 */
async function _Send_Button_Message(_To_Number, _Body, _Buttons) {
    const _To = _Format_WhatsApp_Number(_To_Number);

    // Twilio uses ContentSid for interactive messages
    // Fallback: send numbered text with button labels
    const _Button_Text = _Buttons.map((_Btn, _Idx) => `${_Idx + 1}. ${_Btn.title}`).join('\n');
    const _Full_Body = `${_Body}\n\n${_Button_Text}`;

    return _Send_Twilio_Message({ To: _To, From: _WhatsApp_Number, Body: _Full_Body });
}

/**
 * Send a list message (interactive menu with selectable options)
 * @param {string} _To_Number — recipient
 * @param {string} _Body — header/body text
 * @param {Array} _Items — array of { id, title, description? }
 */
async function _Send_List_Message(_To_Number, _Body, _Items) {
    const _To = _Format_WhatsApp_Number(_To_Number);

    const _Item_Text = _Items.map((_Item, _Idx) => {
        const _Desc = _Item.description ? ` — ${_Item.description}` : '';
        return `${_Idx + 1}. ${_Item.title}${_Desc}`;
    }).join('\n');

    const _Full_Body = `${_Body}\n\n${_Item_Text}`;
    return _Send_Twilio_Message({ To: _To, From: _WhatsApp_Number, Body: _Full_Body });
}

/**
 * Send a media message (image, PDF, or audio with optional caption)
 * @param {string} _To_Number — recipient
 * @param {string} _Media_URL — publicly accessible URL of the media
 * @param {string} _Caption — optional text caption
 */
async function _Send_Media_Message(_To_Number, _Media_URL, _Caption = '') {
    const _To = _Format_WhatsApp_Number(_To_Number);
    const _Params = { To: _To, From: _WhatsApp_Number, MediaUrl: _Media_URL };
    if (_Caption) _Params.Body = _Caption;
    return _Send_Twilio_Message(_Params);
}


// ═════════════════════════════════════════════════════════════
//  OTP — Twilio Verify
// ═════════════════════════════════════════════════════════════

/**
 * Send an OTP to a phone number via Twilio Verify
 * @param {string} _Phone_Number — E.164 format (e.g. +919876543210)
 */
async function _Send_OTP(_Phone_Number) {
    const _Formatted = _Phone_Number.startsWith('+') ? _Phone_Number : `+91${_Phone_Number}`;
    const _URL = `https://verify.twilio.com/v2/Services/${_Verify_SID}/Verifications`;

    const _Response = await fetch(_URL, {
        method: 'POST',
        headers: { Authorization: _Auth_Header, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: _Formatted, Channel: 'sms' }),
    });

    const _Data = await _Response.json();
    return _Data.status === 'pending';
}

/**
 * Verify an OTP code
 * @param {string} _Phone_Number — E.164 format
 * @param {string} _Code — OTP code entered by user
 * @returns {boolean} True if verified
 */
async function _Verify_OTP(_Phone_Number, _Code) {
    const _Formatted = _Phone_Number.startsWith('+') ? _Phone_Number : `+91${_Phone_Number}`;
    const _URL = `https://verify.twilio.com/v2/Services/${_Verify_SID}/VerificationCheck`;

    try {
        const _Response = await fetch(_URL, {
            method: 'POST',
            headers: { Authorization: _Auth_Header, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ To: _Formatted, Code: _Code }),
        });

        const _Data = await _Response.json();
        return _Data.status === 'approved';
    } catch (_Error) {
        console.error('OTP verification failed:', _Error.message);
        return false;
    }
}


// ═════════════════════════════════════════════════════════════
//  WEBHOOK PARSING + VALIDATION
// ═════════════════════════════════════════════════════════════

/**
 * Parse an incoming Twilio webhook POST body
 * @param {string|Object} _Raw_Body — URL-encoded or parsed body
 * @returns {Object} Parsed message with type classification
 */
function _Parse_Webhook(_Raw_Body) {
    const _Body = typeof _Raw_Body === 'string'
        ? Object.fromEntries(new URLSearchParams(_Raw_Body))
        : _Raw_Body;

    const _Parsed = {
        from: _Body.From || '',
        to: _Body.To || '',
        body: (_Body.Body || '').trim(),
        message_sid: _Body.MessageSid || '',
        num_media: parseInt(_Body.NumMedia || '0', 10),
        media_url: _Body.MediaUrl0 || null,
        media_type: _Body.MediaContentType0 || null,
        latitude: _Body.Latitude || null,
        longitude: _Body.Longitude || null,
        button_text: _Body.ButtonText || null,
        list_id: _Body.ListId || null,
        type: 'text',   // default
    };

    // Classify message type
    if (_Parsed.num_media > 0) {
        if (_Parsed.media_type?.startsWith('audio')) _Parsed.type = 'voice';
        else if (_Parsed.media_type?.startsWith('image')) _Parsed.type = 'image';
        else _Parsed.type = 'document';
    } else if (_Parsed.latitude && _Parsed.longitude) {
        _Parsed.type = 'location';
    } else if (_Parsed.button_text) {
        _Parsed.type = 'button';
    } else if (_Parsed.list_id) {
        _Parsed.type = 'list';
    }

    return _Parsed;
}

/**
 * Validate Twilio webhook signature (HMAC-SHA1)
 * @param {string} _Signature — X-Twilio-Signature header
 * @param {string} _URL — full request URL
 * @param {Object} _Params — POST params
 * @returns {boolean}
 */
function _Validate_Signature(_Signature, _URL, _Params) {
    if (!_Auth_Token || !_Signature) return true; // skip in dev

    const crypto = require('crypto');

    const _Sorted_Keys = Object.keys(_Params).sort();
    let _Data_String = _URL;
    for (const _Key of _Sorted_Keys) {
        _Data_String += _Key + _Params[_Key];
    }

    const _Expected = crypto
        .createHmac('sha1', _Auth_Token)
        .update(Buffer.from(_Data_String, 'utf-8'))
        .digest('base64');

    return _Signature === _Expected;
}


// ═════════════════════════════════════════════════════════════
//  MEDIA DOWNLOAD
// ═════════════════════════════════════════════════════════════

/**
 * Download media from a Twilio media URL
 * @param {string} _Media_URL — Twilio media URL
 * @returns {{ buffer: Buffer, contentType: string }}
 */
async function _Download_Media(_Media_URL) {
    const _Response = await fetch(_Media_URL, {
        headers: { Authorization: _Auth_Header },
        redirect: 'follow',
    });

    const _Content_Type = _Response.headers.get('content-type') || 'application/octet-stream';
    const _Array_Buffer = await _Response.arrayBuffer();
    const _Buffer = Buffer.from(_Array_Buffer);

    return { buffer: _Buffer, contentType: _Content_Type };
}


// ═════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ═════════════════════════════════════════════════════════════

/**
 * Format a phone number with the whatsapp: prefix
 */
function _Format_WhatsApp_Number(_Number) {
    if (_Number.startsWith('whatsapp:')) return _Number;
    const _Clean = _Number.replace(/\s/g, '');
    const _With_Country = _Clean.startsWith('+') ? _Clean : `+91${_Clean}`;
    return `whatsapp:${_With_Country}`;
}

/**
 * Send a message via Twilio REST API
 * @param {Object} _Params — Twilio message params { To, From, Body, MediaUrl? }
 */
async function _Send_Twilio_Message(_Params) {
    const _URL = `${_Base_URL}/Accounts/${_Account_Sid}/Messages.json`;

    try {
        const _Response = await fetch(_URL, {
            method: 'POST',
            headers: { Authorization: _Auth_Header, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(_Params),
        });

        const _Data = await _Response.json();

        // Log full response for debugging
        if (!_Response.ok) {
            console.error(`Twilio HTTP ${_Response.status}: ${JSON.stringify(_Data)}`);
        }

        // Check both error formats (API-level uses 'code', message-level uses 'error_code')
        if (_Data.error_code || _Data.code) {
            console.error(`Twilio error [${_Data.error_code || _Data.code}]: ${_Data.error_message || _Data.message}`);
        }
        return _Data;
    } catch (_Error) {
        console.error('Twilio send failed:', _Error.message);
        throw _Error;
    }
}


// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────
module.exports = {
    _Send_Text_Message,
    _Send_Button_Message,
    _Send_List_Message,
    _Send_Media_Message,
    _Send_OTP,
    _Verify_OTP,
    _Parse_Webhook,
    _Validate_Signature,
    _Download_Media,
    _Format_WhatsApp_Number,
};
