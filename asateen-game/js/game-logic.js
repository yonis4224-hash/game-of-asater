const rooms = {};

function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function shuffleArray(arr) {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

const cultureQuestions = [
    { س: "ما الكوكب الأقرب للشمس؟", خيارات: ["عطارد", "الزهرة", "الأرض", "المريخ"], الجواب: 0 },
    { س: "ما أكبر محيط في العالم؟", خيارات: ["الأطلسي", "الهادئ", "الهندي", "المتجمد"], الجواب: 1 },
    { س: "كم عدد ألوان قوس قزح؟", خيارات: ["5", "6", "7", "8"], الجواب: 2 },
    { س: "ما العنصر الأكثر وفرة في الهواء؟", خيارات: ["الأكسجين", "أكسيد الكربون", "النيتروجين", "الهيدروجين"], الجواب: 2 },
    { س: "عام الهبوط على القمر؟", خيارات: ["1967", "1968", "1969", "1970"], الجواب: 2 },
    { س: "ما أطول نهر بالعالم؟", خيارات: ["الأمازون", "النيل", "المسيسيبي", "اليانغتسي"], الجواب: 1 },
    { س: "ما عاصمة فرنسا؟", خيارات: ["لندن", "باريس", "برلين", "مدريد"], الجواب: 1 },
    { س: "عدد أسنان البالغ؟", خيارات: ["28", "30", "32", "34"], الجواب: 2 },
    { س: "ما أكبر عضو بالجسم؟", خيارات: ["الكبد", "الجلد", "الدماغ", "القلب"], الجواب: 1 },
    { س: "كاتب الحرب والسلام؟", خيارات: ["دوستويفسكي", "تولستوي", "تشيخوف", "تورغينيف"], الجواب: 1 },
    { س: "أسرع حيوان بري؟", خيارات: ["الأسد", "النمر", "الفهد", "الغزال"], الجواب: 2 },
    { س: "مؤسس مايكروسوفت؟", خيارات: ["جوبز", "بيل غيتس", "زوكربيرغ", "بيزوس"], الجواب: 1 },
    { س: "أعلى جبل؟", خيارات: ["كليمنجارو", "إيفرست", "أكونكاغوا", "ماكنلي"], الجواب: 1 },
    { س: "عدد سور القرآن؟", خيارات: ["110", "114", "120", "124"], الجواب: 1 },
    { س: "عاصمة اليابان؟", خيارات: ["طوكيو", "كيوتو", "أوساكا", "هيروشيما"], الجواب: 0 },
    { س: "مخترع المصباح؟", خيارات: ["إديسون", "تسلا", "غراهام بيل", "واط"], الجواب: 0 },
    { س: "الكوكب الأحمر؟", خيارات: ["الزهرة", "المريخ", "المشتري", "زحل"], الجواب: 1 },
    { س: "أول رئيس أمريكي؟", خيارات: ["جيفرسون", "واشنطن", "لينكولن", "آدامز"], الجواب: 1 },
    { س: "عملة اليابان؟", خيارات: ["اليوان", "الين", "الوون", "الدولار"], الجواب: 1 },
    { س: "حروف العربية؟", خيارات: ["26", "27", "28", "29"], الجواب: 2 },
    { س: "أول إنسان في الفضاء؟", خيارات: ["نيل أرمسترونغ", "غاغارين", "غلين", "شيبرد"], الجواب: 1 },
    { س: "عاصمة ألمانيا؟", خيارات: ["ميونخ", "برلين", "هامبورغ", "فرانكفورت"], الجواب: 1 },
    { س: "عاصمة إيطاليا؟", خيارات: ["ميلانو", "روما", "نابولي", "البندقية"], الجواب: 1 },
    { س: "عاصمة روسيا؟", خيارات: ["بطرسبرغ", "موسكو", "كييف", "نوفو"], الجواب: 1 },
    { س: "عاصمة إسبانيا؟", خيارات: ["برشلونة", "مدريد", "إشبيلية", "فالنسيا"], الجواب: 1 },
    { س: "عاصمة تركيا؟", خيارات: ["إسطنبول", "أنقرة", "إزمير", "بورصة"], الجواب: 1 },
    { س: "عاصمة البرازيل؟", خيارات: ["ريو", "برازيليا", "ساو باولو", "سالڤادور"], الجواب: 1 },
    { س: "عاصمة كندا؟", خيارات: ["تورونتو", "أوتاوا", "فانكوفر", "مونتريال"], الجواب: 1 },
    { س: "عاصمة الهند؟", خيارات: ["مومباي", "نيودلهي", "كولكاتا", "تشيناي"], الجواب: 1 },
    { س: "عاصمة أستراليا؟", خيارات: ["سيدني", "ملبورن", "كانبرا", "بريسبان"], الجواب: 2 },
];

const whoIsQuestions = [
    { س: "ولد في البرتغال، لعب لسبورتنغ ومانشستر يونايتد وريال مدريد ويوفنتوس، فاز ببطولة أوروبا 2016 و5 كرات ذهبية", خيارات: ["كريستيانو رونالدو", "ليونيل ميسي", "كيليان مبابي", "نيمار"], الجواب: 0 },
    { س: "ولد في الأرجنتين، أمضى معظم مسيرته في برشلونة ثم باريس سان جيرمان وإنتر ميامي، فاز بكأس العالم 2022 و8 كرات ذهبية", خيارات: ["دييغو مارادونا", "ليونيل ميسي", "سيرخيو أغويرو", "أنخيل دي ماريا"], الجواب: 1 },
    { س: "مهاجم فرنسي، لعب لموناكو ويوفنتوس وريال مدريد، فاز بكأس العالم 2018 ويحمل الرقم القياسي لأغلى صفقة", خيارات: ["أنطوان غريزمان", "كيليان مبابي", "كريم بنزيما", "بول بوغبا"], الجواب: 1 },
    { س: "لاعب وسط فرنسي، لعب لليون وريال مدريد، فاز بكأس العالم 1998 وبطولة أوروبا 2000", خيارات: ["باتريك فييرا", "زين الدين زيدان", "ديدييه ديشامب", "لوران بلان"], الجواب: 1 },
    { س: "مهاجم برازيلي، لعب لسانتوس وبرشلونة وميلانو، فاز بكأس العالم 2002 و3 كرات ذهبية", خيارات: ["رونالدو نازاريو", "رونالدينيو", "نيمار", "كاكا"], الجواب: 1 },
    { س: "مهاجم إنجليزي، لعب لمانشستر يونايتد وريال مدريد، فاز بدوري أبطال أوروبا 2008", خيارات: ["واين روني", "ديفيد بيكهام", "مايكل أوين", "ستيفن جيرارد"], الجواب: 0 },
    { س: "حارس مرمى ألماني، لعب لبايرن ميونخ، فاز بكأس العالم 2014", خيارات: ["أوليفر كان", "مانويل نوير", "مارك أندريه تير شتيغن", "ينس ليمان"], الجواب: 1 },
    { س: "لاعب كرواتي، لعب لتوتنهام وريال مدريد، قاد كرواتيا لنهائي كأس العالم 2018", خيارات: ["لوكا مودريتش", "إيفان راكيتيتش", "ماتيو كوفاتشيتش", "مارسيلو بروزوفيتش"], الجواب: 0 },
    { س: "مهاجم مصري، لعب لبرشلونة وليفربول، فاز بدوري أبطال أوروبا", خيارات: ["محمد أبو تريكة", "محمد صلاح", "حسام حسن", "عمرو زكي"], الجواب: 1 },
    { س: "مدافع إسباني، لعب لأشبيلية وريال مدريد، فاز بكأس العالم 2010", خيارات: ["جيرارد بيكيه", "سيرخيو راموس", "سيرجيو بوسكيتس", "جوردي ألبا"], الجواب: 1 },
];

const entertainmentQuestions = [
    { س: "ممثل أمريكي، مثل تايتانيك وذا وولف أوف وول ستريت وإنسبشن، حاصل على أوسكار", خيارات: ["براد بيت", "ليوناردو دي كابريو", "توم هانكس", "جوني ديب"], الجواب: 1 },
    { س: "ممثل أمريكي، مثل الرجل الحديدي وشارلوك هولمز، حاصل على غولدن غلوب", خيارات: ["روبرت داوني جونيور", "كريس إيفانز", "كريس هيمسوورث", "توم هولاند"], الجواب: 0 },
    { س: "ممثل أمريكي، مثل فورست غامب وكاست أواي، حاصل على أوسكار", خيارات: ["توم هانكس", "مورغان فريمان", "دنزل واشنطن", "بروس ويليس"], الجواب: 0 },
    { س: "ممثل أمريكي، مثل جون ويك والماتريكس، بطل أكشن عالمي", خيارات: ["سيلفستر ستالون", "أرنولد شوارزنيجر", "كيانو ريفز", "جاكي شان"], الجواب: 2 },
    { س: "ممثل بريطاني، مثل هاري بوتر، ساحر هوجوورتس", خيارات: ["روبرت باتينسون", "دانيال رادكليف", "توم فيلتون", "روبرت غرينت"], الجواب: 1 },
    { س: "ممثل أمريكي، مثل ذا تيرمينيتور، حاكم كاليفورنيا سابقاً", خيارات: ["سيلفستر ستالون", "أرنولد شوارزنيجر", "دولف لوندغرين", "جان كلود فاندام"], الجواب: 1 },
    { س: "ممثل أمريكي، مثل روكي وكل الحلقات، أسطورة الملاكمة", خيارات: ["أرنولد شوارزنيجر", "سيلفستر ستالون", "بروس لي", "جاكي شان"], الجواب: 1 },
    { س: "ممثل أمريكي، مثل الماتريكس، أيقونة الحركة", خيارات: ["ويل سميث", "كيانو ريفز", "توم كروز", "بروس ويليس"], الجواب: 1 },
    { س: "ممثل بريطاني، مثل جيمس بوند، ممثل أسطوري", خيارات: ["بييرس بروسنان", "دانيال كريغ", "شون كونري", "روجر مور"], الجواب: 1 },
    { س: "ممثلة أمريكية، مثل بلاك ويدو وأفينجرز، أيقونة هوليوود", خيارات: ["سكارليت جوهانسون", "أنجلينا جولي", "جينيفر لورنس", "إيما ستون"], الجواب: 0 },
];

function createRoom(hostSocketId, hostName) {
    const code = generateCode();
    rooms[code] = {
        code,
        host: hostSocketId,
        mode: '1v1',
        scores: {},
        players: {
            [hostSocketId]: {
                socketId: hostSocketId,
                name: hostName,
                team: 'A',
                score: 0,
                ready: true,
                trapAnswer: null,
                selectedOption: null
            }
        },
        game: null,
        status: 'waiting'
    };
    rooms[code].scores[hostSocketId] = 0;
    return rooms[code];
}

function joinRoom(code, socketId, playerName) {
    const room = rooms[code];
    if (!room) {
        return { success: false, message: 'الغرفة غير موجودة' };
    }
    if (room.status !== 'waiting') {
        return { success: false, message: 'اللعبة بدأت بالفعل' };
    }
    if (Object.keys(room.players).length >= 8) {
        return { success: false, message: 'الغرفة ممتلئة' };
    }
    if (room.players[socketId]) {
        return { success: false, message: 'أنت بالفعل في الغرفة' };
    }

    const teams = Object.values(room.players).map(p => p.team);
    const teamA = teams.filter(t => t === 'A').length;
    const teamB = teams.filter(t => t === 'B').length;

    room.players[socketId] = {
        socketId,
        name: playerName,
        team: teamA <= teamB ? 'A' : 'B',
        score: 0,
        ready: true,
        trapAnswer: null,
        selectedOption: null
    };
    room.scores[socketId] = 0;

    const totalPlayers = Object.keys(room.players).length;
    if (totalPlayers === 2) room.mode = '1v1';
    else if (totalPlayers === 4) room.mode = '2v2';
    else if (totalPlayers >= 6) room.mode = '4v4';

    return { success: true, room };
}

function getRoom(code) {
    return rooms[code] || null;
}

function startGame(code) {
    const room = rooms[code];
    if (!room) return null;

    room.status = 'playing';
    room.game = {
        currentRound: 1,
        currentQuestionIndex: 0,
        questionsPerRound: 5,
        totalRounds: 3,
        timer: 30,
        timerInterval: null,
        roundType: 'trap',
        teamOptions: null,
        questions: {
            1: shuffleArray(cultureQuestions).slice(0, 5),
            2: shuffleArray(whoIsQuestions).slice(0, 5),
            3: shuffleArray(entertainmentQuestions).slice(0, 5)
        }
    };

    Object.keys(room.players).forEach(id => {
        room.players[id].score = 0;
        room.players[id].trapAnswer = null;
        room.players[id].selectedOption = null;
        room.scores[id] = 0;
    });

    const totalPlayers = Object.keys(room.players).length;
    if (totalPlayers === 2) room.mode = '1v1';
    else if (totalPlayers === 4) room.mode = '2v2';
    else room.mode = '4v4';

    return {
        code,
        round: 1,
        questionIndex: 0,
        question: room.game.questions[1][0],
        roundType: 'trap',
        timer: 30,
        players: room.players,
        mode: room.mode
    };
}

function submitTrapAnswer(code, socketId, questionIndex, answer) {
    const room = rooms[code];
    if (!room || !room.players[socketId]) return null;

    room.players[socketId].trapAnswer = answer;

    const submittedCount = Object.values(room.players).filter(p => p.trapAnswer !== null).length;
    const totalCount = Object.keys(room.players).length;

    return { submittedCount, totalCount, allSubmitted: submittedCount === totalCount };
}

function submitOption(code, socketId, questionIndex, optionIndex) {
    const room = rooms[code];
    if (!room || !room.players[socketId] || !room.game) return null;

    room.players[socketId].selectedOption = optionIndex;

    const submittedCount = Object.values(room.players).filter(p => p.selectedOption !== null).length;
    const totalCount = Object.keys(room.players).length;

    return { submittedCount, totalCount, allSubmitted: submittedCount === totalCount };
}

function buildTeamOptions(code, questionIndex) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    const question = room.game.questions[room.game.currentRound]?.[questionIndex];
    if (!question) return null;

    const teams = [...new Set(Object.values(room.players).map(p => p.team))];
    const teamOptions = {};
    const correctAnswer = question.خيارات[question.الجواب];

    for (const team of teams) {
        const opponentAnswers = [];
        const seenAnswers = new Set([correctAnswer]);

        for (const player of Object.values(room.players)) {
            if (player.team !== team && player.trapAnswer !== null) {
                if (!seenAnswers.has(player.trapAnswer)) {
                    opponentAnswers.push({ text: player.trapAnswer, fromPlayer: player.name });
                    seenAnswers.add(player.trapAnswer);
                }
            }
        }

        const defaultWrong = question.خيارات
            .map((opt, idx) => ({ text: opt, idx }))
            .filter(a => a.idx !== question.الجواب && !seenAnswers.has(a.text));

        const options = [{ text: correctAnswer, isCorrect: true }];

        for (const ans of opponentAnswers) {
            if (options.length >= 4) break;
            options.push({ text: ans.text, isCorrect: false, fromPlayer: ans.fromPlayer });
        }

        for (const ans of defaultWrong) {
            if (options.length >= 4) break;
            options.push({ text: ans.text, isCorrect: false, isDefault: true });
        }

        for (let i = options.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [options[i], options[j]] = [options[j], options[i]];
        }

        const correctIndex = options.findIndex(o => o.isCorrect);
        teamOptions[team] = { options, correctIndex };
    }

    room.game.teamOptions = teamOptions;
    return teamOptions;
}

