/**
 * BimaSathi — Auth Lambda
 * 
 * Authentication flows:
 *   - send_otp:           Send OTP to farmer/operator phone via Twilio Verify
 *   - verify_otp:         Verify OTP, create user in DynamoDB + Cognito, issue tokens
 *   - send_consent_otp:   Send consent OTP to farmer for helper-mode activation
 *   - verify_consent_otp: Verify farmer consent and store in consent table
 *   - refresh_token:      Refresh expired Cognito tokens
 */

const { CognitoIdentityProviderClient, AdminCreateUserCommand,
    AdminInitiateAuthCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { _Send_OTP, _Verify_OTP } = require('../../shared/twilio');
const _DB = require('../../shared/dynamodb');

const _Cognito_Client = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'ap-south-1' });
const _User_Pool_Id = process.env.COGNITO_USER_POOL_ID;
const _Client_Id = process.env.COGNITO_CLIENT_ID;


exports.handler = async (_Event) => {
    const _Input = typeof _Event.body === 'string' ? JSON.parse(_Event.body) : _Event;

    try {
        switch (_Input.action) {
            case 'send_otp': return await _Handle_Send_OTP(_Input.phoneNumber);
            case 'verify_otp': return await _Handle_Verify_OTP(_Input.phoneNumber, _Input.code, _Input.role);
            case 'send_consent_otp': return await _Handle_Send_Consent_OTP(_Input.phoneNumber);
            case 'verify_consent_otp': return await _Handle_Verify_Consent_OTP(_Input.phoneNumber, _Input.code, _Input.helperId);
            case 'refresh_token': return await _Handle_Refresh_Token(_Input.refreshToken);
            default: return _API_Response(400, { error: 'Invalid action' });
        }
    } catch (_Error) {
        console.error('Auth error:', _Error);
        return _API_Response(500, { error: 'Authentication failed' });
    }
};


// ── Send OTP ──

async function _Handle_Send_OTP(_Phone_Number) {
    const _Formatted = _Format_Phone(_Phone_Number);
    const _Success = await _Send_OTP(_Formatted);
    if (!_Success) {
        return _API_Response(500, { error: 'Failed to send OTP' });
    }
    return _API_Response(200, { success: true, message: 'OTP sent successfully' });
}


// ── Verify OTP + Create/Login User ──

async function _Handle_Verify_OTP(_Phone_Number, _Code, _Role = 'farmer') {
    const _Clean_Phone = _Phone_Number.replace('whatsapp:', '').replace(/\s/g, '');
    const _Formatted = _Format_Phone(_Clean_Phone);

    const _Is_Verified = await _Verify_OTP(_Formatted, _Code);
    if (!_Is_Verified) {
        return _API_Response(401, { error: 'Invalid OTP' });
    }

    // Fetch or create user in DynamoDB
    let _User = await _DB._Get_User(_Clean_Phone);
    if (!_User) {
        _User = await _DB._Create_User({ phoneNumber: _Clean_Phone, role: _Role });
        await _Create_Cognito_User(_Clean_Phone, _Formatted, _Role);
    }

    // Issue tokens
    const _Tokens = await _Issue_Tokens(_Clean_Phone);

    // Audit trail
    await _DB._Log_Audit({
        claimId: 'AUTH',
        actor: _Clean_Phone,
        action: 'otp_verified',
        metadata: { role: _Role },
    });

    return _API_Response(200, {
        success: true,
        user: {
            userId: _User.userId,
            phoneNumber: _User.phoneNumber,
            name: _User.name,
            role: _User.role,
            language: _User.language,
        },
        tokens: _Tokens,
    });
}


// ── Send Consent OTP (helper initiates, farmer receives OTP) ──

async function _Handle_Send_Consent_OTP(_Farmer_Phone) {
    const _Formatted = _Format_Phone(_Farmer_Phone);
    const _Success = await _Send_OTP(_Formatted);
    if (!_Success) {
        return _API_Response(500, { error: 'Failed to send consent OTP' });
    }
    return _API_Response(200, { success: true, message: 'Consent OTP sent to farmer' });
}


// ── Verify Consent OTP ──

async function _Handle_Verify_Consent_OTP(_Farmer_Phone, _Code, _Helper_Id) {
    const _Clean = _Farmer_Phone.replace('whatsapp:', '').replace(/\s/g, '');
    const _Formatted = _Format_Phone(_Clean);

    const _Is_Verified = await _Verify_OTP(_Formatted, _Code);
    if (!_Is_Verified) {
        return _API_Response(401, { error: 'Invalid consent OTP' });
    }

    await _DB._Create_Consent(_Clean, _Helper_Id);

    await _DB._Log_Audit({
        claimId: 'CONSENT',
        actor: _Helper_Id,
        action: 'helper_consent_verified',
        metadata: { farmerPhone: _Clean },
    });

    return _API_Response(200, { success: true, message: 'Consent verified and stored' });
}


// ── Refresh Token ──

async function _Handle_Refresh_Token(_Refresh_Token) {
    try {
        const _Result = await _Cognito_Client.send(new AdminInitiateAuthCommand({
            UserPoolId: _User_Pool_Id,
            ClientId: _Client_Id,
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            AuthParameters: { REFRESH_TOKEN: _Refresh_Token },
        }));
        return _API_Response(200, { tokens: _Result.AuthenticationResult });
    } catch (_Error) {
        return _API_Response(401, { error: 'Token refresh failed' });
    }
}


// ═════════════════════════════════════════════════════════════
//  INTERNAL HELPERS
// ═════════════════════════════════════════════════════════════

function _Format_Phone(_Number) {
    const _Clean = _Number.replace('whatsapp:', '').replace(/\s/g, '');
    return _Clean.startsWith('+') ? _Clean : `+91${_Clean}`;
}

async function _Create_Cognito_User(_Clean_Phone, _Formatted_Phone, _Role) {
    try {
        await _Cognito_Client.send(new AdminCreateUserCommand({
            UserPoolId: _User_Pool_Id,
            Username: _Clean_Phone,
            UserAttributes: [
                { Name: 'phone_number', Value: _Formatted_Phone },
                { Name: 'phone_number_verified', Value: 'true' },
                { Name: 'custom:role', Value: _Role },
            ],
            MessageAction: 'SUPPRESS',
        }));
    } catch (_Error) {
        if (_Error.name !== 'UsernameExistsException') {
            console.error('Cognito user creation failed:', _Error);
        }
    }
}

async function _Issue_Tokens(_Clean_Phone) {
    try {
        const _Auth_Result = await _Cognito_Client.send(new AdminInitiateAuthCommand({
            UserPoolId: _User_Pool_Id,
            ClientId: _Client_Id,
            AuthFlow: 'CUSTOM_AUTH',
            AuthParameters: { USERNAME: _Clean_Phone },
        }));
        return _Auth_Result.AuthenticationResult;
    } catch (_Error) {
        console.error('Cognito auth failed, using fallback token:', _Error.message);
        return {
            AccessToken: `bms-${Date.now()}-${_Clean_Phone}`,
            IdToken: `bms-id-${Date.now()}`,
            ExpiresIn: 86400,
        };
    }
}

function _API_Response(_Status_Code, _Body) {
    return {
        statusCode: _Status_Code,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        },
        body: JSON.stringify(_Body),
    };
}
