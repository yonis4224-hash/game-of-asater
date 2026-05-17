const questionsDB = {
    culture: [],
    whoIs: [],
    entertainment: [],
    football: []
};

let currentQuestionIndex = 0;
let currentRound = 1;
let scores = {};
let selectedMode = '1v1';
let timer = null;
let timeLeft = 30;

function loadQuestions() {
    const cultureQuestions = [
        {
            id: 1,
            س: "ما الكوكب الأقرب للشمس؟",
            خيارات: ["عطارد", "الزهرة", "الأرض", "المريخ"],
            الجواب: 0,
            مجال: "ثقافة عامة"
        },
        {
            id: 2,
            س: "ما أكبر محيط في العالم؟",
            خيارات: ["الأطلسي", "الهادئ", "الهندي", "المتجمد"],
            الجواب: 1,
            مجال: "ثقافة عامة"
        },
        {
            id: 3,
            س: "كم عدد ألوان قوس قزح؟",
            خيارات: ["5", "6", "7", "8"],
            الجواب: 2,
            مجال: "ثقافة عامة"
        }
    ];

    const whoIsQuestions = [
        {
            س: "ولد في البرتغال، لعب لسبورتنغ ومانشستر يونايتد وريال مدريد ويوفنتوس، فاز ببطولة أوروبا 2016 و5 كرات ذهبية",
            ج: "كريستيانو رونالدو"
        },
        {
            س: "ولد في الأرجنتين، أمضى معظم مسيرته في برشلونة ثم باريس سان جيرمان وإنتر ميامي، فاز بكأس العالم 2022 و8 كرات ذهبية",
            ج: "ليونيل ميسي"
        },
        {
            س: "مهاجم فرنسي، لعب لموناكو ويوفنتوس وريال مدريد، فاز بكأس العالم 2018 ويحمل الرقم القياسي لأغلى صفقة",
            ج: "كيليان مبابي"
        }
    ];

    questionsDB.culture = cultureQuestions;
    questionsDB.whoIs = whoIsQuestions;
}

function getRandomQuestion(category, count = 1) {
    const questions = questionsDB[category] || [];
    const shuffled = [...questions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
