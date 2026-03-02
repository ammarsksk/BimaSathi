/**
 * BimaSathi — WhatsApp Webhook Lambda
 * 
 * Entry point for all incoming WhatsApp messages via Twilio.
 * Receives the POST from Twilio, validates signature, parses
 * the message, classifies its type, and invokes the conversation engine.
 * Returns 200 immediately to Twilio (within 15s requirement).
 */

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { _Parse_Webhook, _Validate_Signature } = require('../../shared/twilio');

const _Lambda_Client = new LambdaClient({ region: process.env.AWS_REGION || 'ap-south-1' });


exports.handler = async (_Event) => {
    console.log('Webhook received:', JSON.stringify(_Event).substring(0, 500));

    try {
        // ── Parse the incoming Twilio POST body ──
        const _Raw_Body = _Event.body || '';
        const _Is_Base64 = _Event.isBase64Encoded;
        const _Decoded_Body = _Is_Base64
            ? Buffer.from(_Raw_Body, 'base64').toString('utf-8')
            : _Raw_Body;

        const _Parsed_Message = _Parse_Webhook(_Decoded_Body);

        // ── Validate Twilio signature (skip in dev) ──
        const _Signature = _Event.headers?.['X-Twilio-Signature'] || _Event.headers?.['x-twilio-signature'];
        const _Request_URL = `https://${_Event.headers?.Host || 'api'}${_Event.requestContext?.path || '/webhook/whatsapp'}`;

        if (process.env.NODE_ENV === 'production') {
            const _Params = typeof _Decoded_Body === 'string'
                ? Object.fromEntries(new URLSearchParams(_Decoded_Body))
                : _Decoded_Body;

            const _Is_Valid = _Validate_Signature(_Signature, _Request_URL, _Params);
            if (!_Is_Valid) {
                console.warn('Invalid Twilio signature — rejecting request');
                return _Build_Response(403, 'Forbidden');
            }
        }

        // ── Build the event payload for the conversation engine ──
        const _Engine_Payload = {
            from: _Parsed_Message.from,
            body: _Parsed_Message.body,
            type: _Parsed_Message.type,
            message_sid: _Parsed_Message.message_sid,
            media_data: {
                url: _Parsed_Message.media_url,
                content_type: _Parsed_Message.media_type,
            },
            location: {
                latitude: _Parsed_Message.latitude,
                longitude: _Parsed_Message.longitude,
            },
        };

        // ── Invoke the conversation engine asynchronously ──
        // Using 'Event' invocation type so we don't block the Twilio response
        await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.CONVERSATION_ENGINE_FUNCTION || 'bimasathi-conversation-engine',
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify(_Engine_Payload)),
        }));

        console.log(`Message routed: from=${_Parsed_Message.from}, type=${_Parsed_Message.type}`);

        // ── Return 200 to Twilio immediately ──
        return _Build_Response(200, '<Response></Response>', 'text/xml');

    } catch (_Error) {
        console.error('Webhook processing error:', _Error);
        // Still return 200 to prevent Twilio retries
        return _Build_Response(200, '<Response></Response>', 'text/xml');
    }
};


/**
 * Build a standard API Gateway response object
 */
function _Build_Response(_Status_Code, _Body, _Content_Type = 'text/plain') {
    return {
        statusCode: _Status_Code,
        headers: {
            'Content-Type': _Content_Type,
            'Access-Control-Allow-Origin': '*',
        },
        body: _Body,
    };
}
