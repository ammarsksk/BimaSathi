const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const _DB = require('../../shared/dynamodb');
const _WhatsApp = require('../../shared/whatsapp');
const _Bedrock = require('../../shared/bedrock');
const _Calculator = require('../../shared/calculator');
const _Identity = require('../../shared/identity');
const _Template_Schema = require('../../shared/template-schema');
const { _Get_Template } = require('../../shared/insurance-templates');
const { _Supported_Languages } = require('../../shared/languages');
const _Voice_Intent_Schema = require('../../shared/voice-intent-schema.json');
const {
    _Conversation_States: _States,
    _Claim_Status,
    _Photo_Config,
    _Generate_Claim_Id,
    _Bigha_To_Hectares,
    _Calculate_Deadline,
    _Loss_Causes,
    _Policy_Types,
    _Seasons,
} = require('../../shared/constants');

const _Lambda_Client = new LambdaClient({ region: process.env.AWS_REGION || 'ap-south-1' });

const _LEGACY_STATE_MAP = Object.freeze({
    RESUME_DRAFT: _States.DRAFT_RESUME_LIST,
    DELETE_DRAFTS: _States.DRAFT_DELETE_LIST,
    PREMIUM_CALCULATOR_START: _States.PREMIUM_CALCULATOR,
    COMPANY_SELECT: _States.CLAIM_REVIEW,
    TEMPLATE_FILL: _States.CLAIM_MISSING_FIELDS,
    QUERY_BOT: _States.QUERY_BOT,
});

const _ACTIVE_CLAIM_STATES = new Set([
    _States.CLAIM_HUB,
    _States.CLAIM_FARMER_DETAILS,
    _States.CLAIM_CROP_DETAILS,
    _States.CLAIM_DATE_LOCATION,
    _States.CLAIM_DOCUMENTS,
    _States.CLAIM_TEMPLATE_SELECT,
    _States.CLAIM_MISSING_FIELDS,
    _States.CLAIM_PHOTOS,
    _States.CLAIM_REVIEW,
    _States.DISCARD_CLAIM_CONFIRM,
]);

const _SUPPORTED_LANGUAGE_CODES = Object.keys(_Supported_Languages || {});

const _LANGUAGE_OPTIONS = [
    { id: 'lang_hi', code: 'hi', title: 'Hindi', description: _Supported_Languages?.hi?._Native_Name || 'Hindi' },
    { id: 'lang_mr', code: 'mr', title: 'Marathi', description: _Supported_Languages?.mr?._Native_Name || 'Marathi' },
    { id: 'lang_te', code: 'te', title: 'Telugu', description: _Supported_Languages?.te?._Native_Name || 'Telugu' },
    { id: 'lang_ta', code: 'ta', title: 'Tamil', description: _Supported_Languages?.ta?._Native_Name || 'Tamil' },
    { id: 'lang_gu', code: 'gu', title: 'Gujarati', description: _Supported_Languages?.gu?._Native_Name || 'Gujarati' },
    { id: 'lang_kn', code: 'kn', title: 'Kannada', description: _Supported_Languages?.kn?._Native_Name || 'Kannada' },
    { id: 'lang_en', code: 'en', title: 'English', description: _Supported_Languages?.en?._Native_Name || 'English' },
];

const _CROP_OPTIONS = [
    { key: 'crop_wheat', value: 'wheat', label: 'Wheat', aliases: ['1', 'wheat', 'gehun'] },
    { key: 'crop_rice', value: 'rice', label: 'Rice', aliases: ['2', 'rice', 'paddy', 'dhan'] },
    { key: 'crop_cotton', value: 'cotton', label: 'Cotton', aliases: ['3', 'cotton', 'kapas'] },
    { key: 'crop_sugarcane', value: 'sugarcane', label: 'Sugarcane', aliases: ['4', 'sugarcane', 'ganna'] },
    { key: 'crop_soybean', value: 'soybean', label: 'Soybean', aliases: ['5', 'soybean'] },
    { key: 'crop_pulses', value: 'pulses', label: 'Pulses', aliases: ['6', 'pulses', 'dal'] },
    { key: 'crop_maize', value: 'maize', label: 'Maize', aliases: ['7', 'maize', 'corn'] },
    { key: 'crop_groundnut', value: 'groundnut', label: 'Groundnut', aliases: ['8', 'groundnut'] },
    { key: 'crop_mustard', value: 'mustard', label: 'Mustard', aliases: ['9', 'mustard'] },
    { key: 'crop_other', value: 'other', label: 'Other', aliases: ['10', 'other'] },
];

const _SEASON_OPTIONS = [
    { key: 'season_kharif', value: _Seasons.KHARIF, label: 'Kharif', aliases: ['1', 'kharif'] },
    { key: 'season_rabi', value: _Seasons.RABI, label: 'Rabi', aliases: ['2', 'rabi'] },
    { key: 'season_zaid', value: _Seasons.ZAID, label: 'Zaid', aliases: ['3', 'zaid'] },
];

const _CAUSE_OPTIONS = [
    { key: 'cause_flood', value: _Loss_Causes.FLOOD, label: 'Flood', aliases: ['1', 'flood', 'baadh'] },
    { key: 'cause_drought', value: _Loss_Causes.DROUGHT, label: 'Drought', aliases: ['2', 'drought', 'sukha'] },
    { key: 'cause_hail', value: _Loss_Causes.HAIL, label: 'Hail', aliases: ['3', 'hail', 'ole'] },
    { key: 'cause_unseasonal_rain', value: _Loss_Causes.UNSEASONAL_RAIN, label: 'Unseasonal rain', aliases: ['4', 'rain', 'baarish'] },
    { key: 'cause_pest', value: _Loss_Causes.PEST, label: 'Pest attack', aliases: ['5', 'pest'] },
    { key: 'cause_disease', value: _Loss_Causes.DISEASE, label: 'Disease', aliases: ['6', 'disease'] },
    { key: 'cause_fire', value: _Loss_Causes.FIRE, label: 'Fire', aliases: ['7', 'fire'] },
    { key: 'cause_cyclone', value: _Loss_Causes.CYCLONE, label: 'Cyclone', aliases: ['8', 'cyclone'] },
    { key: 'cause_frost', value: _Loss_Causes.FROST, label: 'Frost', aliases: ['9', 'frost'] },
    { key: 'cause_landslide', value: _Loss_Causes.LANDSLIDE, label: 'Landslide', aliases: ['10', 'landslide'] },
    { key: 'cause_other', value: _Loss_Causes.OTHER, label: 'Other', aliases: ['11', 'other'] },
];

const _POLICY_OPTIONS = [
    { key: 'policy_pmfby', value: _Policy_Types.PMFBY, label: 'PMFBY', aliases: ['1', 'pmfby'] },
    { key: 'policy_rwbcis', value: _Policy_Types.RWBCIS, label: 'RWBCIS', aliases: ['2', 'rwbcis'] },
    { key: 'policy_other', value: _Policy_Types.OTHER, label: 'Other / not sure', aliases: ['3', 'other', 'not sure'] },
];

const _SECTION_FIELDS = Object.freeze({
    [_States.CLAIM_FARMER_DETAILS]: [
        { key: 'farmer_name', required: true, prompt: 'Tell me the farmer\'s full name.' },
        { key: 'village', required: true, prompt: 'What is the village name?' },
        { key: 'district', required: true, prompt: 'What is the district name?' },
        { key: 'state', required: true, prompt: 'What is the state name?' },
    ],
    [_States.CLAIM_CROP_DETAILS]: [
        { key: 'crop_type', required: true, prompt: () => ['Which crop was damaged?', ..._CROP_OPTIONS.map((_O, _I) => `${_I + 1}. ${_O.label}`)].join('\n') },
        { key: 'season', required: true, prompt: () => 'Which season does this crop belong to?\n1. Kharif\n2. Rabi\n3. Zaid' },
        { key: 'cause', required: true, prompt: () => 'What caused the crop loss?\n1. Flood\n2. Drought\n3. Hail\n4. Unseasonal rain\n5. Pest attack\n6. Disease\n7. Fire\n8. Cyclone\n9. Frost\n10. Landslide\n11. Other' },
        { key: 'area_hectares', required: true, prompt: 'How much area was affected? Reply in hectares, or mention bigha.' },
        { key: 'policy_type', required: false, prompt: () => 'Which policy type applies?\n1. PMFBY\n2. RWBCIS\n3. Other / not sure\n\nType skip if you do not know it.' },
    ],
    [_States.CLAIM_DATE_LOCATION]: [
        { key: 'loss_date', required: true, prompt: 'When did the crop damage happen? Reply with a date such as 2026-03-05 or 05/03/2026.' },
        { key: 'exact_location', required: true, prompt: 'What is the field location? Reply with the field location, village, or nearest landmark.' },
    ],
});

let _State_Handlers = {};