function calculateQuestionResults(code, questionIndex) {
    const room = rooms[code];
    if (!room || !room.game || !room.game.teamOptions) return null;

    const correctPlayers = [];
    const wrongPlayers = [];
    const trapInfo = {};

    for (const player of Object.values(room.players)) {
        if (player.selectedOption === null) continue;

        const teamOpts = room.game.teamOptions[player.team];
        if (!teamOpts) continue;

        const isCorrect = player.selectedOption === teamOpts.correctIndex;

        if (isCorrect) {
            player.score += 100;
            correctPlayers.push({ name: player.name, team: player.team, score: player.score });
        } else {
            const selectedOpt = teamOpts.options[player.selectedOption];
            const fromPlayer = selectedOpt?.fromPlayer || null;

            if (fromPlayer) {
                trapInfo[fromPlayer] = (trapInfo[fromPlayer] || 0) + 1;
                const trapper = Object.values(room.players).find(p => p.name === fromPlayer);
                if (trapper) trapper.score += 50;
            }

            wrongPlayers.push({
                name: player.name,
                team: player.team,
                selectedAnswer: selectedOpt?.text || '',
                fromPlayer
            });
        }

        room.scores[player.socketId] = player.score;
    }

    const teamScores = {};
    for (const player of Object.values(room.players)) {
        teamScores[player.team] = (teamScores[player.team] || 0) + player.score;
    }

    return { correctPlayers, wrongPlayers, trapInfo, scores: room.scores, teamScores, mode: room.mode };
}

