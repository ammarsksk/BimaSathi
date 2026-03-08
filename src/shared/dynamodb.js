/**
 * BimaSathi — DynamoDB Data Access Layer
 * 
 * Provides CRUD operations for all 6 DynamoDB tables:
 *   - Users, Claims, Conversations, Deadlines, Audit Log, Consent
 * 
 * Each table operation is encapsulated in a descriptive function.
 * All functions return Promises and handle errors gracefully.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand,
    UpdateCommand, QueryCommand, ScanCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID: _Generate_UUID } = require('crypto');
const { _Table_Names, _Completeness_Weights, _Claim_Status } = require('./constants');

const _Dynamo_Client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const _Doc_Client = DynamoDBDocumentClient.from(_Dynamo_Client, {
    marshallOptions: { removeUndefinedValues: true },
});
const _ACTIVE_CONVERSATION_SESSION_ID = 'ACTIVE';


// ═════════════════════════════════════════════════════════════
//  USERS TABLE
// ═════════════════════════════════════════════════════════════

/**
 * Retrieve a user by phone number
 * @param {string} _Phone_Number — plain phone number (no whatsapp: prefix)
 * @returns {Object|null} User record or null
 */
async function _Get_User(_Phone_Number) {
    const _Clean_Phone = _Phone_Number.replace('whatsapp:', '').replace(/\s/g, '');
    const _Result = await _Doc_Client.send(new QueryCommand({
        TableName: _Table_Names.USERS,
        KeyConditionExpression: 'phoneNumber = :phone',
        ExpressionAttributeValues: { ':phone': _Clean_Phone },
        Limit: 1,
    }));
    return _Result.Items?.[0] || null;
}

/**
 * Create a new user
 * @param {Object} _User_Data — { phoneNumber, name?, village?, district?, state?, language?, role? }
 * @returns {Object} Created user record
 */
async function _Create_User(_User_Data) {
    const _User = {
        phoneNumber: _User_Data.phoneNumber.replace('whatsapp:', '').replace(/\s/g, ''),
        userId: _Generate_UUID(),
        name: _User_Data.name || null,
        village: _User_Data.village || null,
        district: _User_Data.district || null,
        state: _User_Data.state || null,
        language: _User_Data.language || 'hi',
        role: _User_Data.role || 'farmer',
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
    };
    await _Doc_Client.send(new PutCommand({ TableName: _Table_Names.USERS, Item: _User }));
    return _User;
}

/**
 * Update specific fields on a user record
 * @param {string} _Phone_Number — primary key
 * @param {Object} _Updates — fields to update
 */
async function _Update_User(_Phone_Number, _Updates) {
    const _Clean_Phone = _Phone_Number.replace('whatsapp:', '').replace(/\s/g, '');
    const _User = await _Get_User(_Clean_Phone);
    if (!_User) return null;

    const _Expression_Parts = [];
    const _Expression_Values = {};
    const _Expression_Names = {};

    for (const [_Key, _Value] of Object.entries(_Updates)) {
        const _Safe_Key = `#${_Key}`;
        const _Val_Key = `:${_Key}`;
        _Expression_Parts.push(`${_Safe_Key} = ${_Val_Key}`);
        _Expression_Values[_Val_Key] = _Value;
        _Expression_Names[_Safe_Key] = _Key;
    }

    _Expression_Parts.push('#lastActive = :lastActive');
    _Expression_Values[':lastActive'] = new Date().toISOString();
    _Expression_Names['#lastActive'] = 'lastActive';

    await _Doc_Client.send(new UpdateCommand({
        TableName: _Table_Names.USERS,
        Key: { phoneNumber: _Clean_Phone, userId: _User.userId },
        UpdateExpression: `SET ${_Expression_Parts.join(', ')}`,
        ExpressionAttributeValues: _Expression_Values,
        ExpressionAttributeNames: _Expression_Names,
    }));
}


// ═════════════════════════════════════════════════════════════
//  CLAIMS TABLE
// ═════════════════════════════════════════════════════════════

/**
 * Retrieve a claim by its ID
 * @param {string} _Claim_Id — e.g. "BMS-2024-1234"
 * @returns {Object|null} Claim record or null
 */
