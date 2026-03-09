/**
 * BimaSathi — Twilio SMS Module (For Dashboard Authentication)
 * 
 * Used strictly for Operator Dashboard Login. 
 * Sends standard SMS OTPs to a verified operator phone number.
 */

// In production, this should be in DynamoDB with a TTL.
const _DB = require('./dynamodb');

/**
 * Format phone number to E.164 standard required by Twilio (+91...)
 */
function _Format_Phone(_Phone) {
    const _Clean = _Phone.replace(/\D/g, '');
    if (_Clean.startsWith('91') && _Clean.length === 12) {
        return '+' + _Clean;
    }
    if (_Clean.length === 10) {
        return '+91' + _Clean;
    }
    return '+' + _Clean; // Fallback
}

function _Is_WhatsApp_Channel(_Phone_Number) {
    return /^whatsapp:/i.test(String(_Phone_Number || '').trim());
}

function _Normalize_From_Number(_Phone_Number) {
    const _Raw = String(_Phone_Number || '').trim();
    if (!_Raw) return '';
    if (_Is_WhatsApp_Channel(_Raw)) {
        return `whatsapp:${_Format_Phone(_Raw.replace(/^whatsapp:/i, ''))}`;
    }
    return _Format_Phone(_Raw);
}

function _Normalize_To_Number(_Phone_Number, _From_Number) {
    const _Formatted = _Format_Phone(_Phone_Number);
    return _Is_WhatsApp_Channel(_From_Number) ? `whatsapp:${_Formatted}` : _Formatted;
}

async function _Clear_OTP(_Phone_Number) {
    try {
        await _DB._Update_User(_Phone_Number, { otp: null, otpExpiry: null });
    } catch (_Err) {
        console.error('Failed to clear OTP after send error:', _Err);
    }
}

function _Extract_Twilio_Error(_Error_Data) {
    if (!_Error_Data) return 'Twilio OTP send failed';
    if (typeof _Error_Data === 'string') return _Error_Data;
    return _Error_Data.message || _Error_Data.error_message || _Error_Data.detail || 'Twilio OTP send failed';
}

/**
 * Sends a 4-digit numeric OTP via Twilio Programmable SMS
 */
async function _Send_OTP(_Phone_Number) {
    const _Account_Sid = process.env.TWILIO_ACCOUNT_SID;
    const _Auth_Token = process.env.TWILIO_AUTH_TOKEN;
    const _From_Number = _Normalize_From_Number(process.env.TWILIO_PHONE_NUMBER);

    try {
        const _Clean = _Format_Phone(_Phone_Number);
        const _To_Number = _Normalize_To_Number(_Clean, _From_Number);

        // Generate random 6 digit code
        const _Code = Math.floor(100000 + Math.random() * 900000).toString();

        // Save OTP to DynamoDB to persist across Lambda invocations
        let _User = await _DB._Get_User(_Clean);
        if (!_User) {
            _User = await _DB._Create_User({ phoneNumber: _Clean, language: 'en', role: 'operator' });
        }
        await _DB._Update_User(_Clean, { otp: _Code, otpExpiry: new Date(Date.now() + 10 * 60000).toISOString() });

        if (!_Account_Sid || !_Auth_Token || !_From_Number) {
            await _Clear_OTP(_Clean);
            console.error('Twilio credentials missing. OTP was not sent.');
            return { success: false, error: 'Twilio credentials are missing', channel: null };
        }

        const _Message = `Your BimaSathi Dashboard login code is: ${_Code}. Do not share this with anyone.`;

        const _Auth = Buffer.from(`${_Account_Sid}:${_Auth_Token}`).toString('base64');
        const _Response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${_Account_Sid}/Messages.json`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${_Auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                To: _To_Number,
                From: _From_Number,
                Body: _Message
            })
        });

        if (!_Response.ok) {
            const _Error_Data = await _Response.json().catch(async () => ({ message: await _Response.text() }));
            await _Clear_OTP(_Clean);
            console.error('Twilio SMS Failed:', _Error_Data);
            return {
                success: false,
                error: _Extract_Twilio_Error(_Error_Data),
                channel: _Is_WhatsApp_Channel(_From_Number) ? 'whatsapp' : 'sms',
            };
        }

        return {
            success: true,
            channel: _Is_WhatsApp_Channel(_From_Number) ? 'whatsapp' : 'sms',
        };
    } catch (_Err) {
        await _Clear_OTP(_Phone_Number);
        console.error('Error sending SMS:', _Err);
        return {
            success: false,
            error: _Err.message || 'OTP send failed',
            channel: _Is_WhatsApp_Channel(process.env.TWILIO_PHONE_NUMBER) ? 'whatsapp' : 'sms',
        };
    }
}

/**
 * Verifies the OTP stored in memory cache
 */
async function _Verify_OTP(_Phone_Number, _Code) {
    const _Clean = _Format_Phone(_Phone_Number);
    const _User = await _DB._Get_User(_Clean);

    if (_User && _User.otp === _Code.trim()) {
        const _Expiry = new Date(_User.otpExpiry);
        if (_Expiry > new Date()) {
            // Valid OTP, consume it
            await _DB._Update_User(_Clean, { otp: null, otpExpiry: null });
            return true;
        }
    }

    return false;
}

module.exports = {
    _Send_OTP,
    _Verify_OTP,
    _Format_Phone
};
