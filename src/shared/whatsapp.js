/**
 * BimaSathi — Meta WhatsApp Cloud API Integration
 * 
 * All WhatsApp messaging goes through the official Meta Graph API:
 *   - Send text, native interactive buttons, lists, media
 *   - OTP send/verify (Mocked for Test Number)
 *   - Webhook signature validation (X-Hub-Signature-256)
 *   - Media downloading
 */

const crypto = require('crypto');

const _Access_Token = process.env.META_ACCESS_TOKEN;
const _Phone_Number_ID = process.env.META_PHONE_NUMBER_ID;
const _Verify_Token = process.env.META_VERIFY_TOKEN;
const _Base_URL = `https://graph.facebook.com/v18.0/${_Phone_Number_ID}/messages`;

// In-memory OTP cache for the Sandbox (since we can't use Twilio Verify anymore)
const _OTP_Cache = {};

// ═════════════════════════════════════════════════════════════
//  UTILITIES
// ═════════════════════════════════════════════════════════════

function _Format_Phone(_Number) {
    // Meta requires plain international number without '+' or 'whatsapp:' prefixes
    let _Clean = _Number.replace(/[^0-9]/g, '');
    if (_Clean.length === 10) _Clean = '91' + _Clean; // Default to India if no code
    return _Clean;
}

async function _Send_Meta_Message(_Payload) {
    if (!_Access_Token || !_Phone_Number_ID) {
        console.error('Meta environment variables missing!');
        return { error: 'Configuration Error' };
    }

    try {
        const _Response = await fetch(_Base_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${_Access_Token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(_Payload)
        });

        const _Data = await _Response.json();
        if (_Data.error) {
            console.error('Meta API Error:', JSON.stringify(_Data.error));
        }
        return _Data;
    } catch (_Err) {
        console.error('Failed to send Meta message:', _Err.message);
        return { error: _Err.message };
    }
}


// ═════════════════════════════════════════════════════════════
//  MESSAGE SENDING
// ═════════════════════════════════════════════════════════════

async function _Send_Text_Message(_To_Number, _Body) {
    const _Payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: _Format_Phone(_To_Number),
        type: 'text',
        text: { preview_url: false, body: _Body }
    };
    return _Send_Meta_Message(_Payload);
}

async function _Send_Button_Message(_To_Number, _Body, _Buttons) {
    // Meta allows max 3 buttons per interactive message
    const _Meta_Buttons = _Buttons.slice(0, 3).map((_Btn, _Idx) => ({
        type: 'reply',
        reply: {
            id: _Btn.id || `btn_${_Idx}`,
            title: _Btn.title.substring(0, 20) // Meta limits title to 20 chars
        }
    }));

    const _Payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: _Format_Phone(_To_Number),
        type: 'interactive',
        interactive: {
            type: 'button',
            body: { text: _Body },
            action: { buttons: _Meta_Buttons }
        }
    };
    return _Send_Meta_Message(_Payload);
}

async function _Send_List_Message(_To_Number, _Body, _Items, _Button_Text = 'Select Option', _Section_Title = 'Options') {
    const _Rows = _Items.slice(0, 10).map((_Item, _Idx) => ({
        id: _Item.id || `list_${_Idx}`,
        title: _Item.title.substring(0, 24),
        description: (_Item.description || '').substring(0, 72)
    }));

    const _Payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: _Format_Phone(_To_Number),
        type: 'interactive',
        interactive: {
            type: 'list',
            body: { text: _Body },
            action: {
                button: _Button_Text.substring(0, 20),
                sections: [{ title: _Section_Title.substring(0, 24), rows: _Rows }]
            }
        }
    };
    return _Send_Meta_Message(_Payload);
}

async function _Send_Media_Message(_To_Number, _Media_URL, _Caption = '') {
    const _Payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: _Format_Phone(_To_Number),
        type: 'image',
        image: { link: _Media_URL }
    };
    if (_Caption) _Payload.image.caption = _Caption;
    return _Send_Meta_Message(_Payload);
}


// ═════════════════════════════════════════════════════════════
//  OTP (MOCK IMPLEMENTATION FOR SANDBOX)
// ═════════════════════════════════════════════════════════════

async function _Send_OTP(_Phone_Number) {
    const _Clean = _Format_Phone(_Phone_Number);
    // Since this is a test environment, always send '1234'
    const _Code = '1234';
    _OTP_Cache[_Clean] = _Code;

    await _Send_Text_Message(_Clean, `*BimaSathi OTP*\nYour verification code is: ${_Code}\nIt expires in 10 minutes.`);
    return true;
}

async function _Verify_OTP(_Phone_Number, _Code) {
    const _Clean = _Format_Phone(_Phone_Number);
    // In our test environment, '1234' always works if it was requested
    if (_OTP_Cache[_Clean] === _Code.trim()) {
        delete _OTP_Cache[_Clean];
        return true;
    }
    return false;
}


// ═════════════════════════════════════════════════════════════
//  WEBHOOK PARSING + VALIDATION
// ═════════════════════════════════════════════════════════════

