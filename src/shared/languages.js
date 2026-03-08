/**
 * BimaSathi — Multilingual Support
 * 
 * Handles 7 Indian languages with:
 * - Language detection from text (keyword + script-based)
 * - Amazon Transcribe locale codes
 * - Amazon Polly voice IDs and engine types
 * - WhatsApp message templates for every conversation state
 */

// ─────────────────────────────────────────────────────────────
// Language Configuration Registry
// ─────────────────────────────────────────────────────────────
const _Supported_Languages = Object.freeze({
 hi: {
 _Name: 'Hindi',
 _Native_Name: 'हिन्दी',
 _Transcribe_Code: 'hi-IN',
 _Polly_Voice_Id: 'Kajal',
 _Polly_Engine: 'neural',
 _Script_Range: [0x0900, 0x097F], // Devanagari
 },
 mr: {
 _Name: 'Marathi',
 _Native_Name: 'मराठी',
 _Transcribe_Code: 'mr-IN',
 _Polly_Voice_Id: 'Kajal', // fallback to Hindi neural
 _Polly_Engine: 'neural',
 _Script_Range: [0x0900, 0x097F], // shared Devanagari
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
 _Script_Range: [0x0041, 0x007A], // ASCII letters
 },
});


// ─────────────────────────────────────────────────────────────
// Language Detection — keyword list per language
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
// Detect language from free-form text
// Priority: 1) Script-based detection 2) Keyword matching
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

 // Bug #13: Check for Latin characters → likely English
 const _Has_Latin = /[a-zA-Z]/.test(_Cleaned);
 const _Has_Non_Latin_Script = [..._Cleaned].some(_Ch => {
 const _Cp = _Ch.codePointAt(0);
 return _Cp > 0x007F && _Cp !== 0x20; // non-ASCII, non-space
 });

 // If text is purely Latin characters → English
 if (_Has_Latin && !_Has_Non_Latin_Script) {
 // Still do keyword matching to see if it matches English or Romanized Hindi 
 const _En_Keywords = _Detection_Keywords.en || [];
 const _Hi_Keywords = _Detection_Keywords.hi || [];
 const _En_Score = _En_Keywords.filter(_Kw => _Cleaned.includes(_Kw)).length;
 const _Hi_Score = _Hi_Keywords.filter(_Kw => _Cleaned.includes(_Kw)).length;
 // If English keywords match more, or no Hindi keywords found, return English
 if (_En_Score >= _Hi_Score || _Hi_Score === 0) return 'en';
 return 'hi'; // Romanized Hindi like "kaise ho"
 }

 // 2) Keyword matching (fallback)
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
// Message Template Keys
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
// Message Templates — indexed by [template_key][language_code]
// ─────────────────────────────────────────────────────────────
const _Message_Templates = Object.freeze({
 welcome: {
 hi: ' नमस्ते! BimaSathi में आपका स्वागत है।\nमैं आपकी फसल बीमा claim में मदद करूँगा।\n\nकृपया अपनी भाषा चुनें:',
 mr: ' नमस्कार! BimaSathi मध्ये आपले स्वागत आहे।\nमी तुम्हाला पीक विमा दाव्यामध्ये मदत करेन।',
 te: ' నమస్కారం! BimaSathi కు స్వాగతం।\nపంట బీమా క్లెయిమ్ లో మీకు సహాయం చేస్తాను।',
 ta: ' வணக்கம்! BimaSathi க்கு வரவேற்கிறோம்।\nபயிர் காப்பீடு க்ளெய்மில் உதவுவேன்.',
 gu: ' નમસ્તે! BimaSathi માં આપનું સ્વાગત છે।\nપાક વીમા ક્લેમમાં મદદ કરીશ।',
 kn: ' ನಮಸ್ಕಾರ! BimaSathi ಗೆ ಸ್ವಾಗತ।\nಬೆಳೆ ವಿಮಾ ಕ್ಲೇಮ್ ನಲ್ಲಿ ಸಹಾಯ ಮಾಡುತ್ತೇನೆ।',
 en: ' Welcome to BimaSathi!\nI will help you file your crop insurance claim.\n\nPlease choose your language:',
 },

 language_prompt: {
 hi: 'कृपया अपनी भाषा चुनें:\n1. हिन्दी\n2. मराठी\n3. తెలుగు\n4. தமிழ்\n5. ગુજરાતી\n6. ಕನ್ನಡ\n7. English',
 en: 'Please choose your language:\n1. हिन्दी (Hindi)\n2. मराठी (Marathi)\n3. తెలుగు (Telugu)\n4. தமிழ் (Tamil)\n5. ગુજરાતી (Gujarati)\n6. ಕನ್ನಡ (Kannada)\n7. English',
 },

 otp_prompt: {
 hi: ' Aapke phone par OTP bheja gaya hai. Kripya OTP yahan type karein:',
 en: ' An OTP has been sent to your phone. Please type the OTP here:',
 mr: ' तुमच्या फोनवर OTP पाठवला आहे. कृपया OTP टाइप करा:',
 te: ' మీ ఫోన్ కు OTP పంపబడింది. దయచేసి OTP టైప్ చేయండి:',
 ta: ' உங்கள் ஃபோனுக்கு OTP அனுப்பப்பட்டது. OTP டைப் செய்யவும்:',
 gu: ' તમારા ફોન પર OTP મોકલાઈ છે. OTP ટાઈપ કરો:',
 kn: ' ನಿಮ್ಮ ಫೋನ್ ಗೆ OTP ಕಳುಹಿಸಲಾಗಿದೆ. OTP ಟೈಪ್ ಮಾಡಿ:',
 },

 main_menu: {
 hi: ' Main Menu:\n1. Nayi claim file karein\n2. Claim status dekhein\n3. Adhuri claim (draft) resume karein\n4. Madad chahiye\n\nApna choice list se sunein:',
 en: ' Main Menu:\n1. File a new claim\n2. Track claim status\n3. Resume draft claims\n4. Get help\n\nPlease select an option from the list:',
 mr: ' मुख्य मेनू:\n1. नवीन दावा दाखल करा\n2. दावा स्थिती पहा\n3. अपूर्ण दावा पुन्हा सुरू करा\n4. मदत हवी\n\nतुमची निवड लिस्ट मध्ये दाबा:',
 te: ' ప్రధాన మెనూ:\n1. కొత్త క్లెయిమ్ ఫైల్ చేయండి\n2. క్లెయిమ్ స్టేటస్ చూడండి\n3. డ్రాఫ్ట్ క్లెయిమ్ కొనసాగించండి\n4. సహాయం కావాలి',
 ta: ' முதன்மை மெனு:\n1. புதிய க்ளெய்ம் ஃபைல் செய்யுங்கள்\n2. க்ளெய்ம் நிலையைப் பாருங்கள்\n3. டிராஃப்ட் க்ளெய்ம் தொடரவும்\n4. உதவி வேண்டும்',
 gu: ' મુખ્ય મેનુ:\n1. નવો ક્લેમ દાખલ કરો\n2. ક્લેમ સ્ટેટસ જુઓ\n3. અધૂરો ક્લેમ ફરી શરૂ કરો\n4. મદદ જોઈએ',
 kn: ' ಮುಖ್ಯ ಮೆನು:\n1. ಹೊಸ ಕ್ಲೇಮ್ ಫೈಲ್ ಮಾಡಿ\n2. ಕ್ಲೇಮ್ ಸ್ಥಿತಿ ನೋಡಿ\n3. ಡ್ರಾಫ್ಟ್ ಕ್ಲೇಮ್ ಮುಂದುವರಿಸಿ\n4. ಸಹಾಯ ಬೇಕು',
 },

 loss_report_start: {
 hi: ' Claim filing shuru karte hain.\n\nSabse pehle — aapka pura naam batayein:',
 en: ' Let\'s start filing your claim.\n\nFirst — please tell me your full name:',
 mr: ' दावा दाखल करणे सुरू करूया.\n\nसर्वप्रथम — तुमचे पूर्ण नाव सांगा:',
 te: ' క్లెయిమ్ ఫైలింగ్ ప్రారంభిద్దాం.\n\nమొదట — మీ పూర్తి పేరు చెప్పండి:',
 ta: ' க்ளெய்ம் ஃபைலிங்கைத் தொடங்குவோம்.\n\nமுதலில் — உங்கள் முழுப்பெயரைக் கூறுங்கள்:',
 gu: ' ક્લેમ ફાઈલિંગ શરૂ કરીએ.\n\nપ્રથમ — તમારું પૂરું નામ જણાવો:',
 kn: ' ಕ್ಲೇಮ್ ಫೈಲಿಂಗ್ ಪ್ರಾರಂಭಿಸೋಣ.\n\nಮೊದಲು — ನಿಮ್ಮ ಪೂರ್ತಿ ಹೆಸರು ಹೇಳಿ:',
 },

 ask_crop: {
 hi: ' Kaun si fasal ka nuksan hua hai?\n\n1. Gehun (Wheat)\n2. Dhan (Rice)\n3. Kapas (Cotton)\n4. Ganna (Sugarcane)\n5. Soybean\n6. Dal (Pulses)\n\n (Main Menu ke liye "menu" likhein)',
 en: ' Which crop was damaged?\n\n1. Wheat\n2. Rice\n3. Cotton\n4. Sugarcane\n5. Soybean\n6. Pulses\n\n (Type "menu" to restart)',
 mr: ' कोणत्या पिकाचे नुकसान झाले?\n\n1. गहू\n2. भात\n3. कापूस\n4. ऊस\n5. सोयाबीन\n6. डाळ',
 te: ' ఏ పంటకు నష్టం జరిగింది?\n\n1. గోధుమ\n2. వరి\n3. పత్తి\n4. చెరకు\n5. సోయాబీన్\n6. పప్పు',
 ta: ' எந்த பயிருக்கு சேதம் ஏற்பட்டது?\n\n1. கோதுமை\n2. அரிசி\n3. பருத்தி\n4. கரும்பு\n5. சோயா\n6. பருப்பு',
 gu: ' કયા પાકને નુકસાન થયું?\n\n1. ઘઉં\n2. ડાંગર\n3. કપાસ\n4. શેરડી\n5. સોયાબીન\n6. દાળ',
 kn: ' ಯಾವ ಬೆಳೆಗೆ ಹಾನಿಯಾಗಿದೆ?\n\n1. ಗೋಧಿ\n2. ಅಕ್ಕಿ\n3. ಹತ್ತಿ\n4. ಕಬ್ಬು\n5. ಸೋಯಾಬೀನ್\n6. ಬೇಳೆ',
 },

 ask_date: {
 hi: ' Nuksan kab hua? Tarikh is format mein likhein (jaise: "15/02/2024" ya "01/03/2024"):',
 en: ' When did the damage occur? Please enter the exact date in this format (e.g. "15/02/2024" or "01/03/2024"):',
 mr: ' नुकसान कधी झाले? तारीख या फॉरमॅटमध्ये लिहा (उदा: "15/02/2024"):',
 te: ' నష్టం ఎప్పుడు జరిగింది? ఖచ్చితమైన తేదీని ఈ ఫార్మాట్‌లో ఇవ్వండి (ఉదా: "15/02/2024"):',
 ta: ' சேதம் எப்போது ஏற்பட்டது? சரியான தேதியை இந்த வடிவத்தில் உள்ளிடவும் (உதா: "15/02/2024"):',
 gu: ' નુકસાન ક્યારે થયું? તારીખ આ ફોર્મેટમાં લખો (જેમ કે: "15/02/2024"):',
 kn: ' ಹಾನಿ ಯಾವಾಗ ಆಯಿತು? ದಿನಾಂಕವನ್ನು ಈ ರೂಪದಲ್ಲಿ ಬರೆಯಿರಿ (ಉದಾ: "15/02/2024"):',
 },

 ask_location: {
 hi: ' Kripya apne gaon aur zile ka naam likh kar bhejein:',
 en: ' Please type and send the name of your village and district:',
 mr: ' कृपया तुमच्या गावाचे आणि जिल्ह्याचे नाव लिहून पाठवा:',
 te: ' దయచేసి మీ గ్రామం మరియు జిల్లా పేరు టైప్ చేసి పంపండి:',
 ta: ' உங்கள் கிராமம் மற்றும் மாவட்டத்தின் பெயரை தட்டச்சு செய்து அனுப்பவும்:',
 gu: ' કૃપા કરીને તમારા ગામ અને જિલ્લાનું નામ લખીને મોકલો:',
 kn: ' ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹಳ್ಳಿ ಮತ್ತು ಜಿಲ್ಲೆಯ ಹೆಸರನ್ನು ಟೈಪ್ ಮಾಡಿ ಕಳುಹಿಸಿ:',
 },

 ask_photos: {
 hi: ' Ab kripya apne khet ki photos bhejein.\n\nKam se kam 3 photos chahiye:\n• Nuksan dikhe aise\n• Alag-alag angle se\n• Puri fasal bhi dikhe\n\nPhoto bhejein ',
 en: ' Now please send photos of your field.\n\nMinimum 3 photos needed:\n• Show the damage clearly\n• Take from different angles\n• Include the full crop area\n\nSend photos ',
 mr: ' आता कृपया शेताचे फोटो पाठवा.\n\nकिमान 3 फोटो हवेत:\n• नुकसान स्पष्ट दिसले पाहिजे\n• वेगवेगळ्या कोनातून\n• पूर्ण पीक दिसले पाहिजे\n\nफोटो पाठवा ',
 te: ' దయచేసి మీ పొలం ఫోటోలు పంపండి.\n\nకనీసం 3 ఫోటోలు కావాలి:\n• నష్టం స్పష్టంగా చూపించాలి\n• వేర్వేరు కోణాల నుండి\n• పూర్తి పంట ప్రదేశం చూపించాలి\n\nఫోటోలు పంపండి ',
 ta: ' உங்கள் வயல் புகைப்படங்களை அனுப்புங்கள்.\n\nகுறைந்தது 3 புகைப்படங்கள் தேவை:\n• சேதம் தெளிவாக இருக்க வேண்டும்\n• வெவ்வேறு கோணங்களிலிருந்து\n• முழு பயிர் பரப்பும் இருக்க வேண்டும்\n\nபுகைப்படங்கள் அனுப்புங்கள் ',
 gu: ' કૃપા કરી તમારા ખેતરના ફોટો મોકલો.\n\nઓછામાં ઓછા 3 ફોટો જોઈએ:\n• નુકસાન સ્પષ્ટ દેખાવું જોઈએ\n• જુદા જુદા ખૂણેથી\n• સંપૂર્ણ ખેતર દેખાવું જોઈએ\n\nફોટો મોકલો ',
 kn: ' ದಯವಿಟ್ಟು ನಿಮ್ಮ ಹೊಲದ ಫೋಟೋಗಳನ್ನು ಕಳಿಸಿ.\n\nಕನಿಷ್ಠ 3 ಫೋಟೋಗಳು ಬೇಕು:\n• ಹಾನಿ ಸ್ಪಷ್ಟವಾಗಿ ಕಾಣಬೇಕು\n• ವಿವಿಧ ಕೋನಗಳಿಂದ\n• ಪೂರ್ಣ ಬೆಳೆ ಪ್ರದೇಶ ಕಾಣಬೇಕು\n\nಫೋಟೋಗಳನ್ನು ಕಳಿಸಿ ',
 },

 photo_approved: {
 hi: ' Photo #{index} accept ho gayi!\n\n Labels: {labels}\n Quality: {score}/100\n\n{remaining} aur photos chahiye.',
 en: ' Photo #{index} approved!\n\n Labels: {labels}\n Quality: {score}/100\n\n{remaining} more photos needed.',
 mr: ' फोटो #{index} मंजूर!\n\n लेबल: {labels}\n गुणवत्ता: {score}/100\n\n{remaining} आणखी फोटो हवेत.',
 te: ' ఫోటో #{index} ఆమోదం!\n\n లేబుల్స్: {labels}\n నాణ్యత: {score}/100\n\n{remaining} మరిన్ని ఫోటోలు కావాలి.',
 ta: ' புகைப்படம் #{index} ஏற்றுக்கொள்ளப்பட்டது!\n\n லேபிள்கள்: {labels}\n தரம்: {score}/100\n\n{remaining} மேலும் புகைப்படங்கள் தேவை.',
 gu: ' ફોટો #{index} મંજૂર!\n\n લેબલ: {labels}\n ગુણવત્તા: {score}/100\n\n{remaining} વધુ ફોટો જોઈએ.',
 kn: ' ಫೋಟೋ #{index} ಅನುಮೋದಿಸಲಾಗಿದೆ!\n\n ಲೇಬಲ್: {labels}\n ಗುಣಮಟ್ಟ: {score}/100\n\n{remaining} ಇನ್ನೂ ಫೋಟೋಗಳು ಬೇಕು.',
 },

 photo_rejected: {
 hi: ' Photo #{index} reject ho gayi.\nReason: {reason}\n\nKripya nayi photo bhejein.',
 en: ' Photo #{index} rejected.\nReason: {reason}\n\nPlease send a new photo.',
 mr: ' फोटो #{index} नाकारला.\nकारण: {reason}\n\nकृपया नवीन फोटो पाठवा.',
 te: ' ఫోటో #{index} తిరస్కరించబడింది.\nకారణం: {reason}\n\nదయచేసి కొత్త ఫోటో పంపండి.',
 ta: ' புகைப்படம் #{index} நிராகரிக்கப்பட்டது.\nகாரணம்: {reason}\n\nபுதிய புகைப்படம் அனுப்புங்கள்.',
 gu: ' ફોટો #{index} નામંજૂર.\nકારણ: {reason}\n\nકૃપા કરી નવો ફોટો મોકલો.',
 kn: ' ಫೋಟೋ #{index} ತಿರಸ್ಕರಿಸಲಾಗಿದೆ.\nಕಾರಣ: {reason}\n\nದಯವಿಟ್ಟು ಹೊಸ ಫೋಟೋ ಕಳಿಸಿ.',
 },

 review_summary: {
 hi: ' Aapki claim ka summary:\n\n Naam: {farmer_name}\n Gaon: {village}, {district}\n Fasal: {crop_type}\n Nuksan: {loss_date}\n Karan: {cause}\n Area: {area} hectares\n Photos: {photo_count}\n\n Sab sahi hai? "Haan" bolein ya type karein.',
 en: ' Your claim summary:\n\n Name: {farmer_name}\n Village: {village}, {district}\n Crop: {crop_type}\n Loss date: {loss_date}\n Cause: {cause}\n Area: {area} hectares\n Photos: {photo_count}\n\n Is everything correct? Say "Yes" or type it.',
 mr: ' तुमच्या दाव्याचा सारांश:\n\n नाव: {farmer_name}\n गाव: {village}, {district}\n पीक: {crop_type}\n नुकसान: {loss_date}\n कारण: {cause}\n क्षेत्र: {area} हेक्टर\n फोटो: {photo_count}\n\n सर्व बरोबर आहे? "होय" म्हणा.',
 te: ' మీ క్లెయిమ్ సారాంశం:\n\n పేరు: {farmer_name}\n గ్రామం: {village}, {district}\n పంట: {crop_type}\n నష్టం: {loss_date}\n కారణం: {cause}\n విస్తీర్ణం: {area} హెక్టార్లు\n ఫోటోలు: {photo_count}\n\n అంతా సరైనదా? "అవును" అని చెప్పండి.',
 ta: ' உங்கள் க்ளெய்ம் சுருக்கம்:\n\n பெயர்: {farmer_name}\n கிராமம்: {village}, {district}\n பயிர்: {crop_type}\n சேதம்: {loss_date}\n காரணம்: {cause}\n பரப்பு: {area} ஹெக்டேர்\n புகைப்படங்கள்: {photo_count}\n\n எல்லாம் சரியா? "ஆமா" என்று சொல்லுங்கள்.',
 gu: ' તમારા ક્લેમનો સારાંશ:\n\n નામ: {farmer_name}\n ગામ: {village}, {district}\n પાક: {crop_type}\n નુકસાન: {loss_date}\n કારણ: {cause}\n ક્ષેત્ર: {area} હેક્ટર\n ફોટો: {photo_count}\n\n બધું બરાબર છે? "હા" કહો.',
 kn: ' ನಿಮ್ಮ ಕ್ಲೇಮ್ ಸಾರಾಂಶ:\n\n ಹೆಸರು: {farmer_name}\n ಹಳ್ಳಿ: {village}, {district}\n ಬೆಳೆ: {crop_type}\n ಹಾನಿ: {loss_date}\n ಕಾರಣ: {cause}\n ಪ್ರದೇಶ: {area} ಹೆಕ್ಟೇರ್\n ಫೋಟೋ: {photo_count}\n\n ಎಲ್ಲ ಸರಿಯಿದೆಯೇ? "ಹೌದು" ಎಂದು ಹೇಳಿ.',
 },

 claim_submitted: {
 hi: ' Badhaai ho! Aapki claim {claim_id} successfully submit ho gayi hai!\n\n Claim Pack PDF yahan se download karein:\n{pdf_url}\n\n Deadline: {deadline}\n\nHum aapko status updates bhejte rahenge.',
 en: ' Congratulations! Your claim {claim_id} has been submitted!\n\n Download your Claim Pack PDF:\n{pdf_url}\n\n Deadline: {deadline}\n\nWe\'ll keep you updated on the status.',
 mr: ' अभिनंदन! तुमचा दावा {claim_id} सबमिट झाला!\n\n क्लेम पॅक PDF डाउनलोड करा:\n{pdf_url}\n\n मुदत: {deadline}\n\nआम्ही तुम्हाला अपडेट देत राहू.',
 te: ' అభినందనలు! మీ క్లెయిమ్ {claim_id} సమర్పించబడింది!\n\n క్లెయిమ్ ప్యాక్ PDF డౌన్‌లోడ్ చేయండి:\n{pdf_url}\n\n గడువు: {deadline}\n\nస్టేటస్ అప్‌డేట్లు పంపుతూ ఉంటాము.',
 ta: ' வாழ்த்துக்கள்! உங்கள் க்ளெய்ம் {claim_id} சமர்ப்பிக்கப்பட்டது!\n\n க்ளெய்ம் பேக் PDF பதிவிறக்கம் செய்யுங்கள்:\n{pdf_url}\n\n காலக்கெடு: {deadline}\n\nநிலை புதுப்பிப்புகளை அனுப்புவோம்.',
 gu: ' અભિનંદન! તમારો ક્લેમ {claim_id} સબમિટ થઈ ગયો!\n\n ક્લેમ પેક PDF ડાઉનલોડ કરો:\n{pdf_url}\n\n ડેડલાઈન: {deadline}\n\nઅમે તમને સ્ટેટસ અપડેટ મોકલતા રહીશું.',
 kn: ' ಅಭಿನಂದನೆ! ನಿಮ್ಮ ಕ್ಲೇಮ್ {claim_id} ಸಲ್ಲಿಸಲಾಗಿದೆ!\n\n ಕ್ಲೇಮ್ ಪ್ಯಾಕ್ PDF ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ:\n{pdf_url}\n\n ಗಡುವು: {deadline}\n\nಸ್ಥಿತಿ ಅಪ್‌ಡೇಟ್‌ಗಳನ್ನು ಕಳುಹಿಸುತ್ತೇವೆ.',
 },

 deadline_reminder: {
 hi: ' Reminder: Aapki claim {claim_id} ki deadline {remaining} mein hai.\n\nAbhi submit karein — der na karein!',
 en: ' Reminder: Your claim {claim_id} deadline is in {remaining}.\n\nSubmit now — don\'t delay!',
 mr: ' स्मरण: तुमच्या दाव्याची {claim_id} मुदत {remaining} मध्ये आहे.\n\nआताच सबमिट करा!',
 te: ' రిమైండర్: మీ క్లెయిమ్ {claim_id} గడువు {remaining} లో ఉంది.\n\nఇప్పుడే సమర్పించండి!',
 ta: ' நினைவூட்டல்: உங்கள் க்ளெய்ம் {claim_id} காலக்கெடு {remaining} இல் உள்ளது.\n\nஇப்போதே சமர்ப்பியுங்கள்!',
 gu: ' રિમાઇન્ડર: તમારા ક્લેમ {claim_id} ની ડેડલાઈન {remaining} માં છે.\n\nહવે જ સબમિટ કરો!',
 kn: ' ಜ್ಞಾಪನೆ: ನಿಮ್ಮ ಕ್ಲೇಮ್ {claim_id} ಗಡುವು {remaining} ಒಳಗೆ ಇದೆ.\n\nಈಗಲೇ ಸಲ್ಲಿಸಿ!',
 },

 appeal_prompt: {
 hi: '️ Aapki claim reject ho gayi hai.\n\nKya aap appeal file karna chahte hain? Hum AI se ek professional appeal letter taiyaar karenge.\n\n"Haan" bolein appeal ke liye.',
 en: '️ Your claim has been rejected.\n\nWould you like to file an appeal? We\'ll use AI to draft a professional appeal letter.\n\nSay "Yes" to start the appeal.',
 mr: '️ तुमचा दावा नाकारला गेला.\n\nतुम्हाला अपील दाखल करायची आहे का? AI ने व्यावसायिक अपील पत्र तयार करू.\n\n"होय" म्हणा.',
 te: '️ మీ క్లెయిమ్ తిరస్కరించబడింది.\n\nమీరు అప్పీల్ దాఖలు చేయాలనుకుంటున్నారా? AI తో ప్రొఫెషనల్ అప్పీల్ లెటర్ తయారు చేస్తాము.\n\n"అవును" అని చెప్పండి.',
 ta: '️ உங்கள் க்ளெய்ம் நிராகரிக்கப்பட்டது.\n\nமேல்முறையீடு செய்ய விரும்புகிறீர்களா? AI மூலம் தொழில்முறை கடிதம் தயாரிப்போம்.\n\n"ஆமா" என்று சொல்லுங்கள்.',
 gu: '️ તમારો ક્લેમ નામંજૂર થયો.\n\nશું તમે અપીલ કરવા માગો છો? AI થી પ્રોફેશનલ અપીલ લેટર બનાવીશું.\n\n"હા" કહો.',
 kn: '️ ನಿಮ್ಮ ಕ್ಲೇಮ್ ತಿರಸ್ಕರಿಸಲಾಗಿದೆ.\n\nಮೇಲ್ಮನವಿ ಸಲ್ಲಿಸಲು ಬಯಸುತ್ತೀರಾ? AI ನಿಂದ ವೃತ್ತಿಪರ ಮೇಲ್ಮನವಿ ಪತ್ರ ತಯಾರಿಸುತ್ತೇವೆ.\n\n"ಹೌದು" ಎಂದು ಹೇಳಿ.',
 },

 helper_consent: {
 hi: ' Helper mode shuru karne ke liye, kisan ko OTP verify karna hoga.\n\nKisan ke phone par OTP bheja gaya hai.',
 en: ' To start Helper mode, the farmer needs to verify via OTP.\n\nOTP has been sent to the farmer\'s phone.',
 mr: ' हेल्पर मोड सुरू करण्यासाठी, शेतकऱ्याला OTP ने सत्यापन करणे आवश्यक आहे.',
 te: ' హెల్పర్ మోడ్ ప్రారంభించడానికి, రైతు OTP ద్వారా ధృవీకరించాలి.',
 ta: ' ஹெல்பர் மோடு தொடங்க, விவசாயி OTP மூலம் சரிபார்க்க வேண்டும்.',
 gu: ' હેલ્પર મોડ શરૂ કરવા, ખેડૂતે OTP દ્વારા ચકાસણી કરવી પડશે.',
 kn: ' ಹೆಲ್ಪರ್ ಮೋಡ್ ಪ್ರಾರಂಭಿಸಲು, ರೈತ OTP ಮೂಲಕ ಪರಿಶೀಲಿಸಬೇಕು.',
 },

 error_message: {
 hi: ' Kuch galat ho gaya. Kripya dobara try karein ya "menu" type karein.',
 en: ' Something went wrong. Please try again or type "menu".',
 mr: ' काहीतरी चूक झाली. कृपया पुन्हा प्रयत्न करा.',
 te: ' ఏదో తప్పు జరిగింది. దయచేసి మళ్ళీ ప్రయత్నించండి.',
 ta: ' ஏதோ தவறு நடந்தது. மீண்டும் முயற்சிக்கவும்.',
 gu: ' કંઈક ખોટું થયું. ફરી પ્રયાસ કરો.',
 kn: ' ಏನೋ ತಪ್ಪಾಗಿದೆ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
 },

 thank_you: {
 hi: ' Dhanyavaad! BimaSathi use karne ke liye shukriya.\nKabhi bhi madad chahiye to "hi" type karein.',
 en: ' Thank you for using BimaSathi!\nType "hi" anytime you need help.',
 mr: ' धन्यवाद! BimaSathi वापरल्याबद्दल आभार.\nकधीही मदत हवी असल्यास "hi" टाइप करा.',
 te: ' ధన్యవాదాలు! BimaSathi వాడినందుకు కృతజ్ఞతలు.\nసహాయం కావాలంటే "hi" టైప్ చేయండి.',
 ta: ' நன்றி! BimaSathi பயன்படுத்தியதற்கு நன்றி.\nஉதவி தேவைப்படும்போது "hi" டைப் செய்யுங்கள்.',
 gu: ' આભાર! BimaSathi વાપરવા બદલ ધન્યવાદ.\nમદદ જોઈએ ત્યારે "hi" ટાઈપ કરો.',
 kn: ' ಧನ್ಯವಾದ! BimaSathi ಬಳಸಿದ್ದಕ್ಕೆ ಕೃತಜ್ಞತೆ.\nಸಹಾಯ ಬೇಕಾದಾಗ "hi" ಟೈಪ್ ಮಾಡಿ.',
 },
});


// ─────────────────────────────────────────────────────────────
// Template Helpers
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
 * Fill placeholders in a template string {key} → value
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
// Exports
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
