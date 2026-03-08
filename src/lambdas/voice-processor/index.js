/**
 * BimaSathi — Voice Processor Lambda
 * 
 * Pipeline: Download OGG → Upload to S3 → Amazon Transcribe STT → Return text
 * Also generates TTS audio responses via Amazon Polly.
 */

const { TranscribeClient, StartTranscriptionJobCommand,
    GetTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { randomUUID: _Generate_UUID } = require('crypto');
const { _Download_Media } = require('../../shared/whatsapp');
const { _Get_Language_Config } = require('../../shared/languages');
const _S3_Helper = require('../../shared/s3');

const _Transcribe_Client = new TranscribeClient({ region: process.env.TRANSCRIBE_REGION || 'ap-south-1' });
const _Polly_Client = new PollyClient({ region: process.env.POLLY_REGION || 'ap-south-1' });
const _S3_Client = new S3Client({ region: process.env.AWS_REGION || 'ap-south-1' });
const _Bucket = process.env.EVIDENCE_BUCKET || 'bimasathi-evidence';


exports.handler = async (_Event) => {
    const { mediaData, language, claimId } = _Event;
    const _Transcription = await _Process_Voice(mediaData, language, claimId);
    return { statusCode: 200, body: JSON.stringify({ transcription: _Transcription }) };
};


/**
 * Full voice processing pipeline:
 *   1. Download audio from Twilio URL
 *   2. Upload to S3 (temp folder + claim folder)
 *   3. Start Amazon Transcribe job
 *   4. Poll for completion (max 60s)
 *   5. Parse and return transcription text
 *
 * @param {Object} _Media_Data — { url: string }
 * @param {string} _Language — 2-letter language code
 * @param {string} _Claim_Id — parent claim (optional)
 * @returns {string} Transcribed text
 */
async function _Process_Voice(_Media_Data, _Language = 'hi', _Claim_Id = null) {
    const _Job_Id = `bms-${_Generate_UUID().slice(0, 8)}`;
    const _Lang_Config = _Get_Language_Config(_Language);

    try {
        // Step 1: Download audio from Twilio
        const { buffer: _Audio_Buffer, contentType: _Content_Type } = await _Download_Media(_Media_Data.id);
        console.log(`Downloaded audio: ${_Audio_Buffer.length} bytes, type: ${_Content_Type}`);

        // Step 2: Upload to S3 temp folder for Transcribe
        const _Temp_Key = `temp/audio/${_Job_Id}.ogg`;
        await _S3_Client.send(new PutObjectCommand({
            Bucket: _Bucket,
            Key: _Temp_Key,
            Body: _Audio_Buffer,
            ContentType: _Content_Type || 'audio/ogg',
        }));

        // Also archive under the claim if available
        if (_Claim_Id) {
            const _Audio_Index = Date.now() % 1000;
            await _S3_Helper._Upload_Audio(_Claim_Id, _Audio_Index, _Audio_Buffer, _Content_Type);
        }

        // Step 3: Start Transcribe job
        const _S3_Uri = `s3://${_Bucket}/${_Temp_Key}`;
        await _Transcribe_Client.send(new StartTranscriptionJobCommand({
            TranscriptionJobName: _Job_Id,
            Media: { MediaFileUri: _S3_Uri },
            MediaFormat: 'ogg',
            LanguageCode: _Lang_Config._Transcribe_Code,
            OutputBucketName: _Bucket,
            OutputKey: `temp/transcriptions/${_Job_Id}.json`,
        }));

        // Step 4: Poll for completion (30 iterations × 2s = 60s max)
        let _Transcription = '';
        for (let _Attempt = 0; _Attempt < 30; _Attempt++) {
            await _Sleep(2000);

            const _Job_Status = await _Transcribe_Client.send(new GetTranscriptionJobCommand({
                TranscriptionJobName: _Job_Id,
            }));

            const _Status = _Job_Status.TranscriptionJob.TranscriptionJobStatus;

            if (_Status === 'COMPLETED') {
                const _Result_Key = `temp/transcriptions/${_Job_Id}.json`;
                const _Result_Buffer = await _S3_Helper._Get_Object(_Result_Key);
                const _Result = JSON.parse(_Result_Buffer.toString());
                _Transcription = _Result.results?.transcripts?.[0]?.transcript || '';
                break;
            }

            if (_Status === 'FAILED') {
                console.error('Transcription failed:', _Job_Status.TranscriptionJob.FailureReason);
                break;
            }
        }

        console.log(`Transcription result: "${_Transcription.substring(0, 200)}"`);
        return _Transcription;

    } catch (_Error) {
        console.error('Voice processing error:', _Error);
        return '';
    }
}


/**
 * Generate an audio response using Amazon Polly
 * @param {string} _Text — text to convert to speech
 * @param {string} _Language — 2-letter language code
 * @param {string} _Claim_Id — parent claim (optional, for archiving)
 * @returns {{ s3Key: string, presignedUrl: string, audioBuffer: Buffer } | null}
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

        // Collect the audio stream into a buffer
        const _Chunks = [];
        for await (const _Chunk of _Polly_Result.AudioStream) {
            _Chunks.push(_Chunk);
        }
        const _Audio_Buffer = Buffer.concat(_Chunks);

        // Upload to S3
        const _Folder = _Claim_Id || 'responses';
        const _S3_Key = await _S3_Helper._Upload_Polly_Audio(_Folder, _Audio_Buffer);

        // Generate pre-signed URL (1 hour)
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


function _Sleep(_Ms) {
    return new Promise(_Resolve => setTimeout(_Resolve, _Ms));
}


module.exports = {
    handler: exports.handler,
    _Process_Voice,
    _Generate_Audio_Response,
};
