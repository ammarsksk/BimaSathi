const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
    DynamoDBDocumentClient,
    DeleteCommand,
    GetCommand,
    PutCommand,
    ScanCommand,
    UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { RekognitionClient, DetectLabelsCommand, DetectModerationLabelsCommand } = require('@aws-sdk/client-rekognition');

const _DB = require('../../shared/dynamodb');
const _S3 = require('../../shared/s3');
const _Textract = require('../../shared/textract');
const _Identity = require('../../shared/identity');
const _Bedrock = require('../../shared/bedrock');
const _Twilio = require('../../shared/twilio');
const _WhatsApp = require('../../shared/whatsapp');
const { _Build_Template_Schema, _Build_Template_Field_State, _Template_Choices } = require('../../shared/template-schema');
const { _Get_Template } = require('../../shared/insurance-templates');
const { _Render_Insurer_Form } = require('../../shared/pdf-template-renderer');
const { _Generate_Claim_Pack } = require('../claim-generator/index');
const { _Generate_Appeal } = require('../appeal-generator/index');
const {
    _Table_Names,
    _Conversation_States: _States,
    _Generate_Claim_Id,
    _Calculate_Deadline,
    _Claim_Status,
    _Document_Types,
    _Field_Status,
    _User_Roles,
} = require('../../shared/constants');

const _DDB = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' }), {
    marshallOptions: { removeUndefinedValues: true },
});
const _Rekognition = new RekognitionClient({ region: process.env.AWS_REGION || 'ap-south-1' });

const _JSON_HEADERS = Object.freeze({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Operator-Phone,X-Operator-Name,X-Operator-Role',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Content-Type': 'application/json',
});

exports.handler = async (_Event) => {
    try {
        if ((_Event.httpMethod || '').toUpperCase() === 'OPTIONS') {
            return _Respond(200, { ok: true });
        }

        const _Path = _Normalize_Path(_Event.path || _Event.rawPath || '/');
        const _Method = (_Event.httpMethod || _Event.requestContext?.http?.method || 'GET').toUpperCase();
        const _Body = _Parse_Body(_Event.body);
        const _Operator = _Resolve_Operator(_Event);

        if (!_Operator.authorized) {
            return _Respond(401, { error: _Operator.error || 'Missing Authorization header' });
        }

        if (_Method === 'GET' && _Path === '/operator/access') {
            return _Respond(200, { access: await _List_Access_Scope(_Operator) });
        }

        if (_Method === 'POST' && _Path === '/operator/access/request') {
            return _Respond(200, await _Request_Farmer_Access(_Operator, _Body));
        }

        if (_Method === 'POST' && _Path === '/operator/access/verify') {
            return _Respond(200, await _Verify_Farmer_Access(_Operator, _Body));
        }

        if (_Method === 'POST' && _Path === '/operator/access/revoke') {
            return _Respond(200, await _Revoke_Farmer_Access(_Operator, _Body));
        }

        if (_Method === 'GET' && _Path === '/operator/farmers') {
            return _Respond(200, { farmers: await _List_Accessible_Farmers(_Operator) });
        }

        const _Farmer_Claims_Match = _Path.match(/^\/operator\/farmers\/([^/]+)\/claims$/);
        if (_Method === 'GET' && _Farmer_Claims_Match) {
            const _Farmer_Phone = decodeURIComponent(_Farmer_Claims_Match[1]);
            return _Respond(200, { claims: await _List_Farmer_Claims(_Operator, _Farmer_Phone) });
        }

        if (_Method === 'GET' && _Path === '/operator/claims') {
            return _Respond(200, await _List_Operator_Claims(_Operator, _Event.queryStringParameters || {}));
        }

        if (_Method === 'POST' && _Path === '/operator/claims') {
            return _Respond(201, await _Create_Operator_Claim(_Operator, _Body));
        }

        const _Claim_Path_Match = _Path.match(/^\/operator\/claims\/([^/]+)$/);
        if (_Method === 'GET' && _Claim_Path_Match) {
            return _Respond(200, await _Get_Operator_Claim(_Operator, decodeURIComponent(_Claim_Path_Match[1])));
        }
        if (_Method === 'DELETE' && _Claim_Path_Match) {
            return _Respond(200, await _Delete_Operator_Claim(_Operator, decodeURIComponent(_Claim_Path_Match[1])));
        }

        const _Claim_Field_Match = _Path.match(/^\/operator\/claims\/([^/]+)\/fields$/);
        if (_Method === 'PATCH' && _Claim_Field_Match) {
            return _Respond(200, await _Patch_Claim_Fields(_Operator, decodeURIComponent(_Claim_Field_Match[1]), _Body));
        }

        const _Claim_Schema_Match = _Path.match(/^\/operator\/claims\/([^/]+)\/schema$/);
        if (_Method === 'PATCH' && _Claim_Schema_Match) {
            return _Respond(200, await _Patch_Schema_Fields(_Operator, decodeURIComponent(_Claim_Schema_Match[1]), _Body));
        }

        const _Claim_Doc_Match = _Path.match(/^\/operator\/claims\/([^/]+)\/documents$/);
        if (_Method === 'POST' && _Claim_Doc_Match) {
            return _Respond(200, await _Upload_Operator_Document(_Operator, decodeURIComponent(_Claim_Doc_Match[1]), _Body));
        }

        const _Claim_Photo_Match = _Path.match(/^\/operator\/claims\/([^/]+)\/photos$/);
        if (_Method === 'POST' && _Claim_Photo_Match) {
            return _Respond(200, await _Upload_Operator_Photo(_Operator, decodeURIComponent(_Claim_Photo_Match[1]), _Body));
        }

        const _Template_Select_Match = _Path.match(/^\/operator\/claims\/([^/]+)\/template\/select$/);
        if (_Method === 'POST' && _Template_Select_Match) {
            return _Respond(200, await _Select_Template(_Operator, decodeURIComponent(_Template_Select_Match[1]), _Body));
        }

        const _Template_Generate_Match = _Path.match(/^\/operator\/claims\/([^/]+)\/template\/generate$/);
        if (_Method === 'POST' && _Template_Generate_Match) {
            return _Respond(200, await _Generate_Template_Form(_Operator, decodeURIComponent(_Template_Generate_Match[1])));
        }

        const _Submit_Match = _Path.match(/^\/operator\/claims\/([^/]+)\/submit$/);
        if (_Method === 'POST' && _Submit_Match) {
            return _Respond(200, await _Submit_Operator_Claim(_Operator, decodeURIComponent(_Submit_Match[1])));
        }

        const _Appeal_Match = _Path.match(/^\/operator\/claims\/([^/]+)\/appeal$/);
        if (_Method === 'POST' && _Appeal_Match) {
            return _Respond(200, await _Generate_Operator_Appeal(_Operator, decodeURIComponent(_Appeal_Match[1]), _Body));
        }

        if (_Method === 'GET' && _Path === '/claims') {
            return _Respond(200, await _List_Operator_Claims(_Operator, _Event.queryStringParameters || {}));
        }

        const _Legacy_Get_Match = _Path.match(/^\/claims\/([^/]+)$/);
        if (_Method === 'GET' && _Legacy_Get_Match) {
            return _Respond(200, await _Get_Legacy_Claim_Detail(_Operator, decodeURIComponent(_Legacy_Get_Match[1])));
        }

        const _Legacy_Submit_Match = _Path.match(/^\/claims\/([^/]+)\/submit$/);
        if (_Method === 'POST' && _Legacy_Submit_Match) {
            return _Respond(200, await _Submit_Operator_Claim(_Operator, decodeURIComponent(_Legacy_Submit_Match[1])));
        }

        if (_Method === 'GET' && _Path === '/analytics') {
            return _Respond(200, await _Get_Operator_Analytics(_Operator));
        }

        if (_Method === 'GET' && _Path === '/farmers') {
            return _Respond(200, { farmers: await _List_Accessible_Farmers(_Operator) });
        }

        if (_Method === 'POST' && _Path === '/farmers') {
            return _Respond(201, await _Create_Farmer_Profile(_Operator, _Body));
        }

        return _Respond(404, { error: 'Route not found', path: _Path, method: _Method });
    } catch (_Error) {
        console.error('Operator API error:', _Error);
        return _Respond(_Error.statusCode || 500, {
            error: _Error.publicMessage || _Error.message || 'Operator API failed',
        });
    }
};

function _Respond(_Status_Code, _Body) {
    return {
        statusCode: _Status_Code,
        headers: _JSON_HEADERS,
        body: JSON.stringify(_Body),
    };
}

function _Normalize_Path(_Path) {
    return String(_Path || '/').replace(/\/+$/, '') || '/';
}

function _Parse_Body(_Body) {
    if (!_Body) return {};
    if (typeof _Body === 'object') return _Body;
    try {
        return JSON.parse(_Body);
    } catch {
        return {};
    }
}

function _Resolve_Operator(_Event) {
    const _Headers = _Lowercase_Keys(_Event.headers || {});
    const _Token = _Headers.authorization || '';
    if (!_Token) {
        return { authorized: false, error: 'Authorization required' };
    }

    const _Phone = _Normalize_Phone(_Headers['x-operator-phone'] || _Extract_Phone_From_Authorization(_Token));
    return {
        authorized: true,
        token: _Token,
        phoneNumber: _Phone || 'operator-session',
        name: _Headers['x-operator-name'] || 'Operator',
        role: _Headers['x-operator-role'] || _User_Roles.OPERATOR,
        actor: _Phone || 'operator-session',
    };
}

