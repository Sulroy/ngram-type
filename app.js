var ngramTypeConfig = {
    el: '#app',
    data: function() {
        return {
            // If there are major schema changes, increment this number.
            // and update the `data-reset-modal` message.
            VERSION: 3.0,

            // Data source mappings.
            bigrams: bigrams,
            trigrams: trigrams,
            tetragrams: tetragrams,
            words: words,
            custom_words: null,

            data: {
                source: 'bigrams',
                soundCorrectLetterEnabled: true,
                soundIncorrectLetterEnabled: true,
                soundPassedThresholdEnabled: true,
                soundFailedThresholdEnabled: true,
                lessonGenerationMode: 'random',
                ema: {
                    genBias: 1,
                    alpha: 0.2,
                    mistakeWeight: 1,
                    consistencyWeight: 1.5,
                },
                bigrams: {
                    scope: 50,
                    combination: 2,
                    repetition: 3,
                    minimumWPM: 40,
                    minimumAccuracy: 100,
                    WPMs: [],
                    phrases: {},
                    phrasesCurrentIndex: 0,
                    ngramEmaMs: {},
                },
                trigrams: {
                    scope: 50,
                    combination: 2,
                    repetition: 3,
                    minimumWPM: 40,
                    minimumAccuracy: 100,
                    WPMs: [],
                    phrases: {},
                    phrasesCurrentIndex: 0,
                    ngramEmaMs: {},
                },
                tetragrams: {
                    scope: 50,
                    combination: 2,
                    repetition: 3,
                    minimumWPM: 40,
                    minimumAccuracy: 100,
                    WPMs: [],
                    phrases: {},
                    phrasesCurrentIndex: 0,
                    ngramEmaMs: {},
                },
                words: {
                    scope: 50,
                    combination: 2,
                    repetition: 3,
                    minimumWPM: 40,
                    minimumAccuracy: 100,
                    WPMs: [],
                    phrases: {},
                    phrasesCurrentIndex: 0,
                    ngramEmaMs: {},
                },
                custom_words: {
                    scope: null,
                    combination: 2,
                    repetition: 3,
                    minimumWPM: 40,
                    minimumAccuracy: 100,
                    WPMs: [],
                    phrases: {},
                    phrasesCurrentIndex: 0,
                    ngramEmaMs: {},
                },
            },

            phrases: [],
            expectedPhrase: '',
            typedPhrase: '',
            startTime: '',
            hitsCorrect: 0,
            hitsWrong: 0,
            isInputCorrect: true,
            rawWPM: 0,
            accuracy: 0,
        }
    },
    computed: {
        dataSource: function() {
            var dataSource = this.data['source'];
            return this.data[dataSource];
        },
        WPMs: function() {
            var dataSource = this.dataSource;
            return dataSource.WPMs;
        },
        averageWPM: function() {
            var dataSource = this.dataSource;
            if ($.isEmptyObject(dataSource.WPMs)) {
                return 0;
            }

            var sum = dataSource.WPMs.reduce(function(a, b) { return (a + b) }, 0);
            var average = sum / dataSource.WPMs.length;
            return Math.round(average);
        },
    },
    mounted: function() {
        $('.timer').countimer({ autoStart: false});
        
        // If there's already saved data.
        if (localStorage.ngramTypeAppdata != undefined) {
            var data = this.getSavedData();
            if (
                !data.hasOwnProperty('version')
                || data.version < this.VERSION
            ) {
                // Reset the old/incompatible data.
                this.reset();
                $('#data-reset-modal').modal('toggle');

                this.refreshPhrases();
                this.updateDataVersion();
                this.ensureSchemaDefaults();
            }
            else {
                this.load();
                this.ensureSchemaDefaults();
                var dataSource = this.dataSource;
                this.expectedPhrase = dataSource.phrases[dataSource.phrasesCurrentIndex];
                this.initPhraseNgramState();
            }
        }

        else {
            this.refreshPhrases();
            this.updateDataVersion();
            this.ensureSchemaDefaults();
        }

        // Use jQuery instead of Vue for intercepting the <Tab>/<Esc> key.
        var that = this;
        $('#input-typing').on('keydown', function(e) {
            var key = e.originalEvent.code;
            if (key == 'Tab' || key == 'Escape') {
                e.preventDefault();
                that.resetCurrentPhraseMetrics();
            }
        });

        this.correctLetterSound = new Audio('./media/sounds/click.mp3');
        this.incorrectLetterSound = new Audio('./media/sounds/clack.mp3');
        this.incorrectPhraseSound = new Audio('./media/sounds/failed.mp3');
        this.correctPhraseSound = new Audio('./media/sounds/ding.wav');
        this.currentPlayingSound = null;
    },
    watch: {
        'data.source': function() {
            var dataSource = this.dataSource;

            // Set or get the last saved lesson.
            if ($.isEmptyObject(dataSource.phrases)) {
                this.refreshPhrases();
            }

            else {
                this.expectedPhrase = dataSource.phrases[dataSource.phrasesCurrentIndex];
                // Save state in case of page reload.
                this.save();
            }

            this.resetCurrentPhraseMetrics();
        },
        'data.soundCorrectLetterEnabled': function() {
            this.save();
        },
        'data.soundIncorrectLetterEnabled': function() {
            this.save();
        },
        'data.soundPassedThresholdEnabled': function() {
            this.save();
        },
        'data.soundFailedThresholdEnabled': function() {
            this.save();
        },
        'data.lessonGenerationMode': function() {
            this.refreshPhrasesAndCurrentMetrics();
        },
        'data.ema.genBias': function() {
            this.save();
            this.refreshPhrasesAndCurrentMetrics();
        },
        'data.ema.alpha': function() {
            this.save();
        },
        'data.ema.mistakeWeight': function() {
            this.save();
        },
        'data.ema.consistencyWeight': function() {
            this.save();
        },
        custom_words: function() {
            this.refreshPhrasesAndCurrentMetrics();
        },
        typedPhrase: function() {
            // Make sure to reset any error color when moving to next lesson,
            // lesson being reset, all chars being deleted, etc.
            if (!this.typedPhrase.length) {
                this.resetCurrentPhraseMetrics();
            }

            // Remove the spaces at start of the typed phrase
            // since the user might have a typing break
            // but have a habit of typing the spacebar before pausing the session.
            var typedPhrase = this.typedPhrase.trimStart();

            if (typedPhrase.length == 1) {
                this.startTime = new Date().getTime() / 1000;
            }
        },
        WPMs: function() {
            return this.averageWPM;
        },
    },
    methods: {
        save: function() {
            localStorage.ngramTypeAppdata = JSON.stringify(this.data);
        },
        load: function () {
            this.data = JSON.parse(localStorage.ngramTypeAppdata);
        },
        reset: function () {
            localStorage.removeItem('ngramTypeAppdata');
        },
        getSavedData: function () {
            return JSON.parse(localStorage.ngramTypeAppdata);
        },
        updateDataVersion: function () {
            this.data.version = this.VERSION;
            this.save();
        },
        ensureSchemaDefaults: function () {
            if (
                !this.data.lessonGenerationMode
                || (
                    this.data.lessonGenerationMode !== 'random'
                    && this.data.lessonGenerationMode !== 'ema'
                )
            ) {
                this.data.lessonGenerationMode = 'random';
            }
            this.data.ema ||= {};
            this.data.ema.genBias ||= 1;
            this.data.ema.alpha ||= 0.2;
            this.data.ema.mistakeWeight ||= 1;
            this.data.ema.consistencyWeight ||= 1.5;
        },
        normalizeGenerationScore: function (raw) {
            if (
                raw === Infinity
                || raw === Number.POSITIVE_INFINITY
                || typeof raw !== 'number'
                || raw !== raw
            ) {
                return 1e300;
            }
            return Math.max(raw, 1e-9);
        },
        
        getGenerationEmaScore: function (ngramStr) {
            var ds = this.dataSource;
            var map = ds.ngramEmaMs ||= {};
            if (!Object.prototype.hasOwnProperty.call(map, ngramStr)) {
                return Infinity;
            }
            return map[ngramStr];
        },
        weightedPickIndex: function (weights) {
            var sum = 0;
            for (var i = 0; i < weights.length; i++) {
                sum += weights[i];
            }
            if (sum <= 0) {
                return Math.floor(Math.random() * weights.length);
            }
            var r = Math.random() * sum;
            var acc = 0;
            for (var j = 0; j < weights.length; j++) {
                acc += weights[j];
                if (r < acc) {
                    return j;
                }
            }
            return weights.length - 1;
        },
        sampleNgramsWeightedNoReplace: function (pool, count) {
            var out = [];
            var that = this;
            var poolCopy = pool; // no need to deep copy, we don't mutate elements
            var take = Math.min(count, poolCopy.length);
            for (var t = 0; t < take; t++) {
                var weights = poolCopy.map(function (ng) {
                    return that.normalizeGenerationScore(
                        Math.pow(that.getGenerationEmaScore(ng), that.data.ema.genBias)
                    );
                });
                var idx = this.weightedPickIndex(weights);
                out.push(poolCopy[idx]);
                // poolCopy.splice(idx, 1);
            }
            return out;
        },
        generatePhrasesEmaWeighted: function (numberOfItemsToCombine, repetitions) {
            var sourceKey = this.data.source;
            var source = this[sourceKey];
            var scope = this.data[sourceKey].scope;
            if (scope) {
                source = source.slice(0, scope);
            }
            var pool = this.deepCopy(source);
            if (!pool.length) {
                return [];
            }
            var k = Math.min(numberOfItemsToCombine, pool.length);
            var ngramsSublist = this.sampleNgramsWeightedNoReplace(pool, k);
            var subPhrase = ngramsSublist.join(' ');
            var parts = [];
            for (var i = 0; i < repetitions; i++) {
                parts.push(subPhrase);
            }
            return [parts.join(' ')];
        },
        tokenizePhrase: function (expectedPhrase) {
            var tokenList = expectedPhrase.split(/\s+/).filter(function (t) {
                return t.length > 0;
            });
            var tokens = [];
            var pos = 0;
            for (var i = 0; i < tokenList.length; i++) {
                var token = tokenList[i];
                tokens.push({ text: token, start: pos, end: pos + token.length - 1 });
                pos += token.length;
                if (i < tokenList.length - 1) {
                    // Adds a space between tokens.
                    pos += 1;
                }
            }
            return tokens;
        },
        initPhraseNgramState: function () {
            this.tokens = this.tokenizePhrase(this.expectedPhrase || '');
            var n = this.tokens.length;
            this.tokenWrongCounts = Array(n).fill(0);
            this.tokenKeyTimestampMs = Array(n);
            for (var i = 0; i < n; i++) {
                this.tokenKeyTimestampMs[i] = Array(this.tokens[i].end + 1 - this.tokens[i].start).fill(null);
            }
            this.tokenStartMs = Array(n).fill(null);
            this.tokenEndMs = Array(n).fill(null);
            this.lastValidPrefixLength = 0;
        },
        updateValidPrefixTracking: function (typedPhrase) {
            if (!this.tokens || !this.tokens.length) {
                return;
            }
            if (!this.expectedPhrase.startsWith(typedPhrase)) {
                return;
            }
            var validLen = typedPhrase.length;
            if (validLen < this.lastValidPrefixLength) {
                this.onValidPrefixShrunk(validLen);
            } else if (validLen > this.lastValidPrefixLength) {
                this.onValidPrefixGrown(validLen);
            }
            this.lastValidPrefixLength = validLen;
        },
        onValidPrefixGrown: function (validLen) {
            var now = performance.now();
            var validIdx = validLen - 1;
            for (var i = 0; i < this.tokens.length; i++) {
                var token = this.tokens[i];
                // -1 because we start the timer after the leading space
                // this has the inconvenience of starting the timer on the first character for the first ngram
                // as it doesn't have a leading space.
                if (validIdx >= token.start - 1 && this.tokenStartMs[i] == null) {
                    this.tokenStartMs[i] = now;
                }
                if (validIdx >= token.end && this.tokenEndMs[i] == null) {
                    this.tokenEndMs[i] = now;
                }
                
                if (validIdx >= token.start && validIdx <= token.end) {
                    this.tokenKeyTimestampMs[i][validIdx - token.start] = now;
                }
            }
        },
        onValidPrefixShrunk: function (validLen) {
            for (var i = 0; i < this.tokens.length; i++) {
                var token = this.tokens[i];
                // -2 means we deleted the ngram and the leading space
                if (validLen <= token.start - 2) {
                    this.tokenStartMs[i] = null;
                    this.tokenEndMs[i] = null;
                } else if (validLen <= token.end) {
                    this.tokenEndMs[i] = null;
                }
            }
        },
        firstMismatchTokenIndex: function (typedTrim) {
            var tokenizedTypedPhrase = this.tokenizePhrase(typedTrim);  
            for (var i = 0; i < this.tokens.length; i++) {
                var token = this.tokens[i];
                if (tokenizedTypedPhrase[i].text !== token.text) {
                    return i;
                }
            }
            return -1;
        },
        applyNgramEmaForCompletedPhrase: function () {
            var ds = this.dataSource;
            if (!ds.ngramEmaMs) {
                ds.ngramEmaMs = {};
            }
            var alpha = this.data.ema.alpha;
            for (var i = 0; i < this.tokens.length; i++) {
                var token = this.tokens[i];
                var keyIntervalMs = Array(this.tokenKeyTimestampMs[i].length - 1).fill(null);
                for (var j = 0; j < keyIntervalMs.length; j++) {
                    keyIntervalMs[j] = this.tokenKeyTimestampMs[i][j + 1] - this.tokenKeyTimestampMs[i][j];
                }
                var meanKeyIntervalMs = keyIntervalMs.reduce((acc, b) => acc + b) / keyIntervalMs.length;
                var varianceKeyIntervalMs = keyIntervalMs.reduce((acc, b) => acc + Math.pow(b - meanKeyIntervalMs, 2), 0) / keyIntervalMs.length;
                var coefficientOfVariation = Math.sqrt(varianceKeyIntervalMs) / meanKeyIntervalMs;
                var a = this.tokenStartMs[i];
                var b = this.tokenEndMs[i];
                if (a == null || b == null || b - a <= 0) {
                    throw new Error('Invalid durationMs:', b - a, 'for token:', token.text);
                }
                var prev = ds.ngramEmaMs[token.text] || 0;
                var wrong = this.tokenWrongCounts[i] || 0;
                var mistakePenalty = this.data.ema.mistakeWeight * prev; // mistake cost is relative to the user speed
                var consistencyPenalty = 1 + (this.data.ema.consistencyWeight * coefficientOfVariation);
                var score = ((b - a) + wrong * mistakePenalty) * consistencyPenalty;
                if (prev === undefined) {
                    ds.ngramEmaMs[token.text] = score;
                } else {
                    ds.ngramEmaMs[token.text] = alpha * score + (1 - alpha) * prev;
                }
            }
            this.save();
        },
        getNgramEmaCsvSorted: function () {
            var ds = this.dataSource;
            var ema = ds.ngramEmaMs ||= {};
            var rows = [];
            for (var k in ema) {
                if (Object.prototype.hasOwnProperty.call(ema, k)) {
                    rows.push([k, Math.round(ema[k]*10)/10]);
                }
            }
            rows.sort(function (a, b) {
                return a[1] - b[1];
            });
            var lines = ['ngram,ema_score'];
            for (var i = 0; i < rows.length; i++) {
                lines.push(
                    rows[i][0] + ',' + rows[i][1]
                );
            }
            return lines.join('\r\n');
        },
        downloadNgramEmaCsv: function () {
            var csv = this.getNgramEmaCsvSorted();
            var src = this.data.source;
            var d = new Date();
            var pad = function (n) {
                return (n < 10 ? '0' : '') + n;
            };
            var stamp =
                d.getFullYear() +
                '-' +
                pad(d.getMonth() + 1) +
                '-' +
                pad(d.getDate());
            var name = 'ngram-ema-' + src + '-' + stamp + '.csv';
            var blob = new Blob([csv], {
                type: 'text/csv;charset=utf-8;',
            });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.setAttribute('download', name);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        },
        copyNgramEmaCsv: function () {
            var csv = this.getNgramEmaCsvSorted();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(csv);
            }
        },
        deepCopy: function(arrayOrObject) {
            var emptyArrayOrObject = $.isArray(arrayOrObject) ? [] : {};
            return $.extend(true, emptyArrayOrObject, arrayOrObject);
        },
        shuffle: function(array) {
            for (var i = array.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
        },
        stopCurrentPlayingSound: function() {
            // Sounds at the end of each phrase/lesson
            // dont need to be played from the beginning.
            if (
                this.currentPlayingSound == this.correctPhraseSound
                || this.currentPlayingSound == this.incorrectPhraseSound
            ) {
                return;
            }

            // Reset any playing sound to handle fast typing,
            // Otherwise, the sound will be intermittent and
            // not in sync with the key presses.
            if (this.currentPlayingSound) {
                this.currentPlayingSound.currentTime = 0;
            }
        },
        refreshPhrases: function() {
            var dataSource = this.dataSource;

            if (dataSource.combination < 1) {
                dataSource.combination = 1
            }

            dataSource.phrases = this.generatePhrases(dataSource.combination, dataSource.repetition);
            this.expectedPhrase = dataSource.phrases[0];
            dataSource.phrasesCurrentIndex = 0;
            this.save();
            this.initPhraseNgramState();
        },
        refreshPhrasesAndCurrentMetrics: function() {
            this.refreshPhrases();
            this.resetCurrentPhraseMetrics();
            this.pauseTimer();
        },
        generatePhrases: function(numberOfItemsToCombine, repetitions) {
            if (this.data.lessonGenerationMode === 'ema') {
                return this.generatePhrasesEmaWeighted(
                    numberOfItemsToCombine,
                    repetitions
                );
            }

            var dataSource = this.data['source'];
            var source = this[dataSource];
            var scope = this.data[dataSource].scope

            // Use indexing to limit scope of Ngrams.
            // Select the Top 50/100/150/200.
            // `Custom` has no scope.
            if (scope) {
                source = source.slice(0, scope)
            }

            var ngrams = this.deepCopy(source);

            this.shuffle(ngrams);
            var ngramsProcessed = 0;
            var phrases = [];

            while (ngrams.length) {
                var ngramsSublist = ngrams.slice(0, numberOfItemsToCombine);
                var subPhrase = ngramsSublist.join(' ');
                var _phrase = [];
                for (var i = 0; i < repetitions; i++) {
                    _phrase.push(subPhrase);
                }
                phrases.push(_phrase.join(' '));
                // Remove the processed ngrams.
                ngrams.splice(0, numberOfItemsToCombine);
            }

            return phrases
        },
        pauseTimer: function(e) {
            var isStopped = $('.timer').countimer('stopped');
            if (!isStopped) {
                $('.timer').countimer('stop');
            }
        },
        resumeTimer: function(e) {
            var isStopped = $('.timer').countimer('stopped');
            if (isStopped) {
                $('.timer').countimer('resume');
            }
        },
        keyHandler: function(e) {
            // Only handle text insertions and deletions.
            if (e.inputType !== 'insertText' && e.inputType !== 'deleteContentBackward' && e.inputType !== 'deleteContentForward') {
                return;
            }

            // Remove spaces at starting of the phrase
            var typedPhrase = this.typedPhrase.trimStart();
            if (!typedPhrase.length) {
                return;
            }

            this.resumeTimer();            
            this.updateValidPrefixTracking(typedPhrase);

            if (this.expectedPhrase.startsWith(typedPhrase)) {
                if (this.data.soundCorrectLetterEnabled) {
                    this.stopCurrentPlayingSound();
                    this.correctLetterSound.play();
                    this.currentPlayingSound = this.correctLetterSound;
                }
                this.isInputCorrect = true;
                this.hitsCorrect += 1;
            }
            else if (this.expectedPhrase !== typedPhrase.trimEnd()) {
                if (this.data.soundIncorrectLetterEnabled) {
                    this.stopCurrentPlayingSound();
                    this.incorrectLetterSound.play();
                    this.currentPlayingSound = this.incorrectLetterSound;
                }
                this.isInputCorrect = false;
                this.hitsWrong += 1;
                var ti = this.firstMismatchTokenIndex(typedPhrase);
                if (ti == -1) {
                    throw new Error('all tokens matched, but the phrase is not correct');
                }
                if (this.tokenWrongCounts && ti < this.tokenWrongCounts.length) {
                    this.tokenWrongCounts[ti] += 1;
                }
            }

            if (typedPhrase.trimEnd() === this.expectedPhrase) {
                var currentTime = new Date().getTime() / 1000;
                this.rawWPM = Math.round(
                    // 5 chars equals 1 word.
                    ((this.hitsCorrect + this.hitsWrong) / 5) / (currentTime - this.startTime) * 60
                );

                this.accuracy = Math.round(
                    this.hitsCorrect / (this.hitsCorrect + this.hitsWrong) * 100
                );

                this.applyNgramEmaForCompletedPhrase();

                var dataSource = this.dataSource;
                if (
                    this.rawWPM < dataSource.minimumWPM
                    || this.accuracy < dataSource.minimumAccuracy
                ) {
                    if (this.data.soundFailedThresholdEnabled) {
                        this.stopCurrentPlayingSound();
                        this.incorrectPhraseSound.play();
                        this.currentPlayingSound = this.incorrectPhraseSound;
                    }
                    this.resetCurrentPhraseMetrics();
                    this.pauseTimer()
                    return;
                }

                // Reset WPMs when starting a new round (multi-phrase lesson). In EMA mode
                // only one phrase exists at a time; keep a running average across phrases.
                var newRoundStarted = (dataSource.phrasesCurrentIndex == 0);
                if (newRoundStarted && this.data.lessonGenerationMode !== 'ema') {
                    dataSource.WPMs = [];
                }
                dataSource.WPMs.push(this.rawWPM);

                if (this.data.soundPassedThresholdEnabled) {
                    this.stopCurrentPlayingSound();
                    this.correctPhraseSound.play();
                    this.currentPlayingSound = this.correctPhraseSound;
                }
                this.pauseTimer()
                this.nextPhrase();
            }
        },
        resetCurrentPhraseMetrics: function() {
            this.hitsCorrect = 0;
            this.hitsWrong = 0;
            this.typedPhrase = '';
            this.isInputCorrect = true;
            this.initPhraseNgramState();
        },
        nextPhrase: function() {
            this.resetCurrentPhraseMetrics();
            var dataSource = this.dataSource;
            var nextPhraseExists = (dataSource.phrases.length > dataSource.phrasesCurrentIndex + 1);
            if (nextPhraseExists) {
                dataSource.phrasesCurrentIndex += 1;
                this.expectedPhrase = dataSource.phrases[dataSource.phrasesCurrentIndex];
                this.save();
            }
            // Start again from beginning, but generate new data.
            else {
                this.refreshPhrases();
            }
        },
        customWordsModalShow: function() {
            var $customWordsModal = $('#custom-words-modal');
            var customWords = this.custom_words.join('\n')
            $customWordsModal.find('textarea').val(customWords);
        },
        customWordsModalSubmit: function() {
            var $customWordsModal = $('#custom-words-modal');
            var customWordsSubmitted = $customWordsModal.find('textarea').val();

            // Convert to array, remove the empty string.
            var customWordsProccessed = customWordsSubmitted.split(/\s+/).filter(function(element) {return element});

            $customWordsModal.modal("hide");
            this.custom_words = customWordsProccessed;
        },
    },
};

var ngramTypeApp = new Vue(ngramTypeConfig);
