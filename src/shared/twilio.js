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

/**
 * Sends a 4-digit numeric OTP via Twilio Programmable SMS
 */
async function _Send_OTP(_Phone_Number) {
    const _Account_Sid = process.env.TWILIO_ACCOUNT_SID;
    const _Auth_Token = process.env.TWILIO_AUTH_TOKEN;
    const _From_Number = process.env.TWILIO_PHONE_NUMBER;

    try {
        const _Clean = _Format_Phone(_Phone_Number);

        // Generate random 6 digit code
        const _Code = Math.floor(100000 + Math.random() * 900000).toString();

        // Save OTP to DynamoDB to persist across Lambda invocations
        let _User = await _DB._Get_User(_Clean);
        if (!_User) {
            _User = await _DB._Create_User({ phoneNumber: _Clean, language: 'en', role: 'operator' });
        }
        await _DB._Update_User(_Clean, { otp: _Code, otpExpiry: new Date(Date.now() + 10 * 60000).toISOString() });

        if (!_Account_Sid || !_Auth_Token || !_From_Number) {
            console.error('Twilio credentials missing. Skipping REAL SMS send.');
            console.log(`[MOCK SMS] OTP for ${_Clean}: ${_Code}`);
            return true;
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
                To: _Clean,
                From: _From_Number,
                Body: _Message
            })
        });

        if (!_Response.ok) {
            const _Error_Data = await _Response.json();
            console.error('Twilio SMS Failed:', _Error_Data);
            return false;
        }

        return true;
    } catch (_Err) {
        console.error('Error sending SMS:', _Err);
        return false;
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
