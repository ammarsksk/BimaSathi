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
    const _Msg_Sid = _Event.message_sid || '';

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

        // ── Bug #14 Layer 2: Message SID deduplication ──
        const _Recent_Sids = _Session.context?._recentSids || [];
        if (_Msg_Sid && _Recent_Sids.includes(_Msg_Sid)) {
            console.log(`Skipping duplicate message: ${_Msg_Sid}`);
            return;
        }

        // ── Bug #14 Layer 3: Response throttle (5 seconds) ──
        const _Last_Reply_At = _Session.context?._lastReplyAt || 0;
        const _Now = Date.now();
        const _Throttle_Ms = 5000;
        if (_Now - _Last_Reply_At < _Throttle_Ms && _Msg_Type === 'text') {
            console.log('Throttled: too soon since last reply');
            // Still track the SID even if throttled
            _Session.context._recentSids = [..._Recent_Sids, _Msg_Sid].filter(Boolean).slice(-15);
            await _DB._Upsert_Conversation(_Session);
            return;
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
        let _Intent = await _Bedrock._Detect_Intent(_Text_Input);
        const _Lower_Text = (_Text_Input || '').trim().toLowerCase();

        // ── Error #6: Local fallback when Bedrock returns UNKNOWN ──
        if (_Intent === 'UNKNOWN') {
            if (['hi', 'hello', 'hey', 'namaste', 'namaskar', 'hola'].some(_W => _Lower_Text.includes(_W))) _Intent = 'GREETING';
            else if (['haan', 'ha', 'yes', 'ok', 'sahi', 'correct', 'theek', 'ho'].some(_W => _Lower_Text === _W)) _Intent = 'CONFIRM';
            else if (['nahi', 'no', 'galat', 'wrong', 'nako'].some(_W => _Lower_Text === _W)) _Intent = 'DENY';
            else if (['menu', 'main menu'].some(_W => _Lower_Text.includes(_W))) _Intent = 'MENU';
            else if (['help', 'madad', 'sahayata'].some(_W => _Lower_Text.includes(_W))) _Intent = 'HELP';
            else if (['language', 'bhasha', 'bhasa'].some(_W => _Lower_Text.includes(_W))) _Intent = 'LANGUAGE_CHANGE';
        }
        console.log(`Intent: ${_Intent}, Current state: ${_Session.state}`);

        // ── Feature #1: Free navigation commands (work in ANY state) ──
        // RESET — complete fresh start
        if (_Lower_Text.includes('reset') || _Lower_Text.includes('naya shuru') || _Lower_Text.includes('shuru se')
            || _Lower_Text.includes('start over')) {
            _Session.state = _States.WELCOME;
            _Session.context = { _recentSids: [_Msg_Sid], _lastReplyAt: _Now };
            const _Msg = _Session.language === 'en'
                ? '🔄 Starting fresh! All progress has been cleared.'
                : '🔄 Naya shuru! Sab kuch reset ho gaya.';
            await _Twilio._Send_Text_Message(_From, _Msg);
            // Run welcome handler to show language prompt
            const _Welcome_Result = await _State_Handlers[_States.WELCOME]({ from: _From, language: _Session.language });
            for (const _M of _Welcome_Result.messages || []) {
                await _Twilio._Send_Text_Message(_From, _M.body);
            }
            await _DB._Upsert_Conversation(_Session);
            return;
        }

        // BACK — go to previous state
        if (_Lower_Text.includes('back') || _Lower_Text.includes('peeche') || _Lower_Text.includes('wapas')
            || _Lower_Text.includes('galti ho gayi')) {
            const _History = _Session.context._stateHistory || [];
            if (_History.length > 0) {
                const _Prev = _History.pop();
                _Session.state = _Prev.state;
                _Session.context.intake = _Prev.intake;
                _Session.context._stateHistory = _History;
                _Session.context._recentSids = [..._Recent_Sids, _Msg_Sid].filter(Boolean).slice(-15);
                _Session.context._lastReplyAt = _Now;
                const _Msg = _Session.language === 'en'
                    ? '⬅️ Going back. Please re-enter:'
                    : '⬅️ Peeche ja rahe hain. Dobara batayein:';
                await _Twilio._Send_Text_Message(_From, _Msg);
                // Show the restored state's prompt (but don't re-run handler for MAIN_MENU)
                if (_Session.state === _States.MAIN_MENU) {
                    await _Twilio._Send_Text_Message(_From, _Lang._Get_Template('main_menu', _Session.language));
                } else {
                    const _Restored_Handler = _State_Handlers[_Session.state];
                    if (_Restored_Handler) {
                        const _Prompt_Result = await _Restored_Handler({
                            from: _From, text: '', body: '', intent: 'UNKNOWN', type: 'text',
                            event: _Event, session: _Session, context: _Session.context, language: _Session.language,
                        });
                        for (const _M of _Prompt_Result.messages || []) {
                            await _Twilio._Send_Text_Message(_From, _M.body);
                        }
                    }
                }
                await _DB._Upsert_Conversation(_Session);
                return;
            } else {
                const _Msg = _Session.language === 'en'
                    ? '⚠️ Nothing to go back to. Type "reset" to start over.'
                    : '⚠️ Peeche jaane ko kuch nahi. "reset" type karein naye shuru ke liye.';
                await _Twilio._Send_Text_Message(_From, _Msg);
                _Session.context._recentSids = [..._Recent_Sids, _Msg_Sid].filter(Boolean).slice(-15);
                _Session.context._lastReplyAt = _Now;
                await _DB._Upsert_Conversation(_Session);
                return;
            }
        }

        // SKIP — skip current optional field
        if (_Lower_Text.includes('skip') || _Lower_Text.includes('chhodo') || _Lower_Text.includes('baad mein')) {
            // Define skippable states and what comes next
            const _Skip_Map = {
                [_States.LOSS_REPORT]: _States.CROP_DETAILS,
                [_States.CROP_DETAILS]: _States.DATE_LOCATION,
                [_States.DATE_LOCATION]: _States.DOCUMENT_INTAKE,
                [_States.DOCUMENT_INTAKE]: _States.SCHEMA_COLLECTION,
                [_States.SCHEMA_COLLECTION]: _States.PHOTO_EVIDENCE,
            };
            const _Next = _Skip_Map[_Session.state];
            if (_Next) {
                _Session.context._stateHistory = _Session.context._stateHistory || [];
                _Session.context._stateHistory.push({
                    state: _Session.state,
                    intake: _Session.context.intake ? { ..._Session.context.intake } : {},
                });
                _Session.state = _Next;
                _Session.context._recentSids = [..._Recent_Sids, _Msg_Sid].filter(Boolean).slice(-15);
                _Session.context._lastReplyAt = _Now;
                const _Msg = _Session.language === 'en'
                    ? '⏭️ Skipped. Moving to next step.'
                    : '⏭️ Chhod diya. Agle step par chalte hain.';
                await _Twilio._Send_Text_Message(_From, _Msg);
                await _DB._Upsert_Conversation(_Session);
                return;
            } else {
                const _Msg = _Session.language === 'en'
                    ? '⚠️ This step cannot be skipped.'
                    : '⚠️ Ye step chhod nahi sakte.';
                await _Twilio._Send_Text_Message(_From, _Msg);
                _Session.context._recentSids = [..._Recent_Sids, _Msg_Sid].filter(Boolean).slice(-15);
                _Session.context._lastReplyAt = _Now;
                await _DB._Upsert_Conversation(_Session);
                return;
            }
        }

        // ── Strict Keyword Global Navigation ──
        const _Is_Menu = ['menu', 'main menu', 'home', 'shuru', 'mukhya'].includes(_Lower_Text);
        const _Is_Reset = ['reset', 'restart', 'start over', 'hi', 'hello'].includes(_Lower_Text);
        const _Is_Help = ['help', 'madad', 'operator', 'agent'].includes(_Lower_Text);

        if (_Is_Reset && _Session.state !== _States.WELCOME && _Session.state !== _States.LANGUAGE_SELECT) {
            _Session.state = _States.LANGUAGE_SELECT;
            _Session.context = { _recentSids: [..._Recent_Sids, _Msg_Sid].filter(Boolean).slice(-15), _lastReplyAt: _Now };
            await _Twilio._Send_Text_Message(_From, _Lang._Get_Template('welcome', _Session.language || 'hi'));
            await _Twilio._Send_Text_Message(_From, _Lang._Get_Template('language_prompt', 'en'));
            await _DB._Upsert_Conversation(_Session);
            return;
        }

        if (_Is_Menu && _Session.state !== _States.MAIN_MENU && _Session.state !== _States.LANGUAGE_SELECT && _Session.state !== _States.AUTH_OTP) {
            _Session.state = _States.MAIN_MENU;
            _Session.context._recentSids = [..._Recent_Sids, _Msg_Sid].filter(Boolean).slice(-15);
            _Session.context._lastReplyAt = _Now;
            await _Twilio._Send_Text_Message(_From, _Lang._Get_Template('main_menu', _Session.language || 'hi'));
            await _DB._Upsert_Conversation(_Session);
            return;
        }

        if (_Is_Help && _Session.state !== _States.OPERATOR_BRIDGE) {
            _Session.state = _States.OPERATOR_BRIDGE;
            _Session.context._recentSids = [..._Recent_Sids, _Msg_Sid].filter(Boolean).slice(-15);
            _Session.context._lastReplyAt = _Now;
            const _Msg = _Session.language === 'en'
                ? '📞 A human operator will assist you shortly.\nMeanwhile, type "menu" to go back.'
                : '📞 Ek operator jaldi aapki madad karega.\nTab tak "menu" type karein.';
            await _Twilio._Send_Text_Message(_From, _Msg);
            await _DB._Upsert_Conversation(_Session);
            return;
        }

        // ── Push state history (for "back" navigation) ──
        const _Pre_Handler_State = _Session.state;
        if (!_Session.context._stateHistory) _Session.context._stateHistory = [];

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
        if (_Result.next_state && _Result.next_state !== _Pre_Handler_State) {
            // Push history snapshot before state change
            _Session.context._stateHistory.push({
                state: _Pre_Handler_State,
                intake: _Session.context.intake ? { ..._Session.context.intake } : {},
            });
            _Session.context._stateHistory = _Session.context._stateHistory.slice(-10);
            _Session.state = _Result.next_state;
        }
        if (_Result.context) _Session.context = { ..._Session.context, ..._Result.context };
        if (_Result.language) _Session.language = _Result.language;

        // Track dedup + throttle
        _Session.context._recentSids = [...(_Session.context._recentSids || []), _Msg_Sid].filter(Boolean).slice(-15);
        _Session.context._lastReplyAt = _Now;

        // ── Send response message(s) ──
        console.log(`Handler returned ${(_Result.messages || []).length} message(s), next_state=${_Result.next_state || 'same'}`);
        for (const _Msg of _Result.messages || []) {
            try {
                if (_Msg.type === 'buttons') {
                    await _Twilio._Send_Button_Message(_From, _Msg.body, _Msg.buttons);
                } else if (_Msg.type === 'media' && _Msg.media_url) {
                    await _Twilio._Send_Media_Message(_From, _Msg.media_url, _Msg.body);
                } else {
                    console.log(`Sending message to ${_From}: "${(_Msg.body || '').substring(0, 60)}..."`);
                    const _Send_Result = await _Twilio._Send_Text_Message(_From, _Msg.body);
                    console.log(`Twilio send result: sid=${_Send_Result?.sid || 'none'}, error=${_Send_Result?.error_code || 'none'}`);
                }
            } catch (_Send_Err) {
                console.error(`Failed to send message: ${_Send_Err.message}`);
            }
        }

        // ── Persist conversation state ──
        await _DB._Upsert_Conversation(_Session);

    } catch (_Error) {
        console.error('Conversation engine error:', _Error.message, _Error.stack);
        try {
            await _Twilio._Send_Text_Message(_From, _Lang._Get_Template('error_message', 'hi'));
        } catch (_E) {
            console.error('Even error message send failed:', _E.message);
        }
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
    [_States.LANGUAGE_SELECT]: async ({ text, from, language }) => {
        const _Lang_Map = { '1': 'hi', '2': 'mr', '3': 'te', '4': 'ta', '5': 'gu', '6': 'kn', '7': 'en' };
        let _Selected = _Lang_Map[text.trim()];

        // If not a number, ask AI what language they want
        if (!_Selected) {
            const _Route = await _Bedrock._Interpret_Message('LANGUAGE_SELECT', text, [
                { key: 'HI', description: 'Hindi (हिंदी)' },
                { key: 'MR', description: 'Marathi (मराठी)' },
                { key: 'TE', description: 'Telugu (తెలుగు)' },
                { key: 'TA', description: 'Tamil (தமிழ்)' },
                { key: 'GU', description: 'Gujarati (ગુજરાતી)' },
                { key: 'KN', description: 'Kannada (ಕನ್ನಡ)' },
                { key: 'EN', description: 'English' },
            ], language);
            if (_Route.action !== 'UNKNOWN') {
                _Selected = _Route.action.toLowerCase();
            }
        }

        // Fallback: try script-based detection
        if (!_Selected) {
            _Selected = _Lang._Detect_Language(text);
        }

        if (!_Selected || _Selected === 'unknown') {
            return {
                messages: [{ body: '⚠️ Please choose a valid option (1-7) or type your language. \n\nकृपया सही विकल्प चुनें (1-7) या अपनी भाषा टाइप करें।' }]
            };
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
    [_States.AUTH_OTP]: async ({ text, from, language, context }) => {
        const _Clean_Phone = from.replace('whatsapp:', '');
        const _Is_Valid = await _Twilio._Verify_OTP(_Clean_Phone, text.trim());

        if (!_Is_Valid) {
            const _Attempts = (context.otp_attempts || 0) + 1;
            if (_Attempts >= 3) {
                return {
                    messages: [{ body: language === 'en' ? '❌ Session expired due to too many failed attempts. Type "hello" to start again.' : '❌ Session samapt hua. Dobara shuru karne ke liye "hello" bhejein.' }],
                    next_state: _States.WELCOME,
                    context: { otp_attempts: 0 }
                };
            }
            return {
                messages: [{ body: language === 'en' ? `❌ Invalid OTP. Please try again. (Attempts left: ${3 - _Attempts})` : `❌ Galat OTP. Dobara try karein. (Avasar bache hain: ${3 - _Attempts})` }],
                context: { otp_attempts: _Attempts }
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

    // ── MAIN_MENU: AI-powered routing — farmer says anything, AI picks the option ──
    [_States.MAIN_MENU]: async ({ text, intent, language }) => {
        const _Choice = text.trim();

        // Fast-path: number shortcuts (no AI call needed)
        if (_Choice === '1') {
            return {
                messages: [{ body: _Lang._Get_Template('loss_report_start', language) }],
                next_state: _States.LOSS_REPORT,
                context: { claimId: _Constants._Generate_Claim_Id(), intake: {}, currentField: 'farmer_name' },
            };
        }
        if (_Choice === '2') {
            return { messages: [{ body: language === 'en' ? '📊 Fetching your claims...' : '📊 Aapki claims dekh rahe hain...' }], next_state: _States.TRACK_STATUS };
        }
        if (_Choice === '3') {
            return { messages: [{ body: language === 'en' ? '📞 Connecting to operator...' : '📞 Operator se connect kar rahe hain...' }], next_state: _States.OPERATOR_BRIDGE };
        }

        // AI-powered routing: ask Bedrock what the farmer wants
        const _Route = await _Bedrock._Interpret_Message('MAIN_MENU', text, [
            { key: 'FILE_CLAIM', description: 'Start filing a new crop insurance claim (nayi claim, bima, dava)' },
            { key: 'CHECK_STATUS', description: 'Check/track status of existing claims (status, track, sthiti, dekho)' },
            { key: 'GET_HELP', description: 'Get help, talk to operator, ask questions (madad, help, sahayata)' },
        ], language);

        if (_Route.action === 'FILE_CLAIM') {
            return {
                messages: [{ body: _Lang._Get_Template('loss_report_start', language) }],
                next_state: _States.LOSS_REPORT,
                context: { claimId: _Constants._Generate_Claim_Id(), intake: {}, currentField: 'farmer_name' },
            };
        }
        if (_Route.action === 'CHECK_STATUS') {
            return { messages: [{ body: language === 'en' ? '📊 Fetching your claims...' : '📊 Aapki claims dekh rahe hain...' }], next_state: _States.TRACK_STATUS };
        }
        if (_Route.action === 'GET_HELP') {
            return { messages: [{ body: language === 'en' ? '📞 Connecting to operator...' : '📞 Operator se connect kar rahe hain...' }], next_state: _States.OPERATOR_BRIDGE };
        }

        // Truly unrecognized
        const _Hint = language === 'en'
            ? '❓ I didn\'t understand. You can say:\n• "File a claim" or "new claim"\n• "Check status" or "track"\n• "Help" or "madad"\n\nOr type 1, 2, or 3.'
            : '❓ Samajh nahi aaya. Aap bol sakte hain:\n• "Nayi claim" ya "bima"\n• "Status dekho" ya "track"\n• "Madad" ya "help"\n\nYa 1, 2, ya 3 type karein.';
        return { messages: [{ body: _Hint }] };
    },

    // ── LOSS_REPORT: Collect farmer details (1 field at a time) ──
    [_States.LOSS_REPORT]: async ({ text, context, language }) => {
        const _Intake = context.intake || {};
        const _Field = context.currentField || 'farmer_name';

        // Store the answer
        _Intake[_Field] = text.trim();

        // Determine next field
        const _Field_Order = ['farmer_name', 'village'];
        const _Current_Idx = _Field_Order.indexOf(_Field);
        const _Next_Field = _Field_Order[_Current_Idx + 1];

        if (_Next_Field) {
            const _Prompts = {
                village: language === 'en' ? '🏘 Which village is your field in?' : '🏘 Aapka khet kis gaon mein hai?',
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

    // ── CROP_DETAILS: AI-powered crop, cause, and area collection ──
    [_States.CROP_DETAILS]: async ({ text, context, language }) => {
        const _Intake = context.intake || {};
        const _Step = context.cropStep || 'crop_type';

        if (_Step === 'crop_type') {
            // AI interprets crop name from any language
            const _Route = await _Bedrock._Interpret_Message('CROP_DETAILS_TYPE', text, [
                { key: 'DATA_INPUT', description: 'Farmer is telling their crop type (wheat/gehun, rice/dhan, cotton/kapas, sugarcane/ganna, soybean, pulses/dal, maize/makka, groundnut/mungfali, mustard/sarson, or any other crop)' },
            ], language);
            _Intake.crop_type = _Route.data || text.trim().toLowerCase();

            const _Cause_Prompt = language === 'en'
                ? '⚡ What caused the damage?\n\n1. Flood\n2. Drought\n3. Hail\n4. Unseasonal Rain\n5. Pest/Disease\n6. Fire\n7. Other\n\nOr just describe it in your own words.'
                : '⚡ Nuksan ka karan kya hai?\n\n1. Baadh\n2. Sukha\n3. Ole\n4. Beseasonal Baarish\n5. Keet/Rog\n6. Aag\n7. Aur\n\nYa apne shabdon mein batayein.';
            return { messages: [{ body: _Cause_Prompt }], context: { intake: _Intake, cropStep: 'cause' } };
        }

        if (_Step === 'cause') {
            const _Cause_Map = { '1': 'flood', '2': 'drought', '3': 'hail', '4': 'unseasonal_rain', '5': 'pest', '6': 'fire', '7': 'other' };
            if (_Cause_Map[text.trim()]) {
                _Intake.cause = _Cause_Map[text.trim()];
            } else {
                // AI interprets damage cause from free text
                const _Route = await _Bedrock._Interpret_Message('CROP_DETAILS_CAUSE', text, [
                    { key: 'DATA_INPUT', description: 'Farmer is describing the cause of crop damage (flood/baadh, drought/sukha, hail/ole, unseasonal_rain/baarish, pest/keet, disease/rog, fire/aag, cyclone/toofan, frost/pala, landslide, or other)' },
                ], language);
                _Intake.cause = _Route.data || text.trim().toLowerCase();
            }

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

            // Transition to document intake for supporting documents
            const _Doc_Prompt = language === 'en'
                ? '📄 Great! Now you can send supporting documents (Aadhaar, bank passbook, land records, insurance form).\n\nSend a photo or PDF of any document, or type "skip" to go directly to photo evidence.'
                : '📄 Bahut accha! Ab aap supporting documents bhej sakte hain (Aadhaar, passbook, zameen ka record, bima form).\n\nKisi bhi document ki photo ya PDF bhejein, ya "skip" type karein seedha photo evidence ke liye.';

            return {
                messages: [{ body: _Doc_Prompt }],
                next_state: _States.DOCUMENT_INTAKE,
                context: { intake: _Intake, documentCount: 0 },
            };
        }

        return { messages: [{ body: _Lang._Get_Template('ask_date', language) }] };
    },

    // ── PHOTO_EVIDENCE: Collect and AI-verify photos ──
    [_States.PHOTO_EVIDENCE]: async ({ type, event, context, language }) => {
        if (type !== 'image') {
            const _Approved = context.approvedPhotos || 0;
            const _Needed = _Constants._Photo_Config.MIN_PHOTOS_REQUIRED - _Approved;
            const _Prompt = language === 'en'
                ? `📸 Please send a photo of your damaged crop.\n\nProgress: ${_Approved}/3 approved. ${_Needed} more needed.`
                : `📸 Kripya apne khet ki photo bhejein.\n\nProgress: ${_Approved}/3 accept. Aur ${_Needed} chahiye.`;
            return { messages: [{ body: _Prompt }] };
        }

        // Deduplication: skip if we've already processed this message
        const _Msg_Sid = event.message_sid;
        if (_Msg_Sid && context._processedSids?.includes(_Msg_Sid)) {
            return { messages: [] };
        }

        const _Claim_Id = context.claimId;
        const _Total_Sent = (context.totalPhotosSent || 0) + 1;

        // Invoke photo processor
        const _Photo_Result = await _Invoke_Photo_Processor(event.media_data, _Claim_Id, {
            photoCount: _Total_Sent - 1,
            claimData: { gpsCoords: context.intake?.gps_coords, lossDate: context.intake?.loss_date },
        });

        const _Approved_Count = (context.approvedPhotos || 0) + (_Photo_Result.approved ? 1 : 0);
        const _Remaining = Math.max(0, _Constants._Photo_Config.MIN_PHOTOS_REQUIRED - _Approved_Count);

        // Track processed message SIDs
        const _Processed_Sids = [...(context._processedSids || []), _Msg_Sid].filter(Boolean).slice(-10);

        // Build response — describe outcome, show progress
        let _Response_Msg;
        if (_Photo_Result.approved) {
            const _Labels = _Photo_Result.labels?.slice(0, 3).map(_L => _L.name).join(', ') || '';
            if (language === 'en') {
                _Response_Msg = `✅ Photo accepted!${_Labels ? `\nDetected: ${_Labels}` : ''}\nQuality: ${_Photo_Result.quality_score || 70}/100\n\n📊 Progress: ${_Approved_Count}/3 approved.${_Remaining > 0 ? ` Send ${_Remaining} more.` : ''}`;
            } else {
                _Response_Msg = `✅ Photo accept ho gayi!${_Labels ? `\nPata chala: ${_Labels}` : ''}\nQuality: ${_Photo_Result.quality_score || 70}/100\n\n📊 Progress: ${_Approved_Count}/3 accept hui.${_Remaining > 0 ? ` Aur ${_Remaining} bhejein.` : ''}`;
            }
        } else {
            const _Reason = _Photo_Result.fail_reason || 'Unknown error';
            // Show rejection reason in native language
            let _Local_Reason = _Reason;
            if (language !== 'en') {
                const _Reason_Map = {
                    'Internal processing error': 'Photo process nahi ho payi. Dobara bhejein.',
                    'Image resolution too low. Min: 640×480': 'Photo chhoti hai. Kam se kam 640×480 honi chahiye.',
                    'Image flagged by content moderation': 'Photo mein galat content hai. Sirf khet ki photo bhejein.',
                };
                _Local_Reason = _Reason_Map[_Reason] || _Reason;
            }
            if (language === 'en') {
                _Response_Msg = `❌ Photo rejected.\nReason: ${_Reason}\n\n📊 Progress: ${_Approved_Count}/3 approved. Send another photo.`;
            } else {
                _Response_Msg = `❌ Photo reject ho gayi.\nWajah: ${_Local_Reason}\n\n📊 Progress: ${_Approved_Count}/3 accept hui. Nayi photo bhejein.`;
            }
        }

        // Check if enough photos collected
        if (_Remaining === 0) {
            await _DB._Update_Claim(_Claim_Id, context.userId, {
                photoCount: _Total_Sent,
                approvedPhotoCount: _Approved_Count,
            });

            const _Summary = await _Bedrock._Generate_Claim_Summary(context.intake, language);
            return {
                messages: [{ body: _Response_Msg }, { body: _Summary || _Lang._Get_Template('review_summary', language) }],
                next_state: _States.REVIEW_CONFIRM,
                context: { totalPhotosSent: _Total_Sent, approvedPhotos: _Approved_Count, _processedSids: _Processed_Sids },
            };
        }

        return {
            messages: [{ body: _Response_Msg }],
            context: { totalPhotosSent: _Total_Sent, approvedPhotos: _Approved_Count, _processedSids: _Processed_Sids },
        };
    },

    // ── REVIEW_CONFIRM: AI-powered confirm/deny/edit ──
    [_States.REVIEW_CONFIRM]: async ({ intent, text, context, language }) => {
        // Handle the actual correction value if we're waiting for one
        if (context._correctionField) {
            const _Intake = context.intake || {};
            _Intake[context._correctionField] = text.trim();
            // Re-generate summary
            const _Summary = await _Bedrock._Generate_Claim_Summary(_Intake, language);
            return {
                messages: [
                    { body: language === 'en' ? `✅ Updated ${context._correctionField.replace(/_/g, ' ')}.` : `✅ ${context._correctionField.replace(/_/g, ' ')} update ho gaya.` },
                    { body: _Summary || _Lang._Get_Template('review_summary', language) },
                ],
                context: { intake: _Intake, _correctionField: null, _awaitingCorrection: false },
            };
        }

        // AI-powered: ask Bedrock what the farmer wants
        const _Route = await _Bedrock._Interpret_Message('REVIEW_CONFIRM', text, [
            { key: 'CONFIRM', description: 'Farmer confirms the summary is correct (haan, ha, yes, ok, sahi, theek hai, correct, submit)' },
            { key: 'DENY', description: 'Farmer says something is wrong and wants to see correction options (nahi, no, galat, wrong)' },
            { key: 'EDIT_FIELD', description: 'Farmer wants to change a specific field (naam badlo, change name, gaon badlo, fasal badlo, crop change, area change, date change, karan badlo). Extract the field name and new value if provided.' },
        ], language);

        if (_Route.action === 'CONFIRM') {
            // Trigger claim generation pipeline
            const _Claim_Id = context.claimId;
            const _Intake = context.intake || {};

            await _DB._Update_Claim(_Claim_Id, context.userId, { status: _Constants._Claim_Status.SUBMITTED });

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

        if (_Route.action === 'DENY') {
            return {
                messages: [{ body: language === 'en' ? '✏️ What would you like to correct? Just tell me in your own words.\n\nFor example: "change my name to Ramesh" or "village galat hai"' : '✏️ Kya badalna hai? Apne shabdon mein batayein.\n\nJaise: "naam Ramesh karo" ya "gaon galat hai"' }],
                context: { _awaitingCorrection: true },
            };
        }

        if (_Route.action === 'EDIT_FIELD') {
            // AI extracted field info — try to map it
            const _Field_Map = {
                'name': 'farmer_name', 'naam': 'farmer_name', 'farmer_name': 'farmer_name',
                'village': 'village', 'gaon': 'village',
                'district': 'district', 'zila': 'district',
                'crop': 'crop_type', 'fasal': 'crop_type', 'crop_type': 'crop_type',
                'cause': 'cause', 'karan': 'cause',
                'area': 'area_hectares', 'hectare': 'area_hectares', 'bigha': 'area_hectares', 'area_hectares': 'area_hectares',
                'date': 'loss_date', 'tarikh': 'loss_date', 'loss_date': 'loss_date',
            };

            const _Data = (_Route.data || '').toLowerCase();
            let _Target_Field = null;
            for (const [_Key, _Val] of Object.entries(_Field_Map)) {
                if (_Data.includes(_Key)) { _Target_Field = _Val; break; }
            }

            if (_Target_Field) {
                const _Prompt = language === 'en'
                    ? `📝 Please enter the new ${_Target_Field.replace(/_/g, ' ')}:`
                    : `📝 Naya ${_Target_Field.replace(/_/g, ' ')} batayein:`;
                return {
                    messages: [{ body: _Prompt }],
                    context: { _awaitingCorrection: false, _correctionField: _Target_Field },
                };
            }
            // If AI couldn't determine, ask more specifically
            return {
                messages: [{ body: language === 'en' ? '❓ Which field do you want to change? Say "name", "village", "crop", "cause", "area", or "date".' : '❓ Kaun sa field badalna hai? "naam", "gaon", "fasal", "karan", "area", ya "tarikh" bolein.' }],
                context: { _awaitingCorrection: true },
            };
        }

        // If awaiting correction from a previous DENY
        if (context._awaitingCorrection) {
            // Re-route through AI to figure out what field they mean
            const _Edit_Route = await _Bedrock._Interpret_Message('REVIEW_EDIT', text, [
                { key: 'EDIT_FIELD', description: 'Farmer is specifying which field to change (naam/name, gaon/village, fasal/crop, karan/cause, area, tarikh/date). Extract the field name.' },
            ], language);

            const _Field_Map = {
                'name': 'farmer_name', 'naam': 'farmer_name', 'farmer_name': 'farmer_name',
                'village': 'village', 'gaon': 'village',
                'district': 'district', 'zila': 'district',
                'crop': 'crop_type', 'fasal': 'crop_type', 'crop_type': 'crop_type',
                'cause': 'cause', 'karan': 'cause',
                'area': 'area_hectares', 'hectare': 'area_hectares', 'area_hectares': 'area_hectares',
                'date': 'loss_date', 'tarikh': 'loss_date', 'loss_date': 'loss_date',
            };
            const _Data = (_Edit_Route.data || '').toLowerCase();
            let _Target_Field = null;
            for (const [_Key, _Val] of Object.entries(_Field_Map)) {
                if (_Data.includes(_Key)) { _Target_Field = _Val; break; }
            }

            if (_Target_Field) {
                const _Prompt = language === 'en'
                    ? `📝 Please enter the new ${_Target_Field.replace(/_/g, ' ')}:`
                    : `📝 Naya ${_Target_Field.replace(/_/g, ' ')} batayein:`;
                return {
                    messages: [{ body: _Prompt }],
                    context: { _awaitingCorrection: false, _correctionField: _Target_Field },
                };
            }
            return {
                messages: [{ body: language === 'en' ? '❓ I couldn\'t identify the field. Say "name", "village", "crop", "cause", "area", or "date".' : '❓ Samajh nahi aaya. "naam", "gaon", "fasal", "karan", "area", ya "tarikh" bolein.' }],
            };
        }

        return { messages: [{ body: language === 'en' ? 'Please confirm "Yes" or tell me what to change.' : '"Haan" bolein ya kya badalna hai batayein.' }] };
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
    [_States.HELPER_MODE]: async ({ text, from, context, language }) => {
        // Step 1: Ask for farmer's phone number
        if (!context._helperFarmerPhone) {
            const _Input = text.trim().replace(/\s/g, '');
            // Check if text looks like a phone number (10+ digits)
            const _Phone_Match = _Input.match(/(\+?\d{10,13})/);
            if (_Phone_Match) {
                const _Farmer_Phone = _Phone_Match[1].startsWith('+') ? _Phone_Match[1] : `+91${_Phone_Match[1]}`;
                // Send OTP to farmer's phone
                try {
                    await _Twilio._Send_OTP(_Farmer_Phone);
                    const _Msg = language === 'en'
                        ? `📱 OTP sent to farmer's phone (${_Farmer_Phone}).\n\nAsk the farmer to read the OTP and type it here:`
                        : `📱 Kisan ke phone (${_Farmer_Phone}) par OTP bheja gaya hai.\n\nKisan se OTP sunein aur yahan type karein:`;
                    return {
                        messages: [{ body: _Msg }],
                        context: { _helperFarmerPhone: _Farmer_Phone, helperMode: true, helperPhone: from },
                    };
                } catch (_Err) {
                    return {
                        messages: [{ body: language === 'en' ? '❌ Could not send OTP. Please check the phone number.' : '❌ OTP nahi bhej paye. Phone number check karein.' }],
                    };
                }
            }
            // No phone number yet, ask for it
            const _Ask = language === 'en'
                ? '🤝 Helper Mode\n\nPlease enter the farmer\'s phone number (10 digits):'
                : '🤝 Helper Mode\n\nKisan ka phone number batayein (10 digit):';
            return { messages: [{ body: _Ask }] };
        }

        // Step 2: Verify OTP from farmer's phone
        const _Farmer_Phone = context._helperFarmerPhone;
        const _Is_Valid = await _Twilio._Verify_OTP(_Farmer_Phone, text.trim());
        if (!_Is_Valid) {
            return {
                messages: [{ body: language === 'en' ? '❌ Wrong OTP. Ask the farmer again.' : '❌ Galat OTP. Kisan se dobara sunein.' }],
            };
        }

        // Record consent
        await _DB._Log_Audit({
            claimId: 'HELPER_CONSENT',
            actor: from,
            action: 'helper_consent_verified',
            metadata: { farmerPhone: _Farmer_Phone, helperPhone: from },
        });

        const _Success = language === 'en'
            ? `✅ Consent verified! You are now filing on behalf of ${_Farmer_Phone}.\n\nAll claim data will be linked to the farmer's account.`
            : `✅ Sahmati mil gayi! Ab aap ${_Farmer_Phone} ki taraf se claim file kar rahe hain.\n\nSaari jaankari kisan ke khate se judi rahegi.`;

        return {
            messages: [{ body: _Success }, { body: _Lang._Get_Template('main_menu', language) }],
            next_state: _States.MAIN_MENU,
            context: { helperMode: true, helperPhone: from, userId: _Farmer_Phone, _helperFarmerPhone: null },
        };
    },

    // ── DOCUMENT_INTAKE: Process document uploads (PDFs, IDs, passbooks) ──
    [_States.DOCUMENT_INTAKE]: async ({ type, event, context, language, from, text }) => {
        // Handle "done" keyword explicitely for documents
        if (type === 'text') {
            const _Lower = (text || '').toLowerCase().trim();
            if (_Lower === 'done' || _Lower === 'submit' || _Lower === 'ho gaya' || _Lower.includes('done with')) {
                const _Msg = language === 'en'
                    ? '⏭️ Understood. Moving to next step.'
                    : '⏭️ Samajh gaya. Agle step par chalte hain.';
                return {
                    messages: [{ body: _Msg }],
                    next_state: _States.SCHEMA_COLLECTION,
                    context: { ...context },
                };
            }
        }

        // Only process image and document message types
        if (type !== 'image' && type !== 'document') {
            const _Prompt = language === 'en'
                ? '📄 Please send a document (photo of Aadhaar, bank passbook, land record, or insurance form).\n\nOr type "skip" or "done" to proceed without documents.'
                : '📄 Kripya ek document bhejein (Aadhaar, passbook, land record, ya insurance form ki photo).\n\nYa "skip" ya "done" type karein bina document ke aage badhne ke liye.';
            return { messages: [{ body: _Prompt }] };
        }

        const _Claim_Id = context.claimId;

        // Invoke document intake agent
        const _Doc_Result = await _Invoke_Document_Intake(event.media_data, _Claim_Id, context.userId, language, context);
        if (!_Doc_Result?.success) {
            const _Msg = language === 'en'
                ? `❌ Could not process document: ${_Doc_Result?.reason || 'Unknown error'}.\nPlease try again or send a different document.`
                : `❌ Document process nahi ho paya: ${_Doc_Result?.reason || 'Kuch galat hua'}.\nDobara try karein ya dusra document bhejein.`;
            return { messages: [{ body: _Msg }] };
        }

        // Show classification result
        const _Type_Labels = {
            INSURANCE_FORM_TEMPLATE: language === 'en' ? '📋 Insurance Form' : '📋 Bima Form',
            CROP_LOSS_PHOTO: language === 'en' ? '📸 Crop Damage Photo' : '📸 Fasal Nuksan Photo',
            LAND_RECORD: language === 'en' ? '📜 Land Record' : '📜 Zameen Ka Record',
            POLICY_DOCUMENT: language === 'en' ? '📑 Policy Document' : '📑 Policy Document',
            AADHAAR_OR_ID: language === 'en' ? '🪪 Aadhaar / ID Card' : '🪪 Aadhaar / ID Card',
            BANK_PASSBOOK: language === 'en' ? '🏦 Bank Passbook' : '🏦 Bank Passbook',
            UNKNOWN: language === 'en' ? '📄 Document' : '📄 Document',
        };

        const _Type_Label = _Type_Labels[_Doc_Result.classification] || _Type_Labels.UNKNOWN;
        let _Confirm = language === 'en'
            ? `✅ ${_Type_Label} received and processed!\n\n📊 Extracted ${_Doc_Result.keyValues?.length || 0} data fields.`
            : `✅ ${_Type_Label} mil gaya aur process ho gaya!\n\n📊 ${_Doc_Result.keyValues?.length || 0} data fields nikale.`;

        // Name match feedback
        if (_Doc_Result.classification === 'AADHAAR_OR_ID') {
            const _Match = _Doc_Result.nameMatch || {};
            if (_Match.success) {
                _Confirm += language === 'en'
                    ? `\n\n🆔 Identity confirmed! Name matches your records.`
                    : `\n\n🆔 Pehchan ki pushti ho gayi! Naam aapke record se mel khata hai.`;
            } else {
                _Confirm += language === 'en'
                    ? `\n\n⚠️ Name mismatch: ${_Match.reason || "Name on ID does not match provided name."}`
                    : `\n\n⚠️ Naam mel nahi khaya: ${_Match.reason || "ID par naam aapke bataye naam se alag hai."}`;
            }
        }

        _Confirm += language === 'en'
            ? `\n\nSend more documents or type "done" to continue.`
            : `\n\nAur documents bhejein ya "done" type karein aage badhne ke liye.`;

        const _Doc_Count = (context.documentCount || 0) + 1;

        // Trigger schema extraction in background
        await _Invoke_Form_Schema_Extractor(_Claim_Id, context.userId, _Doc_Result);

        // Trigger auto-fill in background
        await _Invoke_Auto_Fill(_Claim_Id, context.userId);

        // Transition logic: If ID card uploaded, force selfie next for face verification
        if (_Doc_Result.classification === 'AADHAAR_OR_ID') {
            const _Selfie_Prompt = language === 'en'
                ? `🤳 Now, please send a clear selfie for face verification to match with your ID.`
                : `🤳 Ab, apni ek saaf selfie bhejein taaki aapki ID se milaya ja sake.`;
            return {
                messages: [{ body: _Confirm }, { body: _Selfie_Prompt }],
                next_state: _States.IDENTITY_VERIFICATION,
                context: { documentCount: _Doc_Count, idS3Key: _Doc_Result.s3Key },
            };
        }

        return {
            messages: [{ body: _Confirm }],
            context: { documentCount: _Doc_Count },
        };
    },

    // ── IDENTITY_VERIFICATION: Match selfie with ID ──
    [_States.IDENTITY_VERIFICATION]: async ({ type, event, context, language, from }) => {
        if (type !== 'image') {
            const _Prompt = language === 'en'
                ? '🤳 Please send a selfie image to complete identity verification.'
                : '🤳 Kripya identity verify karne ke liye apni ek selfie bhejein.';
            return { messages: [{ body: _Prompt }] };
        }

        const _Claim_Id = context.claimId;
        const _ID_Key = context.idS3Key;

        // 1. Download and Upload Selfie to S3
        const { buffer: _Buffer, contentType: _Content_Type } = await _Twilio._Download_Media(event.media_data.url);
        const _Selfie_Key = `claims/${_Claim_Id}/documents/selfie_${Date.now()}.jpg`;
        const _S3 = require('../../shared/s3');
        await _S3._Upload_Document(_Claim_Id, `selfie.jpg`, _Buffer);

        // 2. Invoke Face Verification
        const _Verify_Result = await _Invoke_Face_Verification(_ID_Key, _Selfie_Key);

        if (_Verify_Result.isMatch) {
            const _Success = language === 'en'
                ? `✅ Face Match Successful! (Similarity: ${_Verify_Result.similarity}%)\nIdentity verified. Let's continue.`
                : `✅ Face Match ho gaya! (Samanata: ${_Verify_Result.similarity}%)\nPehchan ki pushti ho gayi. Aage badhte hain.`;

            return {
                messages: [{ body: _Success }, { body: language === 'en' ? '📝 Now, let\'s collect the remaining details.' : '📝 Ab baaki jaankari le lete hain.' }],
                next_state: _States.SCHEMA_COLLECTION,
                context: { selfieVerified: true, selfieS3Key: _Selfie_Key },
            };
        } else {
            const _Fail = language === 'en'
                ? `❌ Face Match Failed (Similarity: ${_Verify_Result.similarity}%). The selfie does not match the person on the ID.\n\nPlease try sending another clear selfie or type "help" to talk to an operator.`
                : `❌ Face Match nahi hua (Samanata: ${_Verify_Result.similarity}%). Selfie ID waale vyakti se mel nahi kha rahi.\n\nKripya dusri saaf selfie bhejein ya "help" type karein operator se baat karne ke liye.`;

            return { messages: [{ body: _Fail }] };
        }
    },

    // ── SCHEMA_COLLECTION: Dynamic schema-driven field collection ──
    [_States.SCHEMA_COLLECTION]: async ({ text, intent, context, language, from, type, event }) => {
        const _Claim_Id = context.claimId;
        const _User_Id = context.userId;

        // Handle "done" to move to photo evidence
        const _Lower = (text || '').trim().toLowerCase();
        if (_Lower === 'done' || _Lower === 'ho gaya' || _Lower === 'bas') {
            return {
                messages: [{ body: _Lang._Get_Template('ask_photos', language) }],
                next_state: _States.PHOTO_EVIDENCE,
                context: { photoCount: 0, approvedPhotos: 0 },
            };
        }

        // Load pending fields from DynamoDB
        const _Pending = await _DB._Get_Pending_Fields(_Claim_Id);
        // Filter out photo fields (handled separately)
        const _Non_Photo_Pending = _Pending.filter(_F => _F.field_type !== 'photo');

        if (_Non_Photo_Pending.length === 0) {
            // All fields collected → move to photo evidence
            const _Msg = language === 'en'
                ? '✅ All required information collected! Now let\'s add photo evidence.'
                : '✅ Saari zaroori jaankari mil gayi! Ab photo evidence bhejein.';
            return {
                messages: [{ body: _Msg }, { body: _Lang._Get_Template('ask_photos', language) }],
                next_state: _States.PHOTO_EVIDENCE,
                context: { photoCount: 0, approvedPhotos: 0 },
            };
        }

        // Check if we're collecting value for a specific field
        const _Current_Field = context._schemaCurrentField;
        if (_Current_Field && text.trim()) {
            // Validate and store the response
            const _Field = _Non_Photo_Pending.find(_F => _F.field_name === _Current_Field) ||
                { field_name: _Current_Field, field_type: 'text' };

            let _Value = text.trim();
            let _Valid = true;
            let _Error_Msg = '';

            // Type-based validation
            if (_Field.field_type === 'number') {
                const _Num = parseFloat(_Value.replace(/[^0-9.]/g, ''));
                if (isNaN(_Num)) {
                    _Valid = false;
                    _Error_Msg = language === 'en' ? '❌ Please enter a valid number.' : '❌ Sahi number batayein.';
                } else {
                    // Check for bigha conversion
                    if (_Value.toLowerCase().includes('bigha')) {
                        _Value = String(_Constants._Bigha_To_Hectares(_Num));
                    } else {
                        _Value = String(_Num);
                    }
                }
            } else if (_Field.field_type === 'date') {
                _Value = await _Bedrock._Parse_Date(_Value);
            } else if (_Field.field_type === 'choice' && _Field.accepted_values) {
                // Check if they entered a number or the value itself
                const _Num_Choice = parseInt(_Value);
                if (!isNaN(_Num_Choice) && _Num_Choice > 0 && _Num_Choice <= _Field.accepted_values.length) {
                    _Value = _Field.accepted_values[_Num_Choice - 1];
                } else {
                    const _Match = _Field.accepted_values.find(_V => _V.toLowerCase() === _Value.toLowerCase());
                    if (_Match) {
                        _Value = _Match;
                    }
                    // Let Bedrock handle fuzzy matching if no exact match
                }
            }

            if (!_Valid) {
                return { messages: [{ body: _Error_Msg }] };
            }

            // Store the field value
            const _Submitted_By = context.helperMode ? 'helper' : 'farmer';
            await _DB._Update_Field_Status(_Claim_Id, _User_Id, _Current_Field, 'completed', _Value, _Submitted_By);

            // Update local intake context too
            const _Intake = context.intake || {};
            _Intake[_Current_Field] = _Value;

            // Check progress
            const _Claim = await _DB._Get_Claim_By_Id(_Claim_Id);
            const _Schema = _Claim?.formSchema || [];
            const _Total_Required = _Schema.filter(_F => _F.is_required && _F.field_type !== 'photo').length;
            const _Completed = _Schema.filter(_F => _F.status !== 'pending' && _F.field_type !== 'photo').length + 1; // +1 for just-completed

            // Progress summary every 3 fields
            const _Messages = [];
            const _Confirm = language === 'en'
                ? `✅ Got it! (${_Completed}/${_Total_Required})`
                : `✅ Mil gaya! (${_Completed}/${_Total_Required})`;
            _Messages.push({ body: _Confirm });

            if (_Completed % 3 === 0 && _Completed < _Total_Required) {
                const _Progress = language === 'en'
                    ? `📊 Progress: ${_Completed} of ${_Total_Required} required details collected. Keep going! 💪`
                    : `📊 Progress: ${_Total_Required} mein se ${_Completed} zaroori details mil gayi. Chalte rahein! 💪`;
                _Messages.push({ body: _Progress });
            }

            // Get next pending field
            const _Remaining = await _DB._Get_Pending_Fields(_Claim_Id);
            const _Next_Non_Photo = _Remaining.filter(_F => _F.field_type !== 'photo');

            if (_Next_Non_Photo.length === 0) {
                _Messages.push({
                    body: language === 'en'
                        ? '🎉 All required information collected! Now let\'s add photo evidence.'
                        : '🎉 Saari zaroori jaankari mil gayi! Ab photo evidence bhejein.',
                });
                _Messages.push({ body: _Lang._Get_Template('ask_photos', language) });
                return {
                    messages: _Messages,
                    next_state: _States.PHOTO_EVIDENCE,
                    context: { intake: _Intake, _schemaCurrentField: null, photoCount: 0, approvedPhotos: 0 },
                };
            }

            // Generate question for next field
            const _Next_Field = _Next_Non_Photo[0];
            const _Question = await _Bedrock._Generate_Field_Question(_Next_Field, language, _Completed, _Total_Required);
            _Messages.push({ body: _Question });

            return {
                messages: _Messages,
                context: { intake: _Intake, _schemaCurrentField: _Next_Field.field_name },
            };
        }

        // First entry into SCHEMA_COLLECTION — generate first question
        const _First_Field = _Non_Photo_Pending[0];
        const _Claim = await _DB._Get_Claim_By_Id(_Claim_Id);
        const _Schema = _Claim?.formSchema || [];
        const _Total = _Schema.filter(_F => _F.is_required && _F.field_type !== 'photo').length;
        const _Done = _Schema.filter(_F => _F.status !== 'pending' && _F.field_type !== 'photo').length;

        const _Intro = language === 'en'
            ? `📝 Let's collect the remaining details for your claim.\n\n📊 ${_Done}/${_Total} fields completed. ${_Non_Photo_Pending.length} more to go.\n\n💡 Type "skip" to skip optional fields, "done" to finish early.`
            : `📝 Aapki claim ke liye baaki details le lete hain.\n\n📊 ${_Done}/${_Total} fields complete. ${_Non_Photo_Pending.length} aur chahiye.\n\n💡 Optional fields ke liye "skip" type karein, jaldi finish karne ke liye "done" type karein.`;

        const _Question = await _Bedrock._Generate_Field_Question(_First_Field, language, _Done, _Total);

        return {
            messages: [{ body: _Intro }, { body: _Question }],
            context: { _schemaCurrentField: _First_Field.field_name },
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

async function _Invoke_Document_Intake(_Media_Data, _Claim_Id, _User_Id, _Language, _Context) {
    try {
        const _Response = await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.DOCUMENT_INTAKE_FUNCTION || 'bimasathi-document-intake',
            Payload: Buffer.from(JSON.stringify({
                claimId: _Claim_Id,
                userId: _User_Id,
                mediaData: _Media_Data,
                language: _Language,
                context: { documentCount: _Context.documentCount || 0 },
            })),
        }));
        const _Result = JSON.parse(new TextDecoder().decode(_Response.Payload));
        return typeof _Result.body === 'string' ? JSON.parse(_Result.body) : _Result;
    } catch (_Err) {
        console.error('Document intake invocation failed:', _Err);
        return { success: false, reason: 'Document processing unavailable' };
    }
}

async function _Invoke_Form_Schema_Extractor(_Claim_Id, _User_Id, _Document_Data) {
    try {
        await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.FORM_SCHEMA_EXTRACTOR_FUNCTION || 'bimasathi-form-schema-extractor',
            InvocationType: 'Event',  // async — fire and forget
            Payload: Buffer.from(JSON.stringify({
                claimId: _Claim_Id,
                userId: _User_Id,
                documentData: _Document_Data,
            })),
        }));
    } catch (_Err) {
        console.error('Form schema extractor invocation failed:', _Err);
    }
}

async function _Invoke_Auto_Fill(_Claim_Id, _User_Id) {
    try {
        await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.AUTO_FILL_FUNCTION || 'bimasathi-auto-fill',
            InvocationType: 'Event',  // async — fire and forget
            Payload: Buffer.from(JSON.stringify({
                claimId: _Claim_Id,
                userId: _User_Id,
            })),
        }));
    } catch (_Err) {
        console.error('Auto-fill invocation failed:', _Err);
    }
}

async function _Invoke_Face_Verification(_Source_Key, _Target_Key) {
    try {
        const _Response = await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.FACE_VERIFICATION_FUNCTION || 'bimasathi-face-verification',
            Payload: Buffer.from(JSON.stringify({
                sourceBucket: process.env.EVIDENCE_BUCKET,
                sourceKey: _Source_Key,
                targetKey: _Target_Key,
            })),
        }));
        const _Result = JSON.parse(new TextDecoder().decode(_Response.Payload));
        return typeof _Result.body === 'string' ? JSON.parse(_Result.body) : _Result;
    } catch (_Err) {
        console.error('Face verification invocation failed:', _Err);
        return { isMatch: false, similarity: 0 };
    }
}
