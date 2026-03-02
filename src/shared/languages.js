/**
 * BimaSathi — Multilingual Support
 * 
 * Handles 7 Indian languages with:
 *   - Language detection from text (keyword + script-based)
 *   - Amazon Transcribe locale codes
 *   - Amazon Polly voice IDs and engine types
 *   - WhatsApp message templates for every conversation state
 */

// ─────────────────────────────────────────────────────────────
//  Language Configuration Registry
// ─────────────────────────────────────────────────────────────
const _Supported_Languages = Object.freeze({
    hi: {
        _Name: 'Hindi',
        _Native_Name: 'हिन्दी',
        _Transcribe_Code: 'hi-IN',
        _Polly_Voice_Id: 'Kajal',
        _Polly_Engine: 'neural',
        _Script_Range: [0x0900, 0x097F],  // Devanagari
    },
    mr: {
        _Name: 'Marathi',
        _Native_Name: 'मराठी',
        _Transcribe_Code: 'mr-IN',
        _Polly_Voice_Id: 'Kajal',    // fallback to Hindi neural
        _Polly_Engine: 'neural',
        _Script_Range: [0x0900, 0x097F],  // shared Devanagari
    },
    te: {
        _Name: 'Telugu',
        _Native_Name: 'తెలుగు',
        _Transcribe_Code: 'te-IN',
        _Polly_Voice_Id: 'Kajal',
        _Polly_Engine: 'neural',
        _Script_Range: [0x0C00, 0x0C7F],
    },
    ta: {
        _Name: 'Tamil',
        _Native_Name: 'தமிழ்',
        _Transcribe_Code: 'ta-IN',
        _Polly_Voice_Id: 'Kajal',
        _Polly_Engine: 'neural',
        _Script_Range: [0x0B80, 0x0BFF],
    },
    gu: {
        _Name: 'Gujarati',
        _Native_Name: 'ગુજરાતી',
        _Transcribe_Code: 'gu-IN',
        _Polly_Voice_Id: 'Kajal',
        _Polly_Engine: 'neural',
        _Script_Range: [0x0A80, 0x0AFF],
    },
    kn: {
        _Name: 'Kannada',
        _Native_Name: 'ಕನ್ನಡ',
        _Transcribe_Code: 'kn-IN',
        _Polly_Voice_Id: 'Kajal',
        _Polly_Engine: 'neural',
        _Script_Range: [0x0C80, 0x0CFF],
    },
    en: {
        _Name: 'English',
        _Native_Name: 'English',
        _Transcribe_Code: 'en-IN',
        _Polly_Voice_Id: 'Kajal',
        _Polly_Engine: 'neural',
        _Script_Range: [0x0041, 0x007A],  // ASCII letters
    },
});


// ─────────────────────────────────────────────────────────────
//  Language Detection — keyword list per language
// ─────────────────────────────────────────────────────────────
const _Detection_Keywords = Object.freeze({
    hi: ['namaste', 'kaise', 'mera', 'hai', 'kya', 'haan', 'nahi', 'fasal', 'bima', 'madad', 'bhasha'],
    mr: ['namaskar', 'kasa', 'mazha', 'aahe', 'kay', 'ho', 'nahi', 'pik', 'vima'],
    te: ['namaskaram', 'ela', 'naa', 'undi', 'emi', 'avunu', 'kadu', 'panta', 'bima'],
    ta: ['vanakkam', 'eppadi', 'enna', 'irukku', 'aama', 'illa', 'payir', 'kaapeeddu'],
    gu: ['namaste', 'kem', 'maru', 'chhe', 'shu', 'ha', 'na', 'paak', 'vimo'],
    kn: ['namaskara', 'hege', 'nanna', 'ide', 'yenu', 'haudu', 'illa', 'bele', 'vima'],
    en: ['hello', 'help', 'claim', 'insurance', 'crop', 'damage', 'yes', 'no', 'status'],
});