function _Lowercase_Keys(_Object) {
    const _Out = {};
    for (const [_Key, _Value] of Object.entries(_Object || {})) {
        _Out[String(_Key).toLowerCase()] = _Value;
    }
    return _Out;
}

function _Normalize_Phone(_Phone) {
    if (!_Phone) return '';
    return _Twilio._Format_Phone(String(_Phone));
}

function _Extract_Phone_From_Authorization(_Token) {
    const _Raw = String(_Token || '').replace(/^Bearer\s+/i, '').trim();
    if (!_Raw) return '';

    const _Fallback_Match = _Raw.match(/^bms-\d+-(.+)$/);
    if (_Fallback_Match) {
        return _Normalize_Phone(_Fallback_Match[1]);
    }

    const _Payload = _Decode_Jwt_Payload(_Raw);
    return _Normalize_Phone(
        _Payload?.phone_number
        || _Payload?.username
        || _Payload?.['cognito:username']
        || ''
    );
}

function _Decode_Jwt_Payload(_Token) {
    const _Parts = String(_Token || '').split('.');
    if (_Parts.length < 2) return null;
    const _Segment = _Parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const _Padded = _Segment.padEnd(_Segment.length + ((4 - (_Segment.length % 4)) % 4), '=');
    try {
        return JSON.parse(Buffer.from(_Padded, 'base64').toString('utf8'));
    } catch {
        return null;
    }
}

function _Require(_Condition, _Message, _Status_Code = 400) {
    if (!_Condition) {
        const _Error = new Error(_Message);
        _Error.statusCode = _Status_Code;
        _Error.publicMessage = _Message;
        throw _Error;
    }
}

async function _Ensure_Operator_User(_Operator) {
    let _User = await _DB._Get_User(_Operator.phoneNumber);
    if (!_User) {
        _User = await _DB._Create_User({
            phoneNumber: _Operator.phoneNumber,
            name: _Operator.name,
            role: _User_Roles.OPERATOR,
            language: 'en',
        });
    } else if (_User.role !== _User_Roles.OPERATOR || (_Operator.name && _User.name !== _Operator.name)) {
        await _DB._Update_User(_Operator.phoneNumber, {
            role: _User_Roles.OPERATOR,
            name: _Operator.name || _User.name || 'Operator',
        });
        _User = await _DB._Get_User(_Operator.phoneNumber);
    }
    return _User;
}

async function _Ensure_Farmer_User(_Body = {}) {
    const _Phone = _Normalize_Phone(_Body.phoneNumber || _Body.farmerPhone || _Body.phone);
    _Require(_Phone, 'farmerPhone is required');
    let _User = await _DB._Get_User(_Phone);
    if (!_User) {
        _User = await _DB._Create_User({
            phoneNumber: _Phone,
            name: _Body.farmerName || _Body.name || null,
            village: _Body.village || null,
            district: _Body.district || null,
            state: _Body.state || null,
            language: _Body.language || 'hi',
            role: _User_Roles.FARMER,
        });
    } else if (_User.role !== _User_Roles.FARMER || (_Body.farmerName && _User.name !== _Body.farmerName)) {
        await _DB._Update_User(_Phone, {
            role: _User_Roles.FARMER,
            name: _Body.farmerName || _Body.name || _User.name,
            village: _Body.village || _User.village,
            district: _Body.district || _User.district,
            state: _Body.state || _User.state,
            language: _Body.language || _User.language || 'hi',
        });
        _User = await _DB._Get_User(_Phone);
    }
    return _User;
}

async function _Get_Consent_Record(_Farmer_Id, _Helper_Id) {
    const _Result = await _DDB.send(new GetCommand({
        TableName: _Table_Names.CONSENT,
        Key: { farmerId: _Farmer_Id, helperId: _Helper_Id },
    }));
    return _Result.Item || null;
}

async function _Put_Consent_Record(_Item) {
    await _DDB.send(new PutCommand({
        TableName: _Table_Names.CONSENT,
        Item: _Item,
    }));
}

async function _Delete_Consent_Record(_Farmer_Id, _Helper_Id) {
    await _DDB.send(new DeleteCommand({
        TableName: _Table_Names.CONSENT,
        Key: { farmerId: _Farmer_Id, helperId: _Helper_Id },
    }));
}

async function _Update_Consent_Record(_Farmer_Id, _Helper_Id, _Updates) {
    const _Names = {};
    const _Values = {};
    const _Parts = [];
    for (const [_Key, _Value] of Object.entries(_Updates)) {
        _Names[`#${_Key}`] = _Key;
        _Values[`:${_Key}`] = _Value;
        _Parts.push(`#${_Key} = :${_Key}`);
    }
    await _DDB.send(new UpdateCommand({
        TableName: _Table_Names.CONSENT,
        Key: { farmerId: _Farmer_Id, helperId: _Helper_Id },
        UpdateExpression: `SET ${_Parts.join(', ')}`,
        ExpressionAttributeNames: _Names,
        ExpressionAttributeValues: _Values,
    }));
}

async function _Scan_Operator_Consent(..._Helper_Ids) {
    const _Aliases = [...new Set(_Helper_Ids.flat().filter(Boolean))];
    if (!_Aliases.length) return [];

    const _Expression_Values = {};
    const _Filter_Parts = _Aliases.map((_Alias, _Index) => {
        _Expression_Values[`:helper${_Index}`] = _Alias;
        return `helperId = :helper${_Index}`;
    });

    const _Result = await _DDB.send(new ScanCommand({
        TableName: _Table_Names.CONSENT,
        FilterExpression: _Filter_Parts.join(' OR '),
        ExpressionAttributeValues: _Expression_Values,
    }));
    return _Result.Items || [];
}

function _Consent_Is_Valid(_Consent) {
    if (!_Consent) return false;
    if (_Consent.status && _Consent.status !== 'verified') return false;
    if (!_Consent.status && !_Consent.verifiedAt) return false;
    if (!_Consent.expiresAt) return false;
    return new Date(_Consent.expiresAt) > new Date();
}

function _Has_Usable_Farmer_Access(_Resolved, _Consent) {
    const _Farmer_Phone = _Normalize_Phone(_Resolved?.farmerPhone || _Consent?.farmerId);
    return Boolean(_Resolved?.farmer && _Farmer_Phone);
}

function _Can_Discard_Claim(_Claim) {
    const _Status = _Claim?.status || _Claim_Status.DRAFT;
    return _Status === _Claim_Status.DRAFT || _Status === _Claim_Status.EVIDENCE_PENDING;
}

function _Can_Edit_Claim(_Claim) {
    const _Status = _Claim?.status || _Claim_Status.DRAFT;
    return [
        _Claim_Status.DRAFT,
        _Claim_Status.EVIDENCE_PENDING,
        _Claim_Status.LATE_RISK,
        'Ready for Submission',
    ].includes(_Status);
}

function _Require_Editable_Claim(_Claim, _Action_Text = 'edit this claim') {
    _Require(_Can_Edit_Claim(_Claim), `Claim ${_Claim?.claimId || ''} is read-only after submission and cannot be changed.`, 409);
}

async function _Get_User_By_User_Id(_User_Id) {
    if (!_User_Id) return null;
    const _Result = await _DDB.send(new ScanCommand({
        TableName: _Table_Names.USERS,
        FilterExpression: 'userId = :userId',
        ExpressionAttributeValues: { ':userId': _User_Id },
        Limit: 1,
    }));
    return _Result.Items?.[0] || null;
}

async function _Resolve_Farmer_Target(_Claim_Or_Farmer) {
    if (typeof _Claim_Or_Farmer === 'string') {
        const _Farmer_Phone = _Normalize_Phone(_Claim_Or_Farmer);
        const _Farmer = _Farmer_Phone ? await _DB._Get_User(_Farmer_Phone) : null;
        return {
            farmer: _Farmer,
            farmerPhone: _Normalize_Phone(_Farmer?.phoneNumber || _Farmer_Phone),
        };
    }

    const _Anchor_Phone = _Normalize_Phone(
        _Claim_Or_Farmer?.consentPhoneNumber
        || _Claim_Or_Farmer?.ownerPhoneNumber
        || _Claim_Or_Farmer?.draftContext?.farmerPhone
        || _Claim_Or_Farmer?.farmerPhone
    );
    const _Farmer_By_User_Id = _Claim_Or_Farmer?.userId
        ? await _Get_User_By_User_Id(_Claim_Or_Farmer.userId)
        : null;
    const _Display_Phone = _Normalize_Phone(_Claim_Or_Farmer?.phoneNumber || _Claim_Or_Farmer?.farmerPhone);
    const _Candidate_Phone = _Anchor_Phone || _Display_Phone;
    const _Farmer_By_Phone = !_Farmer_By_User_Id && _Candidate_Phone
        ? await _DB._Get_User(_Candidate_Phone)
        : null;
    const _Farmer = _Farmer_By_User_Id || _Farmer_By_Phone || null;

    return {
        farmer: _Farmer,
        farmerPhone: _Normalize_Phone(_Farmer?.phoneNumber || _Candidate_Phone),
    };
}

