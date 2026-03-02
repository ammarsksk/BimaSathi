/**
 * BimaSathi — Conversation Engine Lambda
 * 
 * The core AI brain — a 15-state conversation state machine (Section 4.3).
 * 
 * For each incoming message:
 *   1. Load conversation state from DynamoDB
 *   2. Detect intent via Amazon Bedrock
 *   3. Execute the current state's handler
 *   4. Generate and send response via Twilio
 *   5. Persist updated state
 * 
 * State Machine:
 *   WELCOME → LANGUAGE_SELECT → AUTH_OTP → MAIN_MENU
 *   → LOSS_REPORT → CROP_DETAILS → DATE_LOCATION → PHOTO_EVIDENCE
 *   → REVIEW_CONFIRM → (submit) → TRACK_STATUS
 *   → APPEAL_FLOW (if rejected)
 *   → HELPER_MODE, VOICE_INPUT, OPERATOR_BRIDGE, ERROR_STATE
 */

const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const _DB = require('../../shared/dynamodb');
const _Twilio = require('../../shared/twilio');
const _Bedrock = require('../../shared/bedrock');
const _Lang = require('../../shared/languages');
const _Constants = require('../../shared/constants');
const { v4: _Generate_UUID } = require('uuid');

const _States = _Constants._Conversation_States;
const _Lambda_Client = new LambdaClient({ region: process.env.AWS_REGION || 'ap-south-1' });


exports.handler = async (_Event) => {
    const _From = _Event.from;
    const _Body = _Event.body || '';
    const _Msg_Type = _Event.type || 'text';

    console.log(`Engine invoked: from=${_From}, type=${_Msg_Type}, body="${_Body.substring(0, 80)}"`);

    try {
        // ── Load or create conversation session ──
        let _Session = await _DB._Get_Conversation(_From);

        if (!_Session) {
            _Session = {
                phoneNumber: _From,
                sessionId: _Generate_UUID(),
                state: _States.WELCOME,
                context: {},
                language: 'hi',
            };
        }

        // ── Handle voice messages — transcribe first, then proceed ──
        let _Text_Input = _Body;
        if (_Msg_Type === 'voice' && _Event.media_data?.url) {
            _Text_Input = await _Invoke_Voice_Processor(_Event.media_data, _Session.language, _Session.context?.claimId);
            if (!_Text_Input) {
                await _Twilio._Send_Text_Message(_From, _Lang._Get_Template('error_message', _Session.language));
                return;
            }
        }

        // ── Detect intent via Bedrock ──
        const _Intent = await _Bedrock._Detect_Intent(_Text_Input);
        console.log(`Intent: ${_Intent}, Current state: ${_Session.state}`);

        // ── Global intent overrides (work in any state) ──
        if (_Intent === 'MENU') _Session.state = _States.MAIN_MENU;
        if (_Intent === 'LANGUAGE_CHANGE') _Session.state = _States.LANGUAGE_SELECT;
        if (_Intent === 'HELP') _Session.state = _States.OPERATOR_BRIDGE;

        // ── Execute current state's handler ──
        const _Handler = _State_Handlers[_Session.state];
        if (!_Handler) {
            console.error(`No handler for state: ${_Session.state}`);
            _Session.state = _States.ERROR_STATE;
        }

        const _Result = await (_State_Handlers[_Session.state] || _Handle_Error)({
            from: _From,
            text: _Text_Input,
            body: _Body,
            intent: _Intent,
            type: _Msg_Type,
            event: _Event,
            session: _Session,
            context: _Session.context || {},
            language: _Session.language,
        });

        // ── Apply handler result ──
        if (_Result.next_state) _Session.state = _Result.next_state;
        if (_Result.context) _Session.context = { ..._Session.context, ..._Result.context };
        if (_Result.language) _Session.language = _Result.language;

        // ── Send response message(s) ──
        for (const _Msg of _Result.messages || []) {
            if (_Msg.type === 'buttons') {
                await _Twilio._Send_Button_Message(_From, _Msg.body, _Msg.buttons);
            } else if (_Msg.type === 'media' && _Msg.media_url) {
                await _Twilio._Send_Media_Message(_From, _Msg.media_url, _Msg.body);
            } else {
                await _Twilio._Send_Text_Message(_From, _Msg.body);
            }
        }

        // ── Persist conversation state ──
        await _DB._Upsert_Conversation(_Session);

    } catch (_Error) {
        console.error('Conversation engine error:', _Error);
        try {
            await _Twilio._Send_Text_Message(_From, _Lang._Get_Template('error_message', 'hi'));
        } catch (_E) { /* suppress */ }
    }
};