async function _Get_Claim_By_Id(_Claim_Id) {
    const _Result = await _Doc_Client.send(new QueryCommand({
        TableName: _Table_Names.CLAIMS,
        KeyConditionExpression: 'claimId = :cid',
        ExpressionAttributeValues: { ':cid': _Claim_Id },
        Limit: 1,
    }));
    return _Result.Items?.[0] || null;
}

/**
 * Get all claims for a specific user
 * @param {string} _User_Id — userId or phoneNumber
 * @returns {Array} List of claim records
 */
async function _Get_Claims_By_User(_User_Id) {
    const _Result = await _Doc_Client.send(new ScanCommand({
        TableName: _Table_Names.CLAIMS,
        FilterExpression: 'userId = :uid',
        ExpressionAttributeValues: { ':uid': _User_Id },
    }));
    return _Result.Items || [];
}

/**
 * Get all claims with a given status (via GSI)
 * @param {string} _Status — one of _Claim_Status values
 * @returns {Array} Matching claims
 */
async function _Get_Claims_By_Status(_Status) {
    const _Result = await _Doc_Client.send(new QueryCommand({
        TableName: _Table_Names.CLAIMS,
        IndexName: 'statusIndex',
        KeyConditionExpression: '#s = :status',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':status': _Status },
    }));
    return _Result.Items || [];
}

/**
 * Get all claims with optional filters (for operator dashboard)
 * @param {Object} _Filters — { status?, village?, cropType? }
 * @param {number} _Limit — max records
 * @returns {Array} Matching claims
 */
async function _Get_All_Claims(_Filters = {}, _Limit = 100) {
    const _Params = {
        TableName: _Table_Names.CLAIMS,
        Limit: _Limit,
    };

    const _Filter_Parts = [];
    const _Expr_Values = {};
    const _Expr_Names = {};

    if (_Filters.status) {
        _Filter_Parts.push('#s = :st');
        _Expr_Values[':st'] = _Filters.status;
        _Expr_Names['#s'] = 'status';
    }
    if (_Filters.village) {
        _Filter_Parts.push('#v = :vl');
        _Expr_Values[':vl'] = _Filters.village;
        _Expr_Names['#v'] = 'village';
    }
    if (_Filters.cropType) {
        _Filter_Parts.push('#c = :ct');
        _Expr_Values[':ct'] = _Filters.cropType;
        _Expr_Names['#c'] = 'cropType';
    }

    if (_Filter_Parts.length > 0) {
        _Params.FilterExpression = _Filter_Parts.join(' AND ');
        _Params.ExpressionAttributeValues = _Expr_Values;
        _Params.ExpressionAttributeNames = _Expr_Names;
    }

    const _Result = await _Doc_Client.send(new ScanCommand(_Params));
    return _Result.Items || [];
}

/**
 * Create a new claim record
 * @param {Object} _Claim_Data — all claim fields
 * @returns {Object} Created claim
 */
async function _Create_Claim(_Claim_Data) {
    const _Now = new Date().toISOString();
    const _Claim = {
        claimId: _Claim_Data.claimId,
        userId: _Claim_Data.userId,
        phoneNumber: _Claim_Data.phoneNumber,
        farmerName: _Claim_Data.farmerName || null,
        village: _Claim_Data.village || null,
        district: _Claim_Data.district || null,
        state: _Claim_Data.state || null,
        cropType: _Claim_Data.cropType || null,
        season: _Claim_Data.season || null,
        lossDate: _Claim_Data.lossDate || null,
        cause: _Claim_Data.cause || null,
        areaHectares: _Claim_Data.areaHectares || null,
        policyType: _Claim_Data.policyType || null,
        bankLast4: _Claim_Data.bankLast4 || null,
        documentCount: _Claim_Data.documentCount || 0,
        photoCount: _Claim_Data.photoCount || 0,
        approvedPhotoCount: _Claim_Data.approvedPhotoCount || 0,
        status: _Claim_Status.DRAFT,
        deadline: _Claim_Data.deadline || null,
        gpsCoords: _Claim_Data.gpsCoords || null,
        draftState: _Claim_Data.draftState || null,
        draftContext: _Claim_Data.draftContext || null,
        createdAt: _Now,
        lastUpdated: _Now,
    };
    await _Doc_Client.send(new PutCommand({ TableName: _Table_Names.CLAIMS, Item: _Claim }));
    return _Claim;
}

