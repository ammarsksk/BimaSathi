const rewire = require('rewire');
const index = rewire('./src/lambdas/photo-processor/index.js');
const { _Download_Media } = require('./src/shared/whatsapp.js');

const _Process_Photo = index.__get__('_Process_Photo');

async function debugDownload() {
    try {
        index.__set__('_S3_Helper', {
            _Upload_Photo: async () => 's3-key',
            _Compute_SHA256: () => 'hash123',
            _Upload_Photo_Metadata: async () => true
        });
        index.__set__('_DB', { _Log_Audit: async () => true });
        index.__set__('_Rekognition_Client', {
            send: async () => ({ Labels: [{ Name: 'Flood', Confidence: 99 }], ModerationLabels: [] })
        });

        // This time we actually use _Download_Media to see if Twilio fetching fails
        const res = await _Process_Photo({ id: "https://hub.dummyapis.com/Image?text=Mock&height=640&width=480" }, "CLM-123", { claimData: { gpsCoords: { lat: 0, lng: 0 }, lossDate: "2026-03-05" }, photoCount: 0 }, "en");
        console.log("RESULT:", res);
    } catch (e) {
        console.error("FATAL BUBBLE:", e.stack);
    }
}
debugDownload();