exports.handler = async (_Event) => {
    const _Incoming = _Normalize_Incoming(_Event);
    if (!_Incoming.from) return { statusCode: 400, body: JSON.stringify({ error: 'Missing sender' }) };

    try {
        let _Session = await _Load_Session(_Incoming.from);
        if (_Incoming.messageSid && _Session.context.lastMessageSid === _Incoming.messageSid) {
            return { statusCode: 200, body: JSON.stringify({ ok: true, deduped: true }) };
        }

        _Session = await _Attach_Identity(await _Ensure_Actor_Session(_Session));
        const _Event_Norm = await _Normalize_Event_Content(_Incoming, _Session);
        if (_Event_Norm.abort) {
            await _Persist_Session(_Session, _Incoming.messageSid);
            await _Send_Messages(_Incoming.from, _Event_Norm.messages, _Session.language);
            return { statusCode: 200, body: JSON.stringify({ ok: true }) };
        }

        let _Result = await _Handle_Global(_Session, _Event_Norm);
        if (!_Result) {
            const _Handler = _State_Handlers[_Session.state] || _State_Handlers[_States.ERROR_RECOVERY];
            _Result = await _Handler({ session: _Session, event: _Event_Norm });
        }

        const _Final = _Finalize_Session(_Session, _Result, _Incoming.messageSid);
        await _Persist_Session(_Final.session, _Incoming.messageSid);
        await _Persist_Draft(_Final.session);
        await _Update_Actor_Language(_Final.session);
        await _Send_Messages(_Incoming.from, _Final.messages, _Final.session.language);
        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (_Error) {
        console.error('Conversation engine failed:', _Error);
        return { statusCode: 500, body: JSON.stringify({ error: _Error.message }) };
    }
};

function _Normalize_Incoming(_Event = {}) {
    const _Type = _Normalize_Type(_Event.type);
    return {
        from: _Clean_Phone(_Event.from || ''),
        type: _Type,
        text: typeof _Event.body === 'string' ? _Event.body.trim() : '',
        rawText: typeof _Event.body === 'string' ? _Event.body : '',
        mediaData: _Event.media_data || null,
        location: _Event.location || null,
        messageSid: _Event.message_sid || null,
        originalType: _Type,
        inputSource: _Type === 'voice' ? 'voice' : 'text',
    };
}

function _Normalize_Type(_Type) {
    if (_Type === 'audio') return 'voice';
    if (_Type === 'interactive') return 'text';
    return _Type || 'text';
}

async function _Load_Session(_Phone) {
    const _Stored = await _DB._Get_Conversation(_Phone);
    if (!_Stored) return _Default_Session(_Phone);
    return {
        phoneNumber: _Clean_Phone(_Phone),
        state: _Normalize_State(_Stored.state),
        language: _Normalize_Language(_Stored.language),
        context: _Normalize_Context(_Stored.context, _Phone),
    };
}

function _Default_Session(_Phone) {
    return {
        phoneNumber: _Clean_Phone(_Phone),
        state: _States.WELCOME,
        language: 'hi',
        context: _Normalize_Context({}, _Phone),
    };
}

function _Normalize_Context(_Context = {}, _Phone = '') {
    const _Clean = _Clean_Phone(_Phone);
    const _Base = _Clone(_Context || {});
    return {
        actorPhone: _Base.actorPhone || _Clean,
        farmerPhone: _Base.farmerPhone || _Clean,
        helperPhone: _Base.helperPhone || null,
        helperMode: Boolean(_Base.helperMode),
        userId: _Base.userId || null,
        activeClaimId: _Base.activeClaimId || null,
        currentFieldKey: _Base.currentFieldKey || null,
        selectedStatusClaimId: _Base.selectedStatusClaimId || null,
        premiumFlow: _Base.premiumFlow || null,
        helperVerificationPhone: _Base.helperVerificationPhone || null,
        languageReturn: _Base.languageReturn || null,
        operatorReturn: _Base.operatorReturn || null,
        cachedPrompt: _Sanitize_Message(_Base.cachedPrompt),
        currentCheckpoint: _Clone(_Base.currentCheckpoint || null),
        history: Array.isArray(_Base.history) ? _Base.history.map(_Sanitize_History).filter(Boolean).slice(-20) : [],
        allowNewDraft: Boolean(_Base.allowNewDraft),
        lastMessageSid: _Base.lastMessageSid || null,
    };
}

function _Sanitize_History(_Entry) {
    if (!_Entry?.state || !_Entry?.prompt || !_Entry?.checkpoint) return null;
    return {
        state: _Normalize_State(_Entry.state),
        prompt: _Sanitize_Message(_Entry.prompt),
        checkpoint: _Clone(_Entry.checkpoint),
    };
}

function _Sanitize_Message(_Message) {
    if (!_Message || typeof _Message !== 'object') return null;
    if (_Message.type === 'text') return { type: 'text', body: String(_Message.body || '') };
    if (_Message.type === 'buttons') {
        return {
            type: 'buttons',
            body: String(_Message.body || ''),
            buttons: Array.isArray(_Message.buttons) ? _Message.buttons.map((_B) => ({ id: String(_B.id || ''), title: String(_B.title || '') })) : [],
        };
    }
    if (_Message.type === 'list') {
        return {
            type: 'list',
            body: String(_Message.body || ''),
            buttonText: String(_Message.buttonText || 'Select Option'),
            sectionTitle: String(_Message.sectionTitle || 'Options'),
            items: Array.isArray(_Message.items) ? _Message.items.map((_I) => ({
                id: String(_I.id || ''),
                title: String(_I.title || ''),
                description: String(_I.description || ''),
            })) : [],
        };
    }
    return null;
}

function _Normalize_State(_State) {
    if (!_State) return _States.WELCOME;
    if (_LEGACY_STATE_MAP[_State]) return _LEGACY_STATE_MAP[_State];
    if (_States[_State]) return _States[_State];
    return Object.values(_States).includes(_State) ? _State : _States.WELCOME;
}

function _Normalize_Language(_Language) {
    return _SUPPORTED_LANGUAGE_CODES.includes(_Language) ? _Language : 'hi';
}

async function _Ensure_Actor_Session(_Session) {
    const _Actor_Phone = _Clean_Phone(_Session.phoneNumber || _Session.context.actorPhone);
    let _Actor_User = await _DB._Get_User(_Actor_Phone);
    if (!_Actor_User) {
        _Actor_User = await _DB._Create_User({ phoneNumber: _Actor_Phone, language: _Session.language, role: _Session.context.helperMode ? 'helper' : 'farmer' });
    }
    return { ..._Session, context: { ..._Session.context, actorPhone: _Actor_Phone, actorUserId: _Actor_User.userId } };
}

async function _Attach_Identity(_Session) {
    const _Actor_User = await _DB._Get_User(_Session.context.actorPhone);
    if (_Session.context.helperMode && _Session.context.farmerPhone) {
        let _Farmer_User = await _DB._Get_User(_Session.context.farmerPhone);
        if (!_Farmer_User) {
            _Farmer_User = await _DB._Create_User({ phoneNumber: _Session.context.farmerPhone, language: _Session.language, role: 'farmer' });
        }
        return {
            ..._Session,
            context: {
                ..._Session.context,
                helperMode: true,
                helperPhone: _Session.context.actorPhone,
                userId: _Farmer_User.userId,
                farmerPhone: _Clean_Phone(_Session.context.farmerPhone),
            },
        };
    }
    return {
        ..._Session,
        context: {
            ..._Session.context,
            helperMode: false,
            helperPhone: null,
            farmerPhone: _Session.context.actorPhone,
            userId: _Actor_User?.userId || _Session.context.userId || null,
        },
    };
}

async function _Normalize_Event_Content(_Event, _Session) {
    if (_Event.type !== 'voice' || !_Event.mediaData?.id) return _Event;
    const _Voice_Result = await _Invoke_Voice(_Event.mediaData, _Session.language, _Session.context.activeClaimId);
    if (!_Voice_Result.ok || !_Voice_Result.transcription) {
        return { abort: true, messages: _With_Current_Prompt(_Session, _Voice_Error_Message(_Voice_Result)) };
    }
    return {
        ..._Event,
        type: 'text',
        text: _Voice_Result.transcription.trim(),
        rawText: _Voice_Result.transcription,
        inputSource: 'voice',
        originalType: 'voice',
    };
}

function _Finalize_Session(_Prev, _Result, _Message_Sid) {
    const _Next_State = _Normalize_State(_Result.state || _Prev.state);
    const _Base = _Result.replaceContext
        ? _Normalize_Context(_Result.context || {}, _Prev.phoneNumber)
        : _Normalize_Context({ ..._Prev.context, ..._Clone(_Result.context || {}) }, _Prev.phoneNumber);

    if (_Result.resetHistory) _Base.history = [];
    if (Array.isArray(_Result.clearContextKeys)) {
        for (const _Key of _Result.clearContextKeys) delete _Base[_Key];
    }
    if (_Result.prompt) {
        if (_Result.pushHistory !== false && _Prev.context.cachedPrompt && _Prev.context.currentCheckpoint) {
            _Base.history = [...(_Base.history || []), {
                state: _Normalize_State(_Prev.state),
                prompt: _Prev.context.cachedPrompt,
                checkpoint: _Clone(_Prev.context.currentCheckpoint),
            }].slice(-20);
        }
        _Base.cachedPrompt = _Result.prompt;
        _Base.currentCheckpoint = _Clone(_Result.checkpointContext || _Checkpoint(_Base));
    }
    _Base.lastMessageSid = _Message_Sid || _Base.lastMessageSid || null;

    return {
        session: {
            phoneNumber: _Prev.phoneNumber,
            state: _Next_State,
            language: _Normalize_Language(_Result.language || _Prev.language),
            context: _Base,
        },
        messages: Array.isArray(_Result.messages) ? _Result.messages.filter(Boolean) : [],
    };
}

async function _Persist_Session(_Session, _Message_Sid) {
    await _DB._Upsert_Conversation({
        phoneNumber: _Session.phoneNumber,
        state: _Session.state,
        context: { ..._Session.context, lastMessageSid: _Message_Sid || _Session.context.lastMessageSid || null },
        language: _Session.language,
    });
}

async function _Persist_Draft(_Session) {
    if (!_Session.context.activeClaimId || !_ACTIVE_CLAIM_STATES.has(_Session.state) || !_Session.context.userId) return;
    await _DB._Update_Claim(_Session.context.activeClaimId, _Session.context.userId, {
        draftState: _Session.state,
        draftContext: _Draft_Context(_Session),
    }).catch(() => null);
}

async function _Update_Actor_Language(_Session) {
    if (!_Session.context.actorPhone) return;
    await _DB._Update_User(_Session.context.actorPhone, { language: _Session.language }).catch(() => null);
}

function _Draft_Context(_Session) {
    return {
        ..._Checkpoint(_Session.context),
        cachedPrompt: _Clone(_Session.context.cachedPrompt),
        currentCheckpoint: _Clone(_Session.context.currentCheckpoint || _Checkpoint(_Session.context)),
    };
}

function _Checkpoint(_Context) {
    const _Safe = _Clone(_Context || {});
    delete _Safe.history;
    delete _Safe.cachedPrompt;
    delete _Safe.currentCheckpoint;
    delete _Safe.languageReturn;
    delete _Safe.operatorReturn;
    delete _Safe.lastMessageSid;
    return _Safe;
}

function _With_Current_Prompt(_Session, _Message = null) {
    const _Messages = [];
    if (_Message) _Messages.push({ type: 'text', body: _Message });
    if (_Session.context.cachedPrompt) _Messages.push(_Session.context.cachedPrompt);
    return _Messages;
}

function _Clone(_Value) {
    return _Value == null ? _Value : JSON.parse(JSON.stringify(_Value));
}

function _Clean_Phone(_Phone) {
    return String(_Phone || '').replace('whatsapp:', '').replace(/\s/g, '');
}

async function _Send_Messages(_To_Number, _Messages, _Language) {
    for (const _Message of _Messages || []) {
        const _Localized = await _Localize_Message(_Message, _Language);
        if (!_Localized) continue;
        if (_Localized.type === 'text') {
            await _WhatsApp._Send_Text_Message(_To_Number, _Localized.body);
            continue;
        }
        if (_Localized.type === 'buttons') {
            await _WhatsApp._Send_Button_Message(_To_Number, _Localized.body, _Localized.buttons || []);
            continue;
        }
        if (_Localized.type === 'list') {
            await _WhatsApp._Send_List_Message(
                _To_Number,
                _Localized.body,
                _Localized.items || [],
                _Localized.buttonText || 'Select Option',
                _Localized.sectionTitle || 'Options'
            );
        }
    }
}

async function _Localize_Message(_Message, _Language) {
    const _Safe = _Sanitize_Message(_Message);
    if (!_Safe) return null;
    if (_Language === 'en') return _Safe;

    if (_Safe.type === 'text') {
        return { type: 'text', body: await _Translate(_Safe.body, _Language) };
    }

    if (_Safe.type === 'buttons') {
        const [_Body, ..._Titles] = await Promise.all([
            _Translate(_Safe.body, _Language),
            ...(_Safe.buttons || []).map((_Button) => _Translate(_Button.title, _Language)),
        ]);
        return {
            type: 'buttons',
            body: _Body,
            buttons: (_Safe.buttons || []).map((_Button, _Index) => ({ id: _Button.id, title: _Titles[_Index] || _Button.title })),
        };
    }

    const _Strings = [
        _Safe.body,
        _Safe.buttonText || 'Select Option',
        _Safe.sectionTitle || 'Options',
        ...(_Safe.items || []).flatMap((_Item) => [_Item.title, _Item.description || '']),
    ];
    const _Translated = await Promise.all(_Strings.map((_Text) => _Translate(_Text, _Language)));
    let _Cursor = 0;
    return {
        type: 'list',
        body: _Translated[_Cursor++],
        buttonText: _Translated[_Cursor++],
        sectionTitle: _Translated[_Cursor++],
        items: (_Safe.items || []).map((_Item) => ({
            id: _Item.id,
            title: _Translated[_Cursor++] || _Item.title,
            description: _Translated[_Cursor++] || _Item.description || '',
        })),
    };
}

async function _Translate(_Text, _Language) {
    if (!_Text || _Language === 'en') return _Text;
    try {
        return await _Bedrock._Translate_Text(_Text, _Language);
    } catch (_Error) {
        return _Text;
    }
}

async function _Handle_Global(_Session, _Event) {
    if (_Event.type !== 'text') return null;
    const _Command = _Global_Command(_Event.text, _Session.language);
    if (!_Command) return null;

    if (_Command === 'greeting') {
        return { state: _Session.state, messages: _With_Current_Prompt(_Session) };
    }

    if (_Command === 'repeat') {
        return { state: _Session.state, messages: _With_Current_Prompt(_Session) };
    }

    if (_Command === 'back') {
        const _History = [...(_Session.context.history || [])];
        const _Previous = _History.pop();
        if (!_Previous) return { state: _Session.state, messages: _With_Current_Prompt(_Session, 'There is no earlier step to go back to.') };
        return {
            state: _Previous.state,
            replaceContext: true,
            context: {
                ..._Normalize_Context(_Previous.checkpoint, _Session.phoneNumber),
                history: _History,
                cachedPrompt: _Previous.prompt,
                currentCheckpoint: _Clone(_Previous.checkpoint),
                lastMessageSid: _Session.context.lastMessageSid,
            },
            prompt: _Previous.prompt,
            checkpointContext: _Previous.checkpoint,
            messages: [_Previous.prompt],
            pushHistory: false,
        };
    }

    if (_Command === 'menu') {
        if (_Session.context.activeClaimId && _ACTIVE_CLAIM_STATES.has(_Session.state)) {
            return _Enter_State(_Session, _States.CLAIM_HUB, { currentFieldKey: null }, {
                pushHistory: false,
            });
        }
        return _Enter_State(_Clear_Claim_Session(_Session), _States.MAIN_MENU, {}, {
            resetHistory: true,
            pushHistory: false,
        });
    }

    if (_Command === 'main_menu') {
        if (_Session.context.activeClaimId && _ACTIVE_CLAIM_STATES.has(_Session.state)) await _Save_Draft(_Session);
        return _Enter_State(_Clear_Claim_Session(_Session), _States.MAIN_MENU, {}, {
            extraMessages: [{ type: 'text', body: 'I opened the main menu.' }],
            resetHistory: true,
            pushHistory: false,
        });
    }

    if (_Command === 'save_exit') {
        if (_Session.context.activeClaimId && _ACTIVE_CLAIM_STATES.has(_Session.state)) {
            await _Save_Draft(_Session);
            return _Enter_State(_Clear_Claim_Session(_Session), _States.MAIN_MENU, {}, {
                extraMessages: [{ type: 'text', body: 'Your draft has been saved. You can resume it later.' }],
                resetHistory: true,
                pushHistory: false,
            });
        }
        return { state: _Session.state, messages: _With_Current_Prompt(_Session, 'There is no active claim to save right now.') };
    }

    if (_Command === 'change_language') {
        const _Prompt = _Build_Language_Prompt();
        return {
            state: _States.LANGUAGE_SELECT,
            context: {
                ..._Session.context,
                languageReturn: {
                    state: _Session.state,
                    checkpoint: _Checkpoint(_Session.context),
                    prompt: _Session.context.cachedPrompt,
                },
            },
            prompt: _Prompt,
            messages: [_Prompt],
            pushHistory: false,
        };
    }

    if (_Command === 'help') {
        const _Prompt = _Build_Operator_Prompt();
        return {
            state: _States.OPERATOR_HANDOFF,
            context: {
                ..._Session.context,
                operatorReturn: {
                    state: _Session.state,
                    checkpoint: _Checkpoint(_Session.context),
                    prompt: _Session.context.cachedPrompt,
                },
            },
            prompt: _Prompt,
            messages: [_Prompt],
            pushHistory: false,
        };
    }

    if (_Command === 'abandon') {
        if (!_Session.context.activeClaimId || !_ACTIVE_CLAIM_STATES.has(_Session.state)) {
            return { state: _Session.state, messages: _With_Current_Prompt(_Session, 'There is no active claim to abandon.') };
        }
        return _Enter_State(_Session, _States.DISCARD_CLAIM_CONFIRM);
    }

    if (_Command === 'exit_helper') {
        if (!_Session.context.helperMode) {
            return { state: _Session.state, messages: _With_Current_Prompt(_Session, 'Helper mode is not active.') };
        }
        const _Reset = {
            ..._Session,
            context: {
                ..._Session.context,
                helperMode: false,
                helperPhone: null,
                farmerPhone: _Session.context.actorPhone,
                activeClaimId: null,
                currentFieldKey: null,
            },
        };
        return _Enter_State(await _Attach_Identity(_Reset), _States.MAIN_MENU, {}, {
            extraMessages: [{ type: 'text', body: 'Helper mode has been turned off.' }],
            resetHistory: true,
            pushHistory: false,
        });
    }

    return null;
}

function _Global_Command(_Text, _Language) {
    const _Value = _Norm(_Text);
    if (!_Value) return null;
    const _Match = (..._Words) => _Words.some((_Word) => _Norm(_Word) === _Value);
    const _Contains = (..._Words) => _Words.some((_Word) => _Value.includes(_Norm(_Word)));

    if (_Match('back', 'go back', 'previous', 'wapas', 'return', 'वापस')) return 'back';
    if (_Match('hello', 'hi', 'hey', 'namaste', 'namaskar', 'good morning', 'good afternoon', 'good evening')) return 'greeting';
    if (_Match('repeat', 'again', 'say again', 'dobara')) return 'repeat';
    if (_Match('menu')) return 'menu';
    if (_Match('main menu', 'home')) return 'main_menu';
    if (_Match('save and exit', 'save exit', 'save', 'save draft')) return 'save_exit';
    if (_Contains('change language', 'switch language', 'bhasha', 'भाषा', 'language')) return 'change_language';
    if (_Match('help', 'support', 'madad', 'operator')) return 'help';
    if (_Match('abandon', 'discard', 'cancel claim', 'delete active claim')) return 'abandon';
    if (_Match('exit helper mode', 'stop helper mode', 'helper off')) return 'exit_helper';
    if (_Language !== 'en' && _Match('सहायता', 'મદદ', 'உதவி', 'సహాయం')) return 'help';
    return null;
}

async function _Save_Draft(_Session) {
    if (!_Session.context.activeClaimId || !_Session.context.userId) return;
    await _DB._Update_Claim_Status(_Session.context.activeClaimId, _Session.context.userId, _Claim_Status.DRAFT, {
        draftState: _Session.state,
        draftContext: _Draft_Context(_Session),
    }).catch(() => null);
}

function _Clear_Claim_Session(_Session) {
    return {
        ..._Session,
        context: {
            ..._Session.context,
            activeClaimId: null,
            currentFieldKey: null,
            selectedStatusClaimId: null,
            cachedPrompt: null,
            currentCheckpoint: null,
            history: [],
            allowNewDraft: false,
        },
    };
}

async function _Enter_State(_Session, _State, _Context_Patch = {}, _Options = {}) {
    const _Next = {
        ..._Session,
        state: _Normalize_State(_State),
        language: _Normalize_Language(_Options.language || _Session.language),
        context: _Normalize_Context({ ..._Session.context, ..._Context_Patch }, _Session.phoneNumber),
    };
    const _Handler = _State_Handlers[_Next.state] || _State_Handlers[_States.ERROR_RECOVERY];
    const _Result = await _Handler({ session: _Next, event: { type: 'init', text: '', rawText: '', mediaData: null, location: null } });
    if (_Options.extraMessages?.length) _Result.messages = [..._Options.extraMessages, ...(_Result.messages || [])];
    if (_Options.resetHistory) _Result.resetHistory = true;
    if (_Options.pushHistory === false) _Result.pushHistory = false;
    if (_Options.language) _Result.language = _Options.language;
    if (!_Result.state) _Result.state = _Next.state;
    _Result.context = { ..._Next.context, ...(_Result.context || {}) };
    _Result.replaceContext = true;
    return _Result;
}

function _Build_Language_Prompt() {
    return {
        type: 'list',
        body: 'Choose your preferred language.',
        buttonText: 'Choose',
        sectionTitle: 'Languages',
        items: _LANGUAGE_OPTIONS.map((_Lang) => ({ id: _Lang.id, title: _Lang.title, description: _Lang.description })),
    };
}

function _Build_Main_Menu_Prompt(_Session) {
    const _Helper_Note = _Session.context.helperMode
        ? `You are currently filing on behalf of ${_Pretty_Phone(_Session.context.farmerPhone)}.`
        : 'You are filing for your own account.';
    const _Items = [
        { id: 'menu_new_claim', title: 'New claim', description: 'Start or open a claim' },
        { id: 'menu_status', title: 'Claim status', description: 'View claim updates' },
        { id: 'menu_resume', title: 'Resume draft', description: 'Continue an unfinished draft' },
        { id: 'menu_delete_draft', title: 'Delete draft', description: 'Delete one draft claim' },
        { id: 'menu_query', title: 'Ask question', description: 'Free-form crop insurance help' },
        { id: 'menu_premium', title: 'Premium estimate', description: 'Calculate an estimated premium' },
        _Session.context.helperMode
            ? { id: 'menu_exit_helper', title: 'Exit helper mode', description: 'Return to your own account' }
            : { id: 'menu_helper', title: 'Helper mode', description: 'File on behalf of a farmer' },
        { id: 'menu_language', title: 'Change language', description: 'Switch the bot language' },
    ];
    return {
        type: 'list',
        body: `${_Helper_Note}\n\nChoose what you want to do next.`,
        buttonText: 'Choose',
        sectionTitle: 'Main menu',
        items: _Items,
    };
}

function _Build_Claim_Hub_Prompt(_Claim, _Pending = []) {
    const _Body = [
        `Claim ID: ${_Claim.claimId}`,
        `Status: ${_Claim.status || _Claim_Status.DRAFT}`,
        `Farmer: ${_Farmer_Done(_Claim) ? 'Complete' : 'Pending'}`,
        `Crop: ${_Crop_Done(_Claim) ? 'Complete' : 'Pending'}`,
        `Date/location: ${_Date_Location_Done(_Claim) ? 'Complete' : 'Pending'}`,
        _Identity_Status_Line(_Claim),
        _Template_Status_Line(_Claim),
        `Photos: ${_Claim.approvedPhotoCount || 0}/${_Photo_Config.MIN_PHOTOS_REQUIRED}${_Pending.length ? ` | Missing fields: ${_Pending.length}` : ''}`,
        'Choose a section to continue.',
    ].join('\n');
    return {
        type: 'list',
        body: _Body,
        buttonText: 'Open section',
        sectionTitle: 'Claim hub',
        items: [
            { id: 'claim_farmer', title: 'Farmer details', description: 'Name, village, district, state' },
            { id: 'claim_crop', title: 'Crop details', description: 'Crop, season, cause, area' },
            { id: 'claim_date_location', title: 'Date and location', description: 'Loss date and field location' },
            { id: 'claim_documents', title: 'Documents', description: 'Upload ID and supporting documents' },
            { id: 'claim_template', title: 'Insurer form', description: _Get_Template(_Claim.selectedTemplateId || _Claim.company)?.name || 'Choose SBI or ICICI' },
            { id: 'claim_missing', title: 'Missing details', description: _Pending.length ? `${_Pending.length} pending` : 'No pending fields' },
            { id: 'claim_photos', title: 'Photos', description: `${_Claim.approvedPhotoCount || 0} approved` },
            { id: 'claim_review', title: 'Review and submit', description: 'Final review and submission' },
            { id: 'claim_save_exit', title: 'Save and exit', description: 'Save draft and return to menu' },
            { id: 'claim_abandon', title: 'Abandon claim', description: 'Delete this active draft' },
        ],
    };
}

function _Build_Doc_Prompt(_Claim) {
    return {
        type: 'text',
        body: `Send any supporting document images or files now.\n\nUploaded so far: ${_Claim.documentCount || 0}\n${_Identity_Document_Status(_Claim)}\n\nType done when you are finished.`,
    };
}

function _Build_Template_Select_Prompt() {
    return {
        type: 'list',
        body: 'Which insurer form should I prepare for this claim?',
        buttonText: 'Choose form',
        sectionTitle: 'Insurer forms',
        items: _Template_Schema._Template_Choices().map((_Choice) => ({
            id: _Choice.id,
            title: _Choice.title,
            description: _Choice.description,
        })),
    };
}

function _Identity_Record(_Claim) {
    return _Claim?.identityVerification || null;
}

function _Identity_Is_Verified(_Claim) {
    return Boolean(_Identity_Record(_Claim)?.verified);
}

function _Identity_Status_Line(_Claim) {
    const _Identity_Record_Value = _Identity_Record(_Claim);
    if (_Identity_Record_Value?.verified) {
        return `Identity: Verified from ${_Humanize(_Identity_Record_Value.sourceDocumentType || 'government_document')}`;
    }
    if (_Identity_Record_Value?.status === 'matched_supporting_document') {
        return 'Identity: Name match found, but government ID still needed';
    }
    if (_Identity_Record_Value?.status === 'mismatch') {
        return 'Identity: Uploaded name does not match this claim';
    }
    if (_Identity_Record_Value?.status === 'review_required') {
        return 'Identity: Clearer government document still needed';
    }
    if (_Identity_Record_Value?.status === 'claim_name_changed') {
        return 'Identity: Reverification needed after name change';
    }
    return 'Identity: Government ID or land record still needed';
}

function _Identity_Document_Status(_Claim) {
    const _Identity_Record_Value = _Identity_Record(_Claim);
    if (_Identity_Record_Value?.verified) {
        return `Name verification: complete using ${_Humanize(_Identity_Record_Value.sourceDocumentType || 'government document')}.`;
    }
    if (_Identity_Record_Value?.status === 'matched_supporting_document') {
        return 'Name verification: I found a matching name in a supporting document, but I still need a government ID or land record with the farmer name.';
    }
    if (_Identity_Record_Value?.status === 'mismatch') {
        return 'Name verification: the uploaded document does not match the farmer name already entered for this claim.';
    }
    if (_Identity_Record_Value?.status === 'review_required') {
        return 'Name verification: I need a clearer government ID or land record to confirm the farmer name.';
    }
    if (_Identity_Record_Value?.status === 'claim_name_changed') {
        return 'Name verification: the farmer name was changed, so please upload a government ID or land record again.';
    }
    return 'Name verification: pending. Please upload a government ID or land record that clearly shows the farmer name.';
}

function _Identity_Document_Request(_Claim) {
    const _Identity_Record_Value = _Identity_Record(_Claim);
    if (_Identity_Record_Value?.status === 'mismatch') {
        return 'The uploaded document does not match the farmer name on this claim. Please correct the farmer details or upload another government ID or land record for the correct farmer.';
    }
    if (_Identity_Record_Value?.status === 'matched_supporting_document') {
        return 'I found a matching farmer name in a supporting document, but I still need a government ID or land record that clearly shows the farmer name before submission.';
    }
    if (_Identity_Record_Value?.status === 'claim_name_changed') {
        return 'The farmer name was updated, so please upload a government ID or land record that clearly shows the updated farmer name.';
    }
    if (_Identity_Record_Value?.status === 'review_required') {
        return 'I need a clearer government ID or land record to confirm the farmer name before submission.';
    }
    return 'Please upload a government ID or land record that clearly shows the farmer name before submission.';
}

function _Identity_Upload_Result_Message(_Identity_Record_Value) {
    if (_Identity_Record_Value?.verified) {
        return `Farmer name verified from ${_Humanize(_Identity_Record_Value.sourceDocumentType || 'government document')}.`;
    }
    if (_Identity_Record_Value?.status === 'matched_supporting_document') {
        return 'I found a matching farmer name in this document, but I still need a government ID or land record to verify it.';
    }
    if (_Identity_Record_Value?.status === 'mismatch') {
        return 'The uploaded document does not match the farmer name in this claim.';
    }
    if (_Identity_Record_Value?.status === 'review_required') {
        return 'I could read a possible name from this document, but it is not reliable enough to verify the farmer.';
    }
    return 'I could not verify the farmer name from this document.';
}

function _Template_Status_Line(_Claim) {
    const _Template = _Get_Template(_Claim?.selectedTemplateId || _Claim?.company);
    if (!_Template) return 'Insurer form: Not selected';
    const _Pending = Array.isArray(_Claim?.formSchema)
        ? _Claim.formSchema.filter((_Field) => _Field.status === 'pending').length
        : 0;
    return `Insurer form: ${_Template.name}${_Pending ? ` | Pending template fields: ${_Pending}` : ' | Ready'}`;
}

function _Document_Field_Summary(_Fields = []) {
    if (!Array.isArray(_Fields) || !_Fields.length) return '';
    return [
        'Fields found:',
        ..._Fields.slice(0, 8).map((_Field) => `${_Field.key}: ${_Field.value}`),
    ].join('\n');
}

function _Build_Photo_Prompt(_Claim) {
    const _Approved = Number(_Claim.approvedPhotoCount || 0);
    const _Needed = Math.max(_Photo_Config.MIN_PHOTOS_REQUIRED - _Approved, 0);
    return {
        type: 'text',
        body: `Send clear photos of the damaged crop. Approved photos: ${_Approved}/${_Photo_Config.MIN_PHOTOS_REQUIRED}.\n\n${_Needed > 0 ? `${_Needed} more approved photo(s) are still needed.` : 'You have enough approved photos. Type done to return to the claim hub.'}`,
    };
}

function _Build_Review_Prompt(_Claim, _Pending = []) {
    return {
        type: 'buttons',
        body: [
            `Please review claim ${_Claim.claimId}.`,
            `Farmer: ${_Claim.farmerName || 'Not provided'}`,
            `Village: ${_Claim.village || 'Not provided'}`,
            `District: ${_Claim.district || 'Not provided'}`,
            `State: ${_Claim.state || 'Not provided'}`,
            `Crop: ${_Claim.cropType || 'Not provided'}`,
            `Season: ${_Claim.season || 'Not provided'}`,
            `Cause: ${_Claim.cause || 'Not provided'}`,
            `Area: ${_Claim.areaHectares || 'Not provided'} ha`,
            `Loss date: ${_Claim.lossDate || 'Not provided'}`,
            `Documents: ${_Claim.documentCount || 0}`,
            _Identity_Status_Line(_Claim),
            _Template_Status_Line(_Claim),
            `Approved photos: ${_Claim.approvedPhotoCount || 0}`,
            `Pending fields: ${_Pending.length}`,
            '',
            'Choose Submit to file this claim, or Edit to return to the claim hub.',
        ].join('\n'),
        buttons: [
            { id: 'review_submit', title: 'Submit' },
            { id: 'review_edit', title: 'Edit' },
            { id: 'review_menu', title: 'Menu' },
        ],
    };
}

function _Build_Status_List_Prompt(_Claims, _Delete = false) {
    return {
        type: 'list',
        body: _Delete ? 'Choose the draft you want to delete.' : 'Choose a claim to continue.',
        buttonText: _Delete ? 'Delete draft' : 'Select claim',
        sectionTitle: _Delete ? 'Drafts' : 'Claims',
        items: _Claims.slice(0, 10).map((_Claim) => ({
            id: `${_Delete ? 'draft' : 'claim'}_${_Claim.claimId}`,
            title: _Claim.claimId,
            description: `${_Claim.status || _Claim_Status.DRAFT} | ${new Date(_Claim.lastUpdated || _Claim.createdAt || Date.now()).toLocaleDateString('en-IN')}`,
        })),
    };
}

function _Build_Status_Detail_Prompt(_Claim) {
    const _Buttons = [{ id: 'status_back', title: 'Back' }, { id: 'status_menu', title: 'Menu' }];
    if (_Claim.status === _Claim_Status.REJECTED) _Buttons.unshift({ id: 'status_appeal', title: 'Appeal' });
    return {
        type: 'buttons',
        body: [
            `Claim ID: ${_Claim.claimId}`,
            `Status: ${_Claim.status || 'Unknown'}`,
            `Farmer: ${_Claim.farmerName || 'Not provided'}`,
            `Crop: ${_Claim.cropType || 'Not provided'}`,
            `Loss date: ${_Claim.lossDate || 'Not provided'}`,
            `Village: ${_Claim.village || 'Not provided'}`,
            `Approved photos: ${_Claim.approvedPhotoCount || 0}`,
            `Documents: ${_Claim.documentCount || 0}`,
            _Claim.deadline ? `Deadline: ${new Date(_Claim.deadline).toLocaleString('en-IN')}` : null,
            _Claim.rejectionReason ? `Rejection reason: ${_Claim.rejectionReason}` : null,
        ].filter(Boolean).join('\n'),
        buttons: _Buttons,
    };
}

function _Build_Discard_Prompt() {
    return {
        type: 'buttons',
        body: 'Do you want to permanently abandon and delete this active draft claim?',
        buttons: [
            { id: 'discard_yes', title: 'Delete draft' },
            { id: 'discard_no', title: 'Keep claim' },
        ],
    };
}

function _Build_Operator_Prompt() {
    return {
        type: 'buttons',
        body: 'I flagged this conversation for operator support. Choose Back to continue where you were, or Menu to leave this flow.',
        buttons: [
            { id: 'support_back', title: 'Back' },
            { id: 'support_menu', title: 'Menu' },
        ],
    };
}

function _Build_Helper_Phone_Prompt() {
    return { type: 'text', body: 'Enter the farmer phone number in international format, or as a 10-digit Indian mobile number.' };
}

function _Build_Helper_OTP_Prompt(_Phone) {
    return { type: 'text', body: `I sent an OTP to ${_Pretty_Phone(_Phone)}. Enter that OTP here to continue in helper mode.` };
}

function _Build_Query_Prompt() {
    return { type: 'text', body: 'Ask any crop insurance question. Type menu when you want to leave this Q&A mode.' };
}

function _Build_Premium_Prompt(_Flow) {
    if (_Flow?.step === 'crop') return { type: 'text', body: `Premium estimate step 2 of 3: tell me the crop name for ${_Flow.state}.` };
    if (_Flow?.step === 'area') return { type: 'text', body: `Premium estimate step 3 of 3: how many hectares of ${_Flow.crop} are insured in ${_Flow.state}?` };
    return { type: 'text', body: 'Premium estimate step 1 of 3: tell me the state where the crop is insured.' };
}

function _Build_Appeal_Prompt(_Claim) {
    return {
        type: 'buttons',
        body: `Claim ${_Claim.claimId} is rejected. Do you want me to generate an appeal document now?`,
        buttons: [
            { id: 'appeal_confirm', title: 'Create appeal' },
            { id: 'appeal_cancel', title: 'Cancel' },
        ],
    };
}

function _Pretty_Phone(_Phone) {
    const _Digits = _Clean_Phone(_Phone).replace(/[^\d]/g, '');
    return _Digits ? `+${_Digits}` : 'the selected phone number';
}

function _Norm(_Text) {
    return String(_Text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function _Looks_Like_Small_Talk(_Text) {
    const _Value = _Norm(_Text);
    return [
        'hello',
        'hi',
        'hey',
        'namaste',
        'namaskar',
        'good morning',
        'good afternoon',
        'good evening',
        'thanks',
        'thank you',
        'ok',
        'okay',
        'haan',
        'nahi',
    ].includes(_Value);
}

function _Farmer_Done(_Claim) {
    return Boolean(_Claim.farmerName && _Claim.village && _Claim.district && _Claim.state);
}

function _Crop_Done(_Claim) {
    return Boolean(_Claim.cropType && _Claim.season && _Claim.cause && _Claim.areaHectares);
}

function _Date_Location_Done(_Claim) {
    return Boolean(_Claim.lossDate && (_Claim.gpsCoords || _Claim.exactLocation || (_Claim.village && _Claim.district)));
}

_State_Handlers = {
    [_States.WELCOME]: async ({ session }) => _Enter_State(session, _States.LANGUAGE_SELECT, {}, {
        extraMessages: [{ type: 'text', body: 'Welcome to BimaSathi. I will help you file and manage crop insurance claims.' }],
        resetHistory: true,
        pushHistory: false,
    }),

    [_States.LANGUAGE_SELECT]: async ({ session, event }) => {
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Language_Prompt();
            return { state: _States.LANGUAGE_SELECT, prompt: _Prompt, messages: [_Prompt], pushHistory: false };
        }

        let _Selected = _Parse_Language(event.text);
        if (!_Selected && _Is_Voice_Event(event)) {
            const _Voice_Selected = await _Resolve_Voice_Static_Result(_States.LANGUAGE_SELECT, event.text, session.language);
            _Selected = _Voice_Selected?.result || null;
        }
        if (!_Selected) {
            return { state: _States.LANGUAGE_SELECT, messages: _With_Current_Prompt(session, 'Please choose one of the listed languages.') };
        }

        if (session.context.languageReturn?.state) {
            const _Checkpoint_Value = session.context.languageReturn.checkpoint || {};
            const _Prompt = session.context.languageReturn.prompt || session.context.cachedPrompt;
            return {
                state: _Normalize_State(session.context.languageReturn.state),
                language: _Selected,
                replaceContext: true,
                context: {
                    ..._Normalize_Context(_Checkpoint_Value, session.phoneNumber),
                    history: session.context.history || [],
                    cachedPrompt: _Prompt,
                    currentCheckpoint: _Clone(_Checkpoint_Value),
                    lastMessageSid: session.context.lastMessageSid,
                },
                prompt: _Prompt,
                checkpointContext: _Checkpoint_Value,
                messages: [_Prompt].filter(Boolean),
                pushHistory: false,
            };
        }

        return _Enter_State({ ...session, language: _Selected }, _States.MAIN_MENU, {}, {
            language: _Selected,
            resetHistory: true,
            pushHistory: false,
        });
    },

    [_States.MAIN_MENU]: async ({ session, event }) => {
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Main_Menu_Prompt(session);
            return { state: _States.MAIN_MENU, prompt: _Prompt, messages: [_Prompt], pushHistory: false };
        }

        const _Action = await _Resolve_Main_Menu(event.text, session.language, session.context.helperMode, event, session);
        if (!_Action) {
            return { state: _States.MAIN_MENU, messages: _With_Current_Prompt(session, 'Please choose one of the menu options.') };
        }

        if (_Action === 'new_claim') {
            const _Drafts = await _Drafts_For_User(session);
            if (_Drafts.length) return _Enter_State(session, _States.DRAFT_RESUME_LIST, { allowNewDraft: true });
            return _Create_Claim(session);
        }
        if (_Action === 'status') return _Enter_State(session, _States.STATUS_LIST);
        if (_Action === 'resume') return _Enter_State(session, _States.DRAFT_RESUME_LIST, { allowNewDraft: false });
        if (_Action === 'delete_draft') return _Enter_State(session, _States.DRAFT_DELETE_LIST);
        if (_Action === 'query') return _Enter_State(session, _States.QUERY_BOT);
        if (_Action === 'premium') return _Enter_State(session, _States.PREMIUM_CALCULATOR, { premiumFlow: null });
        if (_Action === 'helper') return _Enter_State(session, _States.HELPER_PHONE_CAPTURE);
        if (_Action === 'exit_helper') {
            const _Reset = {
                ...session,
                context: {
                    ...session.context,
                    helperMode: false,
                    helperPhone: null,
                    farmerPhone: session.context.actorPhone,
                    activeClaimId: null,
                },
            };
            return _Enter_State(await _Attach_Identity(_Reset), _States.MAIN_MENU, {}, {
                extraMessages: [{ type: 'text', body: 'Helper mode has been turned off.' }],
                resetHistory: true,
                pushHistory: false,
            });
        }
        if (_Action === 'language') {
            const _Prompt = _Build_Language_Prompt();
            return {
                state: _States.LANGUAGE_SELECT,
                context: {
                    ...session.context,
                    languageReturn: {
                        state: _States.MAIN_MENU,
                        checkpoint: _Checkpoint(session.context),
                        prompt: session.context.cachedPrompt,
                    },
                },
                prompt: _Prompt,
                messages: [_Prompt],
                pushHistory: false,
            };
        }

        return { state: _States.MAIN_MENU, messages: _With_Current_Prompt(session, 'Please choose one of the menu options.') };
    },

    [_States.CLAIM_HUB]: async ({ session, event }) => {
        const _Claim = await _Active_Claim(session);
        if (!_Claim) {
            return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU, {}, {
                extraMessages: [{ type: 'text', body: 'The active claim draft could not be found, so I returned you to the main menu.' }],
                resetHistory: true,
                pushHistory: false,
            });
        }

        const _Pending = await _Pending_Fields(_Claim);
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Claim_Hub_Prompt(_Claim, _Pending);
            return { state: _States.CLAIM_HUB, context: { activeClaimId: _Claim.claimId, currentFieldKey: null }, prompt: _Prompt, messages: [_Prompt] };
        }

        const _Action = await _Resolve_Claim_Hub(event.text, session.language, event, session);
        if (!_Action) return { state: _States.CLAIM_HUB, messages: _With_Current_Prompt(session, 'Choose one of the sections from the claim hub.') };
        if (_Action === 'farmer') return _Enter_State(session, _States.CLAIM_FARMER_DETAILS, { currentFieldKey: null });
        if (_Action === 'crop') return _Enter_State(session, _States.CLAIM_CROP_DETAILS, { currentFieldKey: null });
        if (_Action === 'date_location') return _Enter_State(session, _States.CLAIM_DATE_LOCATION, { currentFieldKey: null });
        if (_Action === 'documents') {
            if (!_Claim.farmerName) {
                return { state: _States.CLAIM_HUB, messages: _With_Current_Prompt(session, 'Complete the farmer name first before uploading documents.') };
            }
            return _Enter_State(session, _States.CLAIM_DOCUMENTS);
        }
        if (_Action === 'template') return _Enter_State(session, _States.CLAIM_TEMPLATE_SELECT);
        if (_Action === 'missing') {
            if (!_Pending.length) return { state: _States.CLAIM_HUB, messages: _With_Current_Prompt(session, 'There are no pending extracted fields right now.') };
            return _Enter_State(session, _States.CLAIM_MISSING_FIELDS, { currentFieldKey: null });
        }
        if (_Action === 'photos') {
            if (!_Crop_Done(_Claim) || !_Date_Location_Done(_Claim)) {
                return { state: _States.CLAIM_HUB, messages: _With_Current_Prompt(session, 'Complete crop details and date/location before uploading claim photos.') };
            }
            return _Enter_State(session, _States.CLAIM_PHOTOS);
        }
        if (_Action === 'review') {
            const _Check = _Can_Review(_Claim, _Pending);
            if (!_Check.ok) {
                if (_Check.route === 'documents') {
                    return _Enter_State(session, _States.CLAIM_DOCUMENTS, {}, { extraMessages: [{ type: 'text', body: _Check.reason }] });
                }
                return { state: _States.CLAIM_HUB, messages: _With_Current_Prompt(session, _Check.reason) };
            }
            return _Enter_State(session, _States.CLAIM_REVIEW);
        }
        if (_Action === 'save_exit') {
            await _Save_Draft(session);
            return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU, {}, {
                extraMessages: [{ type: 'text', body: 'Your draft has been saved. You can resume it later.' }],
                resetHistory: true,
                pushHistory: false,
            });
        }
        if (_Action === 'abandon') return _Enter_State(session, _States.DISCARD_CLAIM_CONFIRM);
        return { state: _States.CLAIM_HUB, messages: _With_Current_Prompt(session, 'Choose one of the sections from the claim hub.') };
    },

    [_States.CLAIM_TEMPLATE_SELECT]: async ({ session, event }) => {
        const _Claim = await _Active_Claim(session);
        if (!_Claim) return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU);

        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Template_Select_Prompt();
            return { state: _States.CLAIM_TEMPLATE_SELECT, prompt: _Prompt, messages: [_Prompt] };
        }

        let _Template_Id = _Template_Schema._Parse_Template_Choice(event.text);
        if (!_Template_Id && _Is_Voice_Event(event)) {
            const _Voice_Template = await _Resolve_Voice_Static_Result(_States.CLAIM_TEMPLATE_SELECT, event.text, session.language);
            _Template_Id = _Voice_Template?.result || null;
        }
        if (!_Template_Id) {
            return { state: _States.CLAIM_TEMPLATE_SELECT, messages: _With_Current_Prompt(session, 'Choose SBI or ICICI Lombard from the list.') };
        }

        const _Prepared = await _Prepare_Template_Schema(_Claim.claimId, session.context.userId, _Template_Id);
        if (!_Prepared.template) {
            return { state: _States.CLAIM_TEMPLATE_SELECT, messages: _With_Current_Prompt(session, 'That insurer form could not be prepared right now.') };
        }

        if (_Prepared.pendingCount > 0) {
            return _Enter_State(session, _States.CLAIM_MISSING_FIELDS, { currentFieldKey: null }, {
                extraMessages: [{
                    type: 'text',
                    body: `${_Prepared.template.name} selected. I already prefilled ${_Prepared.prefilledCount} field(s) and still need ${_Prepared.pendingCount} more.`,
                }],
            });
        }

        return _Enter_State(session, _States.CLAIM_HUB, {}, {
            extraMessages: [{
                type: 'text',
                body: `${_Prepared.template.name} selected. I already have enough information to generate the insurer form when you submit the claim.`,
            }],
        });
    },

    [_States.CLAIM_FARMER_DETAILS]: async (_Args) => _Section_Handler(_Args, _States.CLAIM_FARMER_DETAILS),
    [_States.CLAIM_CROP_DETAILS]: async (_Args) => _Section_Handler(_Args, _States.CLAIM_CROP_DETAILS),
    [_States.CLAIM_DATE_LOCATION]: async (_Args) => _Section_Handler(_Args, _States.CLAIM_DATE_LOCATION),

    [_States.CLAIM_DOCUMENTS]: async ({ session, event }) => {
        const _Claim = await _Active_Claim(session);
        if (!_Claim) return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU);

        if (event.type === 'init' || (!event.text && event.type === 'text')) {
            const _Prompt = _Build_Doc_Prompt(_Claim);
            return { state: _States.CLAIM_DOCUMENTS, prompt: _Prompt, messages: [_Prompt] };
        }

        if (event.type === 'text') {
            let _Value = _Norm(event.text);
            if (_Is_Voice_Event(event) && _Value !== 'done' && _Value !== 'skip') {
                const _Voice_Action = await _Resolve_Voice_Static_Result(_States.CLAIM_DOCUMENTS, event.text, session.language);
                _Value = _Voice_Action?.result || _Value;
            }
            if (_Value === 'done' || _Value === 'skip') {
                if (!_Identity_Is_Verified(_Claim)) {
                    return { state: _States.CLAIM_DOCUMENTS, messages: _With_Current_Prompt(session, _Identity_Document_Request(_Claim)) };
                }
                const _Pending = await _Pending_Fields(_Claim);
                if (_Pending.length) {
                    return _Enter_State(session, _States.CLAIM_MISSING_FIELDS, { currentFieldKey: null }, {
                        extraMessages: [{ type: 'text', body: `I found ${_Pending.length} additional field(s) that still need user input.` }],
                    });
                }
                return _Enter_State(session, _States.CLAIM_HUB, {}, { extraMessages: [{ type: 'text', body: 'Document section completed.' }] });
            }
            return { state: _States.CLAIM_DOCUMENTS, messages: _With_Current_Prompt(session, 'Send a document now, or type done to leave the document section.') };
        }

        if (event.type !== 'document' && event.type !== 'image') {
            return { state: _States.CLAIM_DOCUMENTS, messages: _With_Current_Prompt(session, 'Please send a document or image file, or type done to continue.') };
        }

        const _Doc = await _Invoke_Document(event.mediaData, _Claim.claimId, session.context.userId, session.language, _Claim);
        if (!_Doc?.success) {
            return { state: _States.CLAIM_DOCUMENTS, messages: _With_Current_Prompt(session, _Doc?.reason || 'Document processing failed. Please try again.') };
        }

        if (_Doc.accepted === false) {
            return {
                state: _States.CLAIM_DOCUMENTS,
                messages: _With_Current_Prompt(session, [
                    `Document not uploaded. Detected type: ${_Humanize(_Doc.documentType || 'UNKNOWN')}.`,
                    _Doc.reason || 'This document could not be accepted.',
                    _Document_Field_Summary(_Doc.fieldsFound || []),
                ].filter(Boolean).join('\n\n')),
            };
        }

        if (_Doc.documentType === 'INSURANCE_FORM_TEMPLATE') {
            await _Invoke_Schema_Extractor(_Claim.claimId, session.context.userId, _Doc);
            await _Invoke_Auto_Fill(_Claim.claimId, session.context.userId);
        }

        let _Updated = await _DB._Get_Claim_By_Id(_Claim.claimId);
        if (_Updated?.selectedTemplateId || _Updated?.company) {
            await _Prepare_Template_Schema(_Claim.claimId, session.context.userId, _Updated.selectedTemplateId || _Updated.company);
            _Updated = await _DB._Get_Claim_By_Id(_Claim.claimId);
        }
        const _Prompt = _Build_Doc_Prompt(_Updated);
        return {
            state: _States.CLAIM_DOCUMENTS,
            prompt: _Prompt,
            messages: [
                {
                    type: 'text',
                    body: [
                        `Document received. Detected type: ${_Humanize(_Doc.documentType)}.`,
                        `Uploaded documents: ${_Updated.documentCount || 0}`,
                        _Identity_Upload_Result_Message(_Doc.identityVerification || _Updated.identityVerification),
                        _Document_Field_Summary(_Doc.fieldsFound || []),
                    ].filter(Boolean).join('\n\n'),
                },
                _Prompt,
            ],
        };
    },

    [_States.CLAIM_MISSING_FIELDS]: async ({ session, event }) => {
        let _Claim = await _Active_Claim(session);
        if (!_Claim) return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU);
        if ((_Claim.selectedTemplateId || _Claim.company) && !Array.isArray(_Claim.formSchema)) {
            await _Prepare_Template_Schema(_Claim.claimId, session.context.userId, _Claim.selectedTemplateId || _Claim.company);
            _Claim = await _DB._Get_Claim_By_Id(_Claim.claimId);
        }

        const _Pending = await _Pending_Fields(_Claim);
        if (!_Pending.length) return _Enter_State(session, _States.CLAIM_HUB, {}, { extraMessages: [{ type: 'text', body: 'There are no pending extracted fields anymore.' }] });

        let _Field = _Current_Pending(_Pending, session.context.currentFieldKey) || _Pending[0];
        if (_Field.field_type === 'photo') {
            if (Number(_Claim.approvedPhotoCount || 0) >= _Photo_Config.MIN_PHOTOS_REQUIRED) {
                await _DB._Update_Field_Status(_Claim.claimId, session.context.userId, _Field.field_name, 'completed', 'photo evidence', 'photo').catch(() => null);
                return _State_Handlers[_States.CLAIM_MISSING_FIELDS]({ session, event: { type: 'init', text: '' } });
            }
            return _Enter_State(session, _States.CLAIM_PHOTOS, {}, { extraMessages: [{ type: 'text', body: `The field "${_Field.field_label}" requires photo evidence, so I opened the photo section.` }] });
        }

        if (event.type === 'init' || (!event.text && event.type === 'text')) {
            const _Prompt = _Build_Missing_Field_Prompt(_Field, _Pending.length);
            return { state: _States.CLAIM_MISSING_FIELDS, context: { currentFieldKey: _Field.field_name }, prompt: _Prompt, messages: [_Prompt] };
        }

        if (event.type !== 'text') return { state: _States.CLAIM_MISSING_FIELDS, messages: _With_Current_Prompt(session, 'Please reply with text for this field.') };
        if (_Norm(event.text) === 'skip') {
            if (_Field.is_required) return { state: _States.CLAIM_MISSING_FIELDS, messages: _With_Current_Prompt(session, 'This field is required, so it cannot be skipped.') };
            await _DB._Update_Field_Status(_Claim.claimId, session.context.userId, _Field.field_name, 'skipped', null, 'user');
            return _State_Handlers[_States.CLAIM_MISSING_FIELDS]({ session: { ...session, context: { ...session.context, currentFieldKey: null } }, event: { type: 'init', text: '' } });
        }

        const _Parsed = await _Parse_Schema_Field(_Field, event, session.language);
        if (!_Parsed.ok) return { state: _States.CLAIM_MISSING_FIELDS, messages: _With_Current_Prompt(session, _Parsed.reason) };
        await _DB._Update_Field_Status(_Claim.claimId, session.context.userId, _Field.field_name, 'completed', _Parsed.value, 'user');
        const _Claim_Update = _Schema_Claim_Update(_Field.field_name, _Parsed.value);
        if (Object.keys(_Claim_Update).length) await _DB._Update_Claim(_Claim.claimId, session.context.userId, _Claim_Update);
        if (_Claim.selectedTemplateId || _Claim.company || _Claim_Update.selectedTemplateId) {
            await _Prepare_Template_Schema(_Claim.claimId, session.context.userId, _Claim.selectedTemplateId || _Claim.company || _Claim_Update.selectedTemplateId);
        }
        return _State_Handlers[_States.CLAIM_MISSING_FIELDS]({ session: { ...session, context: { ...session.context, currentFieldKey: null } }, event: { type: 'init', text: '' } });
    },

    [_States.CLAIM_PHOTOS]: async ({ session, event }) => {
        const _Claim = await _Active_Claim(session);
        if (!_Claim) return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU);

        if (event.type === 'init' || (!event.text && event.type === 'text')) {
            const _Prompt = _Build_Photo_Prompt(_Claim);
            return { state: _States.CLAIM_PHOTOS, prompt: _Prompt, messages: [_Prompt] };
        }

        if (event.type === 'text') {
            let _Value = _Norm(event.text);
            if (_Is_Voice_Event(event) && _Value !== 'done') {
                const _Voice_Action = await _Resolve_Voice_Static_Result(_States.CLAIM_PHOTOS, event.text, session.language);
                _Value = _Voice_Action?.result || _Value;
            }
            if (_Value === 'done') {
                if (Number(_Claim.approvedPhotoCount || 0) >= _Photo_Config.MIN_PHOTOS_REQUIRED) {
                    return _Enter_State(session, _States.CLAIM_HUB, {}, { extraMessages: [{ type: 'text', body: 'Photo section completed.' }] });
                }
                return { state: _States.CLAIM_PHOTOS, messages: _With_Current_Prompt(session, `You still need ${_Photo_Config.MIN_PHOTOS_REQUIRED - Number(_Claim.approvedPhotoCount || 0)} more approved photo(s).`) };
            }
            return { state: _States.CLAIM_PHOTOS, messages: _With_Current_Prompt(session, 'Please send crop damage photos, or type done when you already have enough approved photos.') };
        }

        if (event.type !== 'image') {
            return { state: _States.CLAIM_PHOTOS, messages: _With_Current_Prompt(session, 'Only image uploads can be used for crop damage evidence.') };
        }

        const _Sid = event.messageSid || `photo-${Date.now()}`;
        const _Reserved = await _DB._Begin_Photo_Processing(_Claim.claimId, session.context.userId, _Sid);
        if (_Reserved.alreadyProcessed) {
            return { state: _States.CLAIM_PHOTOS, messages: _With_Current_Prompt(session, `That photo was already processed. Approved photos: ${_Reserved.claim?.approvedPhotoCount || 0}/${_Photo_Config.MIN_PHOTOS_REQUIRED}.`) };
        }

        const _Photo = await _Invoke_Photo(event.mediaData, _Claim.claimId, {
            photoIndex: _Reserved.photoIndex,
            photoCount: _Reserved.claim?.photoCount || _Reserved.photoIndex,
            claimData: {
                cropType: _Claim.cropType,
                cause: _Claim.cause,
                lossDate: _Claim.lossDate,
                gpsCoords: _Claim.gpsCoords,
            },
        });
        const _Updated = await _DB._Finalize_Photo_Processing(_Claim.claimId, session.context.userId, _Sid, Boolean(_Photo?.approved));
        const _Approved = Number(_Updated.approvedPhotoCount || 0);

        if (_Approved >= _Photo_Config.MIN_PHOTOS_REQUIRED) {
            await _DB._Update_Field_Status(_Claim.claimId, session.context.userId, 'crop_loss_photo', 'completed', 'photo evidence', 'photo').catch(() => null);
            return _Enter_State(session, _States.CLAIM_HUB, {}, {
                extraMessages: [{
                    type: 'text',
                    body: _Photo?.approved
                        ? `Photo accepted. You now have ${_Approved} approved photos, so I opened the claim hub.`
                        : `This photo was not approved: ${_Photo?.fail_reason || 'No reason was returned'}. You already have ${_Approved} approved photos, so I opened the claim hub.`,
                }],
            });
        }

        const _Prompt = _Build_Photo_Prompt(_Updated);
        return {
            state: _States.CLAIM_PHOTOS,
            prompt: _Prompt,
            messages: [
                {
                    type: 'text',
                    body: _Photo?.approved
                        ? `Photo accepted. Approved photos: ${_Approved}/${_Photo_Config.MIN_PHOTOS_REQUIRED}.`
                        : `Photo rejected: ${_Photo?.fail_reason || 'The verification checks did not pass.'}\n\nApproved photos: ${_Approved}/${_Photo_Config.MIN_PHOTOS_REQUIRED}.`,
                },
                _Prompt,
            ],
        };
    },

    [_States.CLAIM_REVIEW]: async ({ session, event }) => {
        let _Claim = await _Active_Claim(session);
        if (!_Claim) return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU);
        if (_Claim.selectedTemplateId || _Claim.company) {
            await _Prepare_Template_Schema(_Claim.claimId, session.context.userId, _Claim.selectedTemplateId || _Claim.company);
            _Claim = await _DB._Get_Claim_By_Id(_Claim.claimId);
        }
        const _Pending = await _Pending_Fields(_Claim);
        const _Check = _Can_Review(_Claim, _Pending);
        if (!_Check.ok) {
            if (_Check.route === 'documents') {
                return _Enter_State(session, _States.CLAIM_DOCUMENTS, {}, { extraMessages: [{ type: 'text', body: _Check.reason }] });
            }
            return _Enter_State(session, _States.CLAIM_HUB, {}, { extraMessages: [{ type: 'text', body: _Check.reason }] });
        }

        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Review_Prompt(_Claim, _Pending);
            return { state: _States.CLAIM_REVIEW, prompt: _Prompt, messages: [_Prompt] };
        }

        let _Value = _Norm(event.text);
        if (_Is_Voice_Event(event)) {
            const _Voice_Action = await _Resolve_Voice_Static_Result(_States.CLAIM_REVIEW, event.text, session.language);
            _Value = _Voice_Action?.result || _Value;
        }
        if (_Value === 'review_submit' || _Value === 'submit' || _Value === '1') {
            await _DB._Update_Claim_Status(_Claim.claimId, session.context.userId, _Claim_Status.SUBMITTED, {
                draftState: null,
                draftContext: null,
                submittedAt: new Date().toISOString(),
            });
            await _Invoke_Claim_Generator(_Claim.claimId, {
                ..._Claim,
                userId: session.context.userId,
                phoneNumber: _Claim.phoneNumber || session.context.farmerPhone,
                language: session.language,
            });
            return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU, {}, {
                extraMessages: [{ type: 'text', body: `Claim ${_Claim.claimId} has been submitted. I am generating your claim document pack${_Get_Template(_Claim.selectedTemplateId || _Claim.company) ? ' and the filled insurer form' : ''} and will send it here when it is ready.` }],
                resetHistory: true,
                pushHistory: false,
            });
        }
        if (_Value === 'review_edit' || _Value === 'edit' || _Value === '2') {
            return _Enter_State(session, _States.CLAIM_HUB, {}, { extraMessages: [{ type: 'text', body: 'Returned to the claim hub for editing.' }] });
        }
        if (_Value === 'review_menu' || _Value === 'menu' || _Value === '3') {
            await _Save_Draft(session);
            return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU, {}, {
                extraMessages: [{ type: 'text', body: 'Your draft is saved and the main menu is open.' }],
                resetHistory: true,
                pushHistory: false,
            });
        }
        return { state: _States.CLAIM_REVIEW, messages: _With_Current_Prompt(session, 'Choose Submit, Edit, or Menu.') };
    },

    [_States.STATUS_LIST]: async ({ session, event }) => {
        const _Claims = await _Claims_For_User(session);
        if (!_Claims.length) {
            return _Enter_State(session, _States.MAIN_MENU, {}, { extraMessages: [{ type: 'text', body: 'There are no claims for this account yet.' }], resetHistory: true });
        }
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Status_List_Prompt(_Claims);
            return { state: _States.STATUS_LIST, prompt: _Prompt, messages: [_Prompt] };
        }
        let _Selected = _Pick_Claim(event.text, _Claims, 'claim_');
        if (!_Selected && _Is_Voice_Event(event)) {
            const _Voice_Selected = await _Resolve_Voice_List_Result(_States.STATUS_LIST, event.text, session.language, _Claims, {
                itemResult: 'status_claim',
                itemDescription: (_Claim, _Index) => `open claim ${_Index + 1}: ${_Claim.claimId} with status ${_Claim.status || _Claim_Status.DRAFT}`,
            });
            _Selected = _Voice_Selected?.item || null;
        }
        if (!_Selected) return { state: _States.STATUS_LIST, messages: _With_Current_Prompt(session, 'Choose a claim from the list to view its details.') };
        return _Enter_State(session, _States.STATUS_DETAIL, { selectedStatusClaimId: _Selected.claimId });
    },

    [_States.STATUS_DETAIL]: async ({ session, event }) => {
        const _Claim = session.context.selectedStatusClaimId ? await _DB._Get_Claim_By_Id(session.context.selectedStatusClaimId) : null;
        if (!_Claim) return _Enter_State(session, _States.STATUS_LIST, {}, { extraMessages: [{ type: 'text', body: 'That claim could not be loaded, so I returned you to the claim list.' }] });
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Status_Detail_Prompt(_Claim);
            return { state: _States.STATUS_DETAIL, prompt: _Prompt, messages: [_Prompt] };
        }
        let _Value = _Norm(event.text);
        if (_Is_Voice_Event(event)) {
            const _Voice_Action = await _Resolve_Voice_Static_Result(_States.STATUS_DETAIL, event.text, session.language);
            _Value = _Voice_Action?.result || _Value;
        }
        if (_Value === 'status_back' || _Value === 'back' || _Value === '1') return _Enter_State(session, _States.STATUS_LIST);
        if (_Value === 'status_menu' || _Value === 'menu' || _Value === '2') return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU, {}, { resetHistory: true, pushHistory: false });
        if (_Value === 'status_appeal' || _Value === 'appeal') {
            if (_Claim.status !== _Claim_Status.REJECTED) return { state: _States.STATUS_DETAIL, messages: _With_Current_Prompt(session, 'Appeals are only available for rejected claims.') };
            return _Enter_State(session, _States.APPEAL_START);
        }
        return { state: _States.STATUS_DETAIL, messages: _With_Current_Prompt(session, 'Choose Back, Menu, or Appeal when it is available.') };
    },

    [_States.DRAFT_RESUME_LIST]: async ({ session, event }) => {
        const _Drafts = await _Drafts_For_User(session);
        if (!_Drafts.length) return _Enter_State(session, _States.MAIN_MENU, {}, { extraMessages: [{ type: 'text', body: 'There are no saved drafts to resume.' }], resetHistory: true });
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Status_List_Prompt(_Drafts, false);
            if (session.context.allowNewDraft) {
                _Prompt.items.unshift({ id: 'draft_new_claim', title: 'Start new claim', description: 'Create a fresh claim draft instead' });
                _Prompt.body = 'Choose the draft you want to resume, or choose Start new claim.';
            }
            _Prompt.buttonText = 'Resume draft';
            _Prompt.sectionTitle = 'Drafts';
            _Prompt.items = _Prompt.items.map((_Item) => _Item.id.startsWith('claim_') ? { ..._Item, id: _Item.id.replace(/^claim_/, 'draft_') } : _Item);
            return { state: _States.DRAFT_RESUME_LIST, prompt: _Prompt, messages: [_Prompt] };
        }
        let _Value = _Norm(event.text);
        if (_Value === 'draft_new_claim') return _Create_Claim(session);
        let _Selected = _Pick_Claim(event.text, _Drafts, 'draft_');
        if (!_Selected && _Is_Voice_Event(event)) {
            const _Voice_Selected = await _Resolve_Voice_List_Result(_States.DRAFT_RESUME_LIST, event.text, session.language, _Drafts, {
                itemResult: 'resume_draft',
                itemDescription: (_Claim, _Index) => `resume draft ${_Index + 1}: ${_Claim.claimId} status ${_Claim.status || _Claim_Status.DRAFT}`,
                staticResults: session.context.allowNewDraft ? [{
                    key: 'START_NEW_CLAIM',
                    result: 'start_new_claim',
                    description: 'create a fresh claim draft instead',
                }] : [],
            });
            if (_Voice_Selected?.result === 'start_new_claim') return _Create_Claim(session);
            _Selected = _Voice_Selected?.item || null;
        }
        if (!_Selected) return { state: _States.DRAFT_RESUME_LIST, messages: _With_Current_Prompt(session, 'Choose a draft from the list to resume it.') };
        return _Resume_Draft(session, _Selected);
    },

    [_States.DRAFT_DELETE_LIST]: async ({ session, event }) => {
        const _Drafts = await _Drafts_For_User(session);
        if (!_Drafts.length) return _Enter_State(session, _States.MAIN_MENU, {}, { extraMessages: [{ type: 'text', body: 'There are no saved drafts to delete.' }], resetHistory: true });
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Status_List_Prompt(_Drafts, true);
            return { state: _States.DRAFT_DELETE_LIST, prompt: _Prompt, messages: [_Prompt] };
        }
        let _Selected = _Pick_Claim(event.text, _Drafts, 'draft_');
        if (!_Selected && _Is_Voice_Event(event)) {
            const _Voice_Selected = await _Resolve_Voice_List_Result(_States.DRAFT_DELETE_LIST, event.text, session.language, _Drafts, {
                itemResult: 'delete_draft',
                itemDescription: (_Claim, _Index) => `delete draft ${_Index + 1}: ${_Claim.claimId} status ${_Claim.status || _Claim_Status.DRAFT}`,
            });
            _Selected = _Voice_Selected?.item || null;
        }
        if (!_Selected) return { state: _States.DRAFT_DELETE_LIST, messages: _With_Current_Prompt(session, 'Choose the draft you want to delete.') };
        await _DB._Delete_Claim(_Selected.claimId, _Selected.userId);
        return _Enter_State(session, _States.MAIN_MENU, {}, {
            extraMessages: [{ type: 'text', body: `Draft ${_Selected.claimId} has been deleted.` }],
            resetHistory: true,
            pushHistory: false,
        });
    },
    [_States.DISCARD_CLAIM_CONFIRM]: async ({ session, event }) => {
        const _Claim = await _Active_Claim(session);
        if (!_Claim) return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU);
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Discard_Prompt();
            return { state: _States.DISCARD_CLAIM_CONFIRM, prompt: _Prompt, messages: [_Prompt] };
        }
        let _Value = _Norm(event.text);
        if (_Is_Voice_Event(event)) {
            const _Voice_Action = await _Resolve_Voice_Static_Result(_States.DISCARD_CLAIM_CONFIRM, event.text, session.language);
            _Value = _Voice_Action?.result || _Value;
        }
        if (_Value === 'discard_yes' || _Value === 'delete' || _Value === '1') {
            await _DB._Delete_Claim(_Claim.claimId, session.context.userId);
            return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU, {}, {
                extraMessages: [{ type: 'text', body: `Draft ${_Claim.claimId} has been deleted.` }],
                resetHistory: true,
                pushHistory: false,
            });
        }
        if (_Value === 'discard_no' || _Value === 'keep' || _Value === 'cancel' || _Value === '2') {
            return _Enter_State(session, _States.CLAIM_HUB, {}, { extraMessages: [{ type: 'text', body: 'The draft claim was kept.' }] });
        }
        return { state: _States.DISCARD_CLAIM_CONFIRM, messages: _With_Current_Prompt(session, 'Choose Delete draft or Keep claim.') };
    },

    [_States.QUERY_BOT]: async ({ session, event }) => {
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Query_Prompt();
            return { state: _States.QUERY_BOT, prompt: _Prompt, messages: [_Prompt], pushHistory: false };
        }
        const _Reply = await _Bedrock._Query_Bot_Message(event.text, 'en').catch(() => 'I could not answer that question right now.');
        return { state: _States.QUERY_BOT, messages: [{ type: 'text', body: _Reply }, session.context.cachedPrompt].filter(Boolean) };
    },

    [_States.PREMIUM_CALCULATOR]: async ({ session, event }) => {
        const _Flow = _Clone(session.context.premiumFlow || { step: 'state' });
        if (event.type === 'init' || (!event.text && event.type === 'text')) {
            const _Prompt = _Build_Premium_Prompt(_Flow);
            return { state: _States.PREMIUM_CALCULATOR, context: { premiumFlow: _Flow }, prompt: _Prompt, messages: [_Prompt] };
        }
        if (event.type !== 'text') return { state: _States.PREMIUM_CALCULATOR, messages: _With_Current_Prompt(session, 'Please reply with text for the premium estimate flow.') };
        if (_Flow.step === 'state') {
            _Flow.state = event.text.trim();
            _Flow.step = 'crop';
            const _Prompt = _Build_Premium_Prompt(_Flow);
            return { state: _States.PREMIUM_CALCULATOR, context: { premiumFlow: _Flow }, prompt: _Prompt, messages: [_Prompt] };
        }
        if (_Flow.step === 'crop') {
            _Flow.crop = event.text.trim();
            _Flow.step = 'area';
            const _Prompt = _Build_Premium_Prompt(_Flow);
            return { state: _States.PREMIUM_CALCULATOR, context: { premiumFlow: _Flow }, prompt: _Prompt, messages: [_Prompt] };
        }
        const _Area = _Number(event.text);
        if (!_Area || _Area <= 0) return { state: _States.PREMIUM_CALCULATOR, messages: _With_Current_Prompt(session, 'Please enter a valid area in hectares.') };
        const _Estimate = _Calculator._Calculate_Premium(_Flow.state, _Flow.crop, _Area);
        return _Enter_State({ ...session, context: { ...session.context, premiumFlow: null } }, _States.MAIN_MENU, {}, {
            extraMessages: [{
                type: 'text',
                body: [
                    `Estimated premium for ${_Estimate.crop} in ${_Estimate.state}:`,
                    `Season: ${_Estimate.season}`,
                    `Area: ${_Estimate.areaHectares} ha`,
                    `Sum insured per hectare: INR ${_Estimate.sumInsuredPerHectare}`,
                    `Total sum insured: INR ${_Estimate.totalSumInsured}`,
                    `Farmer premium rate: ${_Estimate.farmerPremiumRate}`,
                    `Farmer premium amount: INR ${_Estimate.farmerPremiumAmount}`,
                    `Estimated government subsidy: INR ${_Estimate.govtSubsidyAmount}`,
                ].join('\n'),
            }],
            resetHistory: true,
            pushHistory: false,
        });
    },

    [_States.HELPER_PHONE_CAPTURE]: async ({ session, event }) => {
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Helper_Phone_Prompt();
            return { state: _States.HELPER_PHONE_CAPTURE, prompt: _Prompt, messages: [_Prompt] };
        }
        const _Parsed_Phone = _Phone(event.text);
        if (!_Parsed_Phone) return { state: _States.HELPER_PHONE_CAPTURE, messages: _With_Current_Prompt(session, 'Please enter a valid farmer phone number.') };
        await _WhatsApp._Send_OTP(_Parsed_Phone);
        const _Prompt = _Build_Helper_OTP_Prompt(_Parsed_Phone);
        return { state: _States.HELPER_OTP_VERIFY, context: { helperVerificationPhone: _Parsed_Phone }, prompt: _Prompt, messages: [_Prompt] };
    },

    [_States.HELPER_OTP_VERIFY]: async ({ session, event }) => {
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Helper_OTP_Prompt(session.context.helperVerificationPhone);
            return { state: _States.HELPER_OTP_VERIFY, prompt: _Prompt, messages: [_Prompt] };
        }
        const _Verified = await _WhatsApp._Verify_OTP(session.context.helperVerificationPhone, event.text);
        if (!_Verified) return { state: _States.HELPER_OTP_VERIFY, messages: _With_Current_Prompt(session, 'That OTP did not match. Please try again.') };
        let _Farmer_User = await _DB._Get_User(session.context.helperVerificationPhone);
        if (!_Farmer_User) _Farmer_User = await _DB._Create_User({ phoneNumber: session.context.helperVerificationPhone, language: session.language, role: 'farmer' });
        const _Actor_User = await _DB._Get_User(session.context.actorPhone);
        if (_Actor_User?.userId && _Farmer_User?.userId) await _DB._Create_Consent(_Farmer_User.userId, _Actor_User.userId).catch(() => null);
        return _Enter_State({
            ...session,
            context: {
                ...session.context,
                helperMode: true,
                helperPhone: session.context.actorPhone,
                farmerPhone: session.context.helperVerificationPhone,
                helperVerificationPhone: null,
                userId: _Farmer_User.userId,
                activeClaimId: null,
            },
        }, _States.MAIN_MENU, {}, {
            extraMessages: [{ type: 'text', body: `Helper mode is active for ${_Pretty_Phone(session.context.helperVerificationPhone)}.` }],
            resetHistory: true,
            pushHistory: false,
        });
    },

    [_States.OPERATOR_HANDOFF]: async ({ session, event }) => {
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Operator_Prompt();
            return { state: _States.OPERATOR_HANDOFF, prompt: _Prompt, messages: [_Prompt], pushHistory: false };
        }
        let _Value = _Norm(event.text);
        if (_Is_Voice_Event(event)) {
            const _Voice_Action = await _Resolve_Voice_Static_Result(_States.OPERATOR_HANDOFF, event.text, session.language);
            _Value = _Voice_Action?.result || _Value;
        }
        if (_Value === 'support_menu' || _Value === 'menu') return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU, {}, { resetHistory: true, pushHistory: false });
        if (_Value === 'support_back' || _Value === 'back') {
            const _Return = session.context.operatorReturn;
            if (_Return?.state && _Return?.prompt) {
                return {
                    state: _Normalize_State(_Return.state),
                    replaceContext: true,
                    context: {
                        ..._Normalize_Context(_Return.checkpoint || {}, session.phoneNumber),
                        history: session.context.history || [],
                        cachedPrompt: _Return.prompt,
                        currentCheckpoint: _Clone(_Return.checkpoint || {}),
                    },
                    prompt: _Return.prompt,
                    checkpointContext: _Return.checkpoint,
                    messages: [_Return.prompt],
                    pushHistory: false,
                };
            }
            return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU, {}, { resetHistory: true, pushHistory: false });
        }
        return { state: _States.OPERATOR_HANDOFF, messages: _With_Current_Prompt(session, 'Choose Back or Menu.') };
    },

    [_States.APPEAL_START]: async ({ session, event }) => {
        const _Claim = session.context.selectedStatusClaimId ? await _DB._Get_Claim_By_Id(session.context.selectedStatusClaimId) : null;
        if (!_Claim || _Claim.status !== _Claim_Status.REJECTED) {
            return _Enter_State(session, _States.STATUS_DETAIL, {}, { extraMessages: [{ type: 'text', body: 'Appeal is only available for a rejected claim.' }] });
        }
        if (event.type === 'init' || !event.text) {
            const _Prompt = _Build_Appeal_Prompt(_Claim);
            return { state: _States.APPEAL_START, prompt: _Prompt, messages: [_Prompt] };
        }
        let _Value = _Norm(event.text);
        if (_Is_Voice_Event(event)) {
            const _Voice_Action = await _Resolve_Voice_Static_Result(_States.APPEAL_START, event.text, session.language);
            _Value = _Voice_Action?.result || _Value;
        }
        if (_Value === 'appeal_cancel' || _Value === 'cancel' || _Value === '2') return _Enter_State(session, _States.STATUS_DETAIL, {}, { extraMessages: [{ type: 'text', body: 'Appeal creation cancelled.' }] });
        if (_Value === 'appeal_confirm' || _Value === 'create' || _Value === 'create appeal' || _Value === '1') {
            const _Appeal = await _Invoke_Appeal_Generator(_Claim.claimId, { ..._Claim, userId: session.context.userId });
            await _DB._Update_Claim_Status(_Claim.claimId, session.context.userId, _Claim_Status.APPEAL_FILED, { appealSubmittedAt: new Date().toISOString() }).catch(() => null);
            return _Enter_State(session, _States.STATUS_DETAIL, {}, {
                extraMessages: [{
                    type: 'text',
                    body: _Appeal?.presignedUrl ? `Appeal document created. Download: ${_Appeal.presignedUrl}` : 'Appeal creation has been started for this rejected claim.',
                }],
            });
        }
        return { state: _States.APPEAL_START, messages: _With_Current_Prompt(session, 'Choose Create appeal or Cancel.') };
    },

    [_States.ERROR_RECOVERY]: async ({ session }) => _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU, {}, {
        extraMessages: [{ type: 'text', body: 'I recovered the conversation and returned you to the main menu.' }],
        resetHistory: true,
        pushHistory: false,
    }),
};

