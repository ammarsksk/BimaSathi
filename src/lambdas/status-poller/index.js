/**
 * BimaSathi — Status Poller Lambda
 * 
 * EventBridge-triggered every 24 hours.
 * Polls insurer APIs for claim status updates.
 * When status changes: updates DynamoDB and notifies farmer via WhatsApp.
 */

const _DB = require('../../shared/dynamodb');
const { _Send_Text_Message } = require('../../shared/whatsapp');
const { _Claim_Status } = require('../../shared/constants');


exports.handler = async (_Event) => {
    console.log('Status poller invoked');

    try {
        // Fetch all active claims (submitted, acknowledged, under review)
        const _Submitted = await _DB._Get_Claims_By_Status(_Claim_Status.SUBMITTED);
        const _Acknowledged = await _DB._Get_Claims_By_Status(_Claim_Status.ACKNOWLEDGED);
        const _Under_Review = await _DB._Get_Claims_By_Status(_Claim_Status.UNDER_REVIEW);
        const _All_Active = [..._Submitted, ..._Acknowledged, ..._Under_Review];

        console.log(`Polling ${_All_Active.length} active claims`);

        let _Updated_Count = 0;
        for (const _Claim of _All_Active) {
            const _New_Status = await _Poll_Insurer_Status(_Claim);

            if (_New_Status && _New_Status !== _Claim.status) {
                await _DB._Update_Claim(_Claim.claimId, _Claim.userId, { status: _New_Status });
                await _Notify_Status_Change(_Claim, _New_Status);
                await _DB._Log_Audit({
                    claimId: _Claim.claimId,
                    actor: 'system',
                    action: 'status_updated',
                    metadata: { oldStatus: _Claim.status, newStatus: _New_Status },
                });
                _Updated_Count++;
            }
        }

        return { statusCode: 200, body: JSON.stringify({ polled: _All_Active.length, updated: _Updated_Count }) };
    } catch (_Error) {
        console.error('Status poller error:', _Error);
        throw _Error;
    }
};


/**
 * Poll insurer API for current claim status.
 * In production: replace with actual insurer API call.
 * For hackathon: simulate time-based status progression.
 *
 * @param {Object} _Claim — claim record
 * @returns {string|null} New status or null if unchanged
 */
async function _Poll_Insurer_Status(_Claim) {
    try {
        const _Submitted_At = new Date(_Claim.submittedAt || _Claim.createdAt);
        const _Days_Elapsed = (Date.now() - _Submitted_At) / (1000 * 60 * 60 * 24);

        // Simulated progression timeline
        if (_Claim.status === _Claim_Status.SUBMITTED && _Days_Elapsed > 2) {
            return _Claim_Status.ACKNOWLEDGED;
        }
        if (_Claim.status === _Claim_Status.ACKNOWLEDGED && _Days_Elapsed > 5) {
            return _Claim_Status.UNDER_REVIEW;
        }
        if (_Claim.status === _Claim_Status.UNDER_REVIEW && _Days_Elapsed > 10) {
            return _Claim_Status.SURVEY_SCHEDULED;
        }

        return null;
    } catch (_Err) {
        console.error(`Poll failed for ${_Claim.claimId}:`, _Err.message);
        return null;
    }
}


/**
 * Send a WhatsApp notification to the farmer about a status change
 */
async function _Notify_Status_Change(_Claim, _New_Status) {
    const _User = await _DB._Get_User(_Claim.phoneNumber || _Claim.userId);
    const _Language = _User?.language || 'hi';
    const _Phone = _Claim.phoneNumber || _Claim.userId;

    const _Message = _Build_Status_Message(_Claim.claimId, _New_Status, _Language);
    if (!_Message) return;

    const _Formatted_Phone = _Phone.startsWith('+') ? _Phone : `+91${_Phone}`;

    try {
        await _Send_Text_Message(_Formatted_Phone, _Message);
    } catch (_Err) {
        console.error(`Status notification failed for ${_Claim.claimId}:`, _Err.message);
    }
}


/**
 * Build a status-specific notification message
 */
function _Build_Status_Message(_Claim_Id, _Status, _Language) {
    const _Is_Hindi = _Language !== 'en';

    const _Messages = {
        [_Claim_Status.ACKNOWLEDGED]: _Is_Hindi
            ? `✅ Insurance company ne aapki claim ${_Claim_Id} accept kar li hai. 7 din mein surveyor aayega.`
            : `✅ Your claim ${_Claim_Id} has been acknowledged. Surveyor visit within 7 days.`,

        [_Claim_Status.UNDER_REVIEW]: _Is_Hindi
            ? `📋 Aapki claim ${_Claim_Id} review mein hai. Jald hi update milega.`
            : `📋 Your claim ${_Claim_Id} is under review. Update coming soon.`,

        [_Claim_Status.SURVEY_SCHEDULED]: _Is_Hindi
            ? `📍 Aapki claim ${_Claim_Id} ke liye field survey schedule ho gaya hai.`
            : `📍 A field survey has been scheduled for claim ${_Claim_Id}.`,

        [_Claim_Status.APPROVED]: _Is_Hindi
            ? `🎉 Badhaai ho! Claim ${_Claim_Id} approve ho gayi! Paise jald aayenge.`
            : `🎉 Congratulations! Claim ${_Claim_Id} approved! Payment on its way.`,

        [_Claim_Status.REJECTED]: _Is_Hindi
            ? `⚠️ Claim ${_Claim_Id} reject ho gayi. Appeal karna chahte hain? "Haan" bolein.`
            : `⚠️ Claim ${_Claim_Id} rejected. Would you like to appeal? Say "Yes".`,

        [_Claim_Status.PAID]: _Is_Hindi
            ? `💰 Claim ${_Claim_Id} ka paisa aapke account mein aa gaya hai!`
            : `💰 Payment for claim ${_Claim_Id} has been deposited!`,
    };

    return _Messages[_Status] || null;
}
