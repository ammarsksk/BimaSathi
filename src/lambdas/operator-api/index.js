/**
 * BimaSathi — Operator API Lambda
 * 
 * REST API backend for the Operator Dashboard:
 *   GET  /claims          — list all claims (sorted, filtered)
 *   GET  /claims/:id      — full claim detail with evidence + audit log
 *   POST /claims/:id/submit — submit a complete claim to insurer
 *   GET  /analytics       — dashboard analytics and KPIs
 *   GET  /farmers         — list all registered farmers
 *   POST /farmers         — register a new farmer
 */

const _DB = require('../../shared/dynamodb');
const _S3_Helper = require('../../shared/s3');
const { _Claim_Status } = require('../../shared/constants');


exports.handler = async (_Event) => {
    const _Method = _Event.httpMethod || _Event.requestContext?.http?.method || 'GET';
    const _Path = _Event.path || _Event.rawPath || '';
    const _Route_Key = `${_Method} ${_Path}`;
    const _Params = _Event.queryStringParameters || {};
    const _Path_Params = _Event.pathParameters || {};
    const _Body = _Event.body ? JSON.parse(_Event.body) : {};
    const _Headers = _Event.headers || {};

    console.log(`Operator API: ${_Route_Key}`);

    try {
        // ── Auth check (simplified — production should validate Cognito JWT) ──
        const _Auth_Header = _Headers.Authorization || _Headers.authorization;
        if (!_Auth_Header) return _Response(401, { error: 'Unauthorized' });

        // ── Route matching ──
        if (_Path.match(/\/claims$/) && _Method === 'GET') return await _List_Claims(_Params);
        if (_Path.match(/\/claims\/[\w-]+$/) && _Method === 'GET') return await _Get_Claim_Detail(_Path_Params.id || _Path.split('/').pop());
        if (_Path.includes('/submit') && _Method === 'POST') return await _Submit_Claim(_Extract_Claim_Id(_Path), _Body);
        if (_Path.match(/\/analytics$/) && _Method === 'GET') return await _Get_Analytics();
        if (_Path.match(/\/farmers$/) && _Method === 'GET') return await _List_Farmers(_Params);
        if (_Path.match(/\/farmers$/) && _Method === 'POST') return await _Create_Farmer(_Body);

        return _Response(404, { error: 'Route not found' });
    } catch (_Error) {
        console.error('Operator API error:', _Error);
        return _Response(500, { error: 'Internal server error' });
    }
};


// ═════════════════════════════════════════════════════════════
//  ROUTE HANDLERS
// ═════════════════════════════════════════════════════════════

/**
 * GET /claims — list claims with optional filters, sorted by deadline urgency
 */
async function _List_Claims(_Params) {
    const _Filters = {};
    if (_Params.status) _Filters.status = _Params.status;
    if (_Params.village) _Filters.village = _Params.village;
    if (_Params.cropType) _Filters.cropType = _Params.cropType;

    const _Claims = await _DB._Get_All_Claims(_Filters, parseInt(_Params.limit || '100', 10));

    // Sort by deadline urgency (soonest first)
    _Claims.sort((_A, _B) => {
        if (!_A.deadline) return 1;
        if (!_B.deadline) return -1;
        return new Date(_A.deadline) - new Date(_B.deadline);
    });

    // Enrich each claim with computed fields
    const _Enriched = _Claims.map(_C => ({
        ..._C,
        completenessScore: _DB._Calculate_Completeness_Score(_C),
        urgency: _Compute_Urgency(_C.deadline),
    }));

    return _Response(200, { claims: _Enriched, total: _Enriched.length });
}


/**
 * GET /claims/:id — full claim detail with farmer profile, evidence URLs, and audit log
 */
async function _Get_Claim_Detail(_Claim_Id) {
    const _Claim = await _DB._Get_Claim_By_Id(_Claim_Id);
    if (!_Claim) return _Response(404, { error: 'Claim not found' });

    // Parallel fetch: audit log + evidence files + farmer profile
    const [_Audit_Log, _Photos, _Documents, _User] = await Promise.all([
        _DB._Get_Audit_Log(_Claim_Id),
        _S3_Helper._List_Claim_Files(_Claim_Id, 'photos/'),
        _S3_Helper._List_Claim_Files(_Claim_Id, 'documents/'),
        _DB._Get_User(_Claim.phoneNumber || _Claim.userId),
    ]);

    // Generate pre-signed URLs for photos
    const _Photo_URLs = await Promise.all(
        _Photos.map(async (_P) => ({
            key: _P.key,
            size: _P.size,
            url: await _S3_Helper._Get_Presigned_URL(_P.key, 3600),
        }))
    );

    return _Response(200, {
        claim: {
            ..._Claim,
            completenessScore: _DB._Calculate_Completeness_Score(_Claim),
            urgency: _Compute_Urgency(_Claim.deadline),
        },
        farmer: _User ? {
            name: _User.name, phone: _User.phoneNumber,
            village: _User.village, language: _User.language, role: _User.role,
        } : null,
        evidence: { photos: _Photo_URLs, documents: _Documents },
        auditLog: _Audit_Log,
    });
}