async function _Hydrate_Consent_Record(_Consent) {
    const _Farmer_Phone = _Normalize_Phone(_Consent?.farmerId);
    const _Farmer_By_Phone = _Farmer_Phone ? await _DB._Get_User(_Farmer_Phone) : null;
    const _Farmer_By_User_Id = !_Farmer_By_Phone && _Consent?.farmerId ? await _Get_User_By_User_Id(_Consent.farmerId) : null;
    const _Farmer = _Farmer_By_Phone || _Farmer_By_User_Id || null;

    const _Helper_Phone = _Normalize_Phone(_Consent?.helperId);
    const _Helper_By_Phone = _Helper_Phone ? await _DB._Get_User(_Helper_Phone) : null;
    const _Helper_By_User_Id = !_Helper_By_Phone && _Consent?.helperId ? await _Get_User_By_User_Id(_Consent.helperId) : null;
    const _Helper = _Helper_By_Phone || _Helper_By_User_Id || null;

    return {
        farmer: _Farmer,
        farmerPhone: _Normalize_Phone(_Farmer?.phoneNumber || _Consent?.farmerId),
        helper: _Helper,
        helperPhone: _Normalize_Phone(_Helper?.phoneNumber || _Consent?.helperId),
    };
}

async function _Find_Consent_Record(_Farmer_Phone, _Operator) {
    const _Operator_User = await _Ensure_Operator_User(_Operator);
    const _Farmer = await _DB._Get_User(_Farmer_Phone);
    const _Candidate_Pairs = [
        [_Farmer_Phone, _Operator.phoneNumber],
        [_Farmer_Phone, _Operator_User?.userId],
        [_Farmer?.userId, _Operator.phoneNumber],
        [_Farmer?.userId, _Operator_User?.userId],
    ].filter(([_Farmer_Id, _Helper_Id]) => _Farmer_Id && _Helper_Id);
    let _Last_Seen = null;

    for (const [_Farmer_Id, _Helper_Id] of _Candidate_Pairs) {
        const _Consent = await _Get_Consent_Record(_Farmer_Id, _Helper_Id);
        if (!_Consent) continue;
        _Last_Seen = _Consent;

        if (!_Consent_Is_Valid(_Consent)) {
            continue;
        }

        if (_Farmer_Id !== _Farmer_Phone || _Helper_Id !== _Operator.phoneNumber) {
            await _Put_Consent_Record({
                ..._Consent,
                farmerId: _Farmer_Phone,
                helperId: _Operator.phoneNumber,
                operatorUserId: _Operator_User?.userId || _Consent.operatorUserId || null,
                farmerName: _Consent.farmerName || _Farmer?.name || null,
                status: _Consent.status || 'verified',
                verifiedAt: _Consent.verifiedAt || new Date().toISOString(),
            });
        }

        return _Consent;
    }

    return _Last_Seen;
}

async function _Require_Farmer_Access(_Operator, _Claim_Or_Farmer) {
    const { farmerPhone: _Farmer_Phone } = await _Resolve_Farmer_Target(_Claim_Or_Farmer);
    _Require(_Farmer_Phone, 'Farmer phone is required', 400);
    const _Consent = await _Find_Consent_Record(_Farmer_Phone, _Operator);
    _Require(_Consent_Is_Valid(_Consent), 'Farmer consent is required', 403);
    return _Consent;
}

async function _List_Access_Scope(_Operator) {
    const _Operator_User = await _Ensure_Operator_User(_Operator);
    const _Consents = await _Scan_Operator_Consent(_Operator.phoneNumber, _Operator_User?.userId);
    const _Items = await Promise.all(_Consents.map(async (_Consent) => {
        const _Resolved = await _Hydrate_Consent_Record(_Consent);
        if (!_Has_Usable_Farmer_Access(_Resolved, _Consent)) {
            return null;
        }
        const _Farmer = _Resolved.farmer;
        const _Claims = _Farmer?.userId ? await _DB._Get_Claims_By_User(_Farmer.userId) : [];
        return {
            farmerPhone: _Resolved.farmerPhone || _Normalize_Phone(_Consent.farmerId),
            farmerName: _Consent.farmerName || _Farmer?.name || null,
            farmerVillage: _Farmer?.village || null,
            farmerDistrict: _Farmer?.district || null,
            farmerState: _Farmer?.state || null,
            status: _Consent.status || (_Consent.verifiedAt ? 'verified' : 'pending'),
            requestedAt: _Consent.requestedAt || null,
            verifiedAt: _Consent.verifiedAt || null,
            expiresAt: _Consent.expiresAt || null,
            claimCount: _Claims.length,
            lastClaimUpdated: _Claims.sort((_A, _B) => String(_B.lastUpdated || '').localeCompare(String(_A.lastUpdated || '')))[0]?.lastUpdated || null,
        };
    }));
    const _Deduped = Array.from(
        _Items
            .filter((_Item) => _Item?.farmerPhone && _Item.status !== 'revoked')
            .reduce((_Map, _Item) => {
                const _Current = _Map.get(_Item.farmerPhone);
                if (!_Current) {
                    _Map.set(_Item.farmerPhone, _Item);
                    return _Map;
                }

                const _Current_Score = `${_Current.status === 'verified' ? '1' : '0'}${_Current.verifiedAt || _Current.requestedAt || ''}`;
                const _Next_Score = `${_Item.status === 'verified' ? '1' : '0'}${_Item.verifiedAt || _Item.requestedAt || ''}`;
                if (_Next_Score > _Current_Score) {
                    _Map.set(_Item.farmerPhone, _Item);
                }
                return _Map;
            }, new Map())
            .values()
    );
    return _Deduped.sort((_A, _B) => String(_B.verifiedAt || _B.requestedAt || '').localeCompare(String(_A.verifiedAt || _A.requestedAt || '')));
}

async function _Request_Farmer_Access(_Operator, _Body) {
    const _Operator_User = await _Ensure_Operator_User(_Operator);
    const _Farmer_User = await _Ensure_Farmer_User(_Body);
    const _Existing = await _Get_Consent_Record(_Farmer_User.phoneNumber, _Operator.phoneNumber);

    const _Now = new Date();
    const _Otp_Deadline = new Date(_Now.getTime() + 10 * 60 * 1000).toISOString();
    const _Access_Expires = new Date(_Now.getTime() + 12 * 60 * 60 * 1000).toISOString();

    const _Otp_Send = await _Twilio._Send_OTP(_Farmer_User.phoneNumber);
    try {
        await _WhatsApp._Send_Text_Message(
            `whatsapp:${_Farmer_User.phoneNumber}`,
            `BimaSathi operator ${_Operator.name} wants to help file your claim. Share the OTP sent to your phone only if you approve operator access.`
        );
    } catch (_Error) {
        console.error('Farmer WhatsApp consent notice failed:', _Error.message);
    }

    const _Record = {
        farmerId: _Farmer_User.phoneNumber,
        helperId: _Operator.phoneNumber,
        operatorName: _Operator.name,
        operatorUserId: _Operator_User.userId,
        farmerName: _Farmer_User.name || _Body.farmerName || null,
        status: _Otp_Send.success ? 'otp_sent' : 'pending_farmer_confirmation',
        requestedAt: _Now.toISOString(),
        otpSentAt: _Otp_Send.success ? _Now.toISOString() : null,
        otpChannel: _Otp_Send.channel || null,
        otpError: _Otp_Send.success ? null : (_Otp_Send.error || null),
        verificationDeadline: _Otp_Deadline,
        expiresAt: _Access_Expires,
        via: 'operator_dashboard',
    };

    await _Put_Consent_Record({ ...(_Existing || {}), ..._Record });
    await _DB._Log_Audit({
        claimId: `CONSENT#${_Farmer_User.phoneNumber}`,
        actor: _Operator.actor,
        action: 'operator_access_requested',
        metadata: {
            operatorPhone: _Operator.phoneNumber,
            farmerPhone: _Farmer_User.phoneNumber,
            otpChannel: _Otp_Send.channel || null,
            otpSuccess: _Otp_Send.success,
        },
    });

    return {
        success: true,
        consent: {
            farmerPhone: _Farmer_User.phoneNumber,
            farmerName: _Farmer_User.name || null,
            status: _Record.status,
            requestedAt: _Record.requestedAt,
            expiresAt: _Record.expiresAt,
            otpChannel: _Record.otpChannel,
            otpError: _Record.otpError,
        },
    };
}