function resetForNextQuestion(code) {
    const room = rooms[code];
    if (!room || !room.game) return null;

    for (const player of Object.values(room.players)) {
        player.trapAnswer = null;
        player.selectedOption = null;
    }

    room.game.teamOptions = null;

    room.game.currentQuestionIndex++;
    const questions = room.game.questions[room.game.currentRound];

    if (room.game.currentQuestionIndex >= questions.length) {
        room.game.currentRound++;
        room.game.currentQuestionIndex = 0;

        if (room.game.currentRound > room.game.totalRounds) {
            room.status = 'finished';
            return { isFinished: true };
        }
    }

    return {
        round: room.game.currentRound,
        questionIndex: room.game.currentQuestionIndex,
        question: room.game.questions[room.game.currentRound]?.[room.game.currentQuestionIndex],
        timer: 30,
        players: room.players,
        mode: room.mode,
        isFinished: false
    };
}

function disconnectPlayer(socketId) {
    for (const code in rooms) {
        const room = rooms[code];
        if (room.players[socketId]) {
            delete room.players[socketId];
            delete room.scores[socketId];
            if (Object.keys(room.players).length === 0) {
                delete rooms[code];
            } else {
                if (room.host === socketId) {
                    room.host = Object.keys(room.players)[0];
                }
            }
            break;
        }
    }
}

module.exports = {
    createRoom,
    joinRoom,
    getRoom,
    startGame,
    submitTrapAnswer,
    submitOption,
    disconnectPlayer,
    buildTeamOptions,
    calculateQuestionResults,
    resetForNextQuestion,
    rooms
};