async function _Create_Claim(_Session) {
    const _Farmer = await _DB._Get_User(_Session.context.farmerPhone);
    const _Claim = await _DB._Create_Claim({
        claimId: _Generate_Claim_Id(),
        userId: _Session.context.userId,
        phoneNumber: _Session.context.farmerPhone,
        farmerName: _Farmer?.name || null,
        village: _Farmer?.village || null,
        district: _Farmer?.district || null,
        state: _Farmer?.state || null,
        draftState: _States.CLAIM_HUB,
    });
    return _Enter_State({ ..._Session, context: { ..._Session.context, activeClaimId: _Claim.claimId, currentFieldKey: null } }, _States.CLAIM_HUB, {}, {
        extraMessages: [{ type: 'text', body: `Created claim ${_Claim.claimId}.` }],
        resetHistory: true,
    });
}

async function _Resume_Draft(_Session, _Claim) {
    const _State = _Normalize_State(_Claim.draftState || _States.CLAIM_HUB);
    const _Draft = _Normalize_Context(_Claim.draftContext || {}, _Session.phoneNumber);
    const _Context = {
        ..._Session.context,
        ..._Draft,
        activeClaimId: _Claim.claimId,
        userId: _Claim.userId,
        selectedStatusClaimId: null,
        history: [],
    };
    if (_Draft.cachedPrompt) {
        return {
            state: _State,
            replaceContext: true,
            context: {
                ..._Context,
                cachedPrompt: _Draft.cachedPrompt,
                currentCheckpoint: _Draft.currentCheckpoint || _Checkpoint(_Context),
            },
            prompt: _Draft.cachedPrompt,
            checkpointContext: _Draft.currentCheckpoint || _Checkpoint(_Context),
            messages: [{ type: 'text', body: `Resumed draft ${_Claim.claimId}.` }, _Draft.cachedPrompt],
            resetHistory: true,
            pushHistory: false,
        };
    }
    return _Enter_State({ ..._Session, context: _Context }, _State, {}, {
        extraMessages: [{ type: 'text', body: `Resumed draft ${_Claim.claimId}.` }],
        resetHistory: true,
        pushHistory: false,
    });
}

