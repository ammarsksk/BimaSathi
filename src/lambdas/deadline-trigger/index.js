/**
 * BimaSathi — Deadline Trigger Lambda
 * 
 * EventBridge-triggered every hour. Scans the deadlines table for:
 *   - Approaching deadlines (48h, 24h, 6h, 1h) → sends WhatsApp reminders
 *   - Overdue claims → marks as LATE_RISK, sends urgent warning
 * 
 * Each reminder is sent once per interval (tracked in remindersSent array).
 */

const _DB = require('../../shared/dynamodb');
const { _Send_Text_Message } = require('../../shared/twilio');
const { _Get_Template, _Fill_Template, _Template_Keys } = require('../../shared/languages');
const { _Deadline_Config } = require('../../shared/constants');


exports.handler = async (_Event) => {
    console.log('Deadline trigger invoked');

    try {
        const _Deadlines = await _DB._Get_Upcoming_Deadlines(48);
        console.log(`Found ${_Deadlines.length} upcoming deadlines`);

        for (const _Deadline of _Deadlines) {
            await _Process_Single_Deadline(_Deadline);
        }

        return { statusCode: 200, body: JSON.stringify({ processed: _Deadlines.length }) };
    } catch (_Error) {
        console.error('Deadline trigger error:', _Error);
        throw _Error;
    }
};


/**
 * Process a single deadline entry:
 *   - Determine which reminder interval applies
 *   - Send reminder if not already sent at this interval
 *   - Handle overdue state
 */
async function _Process_Single_Deadline(_Deadline) {
    const _Now = new Date();
    const _Deadline_Date = new Date(_Deadline.deadline);
    const _Hours_Remaining = (_Deadline_Date - _Now) / (1000 * 60 * 60);
    const _Reminders_Sent = _Deadline.remindersSent || [];

    // ── Send scheduled reminders ──
    for (const _Interval of _Deadline_Config.REMINDER_INTERVALS) {
        const _Reminder_Key = `${_Interval}h`;

        if (_Hours_Remaining <= _Interval && !_Reminders_Sent.includes(_Reminder_Key)) {
            await _Send_Reminder(_Deadline, _Hours_Remaining, _Interval);

            _Reminders_Sent.push(_Reminder_Key);
            await _DB._Update_Deadline(_Deadline.claimId, _Deadline.deadline, { remindersSent: _Reminders_Sent });

            await _DB._Log_Audit({
                claimId: _Deadline.claimId,
                actor: 'system',
                action: `deadline_reminder_${_Reminder_Key}`,
                metadata: { hoursRemaining: Math.round(_Hours_Remaining) },
            });

            break;  // only send one reminder per trigger cycle
        }
    }

    // ── Handle overdue claims ──
    if (_Hours_Remaining < 0 && _Deadline.status === 'active') {
        await _Handle_Overdue(_Deadline);
    }
}


/**
 * Send a deadline reminder via WhatsApp to farmer (and helper if linked)
 */
async function _Send_Reminder(_Deadline, _Hours_Remaining, _Interval) {
    const _User = await _DB._Get_User(_Deadline.farmerId?.replace('whatsapp:', '') || _Deadline.farmerId);
    const _Language = _User?.language || 'hi';

    // Format remaining time naturally
    const _Remaining_Text = _Format_Remaining_Time(_Hours_Remaining, _Language);

    // Build message from template
    const _Template = _Get_Template(_Template_Keys.deadline_reminder, _Language);
    const _Message = _Fill_Template(_Template, {
        claim_id: _Deadline.claimId,
        remaining: _Remaining_Text,
    });

    // Add urgency prefix for close deadlines
    const _Urgency_Prefix = _Hours_Remaining <= 1 ? '🚨 URGENT: '
        : _Hours_Remaining <= 6 ? '⚠️ '
            : '';

    const _Full_Message = _Urgency_Prefix + _Message;

    // Send to farmer
    const _Farmer_Phone = _Deadline.farmerId.startsWith('+')
        ? _Deadline.farmerId
        : `+91${_Deadline.farmerId}`;

    try {
        await _Send_Text_Message(_Farmer_Phone, _Full_Message);
        console.log(`Reminder sent to farmer ${_Farmer_Phone} for claim ${_Deadline.claimId}`);
    } catch (_Err) {
        console.error(`Farmer reminder failed for ${_Deadline.claimId}:`, _Err.message);
    }

    // Send to helper if linked
    if (_Deadline.helperPhone) {
        try {
            await _Send_Text_Message(_Deadline.helperPhone, _Full_Message);
        } catch (_Err) {
            console.error(`Helper reminder failed:`, _Err.message);
        }
    }
}


/**
 * Mark a claim as overdue and send final warning
 */
async function _Handle_Overdue(_Deadline) {
    await _DB._Update_Deadline(_Deadline.claimId, _Deadline.deadline, { status: 'overdue' });

    const _User = await _DB._Get_User(_Deadline.farmerId?.replace('whatsapp:', '') || _Deadline.farmerId);
    const _Language = _User?.language || 'hi';

    const _Overdue_Message = _Language === 'hi'
        ? `⚠️ Aapki claim ${_Deadline.claimId} ki deadline nikal gayi hai. Jaldi submit karein — late submission se reject ho sakti hai.`
        : `⚠️ Your claim ${_Deadline.claimId} deadline has passed. Please submit ASAP — late submissions may be rejected.`;

    const _Phone = _Deadline.farmerId.startsWith('+') ? _Deadline.farmerId : `+91${_Deadline.farmerId}`;

    try {
        await _Send_Text_Message(_Phone, _Overdue_Message);
    } catch (_Err) {
        console.error(`Overdue warning failed for ${_Deadline.claimId}:`, _Err.message);
    }

    await _DB._Log_Audit({
        claimId: _Deadline.claimId,
        actor: 'system',
        action: 'deadline_overdue',
        metadata: { deadline: _Deadline.deadline },
    });

    console.log(`Claim ${_Deadline.claimId} marked OVERDUE`);
}


/**
 * Format remaining time in a human-readable way
 */
function _Format_Remaining_Time(_Hours, _Language) {
    if (_Hours < 1) return _Language === 'hi' ? '1 ghante se kam' : 'less than 1 hour';
    if (_Hours < 24) {
        const _H = Math.round(_Hours);
        return _Language === 'hi' ? `${_H} ghante` : `${_H} hours`;
    }
    const _Days = Math.round(_Hours / 24);
    return _Language === 'hi' ? `${_Days} din` : `${_Days} days`;
}