function _Parse_Webhook(_Raw_Body) {
    const _Body = typeof _Raw_Body === 'string' ? JSON.parse(_Raw_Body) : _Raw_Body;

    // Check if it's a valid WhatsApp webhook event
    if (_Body.object !== 'whatsapp_business_account') return null;

    const _Entry = _Body.entry?.[0];
    const _Changes = _Entry?.changes?.[0]?.value;

    // Ignore statuses (delivered, read)
    if (!_Changes || !_Changes.messages || _Changes.messages.length === 0) {
        return { type: 'status' };
    }

    const _Message = _Changes.messages[0];
    const _Contact = _Changes.contacts?.[0] || {};

    const _Parsed = {
        from: `whatsapp:+${_Message.from}`,
        to: `whatsapp:+${_Changes.metadata.display_phone_number}`,
        body: '',
        message_sid: _Message.id,
        type: 'unknown',
        media_url: null,
        media_content_type: null,
        latitude: null,
        longitude: null,
        profile_name: _Contact.profile?.name || '',
        raw: _Message
    };

    // Extract content based on message type
    if (_Message.type === 'text') {
        _Parsed.body = _Message.text.body;
        _Parsed.type = 'text';
    } else if (_Message.type === 'interactive') {
        _Parsed.type = 'text'; // Normalize to text for the engine
        if (_Message.interactive.type === 'button_reply') {
            _Parsed.body = _Message.interactive.button_reply.id || _Message.interactive.button_reply.title;
        } else if (_Message.interactive.type === 'list_reply') {
            _Parsed.body = _Message.interactive.list_reply.id || _Message.interactive.list_reply.title;
        }
    } else if (_Message.type === 'image' || _Message.type === 'document' || _Message.type === 'audio') {
        // Meta sends media IDs which need to be fetched, not direct URLs yet
        // A second step is needed to resolve the ID to a URL, using raw message structure for now
        _Parsed.type = _Message.type === 'audio' ? 'voice' : _Message.type;
        _Parsed.media_id = _Message[_Message.type].id;
        _Parsed.media_content_type = _Message[_Message.type].mime_type || null;
        _Parsed.body = _Message[_Message.type].caption || '';
    } else if (_Message.type === 'location') {
        _Parsed.type = 'location';
        _Parsed.latitude = _Message.location.latitude;
        _Parsed.longitude = _Message.location.longitude;
    }

    return _Parsed;
}

function _Validate_Signature(_Signature_Header, _Raw_Body, _App_Secret) {
    if (!_Signature_Header || !_App_Secret) return false;

    // Meta uses sha256=...
    const _Expected_Hash = crypto
        .createHmac('sha256', _App_Secret)
        .update(_Raw_Body, 'utf8')
        .digest('hex');

    const _Expected_Signature = `sha256=${_Expected_Hash}`;

    try {
        return crypto.timingSafeEqual(Buffer.from(_Signature_Header), Buffer.from(_Expected_Signature));
    } catch (e) {
        return false;
    }
}

async function _Download_Media(_Media_ID) {
    if (!_Media_ID) {
        return { buffer: null, contentType: '', error: 'MISSING_MEDIA_ID', statusCode: null };
    }
    if (!_Access_Token) {
        return { buffer: null, contentType: '', error: 'MISSING_META_TOKEN', statusCode: null };
    }

    try {
        // Step 1: Resolve the media ID to a temporary download URL.
        const _Meta_URL = `https://graph.facebook.com/v18.0/${_Media_ID}`;
        const _URL_Response = await fetch(_Meta_URL, {
            headers: { 'Authorization': `Bearer ${_Access_Token}` }
        });

        let _URL_Data = {};
        try {
            _URL_Data = await _URL_Response.json();
        } catch (_Json_Error) {
            console.error('Meta media metadata was not valid JSON:', _Json_Error.message);
        }

        if (!_URL_Response.ok) {
            const _Error_Code = _URL_Data?.error?.code || _URL_Response.status;
            console.error(`Meta media metadata lookup failed: status=${_URL_Response.status}, code=${_Error_Code}`);
            return {
                buffer: null,
                contentType: '',
                error: 'META_MEDIA_LOOKUP_FAILED',
                statusCode: _URL_Response.status,
                metaError: _URL_Data?.error || null,
            };
        }

        if (!_URL_Data.url) {
            console.error('Meta media metadata did not include a download URL');
            return { buffer: null, contentType: '', error: 'META_MEDIA_URL_MISSING', statusCode: _URL_Response.status };
        }

        // Step 2: Download the actual binary media file.
        const _Media_Response = await fetch(_URL_Data.url, {
            headers: { 'Authorization': `Bearer ${_Access_Token}` }
        });

        if (!_Media_Response.ok) {
            console.error(`Meta media download failed: status=${_Media_Response.status}, mediaId=${_Media_ID}`);
            return {
                buffer: null,
                contentType: _URL_Data.mime_type || '',
                error: 'META_MEDIA_DOWNLOAD_FAILED',
                statusCode: _Media_Response.status,
            };
        }

        const _Buffer = Buffer.from(await _Media_Response.arrayBuffer());
        if (!_Buffer.length) {
            console.error(`Meta media download returned an empty body: mediaId=${_Media_ID}`);
            return {
                buffer: null,
                contentType: _URL_Data.mime_type || _Media_Response.headers.get('content-type') || '',
                error: 'META_MEDIA_EMPTY',
                statusCode: _Media_Response.status,
            };
        }

        const _Content_Type = _URL_Data.mime_type || _Media_Response.headers.get('content-type') || 'application/octet-stream';

        return {
            buffer: _Buffer,
            contentType: _Content_Type,
            statusCode: _Media_Response.status,
            error: null,
        };
    } catch (error) {
        console.error('Failed to download Meta media:', error.message);
        return { buffer: null, contentType: '', error: 'META_MEDIA_EXCEPTION', statusCode: null };
    }
}


module.exports = {
    _Send_Text_Message,
    _Send_Button_Message,
    _Send_List_Message,
    _Send_Media_Message,
    _Send_OTP,
    _Verify_OTP,
    _Parse_Webhook,
    _Validate_Signature,
    _Download_Media
};