async function _Section_Handler({ session, event }, _State) {
    const _Claim = await _Active_Claim(session);
    if (!_Claim) return _Enter_State(_Clear_Claim_Session(session), _States.MAIN_MENU);
    let _Field = _Section_Field(_State, _Claim, session.context.currentFieldKey);
    if (!_Field) return _Enter_State(session, _States.CLAIM_HUB, { currentFieldKey: null }, { extraMessages: [{ type: 'text', body: `${_Section_Name(_State)} completed.` }] });
    if (event.type === 'init' || (!event.text && event.type === 'text')) {
        const _Prompt = _Section_Prompt(_State, _Field);
        return { state: _State, context: { currentFieldKey: _Field.key }, prompt: _Prompt, messages: [_Prompt] };
    }
    if (_Field.key !== 'exact_location' && event.type !== 'text') {
        return { state: _State, messages: _With_Current_Prompt(session, 'Please reply with text for this step.') };
    }
    if (!_Field.required && event.type === 'text' && _Norm(event.text) === 'skip') {
        await _Update_Section_Value(_Claim, session.context.userId, _Field.key, null);
        return _State_Handlers[_State]({ session: { ...session, context: { ...session.context, currentFieldKey: null } }, event: { type: 'init', text: '' } });
    }
    const _Parsed = await _Parse_Section_Field(_Field, event, session.language, _Claim);
    if (!_Parsed.ok) return { state: _State, messages: _With_Current_Prompt(session, _Parsed.reason) };
    await _Update_Section_Value(_Claim, session.context.userId, _Field.key, _Parsed.value);
    if (_Claim.selectedTemplateId || _Claim.company) {
        await _Prepare_Template_Schema(_Claim.claimId, session.context.userId, _Claim.selectedTemplateId || _Claim.company);
    }
    if (_State === _States.CLAIM_DATE_LOCATION && _Field.key === 'exact_location') {
        return _Enter_State(
            { ...session, context: { ...session.context, currentFieldKey: null } },
            _States.CLAIM_HUB,
            { currentFieldKey: null },
            { extraMessages: [{ type: 'text', body: 'Date and location completed.' }] }
        );
    }
    return _State_Handlers[_State]({ session: { ...session, context: { ...session.context, currentFieldKey: null } }, event: { type: 'init', text: '' } });
}