async function _Verify_Farmer_Access(_Operator, _Body) {
    const _Farmer_Phone = _Normalize_Phone(_Body.farmerPhone || _Body.phoneNumber);
    const _Code = String(_Body.code || '').trim();
    _Require(_Farmer_Phone, 'farmerPhone is required');
    _Require(_Code, 'OTP code is required');

    const _Consent = await _Get_Consent_Record(_Farmer_Phone, _Operator.phoneNumber);
    _Require(_Consent, 'No pending consent request found', 404);

    const _Verified = await _Twilio._Verify_OTP(_Farmer_Phone, _Code);
    _Require(_Verified, 'Invalid or expired OTP', 401);

    const _Now = new Date();
    await _Update_Consent_Record(_Farmer_Phone, _Operator.phoneNumber, {
        status: 'verified',
        verifiedAt: _Now.toISOString(),
        expiresAt: new Date(_Now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        otpError: null,
    });

    await _DB._Log_Audit({
        claimId: `CONSENT#${_Farmer_Phone}`,
        actor: _Operator.actor,
        action: 'operator_access_verified',
        metadata: { operatorPhone: _Operator.phoneNumber, farmerPhone: _Farmer_Phone },
    });

    return {
        success: true,
        consent: await _Get_Consent_Record(_Farmer_Phone, _Operator.phoneNumber),
    };
}

async function _Revoke_Farmer_Access(_Operator, _Body) {
    const _Farmer_Phone = _Normalize_Phone(_Body.farmerPhone || _Body.phoneNumber);
    _Require(_Farmer_Phone, 'farmerPhone is required');
    const _Operator_User = await _Ensure_Operator_User(_Operator);
    const _Farmer = await _DB._Get_User(_Farmer_Phone);
    const _Consent_Keys = Array.from(new Map(
        [
            [_Farmer_Phone, _Operator.phoneNumber],
            [_Farmer_Phone, _Operator_User?.userId],
            [_Farmer?.userId, _Operator.phoneNumber],
            [_Farmer?.userId, _Operator_User?.userId],
        ]
            .filter(([_Farmer_Id, _Helper_Id]) => _Farmer_Id && _Helper_Id)
            .map(([_Farmer_Id, _Helper_Id]) => [`${_Farmer_Id}::${_Helper_Id}`, [_Farmer_Id, _Helper_Id]])
    ).values());

    await Promise.all(_Consent_Keys.map(([_Farmer_Id, _Helper_Id]) => (
        _Delete_Consent_Record(_Farmer_Id, _Helper_Id).catch(() => null)
    )));

    await _DB._Log_Audit({
        claimId: `CONSENT#${_Farmer_Phone}`,
        actor: _Operator.actor,
        action: 'operator_access_revoked',
        metadata: { operatorPhone: _Operator.phoneNumber, farmerPhone: _Farmer_Phone },
    });
    return { success: true, removed: true };
}

async function _List_Accessible_Farmers(_Operator) {
    const _Access = await _List_Access_Scope(_Operator);
    return _Access.filter((_Item) => _Item.status === 'verified');
}

async function _List_Farmer_Claims(_Operator, _Farmer_Phone) {
    const _Farmer = await _DB._Get_User(_Normalize_Phone(_Farmer_Phone));
    _Require(_Farmer, 'Farmer not found', 404);
    await _Require_Farmer_Access(_Operator, _Farmer.phoneNumber);
    const _Claims = await _DB._Get_Claims_By_User(_Farmer.userId);
    return _Claims
        .map(_To_Claim_Summary)
        .sort((_A, _B) => String(_B.lastUpdated || '').localeCompare(String(_A.lastUpdated || '')));
}

async function _List_Operator_Claims(_Operator, _Filters = {}) {
    const _Access = await _List_Accessible_Farmers(_Operator);
    const _Allowed_Phones = new Set(_Access.map((_Item) => _Normalize_Phone(_Item.farmerPhone)));
    const _Claims = await _DB._Get_All_Claims({
        status: _Filters.status || null,
        village: _Filters.village || null,
        cropType: _Filters.cropType || null,
    }, Number(_Filters.limit || 200));

    const _Resolved_Claims = await Promise.all(_Claims.map(async (_Claim) => {
        const { farmerPhone: _Farmer_Phone } = await _Resolve_Farmer_Target(_Claim);
        return {
            claim: _Claim,
            farmerPhone: _Farmer_Phone,
        };
    }));

    const _Filtered = _Resolved_Claims
        .filter(({ farmerPhone }) => _Allowed_Phones.has(_Normalize_Phone(farmerPhone)))
        .map(({ claim }) => claim)
        .filter((_Claim) => !_Filters.search || _Matches_Search(_Claim, _Filters.search))
        .sort((_A, _B) => String(_B.lastUpdated || '').localeCompare(String(_A.lastUpdated || '')));

    return {
        claims: _Filtered.map(_To_Claim_Summary),
        total: _Filtered.length,
    };
}

function _Matches_Search(_Claim, _Search) {
    const _Value = String(_Search || '').toLowerCase();
    return [
        _Claim.claimId,
        _Claim.farmerName,
        _Claim.phoneNumber,
        _Claim.village,
        _Claim.cropType,
    ].some((_Field) => String(_Field || '').toLowerCase().includes(_Value));
}

async function _Create_Operator_Claim(_Operator, _Body) {
    const _Farmer = await _Ensure_Farmer_User({
        phoneNumber: _Body.farmerPhone,
        farmerName: _Body.farmerName,
        village: _Body.village,
        district: _Body.district,
        state: _Body.state,
        language: _Body.language || 'hi',
    });
    await _Require_Farmer_Access(_Operator, _Farmer.phoneNumber);

    const _Claim_Id = _Generate_Claim_Id();
    const _Loss_Date = _Body.lossDate || new Date().toISOString().slice(0, 10);
    const _Claim = await _DB._Create_Claim({
        claimId: _Claim_Id,
        userId: _Farmer.userId,
        phoneNumber: _Farmer.phoneNumber,
        consentPhoneNumber: _Farmer.phoneNumber,
        farmerName: _Body.farmerName || _Farmer.name,
        village: _Body.village || _Farmer.village,
        district: _Body.district || _Farmer.district,
        state: _Body.state || _Farmer.state,
        cropType: _Body.cropType || null,
        season: _Body.season || null,
        lossDate: _Body.lossDate || null,
        cause: _Body.cause || null,
        areaHectares: _Body.areaHectares || null,
        policyType: _Body.policyType || null,
        bankLast4: _Body.bankLast4 || null,
        deadline: _Calculate_Deadline(_Loss_Date).toISOString(),
        draftState: _States.CLAIM_HUB,
        draftContext: { createdByOperator: _Operator.phoneNumber },
    });

    if (_Body.selectedTemplateId) {
        const _Schema = _Build_Template_Schema(_Body.selectedTemplateId, _Claim);
        await _DB._Update_Claim(_Claim_Id, _Farmer.userId, { selectedTemplateId: _Body.selectedTemplateId, formSchema: _Schema });
    }

    await _DB._Log_Audit({
        claimId: _Claim_Id,
        actor: _Operator.actor,
        action: 'operator_claim_created',
        metadata: { farmerPhone: _Farmer.phoneNumber },
    });

    return await _Get_Operator_Claim(_Operator, _Claim_Id);
}

async function _Load_Claim_For_Operator(_Operator, _Claim_Id) {
    const _Claim = await _DB._Get_Claim_By_Id(_Claim_Id);
    _Require(_Claim, 'Claim not found', 404);
    await _Require_Farmer_Access(_Operator, _Claim);
    if (!_Claim.consentPhoneNumber) {
        const { farmerPhone: _Farmer_Phone } = await _Resolve_Farmer_Target(_Claim);
        if (_Farmer_Phone) {
            await _DB._Update_Claim(_Claim_Id, _Claim.userId, { consentPhoneNumber: _Farmer_Phone }).catch(() => null);
            return { ..._Claim, consentPhoneNumber: _Farmer_Phone };
        }
    }
    return _Claim;
}

async function _Get_Operator_Claim(_Operator, _Claim_Id) {
    const _Claim = await _Load_Claim_For_Operator(_Operator, _Claim_Id);
    return await _Build_Claim_Detail(_Claim);
}

async function _Delete_Operator_Claim(_Operator, _Claim_Id) {
    const _Claim = await _Load_Claim_For_Operator(_Operator, _Claim_Id);
    _Require(_Can_Discard_Claim(_Claim), 'Only draft claims can be discarded', 409);
    await _DB._Delete_Claim(_Claim_Id, _Claim.userId);
    await _DB._Log_Audit({
        claimId: _Claim_Id,
        actor: _Operator.actor,
        action: 'operator_claim_discarded',
        metadata: { farmerPhone: _Claim.phoneNumber, status: _Claim.status },
    });
    return {
        success: true,
        claimId: _Claim_Id,
        deleted: true,
    };
}

async function _Get_Legacy_Claim_Detail(_Operator, _Claim_Id) {
    const _Detail = await _Get_Operator_Claim(_Operator, _Claim_Id);
    return {
        claim: _Detail.claim,
        farmer: _Detail.farmer,
        evidence: {
            photos: _Detail.photos,
            documents: _Detail.documents,
        },
        auditLog: _Detail.auditLog,
        pendingFields: _Detail.pendingFields,
        identityVerification: _Detail.identityVerification,
    };
}

async function _Patch_Claim_Fields(_Operator, _Claim_Id, _Body) {
    const _Claim = await _Load_Claim_For_Operator(_Operator, _Claim_Id);
    _Require_Editable_Claim(_Claim, 'edit this claim');
    const _Fields = _Body.fields || _Body;
    _Require(typeof _Fields === 'object' && !Array.isArray(_Fields), 'fields object is required');

    const _Updates = _Normalize_Claim_Field_Updates(_Fields);
    const _Changed_Keys = Object.keys(_Updates);
    _Require(_Changed_Keys.length > 0, 'No supported fields supplied');
    const _Target = await _Resolve_Farmer_Target(_Claim);

    if (
        _Changed_Keys.includes('farmerName')
        && _Identity._Normalize_Name(_Updates.farmerName) !== _Identity._Normalize_Name(_Claim.farmerName)
    ) {
        _Updates.identityVerification = _Identity._Reset_Identity_Verification(_Updates.farmerName);
    }
    if (_Changed_Keys.includes('phoneNumber') && !_Claim.consentPhoneNumber && _Target.farmerPhone) {
        _Updates.consentPhoneNumber = _Target.farmerPhone;
    }

    await _DB._Update_Claim(_Claim_Id, _Claim.userId, _Updates);
    await _Sync_Farmer_Profile_From_Claim(_Claim, _Updates);

    const _Updated = { ..._Claim, ..._Updates };
    await _Refresh_Template_Schema(_Updated);

    if (_Updated.formSchema?.length) {
        await _Apply_Schema_Value_Updates(_Updated, _Updates);
    }

    await _DB._Log_Audit({
        claimId: _Claim_Id,
        actor: _Operator.actor,
        action: 'operator_claim_fields_updated',
        metadata: { fields: _Changed_Keys, voiceAssisted: Boolean(_Body.voiceAssisted) },
    });

    return await _Build_Claim_Detail(await _DB._Get_Claim_By_Id(_Claim_Id));
}

async function _Patch_Schema_Fields(_Operator, _Claim_Id, _Body) {
    const _Claim = await _Load_Claim_For_Operator(_Operator, _Claim_Id);
    _Require_Editable_Claim(_Claim, 'edit this claim');
    const _Fields = _Body.fields || _Body;
    _Require(typeof _Fields === 'object' && !Array.isArray(_Fields), 'fields object is required');
    const _Target = await _Resolve_Farmer_Target(_Claim);

    const _Entries = Object.entries(_Fields).filter(([_Field_Name, _Value]) => (
        typeof _Field_Name === 'string' && _Field_Name.trim() && _Value != null && String(_Value).trim() !== ''
    ));
    _Require(_Entries.length > 0, 'No schema fields supplied');

    for (const [_Field_Name, _Value] of _Entries) {
        await _DB._Update_Field_Status(
            _Claim_Id,
            _Claim.userId,
            _Field_Name,
            _Field_Status.COMPLETED,
            _Value,
            _Body.voiceAssisted ? 'operator_voice' : 'operator_dashboard'
        );
    }

    const _Schema_Updated_Claim = await _DB._Get_Claim_By_Id(_Claim_Id);

    const _Canonical_Updates = _Schema_To_Claim_Field_Updates(_Fields);
    if (
        Object.prototype.hasOwnProperty.call(_Canonical_Updates, 'farmerName')
        && _Identity._Normalize_Name(_Canonical_Updates.farmerName) !== _Identity._Normalize_Name(_Schema_Updated_Claim?.farmerName)
    ) {
        _Canonical_Updates.identityVerification = _Identity._Reset_Identity_Verification(_Canonical_Updates.farmerName);
    }
    if (
        Object.prototype.hasOwnProperty.call(_Canonical_Updates, 'phoneNumber')
        && !_Schema_Updated_Claim?.consentPhoneNumber
        && _Target.farmerPhone
    ) {
        _Canonical_Updates.consentPhoneNumber = _Target.farmerPhone;
    }
    if (Object.keys(_Canonical_Updates).length) {
        await _DB._Update_Claim(_Claim_Id, _Claim.userId, _Canonical_Updates);
        await _Sync_Farmer_Profile_From_Claim(_Schema_Updated_Claim || _Claim, _Canonical_Updates);
        await _Refresh_Template_Schema({ ...(_Schema_Updated_Claim || _Claim), ..._Canonical_Updates });
    }

    await _DB._Log_Audit({
        claimId: _Claim_Id,
        actor: _Operator.actor,
        action: 'operator_schema_fields_updated',
        metadata: {
            fields: _Entries.map(([_Field_Name]) => _Field_Name),
            voiceAssisted: Boolean(_Body.voiceAssisted),
        },
    });

    return await _Build_Claim_Detail(await _DB._Get_Claim_By_Id(_Claim_Id));
}

function _Normalize_Claim_Field_Updates(_Fields) {
    const _Map = {
        farmerName: 'farmerName',
        farmer_name: 'farmerName',
        village: 'village',
        district: 'district',
        state: 'state',
        address: 'address',
        gender: 'gender',
        socialCategory: 'socialCategory',
        social_category: 'socialCategory',
        phoneNumber: 'phoneNumber',
        cropType: 'cropType',
        crop_type: 'cropType',
        season: 'season',
        cause: 'cause',
        areaHectares: 'areaHectares',
        area_hectares: 'areaHectares',
        policyType: 'policyType',
        policy_type: 'policyType',
        lossDate: 'lossDate',
        loss_date: 'lossDate',
        exactLocation: 'exactLocation',
        exact_location: 'exactLocation',
        gpsCoords: 'gpsCoords',
        gps_coords: 'gpsCoords',
        bankLast4: 'bankLast4',
        bank_last_4: 'bankLast4',
        loaneeStatus: 'loaneeStatus',
        loanee_status: 'loaneeStatus',
        accountType: 'accountType',
        account_type: 'accountType',
        hasCropLoanOrKcc: 'hasCropLoanOrKcc',
        has_crop_loan_or_kcc: 'hasCropLoanOrKcc',
        aadhaarNumber: 'aadhaarNumber',
        aadhaar_number: 'aadhaarNumber',
        bankAccountNumber: 'bankAccountNumber',
        bank_account_number: 'bankAccountNumber',
        bankName: 'bankName',
        bank_name: 'bankName',
        bankBranchLocation: 'bankBranchLocation',
        bank_branch_location: 'bankBranchLocation',
        ifscCode: 'ifscCode',
        ifsc_code: 'ifscCode',
        micrCode: 'micrCode',
        micr_code: 'micrCode',
        tehsil: 'tehsil',
        pinCode: 'pinCode',
        pin_code: 'pinCode',
        notifiedAreaName: 'notifiedAreaName',
        notified_area_name: 'notifiedAreaName',
        sumInsuredRupees: 'sumInsuredRupees',
        premiumPaidRupees: 'premiumPaidRupees',
        pepDeclaration: 'pepDeclaration',
        proposedHarvestDate: 'proposedHarvestDate',
        harvestingDate: 'harvestingDate',
        cropStage: 'cropStage',
    };

    const _Updates = {};
    for (const [_Key, _Value] of Object.entries(_Fields || {})) {
        const _Target = _Map[_Key];
        if (!_Target) continue;
        _Updates[_Target] = _Value;
    }
    return _Updates;
}

function _Schema_To_Claim_Field_Updates(_Fields) {
    const _Map = {
        farmer_name: 'farmerName',
        mobile_number: 'phoneNumber',
        mailing_address: 'address',
        mailing_village: 'village',
        mailing_tehsil: 'tehsil',
        mailing_district: 'district',
        mailing_state: 'state',
        mailing_pin_code: 'pinCode',
        land_address: 'landAddress',
        land_village: 'landVillage',
        land_tehsil: 'landTehsil',
        land_district: 'landDistrict',
        land_state: 'landState',
        land_pin_code: 'landPinCode',
        email: 'email',
        crop_name: 'cropType',
        crop_season_year: 'cropSeasonYear',
        sowing_date: 'sowingDate',
        crop_stage: 'cropStage',
        proposed_harvest_date: 'proposedHarvestDate',
        harvesting_date: 'harvestingDate',
        loss_date: 'lossDate',
        loss_event_summary: 'cause',
        insured_area_hectare: 'areaHectares',
        total_land_hectare: 'totalLandHectares',
        total_land_insured_hectare: 'totalLandInsuredHectares',
        loanee_status: 'loaneeStatus',
        survey_or_khasara_or_udyan_no: 'surveyOrKhasaraOrUdyanNo',
        notified_area_name: 'notifiedAreaName',
        sum_insured_rupees: 'sumInsuredRupees',
        premium_paid_rupees: 'premiumPaidRupees',
        premium_deduction_or_cover_note_date: 'premiumDeductionOrCoverNoteDate',
        pep_declaration: 'pepDeclaration',
        place: 'exactLocation',
        aadhaar_number: 'aadhaarNumber',
        bank_account_number: 'bankAccountNumber',
        bank_name: 'bankName',
        bank_branch_location: 'bankBranchLocation',
        ifsc_code: 'ifscCode',
        micr_code: 'micrCode',
        account_type: 'accountType',
        has_crop_loan_or_kcc: 'hasCropLoanOrKcc',
        gender: 'gender',
        social_category: 'socialCategory',
    };

    const _Updates = {};
    for (const [_Field_Name, _Value] of Object.entries(_Fields || {})) {
        const _Target = _Map[_Field_Name];
        if (!_Target || _Value == null || String(_Value).trim() === '') continue;
        _Updates[_Target] = _Value;
    }
    return _Updates;
}

async function _Refresh_Template_Schema(_Claim) {
    if (!_Claim.selectedTemplateId) return;
    const _Template_State = _Build_Template_Field_State(_Claim.selectedTemplateId, _Claim);
    await _DB._Update_Claim(_Claim.claimId, _Claim.userId, { formSchema: _Template_State.schema });
    _Claim.formSchema = _Template_State.schema;
}

async function _Apply_Schema_Value_Updates(_Claim, _Updates) {
    const _Field_Map = {
        farmerName: 'farmer_name',
        village: 'mailing_village',
        tehsil: 'mailing_tehsil',
        district: 'mailing_district',
        state: 'mailing_state',
        address: 'mailing_address',
        pinCode: 'mailing_pin_code',
        landAddress: 'land_address',
        landVillage: 'land_village',
        landTehsil: 'land_tehsil',
        landDistrict: 'land_district',
        landState: 'land_state',
        landPinCode: 'land_pin_code',
        email: 'email',
        phoneNumber: 'mobile_number',
        cropSeasonYear: 'crop_season_year',
        cropType: 'crop_name',
        sowingDate: 'sowing_date',
        cropStage: 'crop_stage',
        proposedHarvestDate: 'proposed_harvest_date',
        harvestingDate: 'harvesting_date',
        lossDate: 'loss_date',
        cause: 'loss_event_summary',
        areaHectares: 'insured_area_hectare',
        totalLandHectares: 'total_land_hectare',
        totalLandInsuredHectares: 'total_land_insured_hectare',
        loaneeStatus: 'loanee_status',
        surveyOrKhasaraOrUdyanNo: 'survey_or_khasara_or_udyan_no',
        notifiedAreaName: 'notified_area_name',
        sumInsuredRupees: 'sum_insured_rupees',
        premiumPaidRupees: 'premium_paid_rupees',
        premiumDeductionOrCoverNoteDate: 'premium_deduction_or_cover_note_date',
        pepDeclaration: 'pep_declaration',
        aadhaarNumber: 'aadhaar_number',
        bankAccountNumber: 'bank_account_number',
        bankName: 'bank_name',
        bankBranchLocation: 'bank_branch_location',
        ifscCode: 'ifsc_code',
        micrCode: 'micr_code',
        accountType: 'account_type',
        hasCropLoanOrKcc: 'has_crop_loan_or_kcc',
        socialCategory: 'social_category',
        gender: 'gender',
        exactLocation: 'place',
    };

    for (const [_Claim_Key, _Value] of Object.entries(_Updates)) {
        const _Field_Name = _Field_Map[_Claim_Key];
        if (!_Field_Name) continue;
        await _DB._Update_Field_Status(_Claim.claimId, _Claim.userId, _Field_Name, _Field_Status.COMPLETED, _Value, 'operator_dashboard');
    }
}

async function _Sync_Farmer_Profile_From_Claim(_Claim, _Updates) {
    const _Profile_Updates = {};

    if (Object.prototype.hasOwnProperty.call(_Updates, 'farmerName')) {
        _Profile_Updates.name = _Updates.farmerName || null;
    }
    if (Object.prototype.hasOwnProperty.call(_Updates, 'village')) {
        _Profile_Updates.village = _Updates.village || null;
    }
    if (Object.prototype.hasOwnProperty.call(_Updates, 'district')) {
        _Profile_Updates.district = _Updates.district || null;
    }
    if (Object.prototype.hasOwnProperty.call(_Updates, 'state')) {
        _Profile_Updates.state = _Updates.state || null;
    }

    if (!Object.keys(_Profile_Updates).length) return;
    const { farmerPhone: _Farmer_Phone } = await _Resolve_Farmer_Target(_Claim);
    if (!_Farmer_Phone) return;
    await _DB._Update_User(_Farmer_Phone, _Profile_Updates);
}

async function _Upload_Operator_Document(_Operator, _Claim_Id, _Body) {
    const _Claim = await _Load_Claim_For_Operator(_Operator, _Claim_Id);
    _Require_Editable_Claim(_Claim, 'upload documents to this claim');
    const { farmer: _Farmer } = await _Resolve_Farmer_Target(_Claim);
    const _Claimed_Names = _Resolve_Claimed_Farmer_Names(_Claim, _Farmer);
    const _Claimed_Name = _Claimed_Names[0] || null;
    const _Claim_Context = { ..._Claim, farmerName: _Claimed_Name };

    _Require(_Claimed_Name, 'Complete farmer details before uploading identity documents');
    const _File = _Decode_Upload(_Body.file || _Body);
    _Require(_File.buffer?.length, 'Document file is required');

    const _Extracted_Text = await _Textract._Extract_Text(_File.buffer);
    const _Key_Values = await _Textract._Extract_Key_Values(_File.buffer);
    const _Classification = _Extracted_Text.length > 10
        ? await _Textract._Classify_Document(_Extracted_Text)
        : _Document_Types.UNKNOWN;

    const _Identity_Result = _Assess_Operator_Name_Verification({
        claimedNames: _Claimed_Names,
        keyValues: _Key_Values,
        extractedText: _Extracted_Text,
        documentType: _Classification,
        sourceDocumentKey: null,
    });

    const _Accepted = ['verified', 'matched_supporting_document'].includes(_Identity_Result.status);
    if (!_Accepted) {
        await _DB._Log_Audit({
            claimId: _Claim_Id,
            actor: _Operator.actor,
            action: 'operator_document_rejected_preupload',
            metadata: {
                classification: _Classification,
                identityStatus: _Identity_Result.status,
                identityCandidate: _Identity_Result.extractedName || null,
            },
        });
        return {
            success: true,
            accepted: false,
            classification: _Classification,
            identityVerification: _Identity_Result,
            reason: _Build_Document_Rejection_Reason(_Identity_Result, _Claim_Context),
        };
    }

    const _Doc_Index = (_Claim.documentCount || 0) + 1;
    const _Extension = _Infer_Document_Extension(_File.contentType, _File.name);
    const _Filename = `doc_${String(_Doc_Index).padStart(3, '0')}.${_Extension}`;
    const _S3_Key = await _S3._Upload_Document(_Claim_Id, _Filename, _File.buffer, _File.contentType || 'application/octet-stream');

    const _Merged_Identity = _Identity._Merge_Identity_Verification(_Claim.identityVerification || null, {
        ..._Identity_Result,
        sourceDocumentKey: _S3_Key,
    });

    await _DB._Store_Document_Metadata(_Claim_Id, _Claim.userId, {
        type: _Classification,
        s3Key: _S3_Key,
        contentType: _File.contentType,
        sizeBytes: _File.buffer.length,
        extractedText: _Extracted_Text.substring(0, 5000),
        keyValues: _Key_Values.slice(0, 50),
        identityCandidate: _Identity_Result.extractedName || null,
        identityCandidates: (_Identity_Result.candidateNames || []).slice(0, 5),
        identityVerification: { ..._Identity_Result, sourceDocumentKey: _S3_Key },
    });
    await _DB._Update_Claim(_Claim_Id, _Claim.userId, { identityVerification: _Merged_Identity });
    await _DB._Log_Audit({
        claimId: _Claim_Id,
        actor: _Operator.actor,
        action: 'operator_document_uploaded',
        metadata: { classification: _Classification, s3Key: _S3_Key, filename: _File.name || _Filename },
    });

    const _Reloaded = await _DB._Get_Claim_By_Id(_Claim_Id);
    if (_Reloaded?.selectedTemplateId) {
        await _Refresh_Template_Schema(_Reloaded);
    }
    return await _Build_Claim_Detail(await _DB._Get_Claim_By_Id(_Claim_Id));
}

async function _Upload_Operator_Photo(_Operator, _Claim_Id, _Body) {
    const _Claim = await _Load_Claim_For_Operator(_Operator, _Claim_Id);
    _Require_Editable_Claim(_Claim, 'upload photos to this claim');
    const _File = _Decode_Upload(_Body.file || _Body);
    _Require(_File.buffer?.length, 'Photo file is required');
    _Require(/^image\//i.test(_File.contentType || ''), 'Only image uploads are supported for photos');

    const _Message_Sid = `operator-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const _Reservation = await _DB._Begin_Photo_Processing(_Claim_Id, _Claim.userId, _Message_Sid);
    if (_Reservation.alreadyProcessed) {
        return await _Build_Claim_Detail(await _DB._Get_Claim_By_Id(_Claim_Id));
    }

    const _Photo_Index = _Reservation.photoIndex;
    const _S3_Key = await _S3._Upload_Photo(_Claim_Id, _Photo_Index, _File.buffer, _File.contentType || 'image/jpeg');
    const _Hash = _S3._Compute_SHA256(_File.buffer);
    const _Moderation = await _Run_Photo_Moderation(_File.buffer);
    let _AI_Assessment = {
        is_crop_photo: true,
        detected_crop: 'unknown',
        crop_matches_claim: true,
        is_crop_damage: false,
        confidence: 0,
        damage_type: 'none',
        reject_reason: null,
        description: '',
    };

    if (!_Moderation.flagged) {
        _AI_Assessment = await _Assess_Crop_Damage(_File.buffer, _File.contentType, _Claim);
    }

    const _Approved = !_Moderation.flagged
        && _AI_Assessment.is_crop_photo
        && _AI_Assessment.crop_matches_claim !== false
        && _AI_Assessment.is_crop_damage;

    const _Fail_Reason = _Moderation.flagged
        ? 'Image flagged by content moderation'
        : _Build_Photo_Reject_Reason(_AI_Assessment, _Claim);

    const _Labels = await _Photo_Labels(_File.buffer);
    await _DB._Finalize_Photo_Processing(_Claim_Id, _Claim.userId, _Message_Sid, _Approved);
    await _S3._Upload_Photo_Metadata(_Claim_Id, _Photo_Index, {
        photoIndex: _Photo_Index,
        s3Key: _S3_Key,
        sha256: _Hash,
        approved: _Approved,
        failReason: _Fail_Reason,
        labels: _Labels,
        aiAssessment: _AI_Assessment,
        processedAt: new Date().toISOString(),
    });

    await _DB._Log_Audit({
        claimId: _Claim_Id,
        actor: _Operator.actor,
        action: 'operator_photo_uploaded',
        metadata: {
            s3Key: _S3_Key,
            photoIndex: _Photo_Index,
            approved: _Approved,
            aiAssessment: _AI_Assessment,
        },
    });

    return {
        ...(await _Build_Claim_Detail(await _DB._Get_Claim_By_Id(_Claim_Id))),
        photoResult: {
            approved: _Approved,
            s3Key: _S3_Key,
            failReason: _Fail_Reason,
            aiAssessment: _AI_Assessment,
        },
    };
}

async function _Select_Template(_Operator, _Claim_Id, _Body) {
    const _Claim = await _Load_Claim_For_Operator(_Operator, _Claim_Id);
    _Require_Editable_Claim(_Claim, 'change the insurer template');
    const _Template_Id = (_Body.templateId || _Body.selectedTemplateId || '').trim();
    const _Template = _Get_Template(_Template_Id);
    _Require(_Template, 'Unknown insurer template');
    const _Schema = _Build_Template_Schema(_Template.id, { ..._Claim, selectedTemplateId: _Template.id });
    await _DB._Update_Claim(_Claim_Id, _Claim.userId, {
        selectedTemplateId: _Template.id,
        company: _Template.id,
        formSchema: _Schema,
    });
    await _DB._Log_Audit({
        claimId: _Claim_Id,
        actor: _Operator.actor,
        action: 'operator_template_selected',
        metadata: { templateId: _Template.id },
    });
    return await _Build_Claim_Detail(await _DB._Get_Claim_By_Id(_Claim_Id));
}

async function _Generate_Template_Form(_Operator, _Claim_Id) {
    const _Claim = await _Load_Claim_For_Operator(_Operator, _Claim_Id);
    _Require_Editable_Claim(_Claim, 'generate the insurer form');
    _Require(_Claim.selectedTemplateId, 'Select an insurer form first');
    const _Template = _Get_Template(_Claim.selectedTemplateId);
    _Require(_Template, 'Selected insurer form is unavailable');
    await _Refresh_Template_Schema(_Claim);
    _Require_Template_Fields_Ready(_Claim, 'generate the insurer form');
    const _Rendered = await _Render_Insurer_Form(_Template.id, _Claim);
    const _Filename = `${_Template.id.toLowerCase()}_filled_form.pdf`;
    const _Key = await _S3._Upload_Document(_Claim_Id, _Filename, _Rendered.buffer, 'application/pdf');
    const _Url = await _S3._Get_Presigned_URL(_Key, 7 * 24 * 3600);

    await _DB._Update_Claim(_Claim_Id, _Claim.userId, {
        generatedDocuments: {
            ...(_Claim.generatedDocuments || {}),
            insurerFormKey: _Key,
        },
        lastGeneratedAt: new Date().toISOString(),
    });

    await _DB._Log_Audit({
        claimId: _Claim_Id,
        actor: _Operator.actor,
        action: 'operator_template_generated',
        metadata: { templateId: _Template.id, s3Key: _Key, appendixFields: _Rendered.appendixFields || [] },
    });

    return {
        success: true,
        templateId: _Template.id,
        insurerFormKey: _Key,
        insurerFormUrl: _Url,
        appendixFields: _Rendered.appendixFields || [],
    };
}

async function _Submit_Operator_Claim(_Operator, _Claim_Id) {
    const _Claim = await _Load_Claim_For_Operator(_Operator, _Claim_Id);
    _Require_Editable_Claim(_Claim, 'submit the claim');
    await _Refresh_Template_Schema(_Claim);
    _Require_Template_Fields_Ready(_Claim, 'submit the claim');
    const _Pack = await _Generate_Claim_Pack(_Claim_Id, _Claim, false);
    await _DB._Update_Claim_Status(_Claim_Id, _Claim.userId, _Claim_Status.SUBMITTED, {
        submittedAt: new Date().toISOString(),
        submittedByOperator: _Operator.phoneNumber,
    });
    await _DB._Log_Audit({
        claimId: _Claim_Id,
        actor: _Operator.actor,
        action: 'operator_claim_submitted',
        metadata: { finalClaimPackKey: _Pack.finalClaimPackKey, insurerFormKey: _Pack.insurerFormKey || null },
    });
    return {
        success: true,
        claimId: _Claim_Id,
        status: _Claim_Status.SUBMITTED,
        presignedUrl: _Pack.presignedUrl,
        insurerFormUrl: _Pack.insurerFormUrl,
    };
}

async function _Generate_Operator_Appeal(_Operator, _Claim_Id, _Body) {
    const _Claim = await _Load_Claim_For_Operator(_Operator, _Claim_Id);
    const _Result = await _Generate_Appeal(_Claim_Id, {
        ..._Claim,
        rejectionReason: _Body.rejectionReason || _Claim.rejectionReason || 'Rejected claim',
    });
    await _DB._Update_Claim_Status(_Claim_Id, _Claim.userId, _Claim_Status.APPEAL_FILED, {
        appealS3Key: _Result.s3Key,
        appealGeneratedAt: new Date().toISOString(),
    });
    await _DB._Log_Audit({
        claimId: _Claim_Id,
        actor: _Operator.actor,
        action: 'operator_appeal_generated',
        metadata: { s3Key: _Result.s3Key },
    });
    return {
        success: true,
        claimId: _Claim_Id,
        status: _Claim_Status.APPEAL_FILED,
        appealUrl: _Result.presignedUrl,
    };
}

async function _Create_Farmer_Profile(_Operator, _Body) {
    await _Ensure_Operator_User(_Operator);
    const _Farmer = await _Ensure_Farmer_User(_Body);
    return {
        success: true,
        farmer: {
            phoneNumber: _Farmer.phoneNumber,
            userId: _Farmer.userId,
            name: _Farmer.name,
            village: _Farmer.village,
            district: _Farmer.district,
            state: _Farmer.state,
        },
    };
}

async function _Get_Operator_Analytics(_Operator) {
    const _Claims_Data = await _List_Operator_Claims(_Operator, { limit: 500 });
    const _Claims = _Claims_Data.claims || [];
    const _By_Status = {};
    const _By_Crop = {};
    const _Daily_Counts = {};
    let _Completeness_Sum = 0;

    for (const _Claim of _Claims) {
        _By_Status[_Claim.status] = (_By_Status[_Claim.status] || 0) + 1;
        if (_Claim.cropType) _By_Crop[_Claim.cropType] = (_By_Crop[_Claim.cropType] || 0) + 1;
        const _Day_Key = _Claim_Analytics_Day(_Claim);
        if (_Day_Key) {
            _Daily_Counts[_Day_Key] = (_Daily_Counts[_Day_Key] || 0) + 1;
        }
        _Completeness_Sum += Number(_Claim.completenessScore || 0);
    }

    return {
        totalClaims: _Claims.length,
        byStatus: _By_Status,
        byCrop: _By_Crop,
        avgCompleteness: _Claims.length ? Math.round(_Completeness_Sum / _Claims.length) : 0,
        pendingSubmission: _Claims.filter((_Claim) => _Claim.status === _Claim_Status.DRAFT).length,
        due24Hours: _Claims.filter((_Claim) => _Claim.deadline && (new Date(_Claim.deadline).getTime() - Date.now()) <= 24 * 60 * 60 * 1000).length,
        accessibleFarmers: (await _List_Accessible_Farmers(_Operator)).length,
        dailyCounts: _Sort_Object_By_Key(_Daily_Counts),
    };
}

async function _Build_Claim_Detail(_Claim) {
    const _Template_State = _Claim?.selectedTemplateId
        ? _Build_Template_Field_State(_Claim.selectedTemplateId, _Claim)
        : null;
    const _Detail_Claim = _Template_State
        ? { ..._Claim, formSchema: _Template_State.schema }
        : _Claim;
    const { farmer: _Farmer } = await _Resolve_Farmer_Target(_Claim);
    const _Pending_Fields = _Template_State?.pendingFields || [];
    const _Audit_Log = await _DB._Get_Audit_Log(_Claim.claimId);
    const _Photos = await _List_S3_Files_With_Urls(_Claim.claimId, 'photos/');
    const _Documents = await _Build_Document_List(_Claim);
    const _Generated = await _Build_Generated_Documents(_Claim.generatedDocuments || {});
    const _Completeness = _DB._Calculate_Completeness_Score(_Claim);
    const _Farmer_View = _Build_Farmer_View(_Claim, _Farmer);

    return {
        claim: {
            ..._Detail_Claim,
            completenessScore: _Completeness,
        },
        farmer: _Farmer_View,
        documents: _Documents,
        photos: _Photos,
        generatedDocuments: _Generated,
        pendingFields: _Pending_Fields,
        identityVerification: _Detail_Claim.identityVerification || null,
        templateChoices: _Template_Choices(),
        selectedTemplate: _Detail_Claim.selectedTemplateId ? _Get_Template(_Detail_Claim.selectedTemplateId) : null,
        auditLog: _Audit_Log.map((_Entry) => ({
            ..._Entry,
            metadata: _Safe_Parse_JSON(_Entry.metadata),
        })),
    };
}

async function _Build_Document_List(_Claim) {
    return Promise.all((_Claim.documentsReceived || []).map(async (_Document) => ({
        ..._Document,
        url: _Document.s3Key ? await _S3._Get_Presigned_URL(_Document.s3Key, 24 * 3600) : null,
    })));
}

async function _Build_Generated_Documents(_Generated) {
    const _Entries = Object.entries(_Generated || {}).filter(([, _Value]) => Boolean(_Value));
    const _Out = {};
    for (const [_Key, _Value] of _Entries) {
        _Out[_Key] = {
            key: _Value,
            url: await _S3._Get_Presigned_URL(_Value, 24 * 3600),
        };
    }
    return _Out;
}

async function _List_S3_Files_With_Urls(_Claim_Id, _Subfolder) {
    const _Files = await _S3._List_Claim_Files(_Claim_Id, _Subfolder);
    return Promise.all(_Files.map(async (_File) => ({
        ..._File,
        url: await _S3._Get_Presigned_URL(_File.key, 24 * 3600),
    })));
}

function _Build_Farmer_View(_Claim, _Farmer) {
    if (!_Claim && !_Farmer) return null;

    return {
        phoneNumber: _Claim?.phoneNumber || _Farmer?.phoneNumber || null,
        userId: _Farmer?.userId || _Claim?.userId || null,
        name: _Claim?.farmerName || _Farmer?.name || null,
        village: _Claim?.village || _Farmer?.village || null,
        district: _Claim?.district || _Farmer?.district || null,
        state: _Claim?.state || _Farmer?.state || null,
        language: _Farmer?.language || 'hi',
    };
}

function _Resolve_Claimed_Farmer_Names(_Claim = {}, _Farmer = null) {
    const _Seen = new Set();
    const _Names = [];

    for (const _Value of [
        _Claim.farmerName,
        _Claim.identityVerification?.claimedName,
        _Farmer?.name,
    ]) {
        const _Name = String(_Value || '').trim();
        const _Normalized = _Identity._Normalize_Name(_Name);
        if (!_Normalized || _Seen.has(_Normalized)) continue;
        _Seen.add(_Normalized);
        _Names.push(_Name);
    }

    return _Names;
}

function _Assess_Operator_Name_Verification(_Input = {}) {
    const { claimedNames = [], ..._Document } = _Input;
    let _Best = null;

    for (const _Claimed_Name of (claimedNames.length ? claimedNames : [null])) {
        const _Result = _Identity._Assess_Name_Verification({
            ..._Document,
            claimedName: _Claimed_Name,
        });
        if (!_Best || _Compare_Identity_Results(_Result, _Best) > 0) {
            _Best = _Result;
        }
    }

    return _Best || _Identity._Assess_Name_Verification(_Document);
}

function _Compare_Identity_Results(_Left, _Right) {
    const _Rank = {
        verified: 6,
        matched_supporting_document: 5,
        review_required: 4,
        mismatch: 3,
        no_name_found: 2,
        claim_name_missing: 1,
        unverified: 0,
    };

    const _Left_Rank = _Rank[_Left?.status] || 0;
    const _Right_Rank = _Rank[_Right?.status] || 0;
    if (_Left_Rank !== _Right_Rank) return _Left_Rank - _Right_Rank;

    const _Left_Score = Number(_Left?.matchScore || 0);
    const _Right_Score = Number(_Right?.matchScore || 0);
    if (_Left_Score !== _Right_Score) return _Left_Score - _Right_Score;

    return Number(Boolean(_Left?.extractedName)) - Number(Boolean(_Right?.extractedName));
}

function _To_Claim_Summary(_Claim) {
    const _Template_State = _Claim?.selectedTemplateId
        ? _Build_Template_Field_State(_Claim.selectedTemplateId, _Claim)
        : null;
    return {
        ..._Claim,
        pendingFieldsCount: _Template_State?.pendingFields?.length || 0,
        completenessScore: _DB._Calculate_Completeness_Score(_Claim),
        urgency: _Claim.deadline
            ? (_Hours_Until(_Claim.deadline) <= 24 ? 'critical' : _Hours_Until(_Claim.deadline) <= 72 ? 'warning' : 'normal')
            : 'normal',
    };
}

function _Require_Template_Fields_Ready(_Claim, _Action_Text) {
    if (!_Claim?.selectedTemplateId) return;
    const _Template_State = _Build_Template_Field_State(_Claim.selectedTemplateId, _Claim);
    _Claim.formSchema = _Template_State.schema;
    if (!_Template_State.pendingFields.length) return;

    const _Labels = _Template_State.pendingFields.slice(0, 6).map((_Field) => _Field.field_label || _Field.field_name);
    const _Suffix = _Template_State.pendingFields.length > _Labels.length ? ', ...' : '';
    const _Reason = `Complete the Missing Fields section before you ${_Action_Text}. Still needed: ${_Labels.join(', ')}${_Suffix}.`;
    _Require(false, _Reason, 409);
}

function _Hours_Until(_Iso) {
    return Math.round((new Date(_Iso).getTime() - Date.now()) / 3600000);
}

function _Claim_Analytics_Day(_Claim = {}) {
    return _To_Iso_Day(_Claim.createdAt || _Claim.submittedAt || _Claim.lastUpdated);
}

function _To_Iso_Day(_Value) {
    if (!_Value) return null;
    const _Date = new Date(_Value);
    if (Number.isNaN(_Date.getTime())) return null;
    return _Date.toISOString().slice(0, 10);
}

function _Sort_Object_By_Key(_Object = {}) {
    return Object.fromEntries(
        Object.entries(_Object).sort(([_Key_A], [_Key_B]) => _Key_A.localeCompare(_Key_B))
    );
}

function _Decode_Upload(_Payload = {}) {
    const _Base64 = String(_Payload.base64 || _Payload.data || '').replace(/^data:[^;]+;base64,/, '');
    return {
        name: _Payload.name || _Payload.fileName || 'upload.bin',
        contentType: _Payload.contentType || _Payload.mimeType || 'application/octet-stream',
        buffer: Buffer.from(_Base64, 'base64'),
    };
}

function _Infer_Document_Extension(_Content_Type = '', _Name = '') {
    if (_Content_Type.includes('pdf') || /\.pdf$/i.test(_Name)) return 'pdf';
    if (_Content_Type.includes('png') || /\.png$/i.test(_Name)) return 'png';
    if (_Content_Type.includes('webp') || /\.webp$/i.test(_Name)) return 'webp';
    return 'jpg';
}

async function _Run_Photo_Moderation(_Buffer) {
    try {
        const _Result = await _Rekognition.send(new DetectModerationLabelsCommand({
            Image: { Bytes: _Buffer },
            MinConfidence: 70,
        }));
        return {
            flagged: (_Result.ModerationLabels || []).length > 0,
            labels: (_Result.ModerationLabels || []).map((_Label) => _Label.Name),
        };
    } catch (_Error) {
        console.error('Photo moderation failed:', _Error.message);
        return { flagged: false, labels: [] };
    }
}

async function _Photo_Labels(_Buffer) {
    try {
        const _Result = await _Rekognition.send(new DetectLabelsCommand({
            Image: { Bytes: _Buffer },
            MaxLabels: 15,
            MinConfidence: 60,
        }));
        return (_Result.Labels || []).map((_Label) => ({
            name: _Label.Name,
            confidence: Math.round(_Label.Confidence),
        }));
    } catch (_Error) {
        console.error('Photo label detection failed:', _Error.message);
        return [];
    }
}

async function _Assess_Crop_Damage(_Buffer, _Content_Type, _Claim) {
    const _Mime = _Content_Type || 'image/jpeg';
    const _Format = _Mime.includes('png') ? 'png' : _Mime.includes('webp') ? 'webp' : 'jpeg';
    const _Claimed_Crop = _Claim.cropType || null;
    const _Claimed_Cause = _Claim.cause || null;
    let _Prompt = 'Analyze this crop photo for insurance claim evidence.';
    if (_Claimed_Crop) _Prompt += ` The farmer claims the crop is ${_Claimed_Crop}.`;
    if (_Claimed_Cause) _Prompt += ` The reported cause of damage is ${_Claimed_Cause}.`;

    try {
        const _Raw = await _Bedrock._Invoke_Model_With_Image(
            _Bedrock._System_Prompts._Crop_Damage_Assessment,
            _Buffer,
            _Prompt,
            _Format,
            512
        );
        const _Json = _Raw.match(/\{[\s\S]*\}/);
        return _Json ? JSON.parse(_Json[0]) : {
            is_crop_photo: true,
            crop_matches_claim: true,
            is_crop_damage: true,
            confidence: 0,
        };
    } catch (_Error) {
        console.error('Operator photo Bedrock assessment failed:', _Error.message);
        return {
            is_crop_photo: true,
            crop_matches_claim: true,
            is_crop_damage: true,
            confidence: 0,
            description: 'AI assessment unavailable',
        };
    }
}

function _Build_Document_Rejection_Reason(_Identity_Result, _Claim) {
    if (_Identity_Result?.status === 'mismatch') {
        return `The uploaded document name${_Identity_Result.extractedName ? ` looks like "${_Identity_Result.extractedName}"` : ''} does not match the farmer name "${_Claim.farmerName}". Upload another document with the correct farmer name.`;
    }
    if (_Identity_Result?.status === 'review_required') {
        return 'A possible name was found on the document, but it is not clear enough to verify. Upload a clearer document image.';
    }
    return 'No clear farmer name was found on the document. Upload another identity or supporting document.';
}

function _Build_Photo_Reject_Reason(_Assessment, _Claim) {
    if (!_Assessment) return 'Photo validation failed';
    if (_Assessment.reject_reason) return _Assessment.reject_reason;
    if (_Assessment.is_crop_photo === false) return 'This does not appear to be a crop field photo';
    if (_Assessment.crop_matches_claim === false && _Claim.cropType) return `This photo appears to show a crop other than ${_Claim.cropType}`;
    if (_Assessment.is_crop_damage === false) return 'No visible crop damage detected';
    return null;
}

function _Safe_Parse_JSON(_Value) {
    if (typeof _Value !== 'string') return _Value;
    try {
        return JSON.parse(_Value);
    } catch {
        return _Value;
    }
}
