const readline = require('readline');
const path = require('path');
const fs = require('fs');

// Create an interactive terminal interface
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[32mYou:\x1b[0m '
});

// Configure process environment variables for local testing
process.env.AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
process.env.BEDROCK_REGION = process.env.BEDROCK_REGION || 'us-east-1';
process.env.DOCUMENT_INTAKE_FUNCTION = 'bimasathi-document-intake';
process.env.PHOTO_PROCESSOR_FUNCTION = 'bimasathi-photo-processor';

// We need a stable test phone number
const TEST_PHONE = 'whatsapp:+919999999999';

// ═════════════════════════════════════════════════════════════
//  MOCKING WHATSAPP.JS
// ═════════════════════════════════════════════════════════════
// We intercept the WhatsApp utility so it prints to console instead of hitting Meta's API.
const whatsappPath = path.resolve(__dirname, '../src/shared/whatsapp.js');

// Pre-populate the require cache with our mock
require.cache[require.resolve(whatsappPath)] = {
    id: require.resolve(whatsappPath),
    filename: require.resolve(whatsappPath),
    loaded: true,
    exports: {
        _Send_Text_Message: async (to, body) => {
            console.log(`\n\x1b[36m🤖 BimaSathi:\x1b[0m ${body}`);
            return { success: true };
        },
        _Send_Button_Message: async (to, body, buttons) => {
            console.log(`\n\x1b[36m🤖 BimaSathi [Interactive Buttons]:\x1b[0m ${body}`);
            buttons.forEach((b, i) => console.log(`   [🔘 ${b.title}]`));
            return { success: true };
        },
        _Send_List_Message: async (to, body, items) => {
            console.log(`\n\x1b[36m🤖 BimaSathi [Native List]:\x1b[0m ${body}`);
            items.forEach((item, i) => {
                console.log(`   🔸 ${item.title} \x1b[90m(${item.id})\x1b[0m`);
            });
            return { success: true };
        },
        _Send_Media_Message: async (to, mediaUrl, caption) => {
            console.log(`\n\x1b[36m🤖 BimaSathi [Media]:\x1b[0m ${mediaUrl}`);
            if (caption) console.log(`   Caption: ${caption}`);
            return { success: true };
        },
        _Download_Media: async (mediaId) => {
            console.log(`\n\x1b[90m[System: Simulating Media Fetch for ${mediaId}]\x1b[0m`);
            if (mediaId && fs.existsSync(mediaId)) {
                return { buffer: fs.readFileSync(mediaId), contentType: 'image/jpeg' };
            }
            // Return a dummy transparent 1x1 PNG buffer for photo verification tests
            const dummyBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
            return { buffer: dummyBuffer, contentType: 'image/png' };
        }
    }
};

// Now require the conversational engine (it will use the mocked whatsapp.js)
const { handler: EngineHandler } = require('../src/lambdas/conversation-engine/index.js');
const DB = require('../src/shared/dynamodb');
const Constants = require('../src/shared/constants');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// ═════════════════════════════════════════════════════════════
//  MOCKING AWS LAMBDA (LOCAL EXECUTION)
// ═════════════════════════════════════════════════════════════
const _originalSend = LambdaClient.prototype.send;
LambdaClient.prototype.send = async function (command) {
    if (command instanceof InvokeCommand) {
        const payload = JSON.parse(Buffer.from(command.input.Payload).toString('utf-8'));
        const funcName = command.input.FunctionName || '';

        if (funcName.includes('document-intake')) {
            console.log('\x1b[90m[System: ⚡ Intercepting Document Intake Lambda (Running Locally)]\x1b[0m');
            require('../src/lambdas/document-intake/index.js').handler(payload).catch(console.error);
            return {};
        }
        if (funcName.includes('photo-processor')) {
            console.log('\x1b[90m[System: ⚡ Intercepting Photo Processor Lambda (Running Locally)]\x1b[0m');
            require('../src/lambdas/photo-processor/index.js').handler(payload).catch(console.error);
            return {};
        }
    }
    return _originalSend.apply(this, arguments);
};

// ═════════════════════════════════════════════════════════════
//  CLI LOGIC
// ═════════════════════════════════════════════════════════════