async function _Active_Claim(_Session) {
    if (!_Session.context.activeClaimId) return null;
    return _DB._Get_Claim_By_Id(_Session.context.activeClaimId);
}

async function _Claims_For_User(_Session) {
    if (!_Session.context.userId) return [];
    return (await _DB._Get_Claims_By_User(_Session.context.userId) || []).sort((_A, _B) => new Date(_B.lastUpdated || _B.createdAt || 0) - new Date(_A.lastUpdated || _A.createdAt || 0));
}

async function _Drafts_For_User(_Session) {
    const _Claims = await _Claims_For_User(_Session);
    return _Claims.filter((_Claim) => _Claim.status === _Claim_Status.DRAFT || _Claim.status === _Claim_Status.EVIDENCE_PENDING);
}

async function _Pending_Fields(_Claim) {
    const _Pending = await _DB._Get_Pending_Fields(_Claim.claimId);
    if (!_Pending.length) return [];
    const _Photo_Field = _Pending.find((_Field) => _Field.field_type === 'photo' || _Field.field_name === 'crop_loss_photo');
    if (_Photo_Field && Number(_Claim.approvedPhotoCount || 0) >= _Photo_Config.MIN_PHOTOS_REQUIRED) {
        await _DB._Update_Field_Status(_Claim.claimId, _Claim.userId, _Photo_Field.field_name, 'completed', 'photo evidence', 'photo').catch(() => null);
        return _DB._Get_Pending_Fields(_Claim.claimId);
    }
    return _Pending;
}