// ═════════════════════════════════════════════════════════════
//  STATE HANDLERS — each returns { messages[], next_state?, context?, language? }
// ═════════════════════════════════════════════════════════════

const _State_Handlers = {

    // ── WELCOME: First contact → greet + ask language ──
    [_States.WELCOME]: async ({ from, language }) => {
        const _Welcome = _Lang._Get_Template('welcome', language);
        const _Lang_Prompt = _Lang._Get_Template('language_prompt', 'en');
        return {
            messages: [{ body: _Welcome }, { body: _Lang_Prompt }],
            next_state: _States.LANGUAGE_SELECT,
        };
    },

    // ── LANGUAGE_SELECT: User picks a language → set it → move to auth ──
    [_States.LANGUAGE_SELECT]: async ({ text, from }) => {
        const _Lang_Map = { '1': 'hi', '2': 'mr', '3': 'te', '4': 'ta', '5': 'gu', '6': 'kn', '7': 'en' };
        let _Selected = _Lang_Map[text.trim()];

        if (!_Selected) {
            _Selected = _Lang._Detect_Language(text);
        }

        const _Config = _Lang._Get_Language_Config(_Selected);
        const _Confirm = `✅ ${_Config._Name} (${_Config._Native_Name}) selected!`;

        // Send OTP
        await _Twilio._Send_OTP(from.replace('whatsapp:', ''));

        return {
            messages: [{ body: _Confirm }, { body: _Lang._Get_Template('otp_prompt', _Selected) }],
            next_state: _States.AUTH_OTP,
            language: _Selected,
        };
    },

    // ── AUTH_OTP: Verify OTP → create/fetch user → main menu ──
    [_States.AUTH_OTP]: async ({ text, from, language }) => {
        const _Clean_Phone = from.replace('whatsapp:', '');
        const _Is_Valid = await _Twilio._Verify_OTP(_Clean_Phone, text.trim());

        if (!_Is_Valid) {
            return {
                messages: [{ body: language === 'en' ? '❌ Invalid OTP. Please try again.' : '❌ Galat OTP. Dobara try karein.' }],
            };
        }

        // Ensure user exists in DB
        let _User = await _DB._Get_User(_Clean_Phone);
        if (!_User) {
            _User = await _DB._Create_User({ phoneNumber: _Clean_Phone, language });
        }

        await _DB._Log_Audit({ claimId: 'AUTH', actor: _Clean_Phone, action: 'login', metadata: { language } });

        return {
            messages: [
                { body: language === 'en' ? '✅ Logged in successfully!' : '✅ Login ho gaya!' },
                { body: _Lang._Get_Template('main_menu', language) },
            ],
            next_state: _States.MAIN_MENU,
            context: { userId: _User.userId },
        };
    },

    // ── MAIN_MENU: Route based on intent ──
    [_States.MAIN_MENU]: async ({ text, intent, language }) => {
        const _Choice = text.trim();

        if (_Choice === '1' || intent === 'FILE_CLAIM') {
            return {
                messages: [{ body: _Lang._Get_Template('loss_report_start', language) }],
                next_state: _States.LOSS_REPORT,
                context: { claimId: _Constants._Generate_Claim_Id(), intake: {}, currentField: 'farmer_name' },
            };
        }
        if (_Choice === '2' || intent === 'CHECK_STATUS') {
            return { messages: [{ body: language === 'en' ? '📊 Fetching your claims...' : '📊 Aapki claims dekh rahe hain...' }], next_state: _States.TRACK_STATUS };
        }
        if (_Choice === '3' || intent === 'HELP') {
            return { messages: [{ body: language === 'en' ? '📞 Connecting to operator...' : '📞 Operator se connect kar rahe hain...' }], next_state: _States.OPERATOR_BRIDGE };
        }

        return { messages: [{ body: _Lang._Get_Template('main_menu', language) }] };
    },

    // ── LOSS_REPORT: Collect farmer details (1 field at a time) ──
    [_States.LOSS_REPORT]: async ({ text, context, language }) => {
        const _Intake = context.intake || {};
        const _Field = context.currentField || 'farmer_name';

        // Store the answer
        _Intake[_Field] = text.trim();

        // Determine next field
        const _Field_Order = ['farmer_name', 'village', 'district'];
        const _Current_Idx = _Field_Order.indexOf(_Field);
        const _Next_Field = _Field_Order[_Current_Idx + 1];

        if (_Next_Field) {
            const _Prompts = {
                village: language === 'en' ? '🏘 Which village is your field in?' : '🏘 Aapka khet kis gaon mein hai?',
                district: language === 'en' ? '🏛 Which district?' : '🏛 Kaun sa district?',
            };
            return {
                messages: [{ body: _Prompts[_Next_Field] }],
                context: { intake: _Intake, currentField: _Next_Field },
            };
        }

        // All farmer details collected → move to crop details
        return {
            messages: [{ body: _Lang._Get_Template('ask_crop', language) }],
            next_state: _States.CROP_DETAILS,
            context: { intake: _Intake },
        };
    },

    // ── CROP_DETAILS: Collect crop type, season, cause ──
    [_States.CROP_DETAILS]: async ({ text, context, language }) => {
        const _Intake = context.intake || {};
        const _Step = context.cropStep || 'crop_type';

        if (_Step === 'crop_type') {
            const _Crop_Map = { '1': 'wheat', '2': 'rice', '3': 'cotton', '4': 'sugarcane', '5': 'soybean', '6': 'pulses' };
            _Intake.crop_type = _Crop_Map[text.trim()] || text.trim().toLowerCase();

            const _Cause_Prompt = language === 'en'
                ? '⚡ What caused the damage?\n\n1. Flood\n2. Drought\n3. Hail\n4. Unseasonal Rain\n5. Pest/Disease\n6. Fire\n7. Other'
                : '⚡ Nuksan ka karan kya hai?\n\n1. Baadh\n2. Sukha\n3. Ole\n4. Beseasonal Baarish\n5. Keet/Rog\n6. Aag\n7. Aur';
            return { messages: [{ body: _Cause_Prompt }], context: { intake: _Intake, cropStep: 'cause' } };
        }

        if (_Step === 'cause') {
            const _Cause_Map = { '1': 'flood', '2': 'drought', '3': 'hail', '4': 'unseasonal_rain', '5': 'pest', '6': 'fire', '7': 'other' };
            _Intake.cause = _Cause_Map[text.trim()] || text.trim().toLowerCase();

            const _Area_Prompt = language === 'en'
                ? '📐 How many hectares (or bigha) of crop were affected?'
                : '📐 Kitne hectare (ya bigha) fasal ko nuksan hua?';
            return { messages: [{ body: _Area_Prompt }], context: { intake: _Intake, cropStep: 'area' } };
        }

        if (_Step === 'area') {
            const _Number = parseFloat(text.replace(/[^\d.]/g, ''));
            const _Is_Bigha = text.toLowerCase().includes('bigha');
            _Intake.area_hectares = _Is_Bigha ? _Constants._Bigha_To_Hectares(_Number) : (_Number || 1);

            return {
                messages: [{ body: _Lang._Get_Template('ask_date', language) }],
                next_state: _States.DATE_LOCATION,
                context: { intake: _Intake, dateStep: 'date' },
            };
        }

        return { messages: [{ body: _Lang._Get_Template('ask_crop', language) }] };
    },

    // ── DATE_LOCATION: Collect loss date and location ──
    [_States.DATE_LOCATION]: async ({ text, context, language, type, event }) => {
        const _Intake = context.intake || {};
        const _Step = context.dateStep || 'date';

        if (_Step === 'date') {
            const _Parsed_Date = await _Bedrock._Parse_Date(text);
            _Intake.loss_date = _Parsed_Date;

            const _Deadline = _Constants._Calculate_Deadline(_Parsed_Date);
            _Intake.deadline = _Deadline.toISOString();

            return {
                messages: [{ body: _Lang._Get_Template('ask_location', language) }],
                context: { intake: _Intake, dateStep: 'location' },
            };
        }

        if (_Step === 'location') {
            if (type === 'location' && event.location?.latitude) {
                _Intake.gps_coords = { lat: event.location.latitude, lng: event.location.longitude };
                _Intake.location_source = 'gps';
            } else {
                const _Location = await _Bedrock._Parse_Location(text);
                if (_Location.village) _Intake.village = _Location.village;
                if (_Location.district) _Intake.district = _Location.district;
                if (_Location.state) _Intake.state = _Location.state;
            }

            // Create the claim in DynamoDB
            const _Claim_Id = context.claimId;
            await _DB._Create_Claim({
                claimId: _Claim_Id,
                userId: context.userId,
                phoneNumber: event.from,
                farmerName: _Intake.farmer_name,
                village: _Intake.village,
                district: _Intake.district,
                state: _Intake.state,
                cropType: _Intake.crop_type,
                lossDate: _Intake.loss_date,
                cause: _Intake.cause,
                areaHectares: _Intake.area_hectares,
                deadline: _Intake.deadline,
                gpsCoords: _Intake.gps_coords,
            });

            await _DB._Create_Deadline(_Claim_Id, event.from.replace('whatsapp:', ''), _Intake.deadline);

            return {
                messages: [{ body: _Lang._Get_Template('ask_photos', language) }],
                next_state: _States.PHOTO_EVIDENCE,
                context: { intake: _Intake, photoCount: 0, approvedPhotos: 0 },
            };
        }

        return { messages: [{ body: _Lang._Get_Template('ask_date', language) }] };
    },

    // ── PHOTO_EVIDENCE: Collect and AI-verify photos ──
    [_States.PHOTO_EVIDENCE]: async ({ type, event, context, language }) => {
        if (type !== 'image') {
            return { messages: [{ body: _Lang._Get_Template('ask_photos', language) }] };
        }

        const _Photo_Count = (context.photoCount || 0) + 1;
        const _Claim_Id = context.claimId;

        // Invoke photo processor
        const _Photo_Result = await _Invoke_Photo_Processor(event.media_data, _Claim_Id, {
            photoCount: context.photoCount || 0,
            claimData: { gpsCoords: context.intake?.gps_coords, lossDate: context.intake?.loss_date },
        });

        const _Approved_Count = context.approvedPhotos + (_Photo_Result.approved ? 1 : 0);
        const _Remaining = Math.max(0, _Constants._Photo_Config.MIN_PHOTOS_REQUIRED - _Approved_Count);

        // Build response
        let _Response_Msg;
        if (_Photo_Result.approved) {
            _Response_Msg = _Lang._Fill_Template(_Lang._Get_Template('photo_approved', language), {
                index: _Photo_Count,
                labels: _Photo_Result.labels?.slice(0, 3).map(_L => _L.name).join(', ') || 'N/A',
                score: _Photo_Result.quality_score || 0,
                remaining: _Remaining,
            });
        } else {
            _Response_Msg = _Lang._Fill_Template(_Lang._Get_Template('photo_rejected', language), {
                index: _Photo_Count,
                reason: _Photo_Result.fail_reason || 'Unknown',
            });
        }

        // Check if enough photos collected
        if (_Remaining === 0) {
            await _DB._Update_Claim(_Claim_Id, context.userId, {
                photoCount: _Photo_Count,
                approvedPhotoCount: _Approved_Count,
            });

            const _Summary = await _Bedrock._Generate_Claim_Summary(context.intake, language);
            return {
                messages: [{ body: _Response_Msg }, { body: _Summary || _Lang._Get_Template('review_summary', language) }],
                next_state: _States.REVIEW_CONFIRM,
                context: { photoCount: _Photo_Count, approvedPhotos: _Approved_Count },
            };
        }

        return {
            messages: [{ body: _Response_Msg }],
            context: { photoCount: _Photo_Count, approvedPhotos: _Approved_Count },
        };
    },

    // ── REVIEW_CONFIRM: Farmer confirms or corrects ──
    [_States.REVIEW_CONFIRM]: async ({ intent, text, context, language }) => {
        if (intent === 'CONFIRM' || ['haan', 'ha', 'yes', 'ok', 'sahi', '1'].includes(text.trim().toLowerCase())) {
            // Trigger claim generation pipeline
            const _Claim_Id = context.claimId;
            const _Intake = context.intake || {};

            await _DB._Update_Claim(_Claim_Id, context.userId, { status: _Constants._Claim_Status.SUBMITTED });

            // Invoke claim generator asynchronously
            const _Gen_Result = await _Invoke_Claim_Generator(_Claim_Id, {
                ..._Intake,
                claimId: _Claim_Id,
                phoneNumber: context.userId,
                approvedPhotoCount: context.approvedPhotos || 0,
                photoCount: context.photoCount || 0,
            });

            const _Success_Msg = _Lang._Fill_Template(_Lang._Get_Template('claim_submitted', language), {
                claim_id: _Claim_Id,
                pdf_url: _Gen_Result?.presignedUrl || 'PDF generating...',
                deadline: _Intake.deadline ? new Date(_Intake.deadline).toLocaleString('en-IN') : 'N/A',
            });

            await _DB._Log_Audit({ claimId: _Claim_Id, actor: context.userId, action: 'claim_submitted', metadata: {} });

            return {
                messages: [{ body: _Success_Msg }],
                next_state: _States.MAIN_MENU,
                context: { lastClaimId: _Claim_Id },
            };
        }

        if (intent === 'DENY') {
            return {
                messages: [{ body: language === 'en' ? '✏️ What would you like to correct? Tell me and I\'ll update it.' : '✏️ Kya badalna hai? Batayein, main update karunga.' }],
            };
        }

        return { messages: [{ body: language === 'en' ? 'Please confirm "Yes" or say what to correct.' : '"Haan" bolein ya kya badalna hai batayein.' }] };
    },

    // ── TRACK_STATUS: Show claim statuses ──
    [_States.TRACK_STATUS]: async ({ from, context, language }) => {
        const _User = await _DB._Get_User(from.replace('whatsapp:', ''));
        if (!_User) {
            return { messages: [{ body: language === 'en' ? 'No claims found.' : 'Koi claim nahi mili.' }], next_state: _States.MAIN_MENU };
        }

        const _Claims = await _DB._Get_Claims_By_User(_User.userId);
        if (_Claims.length === 0) {
            return { messages: [{ body: language === 'en' ? 'You have no claims yet.' : 'Aapki abhi koi claim nahi hai.' }], next_state: _States.MAIN_MENU };
        }

        const _Status_Lines = _Claims.slice(0, 5).map((_C, _I) =>
            `${_I + 1}. ${_C.claimId} — ${_C.cropType || 'N/A'} — ${_C.status}`
        );
        const _Header = language === 'en' ? '📊 Your Claims:' : '📊 Aapki Claims:';
        const _Msg = `${_Header}\n\n${_Status_Lines.join('\n')}\n\n${language === 'en' ? 'Type "menu" for main menu.' : '"menu" type karein main menu ke liye.'}`;

        return { messages: [{ body: _Msg }], next_state: _States.MAIN_MENU };
    },

    // ── APPEAL_FLOW: Handle rejected claim appeal ──
    [_States.APPEAL_FLOW]: async ({ intent, text, context, language, from }) => {
        if (intent === 'CONFIRM' || text.trim().toLowerCase() === 'haan' || text.trim().toLowerCase() === 'yes') {
            const _Claim_Id = context.lastClaimId || context.claimId;
            const _Msg = language === 'en' ? '⚖️ Generating your appeal letter using AI...' : '⚖️ AI se appeal letter bana rahe hain...';

            await _Twilio._Send_Text_Message(from, _Msg);

            // Invoke appeal generator
            try {
                const _Appeal_Result = await _Invoke_Appeal_Generator(_Claim_Id, context.intake || {});
                const _Done = language === 'en'
                    ? `✅ Appeal letter ready! Download: ${_Appeal_Result?.presignedUrl || 'Link generating...'}`
                    : `✅ Appeal letter taiyaar! Download: ${_Appeal_Result?.presignedUrl || 'Link ban raha hai...'}`;
                return { messages: [{ body: _Done }], next_state: _States.MAIN_MENU };
            } catch (_Err) {
                return { messages: [{ body: _Lang._Get_Template('error_message', language) }], next_state: _States.MAIN_MENU };
            }
        }

        return { messages: [{ body: _Lang._Get_Template('main_menu', language) }], next_state: _States.MAIN_MENU };
    },

    // ── HELPER_MODE: Helper acting on behalf of farmer ──
    [_States.HELPER_MODE]: async ({ text, context, language }) => {
        return {
            messages: [{ body: _Lang._Get_Template('helper_consent', language) }],
            next_state: _States.AUTH_OTP,
            context: { helperMode: true },
        };
    },

    // ── VOICE_INPUT: Handled at top of engine (transcribed before state dispatch) ──
    [_States.VOICE_INPUT]: async ({ language }) => {
        return { messages: [{ body: _Lang._Get_Template('main_menu', language) }], next_state: _States.MAIN_MENU };
    },

    // ── OPERATOR_BRIDGE: Escalate to human operator ──
    [_States.OPERATOR_BRIDGE]: async ({ from, language }) => {
        const _Msg = language === 'en'
            ? '📞 A human operator will assist you shortly.\nMeanwhile, type "menu" to go back.\n\n📧 You can also call: 1800-XXX-XXXX (toll-free)'
            : '📞 Ek operator jaldi aapki madad karega.\nTab tak "menu" type karein.\n\n📧 Phone bhi kar sakte hain: 1800-XXX-XXXX (free)';
        return { messages: [{ body: _Msg }], next_state: _States.MAIN_MENU };
    },

    // ── ERROR_STATE: Recovery ──
    [_States.ERROR_STATE]: async ({ language }) => {
        return {
            messages: [{ body: _Lang._Get_Template('error_message', language) }, { body: _Lang._Get_Template('main_menu', language) }],
            next_state: _States.MAIN_MENU,
        };
    },
};