console.log('\x1b[1m\x1b[32m═════════════════════════════════════════════════════════════\x1b[0m');
console.log('\x1b[1m\x1b[36m                   BIMASATHI CHAT SIMULATOR                  \x1b[0m');
console.log('\x1b[1m\x1b[32m═════════════════════════════════════════════════════════════\x1b[0m');
console.log('Test logic changes directly without using the WhatsApp App.');
console.log(`Simulated Phone Number: \x1b[33m${TEST_PHONE}\x1b[0m\n`);
console.log('\x1b[1mCommands:\x1b[0m');
console.log('  \x1b[33m/jump <STATE>\x1b[0m - Teleport to any state (e.g. /jump DOCUMENT_INTAKE)');
console.log('  \x1b[33m/payload <JSON>\x1b[0m - Send a raw interactive JSON payload (e.g. List Reply ID)');
console.log('  \x1b[33m/upload <path>\x1b[0m - Simulate sending an image file (e.g. /upload ./test.jpg)');
console.log('  \x1b[33m/exit\x1b[0m - Close the simulator\n');

// ── Run an event through the engine ──
async function triggerEngine(payloadContext) {
    const event = {
        from: TEST_PHONE,
        type: payloadContext.type || 'text',
        body: payloadContext.body || '',
        message_sid: `SIMULATED_${Date.now()}`,
        profile_name: 'Test Farmer',
        ...payloadContext
    };

    try {
        await EngineHandler(event);
    } catch (err) {
        console.error('\n\x1b[31m[Engine Error]:\x1b[0m', err);
    }
    // Re-prompt after processing
    setTimeout(() => rl.prompt(), 100);
}

// ── Handle /jump developer command ──
async function handleJumpCommand(stateName) {
    const states = Object.keys(Constants._Conversation_States);
    if (!states.includes(stateName)) {
        console.log(`\x1b[31mInvalid state. Available states:\x1b[0m ${states.join(', ')}`);
        return;
    }

    try {
        const session = await DB._Get_Conversation(TEST_PHONE) || {
            phoneNumber: TEST_PHONE,
            sessionId: 'SIMULATED_SESSION_123'
        };

        // Ensure user exists
        let user = await DB._Get_User(TEST_PHONE);
        if (!user) {
            user = await DB._Create_User({ phoneNumber: TEST_PHONE, name: 'Simulated Farmer', language: 'hi' });
        }

        // Mutate context
        session.state = stateName;
        session.language = session.language || 'hi';
        session.context = {
            userId: user.userId,
            claimId: 'BMS-SIM-0001',
            intake: {
                farmer_name: 'Simulated Farmer',
                village: 'Test Village',
                district: 'Test District',
                state: 'Test State',
                crop_type: 'wheat',
                cause: 'drought',
                area_hectares: 2.5,
                loss_date: '2024-02-15',
                deadline: new Date(Date.now() + 86400000).toISOString()
            }
        };

        await DB._Upsert_Conversation(session);
        console.log(`\n\x1b[32m[System Injection Successful]\x1b[0m Teleported to state: \x1b[1m${stateName}\x1b[0m`);

        // Let the state handler render itself by passing an empty message
        await triggerEngine({ body: '' });

    } catch (err) {
        console.error('\n\x1b[31m[Dev Injection Failed]:\x1b[0m', err.message);
        rl.prompt();
    }
}

// ── Readline listener ──
rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) {
        rl.prompt();
        return;
    }

    if (text === '/exit' || text === 'exit') {
        console.log('Goodbye!');
        process.exit(0);
    }

    if (text.startsWith('/jump ')) {
        const targetState = text.substring(6).trim().toUpperCase();
        await handleJumpCommand(targetState);
        return;
    }

    if (text.startsWith('/payload ')) {
        const payloadText = text.substring(9).trim();
        // Mimic an interactive button or list reply
        // The engine logic processes button/list IDs primarily through text matches via Bedrock or exact switch.
        // We will pass the payloadText as the body.
        console.log(`\x1b[90m[Sending Interactive Payload: ${payloadText}]\x1b[0m`);
        await triggerEngine({ type: 'text', body: payloadText });
        return;
    }

    if (text.startsWith('/upload ')) {
        const filePath = text.substring(8).trim();
        const absolutePath = path.resolve(process.cwd(), filePath);

        console.log(`\x1b[90m[Simulating image upload from ${absolutePath}...]\x1b[0m`);

        if (!fs.existsSync(absolutePath)) {
            console.log(`\x1b[31mFile not found: ${absolutePath}\x1b[0m`);
            rl.prompt();
            return;
        }

        await triggerEngine({
            type: 'image',
            body: '', // image captions
            media_data: {
                id: absolutePath, // we inject the local file path as the media ID!
                content_type: 'image/jpeg'
            }
        });
        return;
    }

    // Default text routing
    await triggerEngine({ type: 'text', body: text });

}).on('close', () => {
    process.exit(0);
});

// Kick off
rl.prompt();