async function _Prepare_Template_Schema(_Claim_Id, _User_Id, _Template_Id) {
    const _Claim = await _DB._Get_Claim_By_Id(_Claim_Id);
    const _Template = _Get_Template(_Template_Id);
    if (!_Claim || !_Template) return { template: null, schema: [], pendingCount: 0, prefilledCount: 0 };

    const _Schema = _Template_Schema._Build_Template_Schema(_Template.id, {
        ..._Claim,
        selectedTemplateId: _Template.id,
        company: _Template.id,
    });

    await _DB._Update_Claim(_Claim_Id, _User_Id, {
        selectedTemplateId: _Template.id,
        company: _Template.id,
        templateBuildStatus: _Schema.some((_Field) => _Field.status === 'pending') ? 'needs_input' : 'ready',
    });
    await _DB._Update_Form_Schema(_Claim_Id, _User_Id, _Schema);

    return {
        template: _Template,
        schema: _Schema,
        pendingCount: _Schema.filter((_Field) => _Field.status === 'pending').length,
        prefilledCount: _Schema.filter((_Field) => _Field.status !== 'pending').length,
    };
}

function _Can_Review(_Claim, _Pending) {
    if (!_Farmer_Done(_Claim)) return { ok: false, reason: 'Farmer details are still incomplete.' };
    if (!_Crop_Done(_Claim)) return { ok: false, reason: 'Crop details are still incomplete.' };
    if (!_Date_Location_Done(_Claim)) return { ok: false, reason: 'Date and location are still incomplete.' };
    if (!_Identity_Is_Verified(_Claim)) return { ok: false, reason: _Identity_Document_Request(_Claim), route: 'documents' };
    if ((_Pending || []).length) return { ok: false, reason: `There are still ${_Pending.length} missing extracted field(s) to complete.` };
    if (Number(_Claim.approvedPhotoCount || 0) < _Photo_Config.MIN_PHOTOS_REQUIRED) return { ok: false, reason: `At least ${_Photo_Config.MIN_PHOTOS_REQUIRED} approved photos are required before submission.` };
    return { ok: true };
}