const _Handle_Error = _State_Handlers[_States.ERROR_STATE];


// ═════════════════════════════════════════════════════════════
//  LAMBDA INVOCATION HELPERS — async calls to processing Lambdas
// ═════════════════════════════════════════════════════════════

async function _Invoke_Voice_Processor(_Media_Data, _Language, _Claim_Id) {
    try {
        const _Response = await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.VOICE_PROCESSOR_FUNCTION || 'bimasathi-voice-processor',
            Payload: Buffer.from(JSON.stringify({ mediaData: _Media_Data, language: _Language, claimId: _Claim_Id })),
        }));
        const _Result = JSON.parse(new TextDecoder().decode(_Response.Payload));
        const _Body = typeof _Result.body === 'string' ? JSON.parse(_Result.body) : _Result;
        return _Body.transcription || '';
    } catch (_Err) {
        console.error('Voice processor invocation failed:', _Err);
        return '';
    }
}

async function _Invoke_Photo_Processor(_Media_Data, _Claim_Id, _Context) {
    try {
        const _Response = await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.PHOTO_PROCESSOR_FUNCTION || 'bimasathi-photo-processor',
            Payload: Buffer.from(JSON.stringify({ mediaData: _Media_Data, claimId: _Claim_Id, context: _Context })),
        }));
        const _Result = JSON.parse(new TextDecoder().decode(_Response.Payload));
        return typeof _Result.body === 'string' ? JSON.parse(_Result.body) : _Result;
    } catch (_Err) {
        console.error('Photo processor invocation failed:', _Err);
        return { approved: false, fail_reason: 'Processing unavailable' };
    }
}

async function _Invoke_Claim_Generator(_Claim_Id, _Claim_Data) {
    try {
        const _Response = await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.CLAIM_GENERATOR_FUNCTION || 'bimasathi-claim-generator',
            Payload: Buffer.from(JSON.stringify({ claimId: _Claim_Id, claimData: _Claim_Data })),
        }));
        const _Result = JSON.parse(new TextDecoder().decode(_Response.Payload));
        return typeof _Result.body === 'string' ? JSON.parse(_Result.body) : _Result;
    } catch (_Err) {
        console.error('Claim generator invocation failed:', _Err);
        return null;
    }
}

async function _Invoke_Appeal_Generator(_Claim_Id, _Claim_Data) {
    try {
        const _Response = await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.APPEAL_GENERATOR_FUNCTION || 'bimasathi-appeal-generator',
            Payload: Buffer.from(JSON.stringify({ claimId: _Claim_Id, claimData: _Claim_Data })),
        }));
        const _Result = JSON.parse(new TextDecoder().decode(_Response.Payload));
        return typeof _Result.body === 'string' ? JSON.parse(_Result.body) : _Result;
    } catch (_Err) {
        console.error('Appeal generator invocation failed:', _Err);
        return null;
    }
}