/**
 * Update specific fields on a claim
 * @param {string} _Claim_Id — primary key
 * @param {string} _User_Id — sort key
 * @param {Object} _Updates — fields to update
 */
async function _Update_Claim(_Claim_Id, _User_Id, _Updates) {
    const _Expression_Parts = [];
    const _Expr_Values = {};
    const _Expr_Names = {};

    for (const [_Key, _Value] of Object.entries(_Updates)) {
        const _Safe = `#f_${_Key}`;
        const _Val = `:v_${_Key}`;
        _Expression_Parts.push(`${_Safe} = ${_Val}`);
        _Expr_Values[_Val] = _Value;
        _Expr_Names[_Safe] = _Key;
    }

    _Expression_Parts.push('#lastUpdated = :ts');
    _Expr_Values[':ts'] = new Date().toISOString();
    _Expr_Names['#lastUpdated'] = 'lastUpdated';

    await _Doc_Client.send(new UpdateCommand({
        TableName: _Table_Names.CLAIMS,
        Key: { claimId: _Claim_Id, userId: _User_Id },
        UpdateExpression: `SET ${_Expression_Parts.join(', ')}`,
        ExpressionAttributeValues: _Expr_Values,
        ExpressionAttributeNames: _Expr_Names,
    }));
}


// ═════════════════════════════════════════════════════════════
//  CONVERSATIONS TABLE — session state persistence
// ═════════════════════════════════════════════════════════════

/**
 * Load the active conversation for a phone number
 * @param {string} _Phone_Number — user's phone
 * @returns {Object|null} Conversation state
 */
async function _Get_Conversation(_Phone_Number) {
    const _Clean = _Phone_Number.replace('whatsapp:', '').replace(/\s/g, '');
    const _Active = await _Doc_Client.send(new GetCommand({
        TableName: _Table_Names.CONVERSATIONS,
        Key: { phoneNumber: _Clean, sessionId: _ACTIVE_CONVERSATION_SESSION_ID },
    }));
    if (_Active.Item) return _Active.Item;

    const _Fallback = await _Doc_Client.send(new QueryCommand({
        TableName: _Table_Names.CONVERSATIONS,
        KeyConditionExpression: 'phoneNumber = :phone',
        ExpressionAttributeValues: { ':phone': _Clean },
        ScanIndexForward: false,
        Limit: 1,
    }));
    return _Fallback.Items?.[0] || null;
}

/**
 * Save or update conversation state
 * @param {Object} _Conversation — { phoneNumber, sessionId, state, context, language }
 */
async function _Upsert_Conversation(_Conversation) {
    const _Clean_Phone = _Conversation.phoneNumber.replace('whatsapp:', '').replace(/\s/g, '');
    const _Ttl = Math.floor(Date.now() / 1000) + 86400;  // 24-hour TTL

    await _Doc_Client.send(new PutCommand({
        TableName: _Table_Names.CONVERSATIONS,
        Item: {
            phoneNumber: _Clean_Phone,
            sessionId: _ACTIVE_CONVERSATION_SESSION_ID,
            state: _Conversation.state,
            context: _Conversation.context || {},
            language: _Conversation.language || 'hi',
            lastMessage: new Date().toISOString(),
            ttl: _Ttl,
        },
    }));
}

/**
 * Update claim status and any related fields in a single call.
 * This is used by save/resume/submit flows so draft metadata is stored consistently.
 */
async function _Update_Claim_Status(_Claim_Id, _User_Id, _Status, _Updates = {}) {
    await _Update_Claim(_Claim_Id, _User_Id, {
        status: _Status,
        ..._Updates,
    });
}

/**
 * Delete a single claim draft.
 */
async function _Delete_Claim(_Claim_Id, _User_Id) {
    await _Doc_Client.send(new DeleteCommand({
        TableName: _Table_Names.CLAIMS,
        Key: { claimId: _Claim_Id, userId: _User_Id },
    }));
}

/**
 * Reserve the next photo slot for a claim and deduplicate by WhatsApp message SID.
 * Returns the up-to-date counters after the reservation.
 */