function _Section_Field(_State, _Claim, _Current) {
    const _Fields = _SECTION_FIELDS[_State] || [];
    if (_Current) {
        const _Match = _Fields.find((_Field) => _Field.key === _Current);
        if (_Match && !_Section_Field_Done(_Claim, _Match.key)) return _Match;
    }
    return _Fields.find((_Field) => !_Section_Field_Done(_Claim, _Field.key)) || null;
}

function _Section_Field_Done(_Claim, _Key) {
    switch (_Key) {
        case 'farmer_name': return Boolean(_Claim.farmerName);
        case 'village': return Boolean(_Claim.village);
        case 'district': return Boolean(_Claim.district);
        case 'state': return Boolean(_Claim.state);
        case 'crop_type': return Boolean(_Claim.cropType);
        case 'season': return Boolean(_Claim.season);
        case 'cause': return Boolean(_Claim.cause);
        case 'area_hectares': return Boolean(_Claim.areaHectares);
        case 'policy_type': return Boolean(_Claim.policyType);
        case 'loss_date': return Boolean(_Claim.lossDate);
        case 'exact_location': return Boolean(_Claim.gpsCoords || _Claim.exactLocation);
        default: return false;
    }
}

function _Section_Name(_State) {
    if (_State === _States.CLAIM_FARMER_DETAILS) return 'Farmer details';
    if (_State === _States.CLAIM_CROP_DETAILS) return 'Crop details';
    if (_State === _States.CLAIM_DATE_LOCATION) return 'Date and location';
    return 'Claim section';
}

function _Section_Prompt(_State, _Field) {
    const _Fields = _SECTION_FIELDS[_State] || [];
    const _Index = Math.max(_Fields.findIndex((_Item) => _Item.key === _Field.key), 0) + 1;
    const _Prompt = typeof _Field.prompt === 'function' ? _Field.prompt() : _Field.prompt;
    return { type: 'text', body: `${_Section_Name(_State)} step ${_Index} of ${_Fields.length}: ${_Prompt}` };
}

function _Current_Pending(_Pending, _Current) {
    return _Current ? _Pending.find((_Field) => _Field.field_name === _Current) : null;
}

function _Build_Missing_Field_Prompt(_Field, _Count) {
    if (_Field.accepted_values?.length) {
        return {
            type: 'text',
            body: [
                `Missing details: please provide ${_Field.field_label}.`,
                ..._Field.accepted_values.map((_Value, _Index) => `${_Index + 1}. ${_Humanize(_Value)}`),
                _Field.is_required ? '' : 'This field is optional. Type skip if you do not have it.',
            ].filter(Boolean).join('\n'),
        };
    }
    return { type: 'text', body: `Missing details (${_Count} pending): please provide ${_Field.field_label}.${_Field.is_required ? '' : ' You can type skip if it is optional.'}` };
}

function _Humanize(_Value) {
    return String(_Value || '').replace(/_/g, ' ').replace(/\b\w/g, (_Char) => _Char.toUpperCase());
}

function _Schema_Claim_Update(_Field, _Value) {
    switch (_Field) {
        case 'farmer_name': return { farmerName: _Value, identityVerification: _Identity._Reset_Identity_Verification(_Value) };
        case 'village': return { village: _Value };
        case 'crop_type': return { cropType: _Value };
        case 'cause': return { cause: _Value };
        case 'area_hectares': return { areaHectares: _Value };
        case 'loss_date': return { lossDate: _Value };
        case 'mobile_number':
        case 'phone_number': return { phoneNumber: _Value };
        case 'mailing_address': return { address: _Value };
        case 'mailing_village': return { village: _Value };
        case 'mailing_district': return { district: _Value };
        case 'mailing_state': return { state: _Value };
        case 'mailing_tehsil': return { tehsil: _Value };
        case 'mailing_pin_code': return { pinCode: _Value };
        case 'land_address': return { landAddress: _Value };
        case 'land_village': return { landVillage: _Value };
        case 'land_district': return { landDistrict: _Value };
        case 'land_state': return { landState: _Value };
        case 'land_tehsil': return { landTehsil: _Value };
        case 'land_pin_code': return { landPinCode: _Value };
        case 'gender': return { gender: _Value };
        case 'social_category': return { socialCategory: _Value };
        case 'account_type': return { accountType: _Value };
        case 'has_crop_loan_or_kcc': return { hasCropLoanOrKcc: _Value };
        case 'crop_season_year': return { cropSeasonYear: _Value };
        case 'sowing_date': return { sowingDate: _Value };
        case 'crop_stage': return { cropStage: _Value };
        case 'proposed_harvest_date': return { proposedHarvestDate: _Value };
        case 'harvesting_date': return { harvestingDate: _Value };
        case 'total_land_hectare': return { totalLandHectares: _Value };
        case 'total_land_insured_hectare': return { totalLandInsuredHectares: _Value };
        case 'loanee_status': return { loaneeStatus: _Value };
        case 'survey_or_khasara_or_udyan_no': return { surveyOrKhasaraOrUdyanNo: _Value };
        case 'notified_area_name': return { notifiedAreaName: _Value };
        case 'sum_insured_rupees': return { sumInsuredRupees: _Value };
        case 'premium_paid_rupees': return { premiumPaidRupees: _Value };
        case 'premium_deduction_or_cover_note_date': return { premiumDeductionOrCoverNoteDate: _Value };
        case 'pep_declaration': return { pepDeclaration: _Value };
        case 'place': return { formPlace: _Value };
        default: return {};
    }
}

async function _Update_Section_Value(_Claim, _User_Id, _Key, _Value) {
    const _Updates = {};
    if (_Key === 'farmer_name') {
        _Updates.farmerName = _Value;
        if (_Identity._Normalize_Name(_Claim.farmerName) !== _Identity._Normalize_Name(_Value)) {
            _Updates.identityVerification = _Identity._Reset_Identity_Verification(_Value);
        }
    }
    if (_Key === 'village') _Updates.village = _Value;
    if (_Key === 'district') _Updates.district = _Value;
    if (_Key === 'state') _Updates.state = _Value;
    if (_Key === 'crop_type') _Updates.cropType = _Value;
    if (_Key === 'season') _Updates.season = _Value;
    if (_Key === 'cause') _Updates.cause = _Value;
    if (_Key === 'area_hectares') _Updates.areaHectares = _Value;
    if (_Key === 'policy_type') _Updates.policyType = _Value;
    if (_Key === 'loss_date') {
        _Updates.lossDate = _Value;
        _Updates.deadline = _Calculate_Deadline(_Value).toISOString();
        if (!_Claim.deadline) {
            await _DB._Create_Deadline(_Claim.claimId, _Clean_Phone(_Claim.phoneNumber || ''), _Updates.deadline).catch(() => null);
        }
    }
    if (_Key === 'exact_location') {
        if (_Value?.gpsCoords) _Updates.gpsCoords = _Value.gpsCoords;
        if (_Value?.exactLocation) _Updates.exactLocation = _Value.exactLocation;
        if (_Value?.village && !_Claim.village) _Updates.village = _Value.village;
        if (_Value?.district && !_Claim.district) _Updates.district = _Value.district;
        if (_Value?.state && !_Claim.state) _Updates.state = _Value.state;
    }
    if (Object.keys(_Updates).length) await _DB._Update_Claim(_Claim.claimId, _User_Id, _Updates);
}

function _Is_Voice_Event(_Event) {
    return _Event?.inputSource === 'voice' || _Event?.originalType === 'voice';
}

function _Voice_State_Config(_State) {
    return _Voice_Intent_Schema?.states?.[_Normalize_State(_State)] || null;
}

function _Voice_Field_Config(_Field_Key) {
    return _Voice_Intent_Schema?.fieldChoices?.[_Field_Key] || null;
}

function _Voice_Accept_Confidence(_Config, _Fallback = 0.8) {
    const _Value = Number(_Config?.acceptConfidence);
    return Number.isFinite(_Value) ? Math.max(0, Math.min(1, _Value)) : _Fallback;
}

function _Voice_Context_From_Prompt(_Prompt) {
    if (!_Prompt) return '';
    if (typeof _Prompt === 'string') return _Prompt;
    const _Parts = [];
    if (_Prompt.body) _Parts.push(String(_Prompt.body));
    if (Array.isArray(_Prompt.buttons) && _Prompt.buttons.length) {
        _Parts.push(`Buttons: ${_Prompt.buttons.map((_Button) => _Button.title).join(', ')}`);
    }
    if (Array.isArray(_Prompt.items) && _Prompt.items.length) {
        _Parts.push(`List items: ${_Prompt.items.map((_Item, _Index) => `${_Index + 1}. ${_Item.title}${_Item.description ? ` (${_Item.description})` : ''}`).join('; ')}`);
    }
    return _Parts.join('\n').trim();
}

async function _Resolve_Voice_Static_Result(_State, _Text, _Language, _Entries_Override = null, _Extra_Context = '') {
    const _State_Config = _Voice_State_Config(_State);
    if (!_State_Config?.enabled) return null;

    const _Entries = Array.isArray(_Entries_Override) && _Entries_Override.length
        ? _Entries_Override
        : [...(_State_Config.actions || []), ...(_State_Config.staticActions || [])];

    if (!_Entries.length) return null;

    try {
        const _Ai = await _Bedrock._Interpret_Message(
            _Normalize_State(_State),
            _Text,
            _Entries.map((_Entry) => ({
                key: String(_Entry.key || '').toUpperCase(),
                description: _Entry.description || _Entry.label || _Entry.result || _Entry.key,
            })),
            _Language,
            _Extra_Context,
        );

        if (!_Ai?.action || _Ai.action === 'UNKNOWN') return null;
        if (_Ai.confidence < _Voice_Accept_Confidence(_State_Config)) return null;

        const _Matched = _Entries.find((_Entry) => String(_Entry.key || '').toUpperCase() === _Ai.action);
        return _Matched ? { ..._Matched, confidence: _Ai.confidence, data: _Ai.data || null } : null;
    } catch (_Error) {
        console.error('Voice static resolver failed:', _State, _Error.message);
        return null;
    }
}

async function _Resolve_Voice_List_Result(_State, _Text, _Language, _Items, _Options = {}) {
    const _State_Config = _Voice_State_Config(_State);
    if (!_State_Config?.enabled || !Array.isArray(_Items) || !_Items.length) return null;

    const _Dynamic_Entries = _Items.map((_Item, _Index) => ({
        key: `ITEM_${_Index + 1}`,
        result: _Options.itemResult || 'select_item',
        description: _Options.itemDescription
            ? _Options.itemDescription(_Item, _Index)
            : `choose item ${_Index + 1}: ${_Item.claimId || _Item.id || _Item.title || `item ${_Index + 1}`}`,
        item: _Item,
        index: _Index,
    }));

    const _Static_Entries = Array.isArray(_Options.staticResults) && _Options.staticResults.length
        ? _Options.staticResults
        : (_State_Config.staticActions || []);

    const _Resolved = await _Resolve_Voice_Static_Result(
        _State,
        _Text,
        _Language,
        [..._Dynamic_Entries, ..._Static_Entries],
        _Options.extraContext || '',
    );

    if (!_Resolved) return null;
    if (_Resolved.item) {
        return {
            result: _Resolved.result || _Options.itemResult || 'select_item',
            item: _Resolved.item,
            index: _Resolved.index,
            confidence: _Resolved.confidence,
        };
    }
    return {
        result: _Resolved.result || null,
        item: null,
        confidence: _Resolved.confidence,
    };
}

async function _Parse_Section_Field(_Field, _Event, _Language) {
    if (_Field.key === 'crop_type') return _Choice(_Event.text, _CROP_OPTIONS, _Language, _Event.inputSource, 'crop_type');
    if (_Field.key === 'season') return _Choice(_Event.text, _SEASON_OPTIONS, _Language, _Event.inputSource, 'season');
    if (_Field.key === 'cause') return _Choice(_Event.text, _CAUSE_OPTIONS, _Language, _Event.inputSource, 'cause');
    if (_Field.key === 'policy_type') return _Choice(_Event.text, _POLICY_OPTIONS, _Language, _Event.inputSource, 'policy_type');
    if (_Field.key === 'area_hectares') {
        const _Value = _Number(_Event.text);
        if (!_Value || _Value <= 0) return { ok: false, reason: 'Please enter a valid affected area.' };
        return { ok: true, value: _Norm(_Event.text).includes('bigha') ? _Bigha_To_Hectares(_Value) : _Value };
    }
    if (_Field.key === 'loss_date') {
        const _Parsed_Date = await _Date(_Event.text);
        if (!_Parsed_Date) return { ok: false, reason: 'Please reply with a valid date.' };
        if (new Date(`${_Parsed_Date}T00:00:00Z`) > new Date()) return { ok: false, reason: 'The loss date cannot be in the future.' };
        return { ok: true, value: _Parsed_Date };
    }
    if (_Field.key === 'exact_location') {
        if (_Event.type === 'location' && _Event.location?.latitude != null && _Event.location?.longitude != null) {
            return {
                ok: true,
                value: {
                    gpsCoords: {
                        lat: Number(_Event.location.latitude),
                        lng: Number(_Event.location.longitude),
                        source: 'whatsapp_share',
                    },
                    exactLocation: 'Pinned field location',
                },
            };
        }
        const _Location_Text = String(_Event.text || '').trim();
        if (_Location_Text.length < 3 || _Looks_Like_Small_Talk(_Location_Text)) {
            return {
                ok: false,
                reason: 'Please enter the field location, village, field name, or nearest landmark.',
            };
        }
        const _Parsed = await _Bedrock._Parse_Location(_Location_Text).catch(() => ({ village: null, district: null, state: null }));
        return { ok: true, value: { exactLocation: _Location_Text, village: _Parsed.village || null, district: _Parsed.district || null, state: _Parsed.state || null } };
    }
    const _Text = String(_Event.text || '').trim();
    if (_Text.length < 2) return { ok: false, reason: 'Please enter a valid value.' };
    return { ok: true, value: _Text };
}

