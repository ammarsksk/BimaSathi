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
const { _Send_Text_Message } = require('../../shared/whatsapp');
const { _Get_Template, _Fill_Template, _Template_Keys } = require('../../shared/languages');
const { _Deadline_Config, _Claim_Status } = require('../../shared/constants');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const _Lambda_Client = new LambdaClient({ region: process.env.AWS_REGION || 'ap-south-1' });


exports.handler = async (_Event) => {
    console.log('Deadline trigger invoked');

    try {
        // ── Original: Deadline reminders ──
        const _Deadlines = await _DB._Get_Upcoming_Deadlines(48);
        console.log(`Found ${_Deadlines.length} upcoming deadlines`);

        for (const _Deadline of _Deadlines) {
            await _Process_Single_Deadline(_Deadline);
        }

        // ── Agent 6 Enhancement: Stalled claim re-engagement ──
        await _Check_Stalled_Claims();

        // ── Agent 6 Enhancement: 5-day insurer acknowledgement check ──
        await _Check_Unacknowledged_Submissions();

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


// ═════════════════════════════════════════════════════════════
//  AGENT 6 ENHANCEMENTS — Stalled Claims & Acknowledgement Check
// ═════════════════════════════════════════════════════════════

/**
 * Re-engage farmers whose claims have had pending fields for > 24 hours
 */
async function _Check_Stalled_Claims() {
    try {
        const _Draft_Claims = await _DB._Get_Claims_By_Status(_Claim_Status.DRAFT);
        const _Now = new Date();
        let _Stalled_Count = 0;

        for (const _Claim of _Draft_Claims) {
            const _Last_Updated = new Date(_Claim.lastUpdated);
            const _Hours_Since = (_Now - _Last_Updated) / (1000 * 60 * 60);

            // Only re-engage if stalled for > 24 hours and has a form schema with pending fields
            if (_Hours_Since > 24 && _Claim.formSchema) {
                const _Pending = _Claim.formSchema.filter(_F => _F.status === 'pending' && _F.field_type !== 'photo');
                if (_Pending.length === 0) continue;

                const _User = await _DB._Get_User(_Claim.phoneNumber?.replace('whatsapp:', '') || '');
                const _Language = _User?.language || 'hi';
                const _Next_Field = _Pending[0];

                const _Nudge = _Language === 'en'
                    ? `👋 Hi! Your claim ${_Claim.claimId} is still incomplete.\n\nWe still need ${_Pending.length} more details. The next one is: ${_Next_Field.field_label}.\n\nReply here to continue, or type "menu" for options.`
                    : `👋 Namaste! Aapki claim ${_Claim.claimId} abhi adhuri hai.\n\nAbhi ${_Pending.length} aur details chahiye. Agla: ${_Next_Field.language_hint || _Next_Field.field_label}.\n\nYahan reply karein continue karne ke liye, ya "menu" type karein.`;

                const _Phone = _Claim.phoneNumber?.startsWith('+') ? _Claim.phoneNumber : `+91${_Claim.phoneNumber}`;

                try {
                    await _Send_Text_Message(_Phone, _Nudge);
                    _Stalled_Count++;
                    console.log(`Stalled re-engagement sent for ${_Claim.claimId}`);
                } catch (_Err) {
                    console.error(`Stalled nudge failed for ${_Claim.claimId}:`, _Err.message);
                }
            }
        }

        if (_Stalled_Count > 0) {
            console.log(`Re-engaged ${_Stalled_Count} stalled claims`);
        }
    } catch (_Err) {
        console.error('Stalled claims check failed:', _Err.message);
    }
}


/**
 * Check if submitted claims have been acknowledged within 5 days.
 * If not, auto-generate a follow-up appeal draft and notify the farmer.
 */
async function _Check_Unacknowledged_Submissions() {
    try {
        const _Submitted = await _DB._Get_Claims_By_Status(_Claim_Status.SUBMITTED);
        const _Now = new Date();
        const _Five_Days_Ms = 5 * 24 * 60 * 60 * 1000;
        let _Follow_Up_Count = 0;

        for (const _Claim of _Submitted) {
            const _Submitted_At = new Date(_Claim.lastUpdated);
            const _Ms_Since = _Now - _Submitted_At;

            if (_Ms_Since > _Five_Days_Ms) {
                const _User = await _DB._Get_User(_Claim.phoneNumber?.replace('whatsapp:', '') || '');
                const _Language = _User?.language || 'hi';

                // Generate auto-follow-up via appeal generator
                try {
                    await _Lambda_Client.send(new InvokeCommand({
                        FunctionName: process.env.APPEAL_GENERATOR_FUNCTION || 'bimasathi-appeal-generator',
                        InvocationType: 'Event',  // async
                        Payload: Buffer.from(JSON.stringify({
                            claimId: _Claim.claimId,
                            claimData: _Claim,
                            isFollowUp: true,
                        })),
                    }));

                    const _Follow_Up_Msg = _Language === 'en'
                        ? `📝 Your claim ${_Claim.claimId} was submitted ${Math.round(_Ms_Since / (24 * 60 * 60 * 1000))} days ago but hasn't been acknowledged yet.\n\nWe're generating a follow-up letter for you. You'll receive a download link shortly.`
                        : `📝 Aapki claim ${_Claim.claimId} ${Math.round(_Ms_Since / (24 * 60 * 60 * 1000))} din pehle submit hui thi lekin abhi tak acknowledgement nahi mili.\n\nHum follow-up letter bana rahe hain. Jaldi download link milega.`;

                    const _Phone = _Claim.phoneNumber?.startsWith('+') ? _Claim.phoneNumber : `+91${_Claim.phoneNumber}`;
                    await _Send_Text_Message(_Phone, _Follow_Up_Msg);
                    _Follow_Up_Count++;

                    await _DB._Log_Audit({
                        claimId: _Claim.claimId,
                        actor: 'system',
                        action: 'auto_follow_up_generated',
                        metadata: { daysSinceSubmission: Math.round(_Ms_Since / (24 * 60 * 60 * 1000)) },
                    });

                    console.log(`Follow-up generated for ${_Claim.claimId}`);
                } catch (_Err) {
                    console.error(`Follow-up failed for ${_Claim.claimId}:`, _Err.message);
                }
            }
        }

        if (_Follow_Up_Count > 0) {
            console.log(`Generated ${_Follow_Up_Count} follow-up letters`);
        }
    } catch (_Err) {
        console.error('Unacknowledged submissions check failed:', _Err.message);
    }
}