// ─────────────────────────────────────────────────────────────
//  Detect language from free-form text
//  Priority: 1) Script-based detection  2) Keyword matching
// ─────────────────────────────────────────────────────────────
function _Detect_Language(_Text) {
    if (!_Text || typeof _Text !== 'string') return 'hi';

    const _Cleaned = _Text.toLowerCase().trim();

    // 1) Script-based detection — check Unicode ranges
    for (const [_Code, _Config] of Object.entries(_Supported_Languages)) {
        if (_Code === 'en' || _Code === 'hi') continue; // check specific scripts first
        const [_Range_Start, _Range_End] = _Config._Script_Range;

        for (const _Char of _Cleaned) {
            const _Code_Point = _Char.codePointAt(0);
            if (_Code_Point >= _Range_Start && _Code_Point <= _Range_End) {
                return _Code;
            }
        }
    }

    // Devanagari detection (shared by Hindi and Marathi)
    const _Has_Devanagari = [..._Cleaned].some(_Ch => {
        const _Cp = _Ch.codePointAt(0);
        return _Cp >= 0x0900 && _Cp <= 0x097F;
    });

    if (_Has_Devanagari) {
        // Marathi-specific keywords to disambiguate from Hindi
        const _Marathi_Markers = ['aahe', 'mazha', 'kasa', 'namaskar', 'pik', 'vima'];
        const _Is_Marathi = _Marathi_Markers.some(_Word => _Cleaned.includes(_Word));
        return _Is_Marathi ? 'mr' : 'hi';
    }

    // 2) Keyword matching
    let _Best_Match = 'hi';
    let _Best_Score = 0;

    for (const [_Code, _Keywords] of Object.entries(_Detection_Keywords)) {
        const _Score = _Keywords.filter(_Kw => _Cleaned.includes(_Kw)).length;
        if (_Score > _Best_Score) {
            _Best_Score = _Score;
            _Best_Match = _Code;
        }
    }

    return _Best_Match;
}


// ─────────────────────────────────────────────────────────────
//  Message Template Keys
// ─────────────────────────────────────────────────────────────
const _Template_Keys = Object.freeze({
    welcome: 'welcome',
    language_prompt: 'language_prompt',
    otp_prompt: 'otp_prompt',
    main_menu: 'main_menu',
    loss_report_start: 'loss_report_start',
    ask_crop: 'ask_crop',
    ask_date: 'ask_date',
    ask_location: 'ask_location',
    ask_photos: 'ask_photos',
    photo_approved: 'photo_approved',
    photo_rejected: 'photo_rejected',
    review_summary: 'review_summary',
    claim_submitted: 'claim_submitted',
    status_update: 'status_update',
    deadline_reminder: 'deadline_reminder',
    appeal_prompt: 'appeal_prompt',
    helper_consent: 'helper_consent',
    error_message: 'error_message',
    thank_you: 'thank_you',
});