async function _Begin_Photo_Processing(_Claim_Id, _User_Id, _Message_Sid) {
    const _Params = {
        TableName: _Table_Names.CLAIMS,
        Key: { claimId: _Claim_Id, userId: _User_Id },
        UpdateExpression: 'ADD #photoCount :one, #photoSids :sidSet SET #lastUpdated = :ts',
        ExpressionAttributeNames: {
            '#photoCount': 'photoCount',
            '#photoSids': 'processedPhotoSids',
            '#lastUpdated': 'lastUpdated',
        },
        ExpressionAttributeValues: {
            ':one': 1,
            ':sidSet': new Set([_Message_Sid]),
            ':sid': _Message_Sid,
            ':ts': new Date().toISOString(),
        },
        ConditionExpression: 'attribute_not_exists(#photoSids) OR NOT contains(#photoSids, :sid)',
        ReturnValues: 'ALL_NEW',
    };

    try {
        const _Result = await _Doc_Client.send(new UpdateCommand(_Params));
        return {
            alreadyProcessed: false,
            claim: _Result.Attributes || {},
            photoIndex: _Result.Attributes?.photoCount || 1,
        };
    } catch (_Error) {
        if (_Error.name === 'ConditionalCheckFailedException') {
            const _Claim = await _Get_Claim_By_Id(_Claim_Id);
            return {
                alreadyProcessed: true,
                claim: _Claim || {},
                photoIndex: _Claim?.photoCount || 0,
            };
        }
        throw _Error;
    }
}

/**
 * Finalize a processed photo and increment approved-photo count only once.
 */
async function _Finalize_Photo_Processing(_Claim_Id, _User_Id, _Message_Sid, _Approved) {
    if (_Approved) {
        try {
            const _Result = await _Doc_Client.send(new UpdateCommand({
                TableName: _Table_Names.CLAIMS,
                Key: { claimId: _Claim_Id, userId: _User_Id },
                UpdateExpression: 'ADD #approvedCount :one, #approvedSids :sidSet SET #lastUpdated = :ts',
                ExpressionAttributeNames: {
                    '#approvedCount': 'approvedPhotoCount',
                    '#approvedSids': 'approvedPhotoSids',
                    '#lastUpdated': 'lastUpdated',
                },
                ExpressionAttributeValues: {
                    ':one': 1,
                    ':sidSet': new Set([_Message_Sid]),
                    ':sid': _Message_Sid,
                    ':ts': new Date().toISOString(),
                },
                ConditionExpression: 'attribute_not_exists(#approvedSids) OR NOT contains(#approvedSids, :sid)',
                ReturnValues: 'ALL_NEW',
            }));
            return _Result.Attributes || {};
        } catch (_Error) {
            if (_Error.name !== 'ConditionalCheckFailedException') throw _Error;
        }
    }

    const _Claim = await _Get_Claim_By_Id(_Claim_Id);
    return _Claim || {};
}


// ═════════════════════════════════════════════════════════════
//  DEADLINES TABLE
// ═════════════════════════════════════════════════════════════

/**
 * Create a deadline entry for a claim
 */
async function _Create_Deadline(_Claim_Id, _Farmer_Id, _Deadline_ISO, _Helper_Phone = null) {
    await _Doc_Client.send(new PutCommand({
        TableName: _Table_Names.DEADLINES,
        Item: {
            claimId: _Claim_Id,
            deadline: _Deadline_ISO,
            farmerId: _Farmer_Id,
            helperPhone: _Helper_Phone,
            status: 'active',
            remindersSent: [],
            createdAt: new Date().toISOString(),
        },
    }));
}

/**
 * Get all deadlines due within the next N hours
 * @param {number} _Hours_Ahead — lookahead window in hours
 * @returns {Array} Active deadlines within the window
 */
async function _Get_Upcoming_Deadlines(_Hours_Ahead = 48) {
    const _Now = new Date().toISOString();
    const _Cutoff = new Date(Date.now() + _Hours_Ahead * 3600000).toISOString();

    const _Result = await _Doc_Client.send(new ScanCommand({
        TableName: _Table_Names.DEADLINES,
        FilterExpression: '#d <= :cutoff AND #s = :active',
        ExpressionAttributeNames: { '#d': 'deadline', '#s': 'status' },
        ExpressionAttributeValues: { ':cutoff': _Cutoff, ':active': 'active' },
    }));
    return _Result.Items || [];
}

/**
 * Update a deadline record (e.g. remindersSent, status)
 */