async function _Parse_Schema_Field(_Field, _Event, _Language) {
    const _Value = String(_Event?.text || '').trim();
    if (_Field.field_type === 'date') {
        const _Parsed = await _Date(_Value);
        return _Parsed ? { ok: true, value: _Parsed } : { ok: false, reason: 'Please reply with a valid date.' };
    }
    if (_Field.field_type === 'number') {
        const _Parsed = _Number(_Value);
        return _Parsed == null ? { ok: false, reason: 'Please enter a valid number.' } : { ok: true, value: _Parsed };
    }
    if (_Field.field_type === 'choice' && _Field.accepted_values?.length) {
        const _Options = _Field.accepted_values.map((_Option, _Index) => ({
            key: `choice_${_Index + 1}`,
            value: _Option,
            label: _Humanize(_Option),
            aliases: [String(_Index + 1), _Option],
        }));
        return _Choice(_Value, _Options, _Language, _Event?.inputSource, 'schema_choice');
    }
    if (_Field.field_name === 'phone_number') {
        const _Phone_Value = _Phone(_Value);
        return _Phone_Value ? { ok: true, value: _Phone_Value } : { ok: false, reason: 'Please enter a valid phone number.' };
    }
    if (_Field.field_name === 'mobile_number') {
        const _Phone_Value = _Phone(_Value);
        return _Phone_Value ? { ok: true, value: _Phone_Value } : { ok: false, reason: 'Please enter a valid mobile number.' };
    }
    if (_Field.field_name === 'aadhaar_number') {
        const _Digits = _Value.replace(/[^\d]/g, '');
        return _Digits.length === 12 ? { ok: true, value: _Digits } : { ok: false, reason: 'Aadhaar number must contain 12 digits.' };
    }
    if (_Field.field_name === 'bank_ifsc' || _Field.field_name === 'ifsc_code') {
        return /^[A-Za-z]{4}[A-Za-z0-9]{7}$/.test(_Value) ? { ok: true, value: _Value.toUpperCase() } : { ok: false, reason: 'Please enter a valid IFSC code.' };
    }
    if (_Field.field_name === 'bank_account_number') {
        const _Digits = _Value.replace(/[^\d]/g, '');
        return _Digits.length >= 6 ? { ok: true, value: _Digits } : { ok: false, reason: 'Please enter a valid bank account number.' };
    }
    if (['mailing_pin_code', 'land_pin_code'].includes(_Field.field_name)) {
        const _Digits = _Value.replace(/[^\d]/g, '');
        return _Digits.length === 6 ? { ok: true, value: _Digits } : { ok: false, reason: 'Pin code must contain 6 digits.' };
    }
    if (_Value.length < 2) return { ok: false, reason: 'Please enter a valid value.' };
    return { ok: true, value: _Value };
}

async function _Choice(_Text, _Options, _Language, _Input_Source, _Choice_Key) {
    const _Value = _Norm(_Text);
    const _Direct = _Options.find((_Option) =>
        _Norm(_Option.key) === _Value
        || _Norm(_Option.value) === _Value
        || (_Option.aliases || []).some((_Alias) => _Norm(_Alias) === _Value)
    );
    if (_Direct) return { ok: true, value: _Direct.value };

    if (_Input_Source !== 'voice') return { ok: false, reason: 'Please choose one of the listed options.' };

    const _Choice_Config = _Voice_Field_Config(_Choice_Key);
    if (!_Choice_Config?.enabled) return { ok: false, reason: 'Please choose one of the listed options.' };

    try {
        const _Ai = await _Bedrock._Interpret_Message(
            `VOICE_FIELD_${String(_Choice_Key || 'CHOICE').toUpperCase()}`,
            _Text,
            _Options.map((_Option) => ({
                key: _Option.key.toUpperCase(),
                description: `choose ${_Option.label}`,
            })),
            _Language,
        );
        if (!_Ai?.action || _Ai.action === 'UNKNOWN') return { ok: false, reason: 'Please choose one of the listed options.' };
        if (_Ai.confidence < _Voice_Accept_Confidence(_Choice_Config, 0.75)) {
            return { ok: false, reason: 'Please choose one of the listed options.' };
        }
        const _Selected = _Options.find((_Option) => _Option.key.toUpperCase() === _Ai.action);
        if (_Selected) return { ok: true, value: _Selected.value };
    } catch (_Error) {
        console.error('Voice choice resolver failed:', _Choice_Key, _Error.message);
    }
    return { ok: false, reason: 'Please choose one of the listed options.' };
}

async function _Date(_Text) {
    const _Value = String(_Text || '').trim();
    const _Slash = _Value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (_Slash) return `${_Slash[3]}-${String(_Slash[2]).padStart(2, '0')}-${String(_Slash[1]).padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(_Value)) return _Value;
    const _Parsed = await _Bedrock._Parse_Date(_Value).catch(() => null);
    return _Parsed && !Number.isNaN(Date.parse(_Parsed)) ? _Parsed : null;
}

function _Number(_Text) {
    const _Match = String(_Text || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return _Match ? Number(_Match[0]) : null;
}

function _Phone(_Text) {
    const _Digits = String(_Text || '').replace(/[^\d]/g, '');
    if (_Digits.length === 10) return `+91${_Digits}`;
    if (_Digits.length >= 11 && _Digits.length <= 13) return `+${_Digits}`;
    return null;
}

async function _Resolve_Main_Menu(_Text, _Language, _Helper_Mode, _Event, _Session) {
    const _Value = _Norm(_Text);
    const _Direct_Groups = [
        { result: 'new_claim', aliases: ['1', 'menu_new_claim', 'new claim', 'start new claim', 'start claim', 'file claim', 'file a claim', 'create claim'] },
        { result: 'status', aliases: ['2', 'menu_status', 'status', 'claim status', 'check status', 'check claim status'] },
        { result: 'resume', aliases: ['3', 'menu_resume', 'resume', 'resume draft', 'continue draft', 'open draft'] },
        { result: 'delete_draft', aliases: ['4', 'menu_delete_draft', 'delete draft', 'remove draft', 'delete my draft'] },
        { result: 'query', aliases: ['5', 'menu_query', 'query', 'ask question', 'insurance question'] },
        { result: 'premium', aliases: ['6', 'menu_premium', 'premium', 'calculate premium', 'premium calculator'] },
        { result: _Helper_Mode ? 'exit_helper' : 'helper', aliases: ['7', _Helper_Mode ? 'menu_exit_helper' : 'menu_helper', _Helper_Mode ? 'exit helper mode' : 'helper mode', _Helper_Mode ? 'stop helper mode' : 'start helper mode'] },
        { result: _Helper_Mode ? 'helper' : 'exit_helper', aliases: [_Helper_Mode ? 'menu_helper' : 'menu_exit_helper'] },
        { result: 'language', aliases: ['8', 'menu_language', 'language', 'change language'] },
    ];
    const _Matched = _Direct_Groups.find((_Entry) => _Entry.aliases.some((_Alias) => _Norm(_Alias) === _Value));
    if (_Matched) return _Matched.result;

    if (!_Is_Voice_Event(_Event)) return null;

    const _Resolved = await _Resolve_Voice_Static_Result(
        _States.MAIN_MENU,
        _Text,
        _Language,
        [
            { key: 'NEW_CLAIM', result: 'new_claim', description: 'start a new crop insurance claim' },
            { key: 'STATUS', result: 'status', description: 'view claim status' },
            { key: 'RESUME', result: 'resume', description: 'resume a saved draft' },
            { key: 'DELETE_DRAFT', result: 'delete_draft', description: 'delete one draft claim' },
            { key: 'QUERY', result: 'query', description: 'ask a crop insurance question' },
            { key: 'PREMIUM', result: 'premium', description: 'calculate premium' },
            {
                key: _Helper_Mode ? 'EXIT_HELPER' : 'HELPER',
                result: _Helper_Mode ? 'exit_helper' : 'helper',
                description: _Helper_Mode ? 'exit helper mode' : 'enter helper mode',
            },
            { key: 'LANGUAGE', result: 'language', description: 'change language' },
        ],
        _Voice_Context_From_Prompt(_Session?.context?.cachedPrompt),
    );
    return _Resolved?.result || null;
}

async function _Resolve_Claim_Hub(_Text, _Language, _Event, _Session) {
    const _Value = _Norm(_Text);
    const _Direct_Groups = [
        { result: 'farmer', aliases: ['claim_farmer', '1', 'farmer', 'farmer details'] },
        { result: 'crop', aliases: ['claim_crop', '2', 'crop', 'crop details'] },
        { result: 'date_location', aliases: ['claim_date_location', '3', 'date location', 'date and location', 'loss date', 'location'] },
        { result: 'documents', aliases: ['claim_documents', '4', 'documents', 'document', 'docs', 'upload documents'] },
        { result: 'template', aliases: ['claim_template', '5', 'template', 'insurer form', 'company form'] },
        { result: 'missing', aliases: ['claim_missing', '6', 'missing fields', 'missing', 'pending fields'] },
        { result: 'photos', aliases: ['claim_photos', '7', 'photos', 'photo evidence', 'pictures', 'images'] },
        { result: 'review', aliases: ['claim_review', '8', 'review', 'review and submit', 'submit'] },
        { result: 'save_exit', aliases: ['claim_save_exit', '9', 'save and exit', 'save exit'] },
        { result: 'abandon', aliases: ['claim_abandon', '10', 'abandon', 'discard claim', 'delete claim'] },
    ];
    const _Matched = _Direct_Groups.find((_Entry) => _Entry.aliases.some((_Alias) => _Norm(_Alias) === _Value));
    if (_Matched) return _Matched.result;

    if (!_Is_Voice_Event(_Event)) return null;

    const _Resolved = await _Resolve_Voice_Static_Result(
        _States.CLAIM_HUB,
        _Text,
        _Language,
        null,
        _Voice_Context_From_Prompt(_Session?.context?.cachedPrompt),
    );
    return _Resolved?.result || null;
}

function _Parse_Language(_Text) {
    const _Value = _Norm(_Text);
    const _Number_Value = Number(_Value);
    if (_Number_Value >= 1 && _Number_Value <= _LANGUAGE_OPTIONS.length) return _LANGUAGE_OPTIONS[_Number_Value - 1].code;
    const _Found = _LANGUAGE_OPTIONS.find((_Lang) => _Value === _Norm(_Lang.id) || _Value === _Norm(_Lang.title) || _Value === _Norm(_Lang.description));
    return _Found?.code || null;
}

function _Pick_Claim(_Text, _Claims, _Prefix) {
    const _Value = _Norm(_Text);
    const _Direct = _Claims.find((_Claim) => _Value === `${_Prefix}${_Norm(_Claim.claimId)}` || _Value === _Norm(_Claim.claimId));
    if (_Direct) return _Direct;
    const _Index = Number(_Value);
    return _Index >= 1 && _Index <= _Claims.length ? _Claims[_Index - 1] : null;
}

async function _Invoke_Voice(_Media_Data, _Language, _Claim_Id) {
    try {
        const _Response = await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.VOICE_PROCESSOR_FUNCTION || 'bimasathi-voice-processor',
            Payload: Buffer.from(JSON.stringify({ mediaData: _Media_Data, language: _Language, claimId: _Claim_Id })),
        }));
        const _Result = JSON.parse(new TextDecoder().decode(_Response.Payload));
        const _Body = typeof _Result.body === 'string' ? JSON.parse(_Result.body) : _Result;
        if (_Response.FunctionError) {
            return {
                ok: false,
                transcription: '',
                errorCode: 'VOICE_PROCESSOR_LAMBDA_ERROR',
                errorMessage: _Body?.errorMessage || _Response.FunctionError,
            };
        }
        return {
            ok: Boolean(_Body?.ok),
            transcription: _Body?.transcription || '',
            errorCode: _Body?.errorCode || null,
            errorMessage: _Body?.errorMessage || null,
            contentType: _Body?.contentType || '',
            mediaFormat: _Body?.mediaFormat || null,
            transcribeLanguage: _Body?.transcribeLanguage || null,
        };
    } catch (_Error) {
        console.error('Voice processor invocation failed:', _Error);
        return {
            ok: false,
            transcription: '',
            errorCode: 'VOICE_PROCESSOR_INVOKE_FAILED',
            errorMessage: _Error.message,
        };
    }
}

function _Voice_Error_Message(_Voice_Result = {}) {
    switch (_Voice_Result.errorCode) {
    case 'VOICE_MEDIA_ID_MISSING':
    case 'META_MEDIA_LOOKUP_FAILED':
    case 'META_MEDIA_URL_MISSING':
    case 'META_MEDIA_DOWNLOAD_FAILED':
    case 'META_MEDIA_EMPTY':
    case 'META_MEDIA_EXCEPTION':
    case 'VOICE_MEDIA_DOWNLOAD_FAILED':
        return 'I could not download that voice note from WhatsApp. Please send the voice note again as a fresh WhatsApp recording, or send text.';
    case 'VOICE_UNSUPPORTED_FORMAT':
        return 'That audio format is not supported yet. Please send a normal WhatsApp voice note, or send text.';
    case 'VOICE_TRANSCRIPTION_TIMEOUT':
        return 'That voice note took too long to process. Please send a shorter voice note, or send text.';
    case 'VOICE_TRANSCRIPTION_FAILED':
    case 'VOICE_TRANSCRIPTION_UNAVAILABLE':
        return 'I could not transcribe that voice note clearly. Please send a shorter, clearer voice note, or send text.';
    case 'VOICE_PROCESSOR_LAMBDA_ERROR':
    case 'VOICE_PROCESSOR_INVOKE_FAILED':
    case 'VOICE_PROCESSING_EXCEPTION':
        return 'Voice processing is unavailable right now. Please send text for now.';
    default:
        return 'I could not understand that voice note. Please send text, or send the voice note again.';
    }
}

async function _Invoke_Photo(_Media_Data, _Claim_Id, _Context) {
    try {
        const _Response = await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.PHOTO_PROCESSOR_FUNCTION || 'bimasathi-photo-processor',
            Payload: Buffer.from(JSON.stringify({ mediaData: _Media_Data, claimId: _Claim_Id, context: _Context })),
        }));
        const _Result = JSON.parse(new TextDecoder().decode(_Response.Payload));
        return typeof _Result.body === 'string' ? JSON.parse(_Result.body) : _Result;
    } catch (_Error) {
        console.error('Photo processor invocation failed:', _Error);
        return { approved: false, fail_reason: 'Photo processing is unavailable right now.' };
    }
}

async function _Invoke_Claim_Generator(_Claim_Id, _Claim_Data) {
    try {
        await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.CLAIM_GENERATOR_FUNCTION || 'bimasathi-claim-generator',
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify({ claimId: _Claim_Id, claimData: _Claim_Data })),
        }));
        return true;
    } catch (_Error) {
        console.error('Claim generator invocation failed:', _Error);
        return false;
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
    } catch (_Error) {
        console.error('Appeal generator invocation failed:', _Error);
        return null;
    }
}

async function _Invoke_Document(_Media_Data, _Claim_Id, _User_Id, _Language, _Claim) {
    try {
        const _Response = await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.DOCUMENT_INTAKE_FUNCTION || 'bimasathi-document-intake',
            Payload: Buffer.from(JSON.stringify({
                claimId: _Claim_Id,
                userId: _User_Id,
                mediaData: _Media_Data,
                language: _Language,
                context: {
                    documentCount: _Claim.documentCount || 0,
                    documentIndex: (_Claim.documentCount || 0) + 1,
                },
            })),
        }));
        const _Result = JSON.parse(new TextDecoder().decode(_Response.Payload));
        return typeof _Result.body === 'string' ? JSON.parse(_Result.body) : _Result;
    } catch (_Error) {
        console.error('Document intake invocation failed:', _Error);
        return { success: false, reason: 'Document processing is unavailable right now.' };
    }
}

async function _Invoke_Schema_Extractor(_Claim_Id, _User_Id, _Document_Data) {
    try {
        await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.FORM_SCHEMA_EXTRACTOR_FUNCTION || 'bimasathi-form-schema-extractor',
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify({ claimId: _Claim_Id, userId: _User_Id, documentData: _Document_Data })),
        }));
    } catch (_Error) {
        console.error('Form schema extractor invocation failed:', _Error);
    }
}

async function _Invoke_Auto_Fill(_Claim_Id, _User_Id) {
    try {
        await _Lambda_Client.send(new InvokeCommand({
            FunctionName: process.env.AUTO_FILL_FUNCTION || 'bimasathi-auto-fill',
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify({ claimId: _Claim_Id, userId: _User_Id })),
        }));
    } catch (_Error) {
        console.error('Auto-fill invocation failed:', _Error);
    }
}

module.exports = {
    handler: exports.handler,
    _State_Handlers,
    _Normalize_State,
    _Finalize_Session,
};