/**
 * POST /claims/:id/submit — submit a claim to the insurer
 * Requires completeness score ≥ 80%
 */
async function _Submit_Claim(_Claim_Id, _Body) {
    const _Claim = await _DB._Get_Claim_By_Id(_Claim_Id);
    if (!_Claim) return _Response(404, { error: 'Claim not found' });

    const _Score = _DB._Calculate_Completeness_Score(_Claim);
    if (_Score < 80) {
        return _Response(400, {
            error: 'Claim incomplete',
            completenessScore: _Score,
            message: 'Score must be ≥ 80% to submit',
        });
    }

    await _DB._Update_Claim(_Claim_Id, _Claim.userId, {
        status: _Claim_Status.SUBMITTED,
        submittedAt: new Date().toISOString(),
    });

    await _DB._Log_Audit({
        claimId: _Claim_Id,
        actor: _Body.operatorId || 'operator',
        action: 'operator_submitted',
        metadata: { completenessScore: _Score },
    });

    return _Response(200, { success: true, claimId: _Claim_Id, status: _Claim_Status.SUBMITTED });
}


/**
 * GET /analytics — aggregated KPIs for the dashboard
 */
async function _Get_Analytics() {
    const _All_Claims = await _DB._Get_All_Claims({}, 500);

    const _By_Status = {};
    const _By_Crop = {};
    const _Daily = {};
    const _Rejections = {};
    let _Total_Score = 0;

    for (const _C of _All_Claims) {
        _By_Status[_C.status] = (_By_Status[_C.status] || 0) + 1;
        if (_C.cropType) _By_Crop[_C.cropType] = (_By_Crop[_C.cropType] || 0) + 1;
        _Total_Score += _DB._Calculate_Completeness_Score(_C);

        const _Day = (_C.createdAt || '').split('T')[0];
        if (_Day) _Daily[_Day] = (_Daily[_Day] || 0) + 1;

        if (_C.status === 'Rejected' && _C.rejectionReason) {
            _Rejections[_C.rejectionReason] = (_Rejections[_C.rejectionReason] || 0) + 1;
        }
    }

    return _Response(200, {
        totalClaims: _All_Claims.length,
        byStatus: _By_Status,
        byCrop: _By_Crop,
        avgCompleteness: _All_Claims.length ? Math.round(_Total_Score / _All_Claims.length) : 0,
        dailyCounts: _Daily,
        rejectionReasons: _Rejections,
        pendingSubmission: (_By_Status['Draft'] || 0) + (_By_Status['Evidence Pending'] || 0),
        due24Hours: _All_Claims.filter(_C => _Compute_Urgency(_C.deadline) === 'critical').length,
    });
}


/**
 * POST /farmers — register a new farmer
 */
async function _Create_Farmer(_Body) {
    const _User = await _DB._Create_User({
        phoneNumber: _Body.phoneNumber,
        name: _Body.name,
        village: _Body.village,
        district: _Body.district,
        state: _Body.state,
        language: _Body.language || 'hi',
        role: 'farmer',
    });
    return _Response(201, { user: _User });
}


/**
 * GET /farmers — list all registered farmers
 */
async function _List_Farmers(_Params) {
    const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
    const { DynamoDBDocumentClient, ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const _Client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-south-1' });
    const _Doc_Client = DynamoDBDocumentClient.from(_Client);

    const _Result = await _Doc_Client.send(new ScanCommand({
        TableName: process.env.USERS_TABLE || 'bimasathi-users',
        FilterExpression: '#r = :farmer',
        ExpressionAttributeNames: { '#r': 'role' },
        ExpressionAttributeValues: { ':farmer': 'farmer' },
        Limit: parseInt(_Params.limit || '100', 10),
    }));

    return _Response(200, { farmers: _Result.Items || [] });
}


// ═════════════════════════════════════════════════════════════
//  HELPERS
// ═════════════════════════════════════════════════════════════

function _Compute_Urgency(_Deadline) {
    if (!_Deadline) return 'none';
    const _Hours = (new Date(_Deadline) - Date.now()) / (1000 * 60 * 60);
    if (_Hours < 0) return 'overdue';
    if (_Hours < 24) return 'critical';
    if (_Hours < 48) return 'warning';
    return 'normal';
}

function _Extract_Claim_Id(_Path) {
    const _Parts = _Path.split('/');
    const _Claims_Index = _Parts.indexOf('claims');
    return _Parts[_Claims_Index + 1] || '';
}

function _Response(_Status, _Body) {
    return {
        statusCode: _Status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        },
        body: JSON.stringify(_Body),
    };
}