async function _Update_Deadline(_Claim_Id, _Deadline, _Updates) {
    const _Parts = [];
    const _Values = {};
    const _Names = {};

    for (const [_Key, _Value] of Object.entries(_Updates)) {
        _Parts.push(`#${_Key} = :${_Key}`);
        _Values[`:${_Key}`] = _Value;
        _Names[`#${_Key}`] = _Key;
    }

    await _Doc_Client.send(new UpdateCommand({
        TableName: _Table_Names.DEADLINES,
        Key: { claimId: _Claim_Id, deadline: _Deadline },
        UpdateExpression: `SET ${_Parts.join(', ')}`,
        ExpressionAttributeValues: _Values,
        ExpressionAttributeNames: _Names,
    }));
}


// ═════════════════════════════════════════════════════════════
//  AUDIT LOG TABLE
// ═════════════════════════════════════════════════════════════

/**
 * Write an immutable audit log entry
 * @param {Object} _Entry — { claimId, actor, action, metadata }
 */
async function _Log_Audit(_Entry) {
    await _Doc_Client.send(new PutCommand({
        TableName: _Table_Names.AUDIT_LOG,
        Item: {
            claimId: _Entry.claimId,
            timestamp: new Date().toISOString(),
            actor: _Entry.actor,
            action: _Entry.action,
            metadata: JSON.stringify(_Entry.metadata || {}),
        },
    }));
}

/**
 * Get the full audit trail for a claim
 * @param {string} _Claim_Id — claim identifier
 * @returns {Array} Audit entries sorted by timestamp
 */
async function _Get_Audit_Log(_Claim_Id) {
    const _Result = await _Doc_Client.send(new QueryCommand({
        TableName: _Table_Names.AUDIT_LOG,
        KeyConditionExpression: 'claimId = :cid',
        ExpressionAttributeValues: { ':cid': _Claim_Id },
        ScanIndexForward: true,
    }));
    return _Result.Items || [];
}


// ═════════════════════════════════════════════════════════════
//  CONSENT TABLE — helper-farmer OTP consent
// ═════════════════════════════════════════════════════════════

/**
 * Store verified consent from farmer to helper
 */
async function _Create_Consent(_Farmer_Id, _Helper_Id) {
    await _Doc_Client.send(new PutCommand({
        TableName: _Table_Names.CONSENT,
        Item: {
            farmerId: _Farmer_Id,
            helperId: _Helper_Id,
            verifiedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),  // 30-day expiry
        },
    }));
}

/**
 * Verify if a helper has valid consent from a farmer
 * @returns {boolean}
 */
async function _Verify_Consent(_Farmer_Id, _Helper_Id) {
    const _Result = await _Doc_Client.send(new GetCommand({
        TableName: _Table_Names.CONSENT,
        Key: { farmerId: _Farmer_Id, helperId: _Helper_Id },
    }));

    if (!_Result.Item) return false;
    return new Date(_Result.Item.expiresAt) > new Date();
}


// ═════════════════════════════════════════════════════════════
//  FORM SCHEMA — dynamic field tracking for document builder
// ═════════════════════════════════════════════════════════════

/**
 * Store or update the form schema on a claim
 * @param {string} _Claim_Id — claim identifier
 * @param {string} _User_Id — user identifier (sort key)
 * @param {Array} _Schema — array of field objects
 */
async function _Update_Form_Schema(_Claim_Id, _User_Id, _Schema) {
    await _Doc_Client.send(new UpdateCommand({
        TableName: _Table_Names.CLAIMS,
        Key: { claimId: _Claim_Id, userId: _User_Id },
        UpdateExpression: 'SET #fs = :schema, #lu = :ts',
        ExpressionAttributeNames: { '#fs': 'formSchema', '#lu': 'lastUpdated' },
        ExpressionAttributeValues: { ':schema': _Schema, ':ts': new Date().toISOString() },
    }));
}

/**
 * Get pending fields from a claim's form schema
 * @param {string} _Claim_Id — claim identifier
 * @returns {Array} Fields with status 'pending'
 */
async function _Get_Pending_Fields(_Claim_Id) {
    const _Claim = await _Get_Claim_By_Id(_Claim_Id);
    if (!_Claim?.formSchema) return [];
    return _Claim.formSchema.filter(_F => _F.status === 'pending');
}

