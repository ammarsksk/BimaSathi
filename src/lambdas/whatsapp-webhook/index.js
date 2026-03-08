/**
 * BimaSathi — WhatsApp Webhook Lambda (Meta Cloud API)
 * 
 * Entry point for all incoming WhatsApp messages via Meta.
 * - Handles GET for hub.challenge verification.
 * - Receives POST from Meta, validates signature, parses
 *   the JSON message, and invokes the conversation engine.
 * Returns 200 immediately to Meta.
 */

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { _Parse_Webhook, _Validate_Signature } = require('../../shared/whatsapp');

const _Lambda_Client = new LambdaClient({ region: process.env.AWS_REGION || 'ap-south-1' });


exports.handler = async (_Event) => {
    console.log('Webhook received:', JSON.stringify(_Event).substring(0, 500));

    try {
        const _Method = _Event.httpMethod || _Event.requestContext?.http?.method || 'POST';

        // ═════════════════════════════════════════════════════════════
        //  META VERIFICATION CHALLENGE (GET)
        // ═════════════════════════════════════════════════════════════
        if (_Method === 'GET') {
            const _Query = _Event.queryStringParameters || {};
            const _Mode = _Query['hub.mode'];
            const _Token = _Query['hub.verify_token'];
            const _Challenge = _Query['hub.challenge'];

            if (_Mode === 'subscribe' && _Token === process.env.META_VERIFY_TOKEN) {
                console.log('WEBHOOK_VERIFIED');
                return _Build_Response(200, _Challenge);
            }
            return _Build_Response(403, 'Forbidden');
        }


        // ═════════════════════════════════════════════════════════════
        //  INCOMING MESSAGE (POST)
        // ═════════════════════════════════════════════════════════════
        const _Raw_Body = _Event.body || '';
        const _Is_Base64 = _Event.isBase64Encoded;
        const _Decoded_Body = _Is_Base64
            ? Buffer.from(_Raw_Body, 'base64').toString('utf-8')
            : _Raw_Body;

        // ── Validate Meta Signature (skip in dev) ──
        const _Signature = _Event.headers?.['X-Hub-Signature-256'] || _Event.headers?.['x-hub-signature-256'];

        if (process.env.NODE_ENV === 'production') {
            const _App_Secret = process.env.META_APP_SECRET; // Ensure this is added if strict validation needed
            if (_App_Secret) {
                const _Is_Valid = _Validate_Signature(_Signature, _Decoded_Body, _App_Secret);
                if (!_Is_Valid) {
                    console.warn('Invalid Meta signature — rejecting request');
                    return _Build_Response(403, 'Forbidden');
                }
            }
        }

        const _Parsed_Message = _Parse_Webhook(_Decoded_Body);

        // Ignore statuses (read, delivered, sent)
        if (!_Parsed_Message || _Parsed_Message.type === 'status') {
            return _Build_Response(200, 'EVENT_RECEIVED');
        }

        // ── Build the event payload for the conversation engine ──
        const _Engine_Payload = {
            from: _Parsed_Message.from,
            body: _Parsed_Message.body,
            type: _Parsed_Message.type,
            message_sid: _Parsed_Message.message_sid,
            media_data: {
                id: _Parsed_Message.media_id,
                content_type: _Parsed_Message.media_content_type,
            },
            location: {
                latitude: _Parsed_Message.latitude,
                longitude: _Parsed_Message.longitude,
            },
            profile_name: _Parsed_Message.profile_name
        };

        // ── Invoke the conversation engine asynchronously ──
        // Using 'Event' invocation type so we don't block the Meta response
        await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.CONVERSATION_ENGINE_FUNCTION || 'bimasathi-conversation-engine',
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify(_Engine_Payload)),
        }));

        console.log(`Message routed: from=${_Parsed_Message.from}, type=${_Parsed_Message.type}`);

        // ── Return 200 to Meta immediately ──
        return _Build_Response(200, 'EVENT_RECEIVED');

    } catch (_Error) {
        console.error('Webhook processing error:', _Error);
        // Still return 200 to prevent Meta retries
        return _Build_Response(200, 'EVENT_RECEIVED');
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
