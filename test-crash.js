const { handler } = require('./src/lambdas/conversation-engine/index.js');

async function run() {
    try {
        const event = {
            from: "whatsapp:+911234567890",
            body: "05/03/2026",
            type: "text",
            message_sid: "SM" + Date.now()
        };
        await handler(event);
        console.log("Success!");
    } catch (e) {
        console.error("FATAL CRASH TRACE:", e.stack);
    }
}

run();