/**
 * Update a single field's status and value in the form schema
 * @param {string} _Claim_Id — claim identifier
 * @param {string} _User_Id — user identifier (sort key)
 * @param {string} _Field_Name — the field to update
 * @param {string} _Status — new status
 * @param {*} _Value — field value (optional)
 * @param {string} _Source — source of the value (optional, e.g. 'aadhaar_card')
 */
async function _Update_Field_Status(_Claim_Id, _User_Id, _Field_Name, _Status, _Value = null, _Source = null) {
    const _Claim = await _Get_Claim_By_Id(_Claim_Id);
    if (!_Claim?.formSchema) return;

    const _Updated_Schema = _Claim.formSchema.map(_Field => {
        if (_Field.field_name === _Field_Name) {
            return { ..._Field, status: _Status, value: _Value !== null ? _Value : _Field.value, source: _Source || _Field.source };
        }
        return _Field;
    });

    await _Update_Form_Schema(_Claim_Id, _User_Id, _Updated_Schema);
}

/**
 * Store document metadata (classification, extracted text) under the claim
 * @param {string} _Claim_Id — claim identifier
 * @param {string} _User_Id — user identifier (sort key)
 * @param {Object} _Doc_Meta — { type, s3Key, extractedText, keyValues, classifiedAt }
 */
async function _Store_Document_Metadata(_Claim_Id, _User_Id, _Doc_Meta) {
    await _Doc_Client.send(new UpdateCommand({
        TableName: _Table_Names.CLAIMS,
        Key: { claimId: _Claim_Id, userId: _User_Id },
        UpdateExpression: 'SET #dr = list_append(if_not_exists(#dr, :emptyDocs), :newDoc), #lu = :ts, #docCount = if_not_exists(#docCount, :zero) + :one',
        ExpressionAttributeNames: {
            '#dr': 'documentsReceived',
            '#lu': 'lastUpdated',
            '#docCount': 'documentCount',
        },
        ExpressionAttributeValues: {
            ':emptyDocs': [],
            ':newDoc': [{
                ..._Doc_Meta,
                receivedAt: new Date().toISOString(),
            }],
            ':zero': 0,
            ':one': 1,
            ':ts': new Date().toISOString(),
        },
    }));
}


// ═════════════════════════════════════════════════════════════
//  COMPLETENESS SCORE CALCULATOR
// ═════════════════════════════════════════════════════════════

/**
 * Calculate claim completeness as a percentage (0–100)
 * @param {Object} _Claim — claim record
 * @returns {number} Score from 0 to 100
 */
function _Calculate_Completeness_Score(_Claim) {
    let _Score = 0;

    for (const [_Field, _Weight] of Object.entries(_Completeness_Weights)) {
        if (_Field === 'photos') {
            const _Photo_Count = _Claim.approvedPhotoCount || _Claim.photoCount || 0;
            const _Photo_Ratio = Math.min(_Photo_Count / 3, 1);  // 3 photos = full weight
            _Score += _Photo_Ratio * _Weight;
        } else {
            const _Field_Key = _Field.replace(/_([a-z])/g, (_, _Ch) => _Ch.toUpperCase());  // snake→camel
            if (_Claim[_Field_Key] || _Claim[_Field]) {
                _Score += _Weight;
            }
        }
    }

    return Math.round(_Score * 100);
}


// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────
module.exports = {
    // Users
    _Get_User,
    _Create_User,
    _Update_User,

    // Claims
    _Get_Claim_By_Id,
    _Get_Claims_By_User,
    _Get_Claims_By_Status,
    _Get_All_Claims,
    _Create_Claim,
    _Update_Claim,
    _Update_Claim_Status,
    _Delete_Claim,
    _Begin_Photo_Processing,
    _Finalize_Photo_Processing,

    // Conversations
    _Get_Conversation,
    _Upsert_Conversation,

    // Deadlines
    _Create_Deadline,
    _Get_Upcoming_Deadlines,
    _Update_Deadline,

    // Audit Log
    _Log_Audit,
    _Get_Audit_Log,

    // Consent
    _Create_Consent,
    _Verify_Consent,

    // Form Schema
    _Update_Form_Schema,
    _Get_Pending_Fields,
    _Update_Field_Status,
    _Store_Document_Metadata,

    // Scoring
    _Calculate_Completeness_Score,
};
