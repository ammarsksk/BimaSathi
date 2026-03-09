/**
 * BimaSathi - Voice Processor Lambda
 *
 * This Lambda supports speech-to-text for WhatsApp voice notes.
 * Outbound voice replies are intentionally not wired into the chatbot flow.
 */

const { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID: _Generate_UUID } = require('crypto');

const { _Download_Media } = require('../../shared/whatsapp');
const { _Get_Language_Config } = require('../../shared/languages');
const _S3_Helper = require('../../shared/s3');

const _Primary_Region = process.env.AWS_REGION || process.env.AWS_REGION_NAME || 'ap-south-1';
const _Transcribe_Region = process.env.TRANSCRIBE_REGION === _Primary_Region
    ? process.env.TRANSCRIBE_REGION
    : _Primary_Region;
const _Polly_Region = process.env.POLLY_REGION === _Primary_Region
    ? process.env.POLLY_REGION
    : _Primary_Region;
const _Bucket = process.env.EVIDENCE_BUCKET || 'bimasathi-evidence';

const _Transcribe_Client = new TranscribeClient({ region: _Transcribe_Region });
const _Polly_Client = new PollyClient({ region: _Polly_Region });
const _S3_Client = new S3Client({ region: _Primary_Region });


exports.handler = async (_Event) => {
    const { mediaData, language, claimId } = _Event || {};
    const _Result = await _Process_Voice(mediaData, language, claimId);
    return {
        statusCode: _Result.ok ? 200 : 422,
        body: JSON.stringify(_Result),
    };
};


/**
 * Full voice processing pipeline:
 *   1. Download media from Meta
 *   2. Upload to S3 (temp folder + claim folder)
 *   3. Start Amazon Transcribe job
 *   4. Poll for completion
 *   5. Parse and return transcription text
 */
async function _Process_Voice(_Media_Data, _Language = 'hi', _Claim_Id = null) {
    const _Job_Id = `bms-${_Generate_UUID().slice(0, 8)}`;
    const _Lang_Config = _Get_Language_Config(_Language);

    try {
        if (!_Media_Data?.id) {
            return _Voice_Result({
                ok: false,
                errorCode: 'VOICE_MEDIA_ID_MISSING',
                errorMessage: 'Voice note metadata did not include a media ID.',
                requestedLanguage: _Language,
            });
        }

        const _Download = await _Download_Media(_Media_Data.id);
        const _Audio_Buffer = _Download.buffer;
        const _Content_Type = _Download.contentType || '';

        if (!_Audio_Buffer) {
            return _Voice_Result({
                ok: false,
                errorCode: _Download.error || 'VOICE_MEDIA_DOWNLOAD_FAILED',
                errorMessage: 'The voice note could not be downloaded from Meta.',
                requestedLanguage: _Language,
                contentType: _Content_Type,
            });
        }

        const _Media_Format = _Resolve_Audio_Format(_Content_Type);
        if (!_Media_Format) {
            return _Voice_Result({
                ok: false,
                errorCode: 'VOICE_UNSUPPORTED_FORMAT',
                errorMessage: `Unsupported audio content type: ${_Content_Type || 'unknown'}`,
                requestedLanguage: _Language,
                contentType: _Content_Type,
            });
        }

        console.log(`Downloaded voice note: bytes=${_Audio_Buffer.length}, type=${_Content_Type}, format=${_Media_Format}`);

        const _Temp_Key = `temp/audio/${_Job_Id}.${_Media_Format}`;
        await _S3_Client.send(new PutObjectCommand({
            Bucket: _Bucket,
            Key: _Temp_Key,
            Body: _Audio_Buffer,
            ContentType: _Content_Type || 'audio/ogg',
        }));

        if (_Claim_Id) {
            const _Audio_Index = Date.now() % 1000;
            await _S3_Helper._Upload_Audio(_Claim_Id, _Audio_Index, _Audio_Buffer, _Content_Type || 'audio/ogg');
        }

        const _S3_Uri = `s3://${_Bucket}/${_Temp_Key}`;
        const _Language_Attempts = _Build_Language_Attempts(_Language, _Lang_Config._Transcribe_Code);
        const _Attempt_Errors = [];

        for (let _Index = 0; _Index < _Language_Attempts.length; _Index++) {
            const _Language_Code = _Language_Attempts[_Index];
            const _Attempt_Job_Id = `${_Job_Id}-${_Index + 1}`;

            try {
                await _Transcribe_Client.send(new StartTranscriptionJobCommand({
                    TranscriptionJobName: _Attempt_Job_Id,
                    Media: { MediaFileUri: _S3_Uri },
                    MediaFormat: _Media_Format,
                    LanguageCode: _Language_Code,
                    OutputBucketName: _Bucket,
                    OutputKey: `temp/transcriptions/${_Attempt_Job_Id}.json`,
                }));

                const _Attempt_Result = await _Await_Transcription_Result(_Attempt_Job_Id);
                if (_Attempt_Result.ok && _Attempt_Result.transcription) {
                    console.log(`Voice transcription (${_Language_Code}): "${_Attempt_Result.transcription.substring(0, 200)}"`);
                    return _Voice_Result({
                        ok: true,
                        transcription: _Attempt_Result.transcription,
                        requestedLanguage: _Language,
                        transcribeLanguage: _Language_Code,
                        contentType: _Content_Type,
                        mediaFormat: _Media_Format,
                    });
                }

                _Attempt_Errors.push(`${_Language_Code}:${_Attempt_Result.errorCode || 'VOICE_TRANSCRIPTION_EMPTY'}`);
            } catch (_Attempt_Error) {
                console.error(`Voice transcription attempt failed (${_Language_Code}):`, _Attempt_Error);
                _Attempt_Errors.push(`${_Language_Code}:${_Attempt_Error.name || 'VOICE_TRANSCRIPTION_FAILED'}`);
            }
        }

        return _Voice_Result({
            ok: false,
            errorCode: 'VOICE_TRANSCRIPTION_UNAVAILABLE',
            errorMessage: `Speech-to-text failed for all language attempts (${_Attempt_Errors.join(', ')})`,
            requestedLanguage: _Language,
            contentType: _Content_Type,
            mediaFormat: _Media_Format,
        });
    } catch (_Error) {
        console.error('Voice processing error:', _Error);
        return _Voice_Result({
            ok: false,
            errorCode: 'VOICE_PROCESSING_EXCEPTION',
            errorMessage: _Error.message,
            requestedLanguage: _Language,
        });
    }
}