// ─────────────────────────────────────────────────────────────
//  Message Templates — indexed by [template_key][language_code]
// ─────────────────────────────────────────────────────────────
const _Message_Templates = Object.freeze({
    welcome: {
        hi: '🌾 नमस्ते! BimaSathi में आपका स्वागत है।\nमैं आपकी फसल बीमा claim में मदद करूँगा।\n\nकृपया अपनी भाषा चुनें:',
        mr: '🌾 नमस्कार! BimaSathi मध्ये आपले स्वागत आहे।\nमी तुम्हाला पीक विमा दाव्यामध्ये मदत करेन।',
        te: '🌾 నమస్కారం! BimaSathi కు స్వాగతం।\nపంట బీమా క్లెయిమ్ లో మీకు సహాయం చేస్తాను।',
        ta: '🌾 வணக்கம்! BimaSathi க்கு வரவேற்கிறோம்।\nபயிர் காப்பீடு க்ளெய்மில் உதவுவேன்.',
        gu: '🌾 નમસ્તે! BimaSathi માં આપનું સ્વાગત છે।\nપાક વીમા ક્લેમમાં મદદ કરીશ।',
        kn: '🌾 ನಮಸ್ಕಾರ! BimaSathi ಗೆ ಸ್ವಾಗತ।\nಬೆಳೆ ವಿಮಾ ಕ್ಲೇಮ್ ನಲ್ಲಿ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ।',
        en: '🌾 Welcome to BimaSathi!\nI will help you file your crop insurance claim.\n\nPlease choose your language:',
    },

    language_prompt: {
        hi: 'कृपया अपनी भाषा चुनें:\n1. हिन्दी\n2. मराठी\n3. తెలుగు\n4. தமிழ்\n5. ગુજરાતી\n6. ಕನ್ನಡ\n7. English',
        en: 'Please choose your language:\n1. हिन्दी (Hindi)\n2. मराठी (Marathi)\n3. తెలుగు (Telugu)\n4. தமிழ் (Tamil)\n5. ગુજરાતી (Gujarati)\n6. ಕನ್ನಡ (Kannada)\n7. English',
    },

    otp_prompt: {
        hi: '🔐 Aapke phone par OTP bheja gaya hai. Kripya OTP yahan type karein:',
        en: '🔐 An OTP has been sent to your phone. Please type the OTP here:',
        mr: '🔐 तुमच्या फोनवर OTP पाठवला आहे. कृपया OTP टाइप करा:',
        te: '🔐 మీ ఫోన్ కు OTP పంపబడింది. దయచేసి OTP టైప్ చేయండి:',
        ta: '🔐 உங்கள் ஃபோனுக்கு OTP அனுப்பப்பட்டது. OTP டைப் செய்யவும்:',
        gu: '🔐 તમારા ફોન પર OTP મોકલાઈ છે. OTP ટાઈપ કરો:',
        kn: '🔐 ನಿಮ್ಮ ಫೋನ್ ಗೆ OTP ಕಳುಹಿಸಲಾಗಿದೆ. OTP ಟೈಪ್ ಮಾಡಿ:',
    },

    main_menu: {
        hi: '📋 Main Menu:\n1. 🆕 Nayi claim file karein\n2. 📊 Claim status dekhein\n3. 📞 Madad chahiye\n\nApna choice type karein ya voice mein bolein:',
        en: '📋 Main Menu:\n1. 🆕 File a new claim\n2. 📊 Track claim status\n3. 📞 Get help\n\nType your choice or send a voice note:',
        mr: '📋 मुख्य मेनू:\n1. 🆕 नवीन दावा दाखल करा\n2. 📊 दावा स्थिती पहा\n3. 📞 मदत हवी\n\nतुमची निवड टाइप करा:',
        te: '📋 ప్రధాన మెనూ:\n1. 🆕 కొత్త క్లెయిమ్ ఫైల్ చేయండి\n2. 📊 క్లెయిమ్ స్టేటస్ చూడండి\n3. 📞 సహాయం కావాలి',
        ta: '📋 முதன்மை மெனு:\n1. 🆕 புதிய க்ளெய்ம் ஃபைல் செய்யுங்கள்\n2. 📊 க்ளெய்ம் நிலையைப் பாருங்கள்\n3. 📞 உதவி வேண்டும்',
        gu: '📋 મુખ્ય મેનુ:\n1. 🆕 નવો ક્લેમ દાખલ કરો\n2. 📊 ક્લેમ સ્ટેટસ જુઓ\n3. 📞 મદદ જોઈએ',
        kn: '📋 ಮುಖ್ಯ ಮೆನು:\n1. 🆕 ಹೊಸ ಕ್ಲೇಮ್ ಫೈಲ್ ಮಾಡಿ\n2. 📊 ಕ್ಲೇಮ್ ಸ್ಥಿತಿ ನೋಡಿ\n3. 📞 ಸಹಾಯ ಬೇಕು',
    },

    loss_report_start: {
        hi: '📝 Claim filing shuru karte hain.\n\nSabse pehle — aapka pura naam batayein:',
        en: '📝 Let\'s start filing your claim.\n\nFirst — please tell me your full name:',
        mr: '📝 दावा दाखल करणे सुरू करूया.\n\nसर्वप्रथम — तुमचे पूर्ण नाव सांगा:',
        te: '📝 క్లెయిమ్ ఫైలింగ్ ప్రారంభిద్దాం.\n\nమొదట — మీ పూర్తి పేరు చెప్పండి:',
        ta: '📝 க்ளெய்ம் ஃபைலிங்கைத் தொடங்குவோம்.\n\nமுதலில் — உங்கள் முழுப்பெயரைக் கூறுங்கள்:',
        gu: '📝 ક્લેમ ફાઈલિંગ શરૂ કરીએ.\n\nપ્રથમ — તમારું પૂરું નામ જણાવો:',
        kn: '📝 ಕ್ಲೇಮ್ ಫೈಲಿಂಗ್ ಪ್ರಾರಂಭಿಸೋಣ.\n\nಮೊದಲು — ನಿಮ್ಮ ಪೂರ್ತಿ ಹೆಸರು ಹೇಳಿ:',
    },

    ask_crop: {
        hi: '🌾 Kaun si fasal ka nuksan hua hai?\n\n1. Gehun (Wheat)\n2. Dhan (Rice)\n3. Kapas (Cotton)\n4. Ganna (Sugarcane)\n5. Soybean\n6. Dal (Pulses)',
        en: '🌾 Which crop was damaged?\n\n1. Wheat\n2. Rice\n3. Cotton\n4. Sugarcane\n5. Soybean\n6. Pulses',
    },

    ask_date: {
        hi: '📅 Nuksan kab hua? Tarikh batayein ya bolein (jaise: "kal", "15 February", "pichle hafte"):',
        en: '📅 When did the damage occur? Tell me the date (like: "yesterday", "15 February", "last week"):',
    },

    ask_location: {
        hi: '📍 Kripya apni location share karein ya apne gaon ka naam batayein:',
        en: '📍 Please share your location or tell me your village name:',
    },

    ask_photos: {
        hi: '📸 Ab kripya apne khet ki photos bhejein.\n\nKam se kam 3 photos chahiye:\n• Nuksan dikhe aise\n• Alag-alag angle se\n• Puri fasal bhi dikhe\n\nPhoto bhejein 👇',
        en: '📸 Now please send photos of your field.\n\nMinimum 3 photos needed:\n• Show the damage clearly\n• Take from different angles\n• Include the full crop area\n\nSend photos 👇',
    },

    photo_approved: {
        hi: '✅ Photo #{index} accept ho gayi!\n\n🏷 Labels: {labels}\n📊 Quality: {score}/100\n\n{remaining} aur photos chahiye.',
        en: '✅ Photo #{index} approved!\n\n🏷 Labels: {labels}\n📊 Quality: {score}/100\n\n{remaining} more photos needed.',
    },

    photo_rejected: {
        hi: '❌ Photo #{index} reject ho gayi.\nReason: {reason}\n\nKripya nayi photo bhejein.',
        en: '❌ Photo #{index} rejected.\nReason: {reason}\n\nPlease send a new photo.',
    },

    review_summary: {
        hi: '📋 Aapki claim ka summary:\n\n👤 Naam: {farmer_name}\n🏘 Gaon: {village}, {district}\n🌾 Fasal: {crop_type}\n📅 Nuksan: {loss_date}\n⚡ Karan: {cause}\n📐 Area: {area} hectares\n📷 Photos: {photo_count}\n\n✅ Sab sahi hai? "Haan" bolein ya type karein.',
        en: '📋 Your claim summary:\n\n👤 Name: {farmer_name}\n🏘 Village: {village}, {district}\n🌾 Crop: {crop_type}\n📅 Loss date: {loss_date}\n⚡ Cause: {cause}\n📐 Area: {area} hectares\n📷 Photos: {photo_count}\n\n✅ Is everything correct? Say "Yes" or type it.',
    },

    claim_submitted: {
        hi: '🎉 Badhaai ho! Aapki claim {claim_id} successfully submit ho gayi hai!\n\n📄 Claim Pack PDF yahan se download karein:\n{pdf_url}\n\n⏰ Deadline: {deadline}\n\nHum aapko status updates bhejte rahenge.',
        en: '🎉 Congratulations! Your claim {claim_id} has been submitted!\n\n📄 Download your Claim Pack PDF:\n{pdf_url}\n\n⏰ Deadline: {deadline}\n\nWe\'ll keep you updated on the status.',
    },

    deadline_reminder: {
        hi: '⏰ Reminder: Aapki claim {claim_id} ki deadline {remaining} mein hai.\n\nAbhi submit karein — der na karein!',
        en: '⏰ Reminder: Your claim {claim_id} deadline is in {remaining}.\n\nSubmit now — don\'t delay!',
    },

    appeal_prompt: {
        hi: '⚖️ Aapki claim reject ho gayi hai.\n\nKya aap appeal file karna chahte hain? Hum AI se ek professional appeal letter taiyaar karenge.\n\n"Haan" bolein appeal ke liye.',
        en: '⚖️ Your claim has been rejected.\n\nWould you like to file an appeal? We\'ll use AI to draft a professional appeal letter.\n\nSay "Yes" to start the appeal.',
    },

    helper_consent: {
        hi: '🤝 Helper mode shuru karne ke liye, kisan ko OTP verify karna hoga.\n\nKisan ke phone par OTP bheja gaya hai.',
        en: '🤝 To start Helper mode, the farmer needs to verify via OTP.\n\nOTP has been sent to the farmer\'s phone.',
    },

    error_message: {
        hi: '❌ Kuch galat ho gaya. Kripya dobara try karein ya "menu" type karein.',
        en: '❌ Something went wrong. Please try again or type "menu".',
        mr: '❌ काहीतरी चूक झाली. कृपया पुन्हा प्रयत्न करा.',
        te: '❌ ఏదో తప్పు జరిగింది. దయచేసి మళ్ళీ ప్రయత్నించండి.',
        ta: '❌ ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.',
        gu: '❌ કંઈક ખોટું થયું. ફરી પ્રયાસ કરો.',
        kn: '❌ ಏನೋ ತಪ್ಪಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    },

    thank_you: {
        hi: '🙏 Dhanyavaad! BimaSathi use karne ke liye shukriya.\nKabhi bhi madad chahiye to "hi" type karein.',
        en: '🙏 Thank you for using BimaSathi!\nType "hi" anytime you need help.',
    },
});


// ─────────────────────────────────────────────────────────────
//  Template Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Get a template string for a given key and language, with Hindi fallback
 * @param {string} _Template_Key — one of _Template_Keys values
 * @param {string} _Language_Code — 2-letter language code
 * @returns {string} Template string
 */
function _Get_Template(_Template_Key, _Language_Code = 'hi') {
    const _Template_Group = _Message_Templates[_Template_Key];
    if (!_Template_Group) return '';
    return _Template_Group[_Language_Code] || _Template_Group['hi'] || _Template_Group['en'] || '';
}

/**
 * Fill placeholders in a template string  {key} → value
 * @param {string} _Template — template string with {placeholder} tokens
 * @param {Object} _Values — key-value pairs for replacement
 * @returns {string} Filled template
 */
function _Fill_Template(_Template, _Values = {}) {
    let _Result = _Template;
    for (const [_Key, _Value] of Object.entries(_Values)) {
        _Result = _Result.replace(new RegExp(`\\{${_Key}\\}`, 'g'), String(_Value));
    }
    return _Result;
}

/**
 * Get the language configuration for a language code
 * @param {string} _Language_Code — 2-letter code
 * @returns {Object} Language config or Hindi default
 */
function _Get_Language_Config(_Language_Code = 'hi') {
    return _Supported_Languages[_Language_Code] || _Supported_Languages.hi;
}


// ─────────────────────────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────────────────────────
module.exports = {
    _Supported_Languages,
    _Detection_Keywords,
    _Template_Keys,
    _Message_Templates,
    _Detect_Language,
    _Get_Template,
    _Fill_Template,
    _Get_Language_Config,
};