/**
 * Generate an audio response using Amazon Polly.
 * This helper is retained for future use but is not wired into the chatbot flow.
 */
async function _Generate_Audio_Response(_Text, _Language = 'hi', _Claim_Id = null) {
    const _Lang_Config = _Get_Language_Config(_Language);

    try {
        const _Polly_Result = await _Polly_Client.send(new SynthesizeSpeechCommand({
            Text: _Text,
            OutputFormat: 'mp3',
            VoiceId: _Lang_Config._Polly_Voice_Id,
            Engine: _Lang_Config._Polly_Engine || 'neural',
            LanguageCode: _Lang_Config._Transcribe_Code,
        }));

        const _Chunks = [];
        for await (const _Chunk of _Polly_Result.AudioStream) {
            _Chunks.push(_Chunk);
        }
        const _Audio_Buffer = Buffer.concat(_Chunks);

        const _Folder = _Claim_Id || 'responses';
        const _S3_Key = await _S3_Helper._Upload_Polly_Audio(_Folder, _Audio_Buffer);
        const _Presigned_URL = await _S3_Helper._Get_Presigned_URL(_S3_Key, 3600);

        return {
            s3Key: _S3_Key,
            presignedUrl: _Presigned_URL,
            audioBuffer: _Audio_Buffer,
        };
    } catch (_Error) {
        console.error('Polly generation error:', _Error);
        return null;
    }
}


async function _Await_Transcription_Result(_Job_Id) {
    for (let _Attempt = 0; _Attempt < 12; _Attempt++) {
        await _Sleep(2000);

        const _Job_Status = await _Transcribe_Client.send(new GetTranscriptionJobCommand({
            TranscriptionJobName: _Job_Id,
        }));

        const _Status = _Job_Status.TranscriptionJob?.TranscriptionJobStatus;
        if (_Status === 'COMPLETED') {
            const _Result_Key = `temp/transcriptions/${_Job_Id}.json`;
            const _Result_Buffer = await _S3_Helper._Get_Object(_Result_Key);
            const _Result = JSON.parse(_Result_Buffer.toString());
            const _Transcript = (_Result.results?.transcripts?.[0]?.transcript || '').trim();

            if (_Transcript) {
                return { ok: true, transcription: _Transcript };
            }

            return {
                ok: false,
                errorCode: 'VOICE_TRANSCRIPTION_EMPTY',
                errorMessage: 'Transcribe completed but returned an empty transcript.',
            };
        }

        if (_Status === 'FAILED') {
            return {
                ok: false,
                errorCode: 'VOICE_TRANSCRIPTION_FAILED',
                errorMessage: _Job_Status.TranscriptionJob?.FailureReason || 'Transcription job failed.',
            };
        }
    }

    return {
        ok: false,
        errorCode: 'VOICE_TRANSCRIPTION_TIMEOUT',
        errorMessage: 'Timed out waiting for the transcription job to finish.',
    };
}

function _Resolve_Audio_Format(_Content_Type = '') {
    const _Type = String(_Content_Type || '').toLowerCase().split(';')[0].trim();
    const _Map = {
        'audio/ogg': 'ogg',
        'audio/oga': 'ogg',
        'audio/opus': 'ogg',
        'audio/webm': 'webm',
        'video/webm': 'webm',
        'audio/mpeg': 'mp3',
        'audio/mp3': 'mp3',
        'audio/wav': 'wav',
        'audio/x-wav': 'wav',
        'audio/mp4': 'mp4',
        'video/mp4': 'mp4',
        'audio/aac': 'mp4',
        'audio/amr': 'amr',
        'audio/flac': 'flac',
    };
    return _Map[_Type] || null;
}

function _Build_Language_Attempts(_Language, _Primary_Code) {
    const _Attempts = [];
    const _Push = (_Code) => {
        if (_Code && !_Attempts.includes(_Code)) _Attempts.push(_Code);
    };

    _Push(_Primary_Code);
    if (_Language !== 'hi') _Push('hi-IN');
    if (_Language !== 'en') _Push('en-IN');

    return _Attempts.slice(0, 3);
}

function _Voice_Result(_Value = {}) {
    return {
        ok: Boolean(_Value.ok),
        transcription: _Value.transcription || '',
        requestedLanguage: _Value.requestedLanguage || 'hi',
        transcribeLanguage: _Value.transcribeLanguage || null,
        contentType: _Value.contentType || '',
        mediaFormat: _Value.mediaFormat || null,
        errorCode: _Value.errorCode || null,
        errorMessage: _Value.errorMessage || null,
    };
}

function _Sleep(_Ms) {
    return new Promise((_Resolve) => setTimeout(_Resolve, _Ms));
}


module.exports = {
    handler: exports.handler,
    _Process_Voice,
    _Generate_Audio_Response,
};
