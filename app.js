/* =========================================================
   O‘zbekistonning Eng Yangi Tarixi — Quiz Engine
   ========================================================= */

(() => {
  'use strict';

  const STORAGE_KEY = 'oz_tarix_quiz_progress_v1';
  const BLOCK_SIZE = 30;
  const EXAM_SIZE = 25;

  const State = {
    allQuestions: [],
    blocks: [],
    progress: {
      blocks: {},       // { [blockIndex]: { correct, total, pct } }
      solvedIds: {},    // { [questionId]: boolean }
      examsCount: 0
    },
    filter: 'all',
    searchQuery: '',
    session: null,      // Active quiz session
    timerInterval: null,
    lastResult: null
  };

  /* -------------------- DOM Cache -------------------- */
  const DOM = {
    viewLoading: document.getElementById('view-loading'),
    viewError: document.getElementById('view-error'),
    errorMessage: document.getElementById('error-message'),
    viewHome: document.getElementById('view-home'),
    viewQuiz: document.getElementById('view-quiz'),
    viewResults: document.getElementById('view-results'),

    btnLogoHome: document.getElementById('btn-logo-home'),
    btnNavHome: document.getElementById('btn-nav-home'),
    headerSolvedText: document.getElementById('header-solved-text'),

    btnStartExam: document.getElementById('btn-start-exam'),
    btnResetStats: document.getElementById('btn-reset-stats'),
    homeDonutContainer: document.getElementById('home-donut-container'),
    statBlocksDone: document.getElementById('stat-blocks-done'),
    statAccuracy: document.getElementById('stat-accuracy'),
    statExamsCount: document.getElementById('stat-exams-count'),
    statCoveragePct: document.getElementById('stat-coverage-pct'),
    statCoverageBar: document.getElementById('stat-coverage-bar'),

    blockSearch: document.getElementById('block-search'),
    blocksGrid: document.getElementById('blocks-grid'),

    quizModeBadge: document.getElementById('quiz-mode-badge'),
    quizCounterText: document.getElementById('quiz-counter-text'),
    timerDisplay: document.getElementById('timer-display'),
    btnFinishQuiz: document.getElementById('btn-finish-quiz'),
    quizProgressFill: document.getElementById('quiz-progress-fill'),
    questionTopic: document.getElementById('question-topic'),
    questionOriginalId: document.getElementById('question-original-id'),
    questionText: document.getElementById('question-text'),
    optionsList: document.getElementById('options-list'),
    instantFeedback: document.getElementById('instant-feedback'),
    btnPrevQ: document.getElementById('btn-prev-q'),
    btnNextQ: document.getElementById('btn-next-q'),
    paletteAnsweredCount: document.getElementById('palette-answered-count'),
    questionPalette: document.getElementById('question-palette'),

    resGradeBadge: document.getElementById('res-grade-badge'),
    resTitle: document.getElementById('res-title'),
    resSubtitle: document.getElementById('res-subtitle'),
    btnRetryWrong: document.getElementById('btn-retry-wrong'),
    btnRetakeSame: document.getElementById('btn-retake-same'),
    btnResultsHome: document.getElementById('btn-results-home'),
    resCorrectCount: document.getElementById('res-correct-count'),
    resCorrectPct: document.getElementById('res-correct-pct'),
    resWrongCount: document.getElementById('res-wrong-count'),
    resSkippedCount: document.getElementById('res-skipped-count'),
    resTimeSpent: document.getElementById('res-time-spent'),
    resAvgSpeed: document.getElementById('res-avg-speed'),
    resDonutContainer: document.getElementById('res-donut-container'),
    resDonutLegend: document.getElementById('res-donut-legend'),
    resTopicBars: document.getElementById('res-topic-bars'),
    countTabWrong: document.getElementById('count-tab-wrong'),
    countTabAll: document.getElementById('count-tab-all'),
    countTabCorrect: document.getElementById('count-tab-correct'),
    analysisList: document.getElementById('analysis-list')
  };

  /* -------------------- Utilities -------------------- */
  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        State.progress = {
          blocks: parsed.blocks || {},
          solvedIds: parsed.solvedIds || {},
          examsCount: Number(parsed.examsCount) || 0
        };
      }
    } catch (_) {
      // Ignore storage restrictions
    }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(State.progress));
    } catch (_) {
      // Ignore storage errors
    }
  }

  function buildBlocks(questions) {
    const blocks = [];
    for (let i = 0; i < questions.length; i += BLOCK_SIZE) {
      const slice = questions.slice(i, i + BLOCK_SIZE);
      const blockNumber = Math.floor(i / BLOCK_SIZE) + 1;
      const startId = slice[0].id;
      const endId = slice[slice.length - 1].id;

      // Extract unique topic numbers/names
      const topicNums = [];
      slice.forEach((q) => {
        const match = q.topic.match(/^(\d+-MAVZU)/i);
        const label = match ? match[1] : q.topic;
        if (!topicNums.includes(label)) topicNums.push(label);
      });

      blocks.push({
        index: blockNumber,
        startId,
        endId,
        questions: slice,
        topicSummary: topicNums.join(', '),
        fullTopics: [...new Set(slice.map((q) => q.topic))].join(' • ')
      });
    }
    return blocks;
  }

  /* -------------------- SVG Donut Chart Builder -------------------- */
  function renderDonutSVG(container, segments, centerMain, centerSub) {
    const size = 120;
    const stroke = 13;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const total = segments.reduce((acc, s) => acc + s.value, 0);

    let offset = 0;
    const circles = total > 0
      ? segments
          .filter((s) => s.value > 0)
          .map((seg) => {
            const dash = (seg.value / total) * circumference;
            const circle = `<circle
              cx="${size / 2}" cy="${size / 2}" r="${radius}"
              fill="none" stroke="${seg.color}" stroke-width="${stroke}"
              stroke-dasharray="${dash.toFixed(2)} ${circumference.toFixed(2)}"
              stroke-dashoffset="${(-offset).toFixed(2)}"
              stroke-linecap="butt"
              transform="rotate(-90 ${size / 2} ${size / 2})"
            />`;
            offset += dash;
            return circle;
          })
          .join('')
      : '';

    container.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}" width="100%" height="100%" role="img" aria-label="${escapeHTML(centerMain)}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="none" stroke="#e2e8f0" stroke-width="${stroke}" />
        ${circles}
        <text x="50%" y="48%" text-anchor="middle" dominant-baseline="central" font-size="20" font-weight="700" fill="#0f172a">${escapeHTML(centerMain)}</text>
        <text x="50%" y="66%" text-anchor="middle" dominant-baseline="central" font-size="10.5" font-weight="600" fill="#64748b">${escapeHTML(centerSub)}</text>
      </svg>
    `;
  }

  /* -------------------- View Navigation -------------------- */
  function showView(viewName) {
    DOM.viewLoading.classList.add('hidden');
    DOM.viewError.classList.add('hidden');
    DOM.viewHome.classList.add('hidden');
    DOM.viewQuiz.classList.add('hidden');
    DOM.viewResults.classList.add('hidden');

    if (viewName === 'home') {
      stopTimer();
      DOM.viewHome.classList.remove('hidden');
      DOM.btnNavHome.classList.add('hidden');
      renderHomeDashboard();
    } else if (viewName === 'quiz') {
      DOM.viewQuiz.classList.remove('hidden');
      DOM.btnNavHome.classList.remove('hidden');
    } else if (viewName === 'results') {
      stopTimer();
      DOM.viewResults.classList.remove('hidden');
      DOM.btnNavHome.classList.remove('hidden');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* -------------------- Home Rendering -------------------- */
  function renderHomeDashboard() {
    const totalQ = State.allQuestions.length;
    const solvedEntries = Object.values(State.progress.solvedIds);
    const solvedCount = solvedEntries.length;
    const correctCount = solvedEntries.filter(Boolean).length;
    const wrongCount = solvedCount - correctCount;
    const remainingCount = Math.max(0, totalQ - solvedCount);

    const accuracy = solvedCount > 0 ? Math.round((correctCount / solvedCount) * 100) : 0;
    const coverage = totalQ > 0 ? Math.round((solvedCount / totalQ) * 100) : 0;
    const completedBlocksCount = Object.keys(State.progress.blocks).length;

    DOM.headerSolvedText.textContent = `${solvedCount} / ${totalQ} savol`;
    DOM.statBlocksDone.textContent = `${completedBlocksCount} / ${State.blocks.length}`;
    DOM.statAccuracy.textContent = `${accuracy}%`;
    DOM.statExamsCount.textContent = `${State.progress.examsCount} ta`;
    DOM.statCoveragePct.textContent = `${coverage}%`;
    DOM.statCoverageBar.style.width = `${coverage}%`;

    renderDonutSVG(
      DOM.homeDonutContainer,
      [
        { color: '#059669', value: correctCount },
        { color: '#dc2626', value: wrongCount },
        { color: '#e2e8f0', value: remainingCount }
      ],
      `${accuracy}%`,
      'Aniqlik'
    );

    renderBlocksGrid();
  }

  function renderBlocksGrid() {
    const q = State.searchQuery.trim().toLowerCase();

    const filtered = State.blocks.filter((blk) => {
      const saved = State.progress.blocks[blk.index];
      if (State.filter === 'completed' && !saved) return false;
      if (State.filter === 'uncompleted' && saved) return false;

      if (q) {
        const hay = `${blk.index}-blok ${blk.startId}-${blk.endId} ${blk.fullTopics}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });

    if (filtered.length === 0) {
      DOM.blocksGrid.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; padding: 32px; text-align: center; color: var(--text-muted);">
          Qidiruv bo‘yicha mos blok topilmadi.
        </div>
      `;
      return;
    }

    DOM.blocksGrid.innerHTML = filtered
      .map((blk) => {
        const saved = State.progress.blocks[blk.index];
        const pct = saved ? saved.pct : 0;
        const isDone = Boolean(saved);
        return `
          <button type="button" class="block-card ${isDone ? 'completed' : ''}" data-block-index="${blk.index}">
            <div>
              <div class="block-card-top">
                <span class="block-num">${blk.index}-blok</span>
                <span class="block-range">${blk.startId}–${blk.endId} savollar</span>
              </div>
              <p class="block-topics" title="${escapeHTML(blk.fullTopics)}">${escapeHTML(blk.fullTopics)}</p>
            </div>
            <div class="block-card-footer">
              <div class="block-status-row">
                <span class="${isDone ? 'status-done' : 'status-new'}">
                  ${isDone ? `Eng yaxshi natija: ${saved.correct}/${saved.total} (${pct}%)` : `${blk.questions.length} ta savol • Boshlash →`}
                </span>
              </div>
              <div class="progress-track">
                <div class="progress-fill" style="width: ${pct}%"></div>
              </div>
            </div>
          </button>
        `;
      })
      .join('');
  }

  /* -------------------- Quiz Session Engine -------------------- */
  function startSession({ mode, title, blockIndex = null, questions }) {
    State.session = {
      mode, // 'block' | 'exam' | 'retry'
      title,
      blockIndex,
      questions,
      currentIndex: 0,
      userAnswers: {}, // { [qIndex]: 'A' | 'B' | 'C' | 'D' }
      secondsElapsed: 0
    };

    DOM.quizModeBadge.textContent = title;
    DOM.quizModeBadge.classList.toggle('exam', mode === 'exam');

    startTimer();
    showView('quiz');
    renderCurrentQuestion();
    renderQuestionPalette();
  }

  function startTimer() {
    stopTimer();
    DOM.timerDisplay.textContent = '00:00';
    State.timerInterval = setInterval(() => {
      if (!State.session) return;
      State.session.secondsElapsed += 1;
      DOM.timerDisplay.textContent = formatTime(State.session.secondsElapsed);
    }, 1000);
  }

  function stopTimer() {
    if (State.timerInterval) {
      clearInterval(State.timerInterval);
      State.timerInterval = null;
    }
  }

  function renderCurrentQuestion() {
    const s = State.session;
    if (!s) return;

    const total = s.questions.length;
    const idx = s.currentIndex;
    const item = s.questions[idx];
    const chosen = s.userAnswers[idx] || null;
    const isInstantMode = s.mode === 'block' || s.mode === 'retry';

    DOM.quizCounterText.textContent = `Savol ${idx + 1} / ${total}`;
    DOM.questionTopic.textContent = item.topic;
    DOM.questionOriginalId.textContent = `Baza #${item.id}`;
    DOM.questionText.textContent = `${idx + 1}. ${item.question}`;

    const answeredCount = Object.keys(s.userAnswers).length;
    const pct = Math.round((answeredCount / total) * 100);
    DOM.quizProgressFill.style.width = `${pct}%`;
    DOM.paletteAnsweredCount.textContent = `${answeredCount} / ${total}`;

    const letters = ['A', 'B', 'C', 'D'];
    DOM.optionsList.innerHTML = letters
      .map((letter) => {
        let cls = 'option-btn';
        if (isInstantMode && chosen) {
          cls += ' locked';
          if (letter === item.answer) cls += ' correct';
          else if (letter === chosen) cls += ' wrong';
        } else if (chosen === letter) {
          cls += ' selected';
        }

        return `
          <button type="button" class="${cls}" data-option="${letter}" role="radio" aria-checked="${chosen === letter}">
            <span class="option-key">${letter}</span>
            <span class="option-label">${escapeHTML(item.options[letter])}</span>
          </button>
        `;
      })
      .join('');

    // Instant feedback banner in practice modes
    if (isInstantMode && chosen) {
      const isRight = chosen === item.answer;
      DOM.instantFeedback.className = `instant-feedback ${isRight ? 'ok' : 'bad'}`;
      DOM.instantFeedback.innerHTML = isRight
        ? `✓ Barakalla! To‘g‘ri javob: <strong>${item.answer}</strong>`
        : `✕ Noto‘g‘ri. Siz <strong>${chosen}</strong> belgiladingiz, to‘g‘ri javob: <strong>${item.answer}</strong>`;
    } else {
      DOM.instantFeedback.className = 'instant-feedback hidden';
      DOM.instantFeedback.innerHTML = '';
    }

    DOM.btnPrevQ.disabled = idx === 0;
    DOM.btnNextQ.innerHTML =
      idx === total - 1
        ? `<span>Yakunlash</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
        : `<span>Keyingi</span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
  }

  function renderQuestionPalette() {
    const s = State.session;
    if (!s) return;

    const isInstantMode = s.mode === 'block' || s.mode === 'retry';

    DOM.questionPalette.innerHTML = s.questions
      .map((item, idx) => {
        const chosen = s.userAnswers[idx];
        let cls = 'pal-btn';
        if (idx === s.currentIndex) cls += ' current';
        if (chosen) {
          if (isInstantMode) {
            cls += chosen === item.answer ? ' pal-correct' : ' pal-wrong';
          } else {
            cls += ' answered';
          }
        }
        return `<button type="button" class="${cls}" data-qindex="${idx}">${idx + 1}</button>`;
      })
      .join('');
  }

  function handleOptionSelect(letter) {
    const s = State.session;
    if (!s) return;

    const idx = s.currentIndex;
    const isInstantMode = s.mode === 'block' || s.mode === 'retry';

    // In instant practice mode, lock once answered
    if (isInstantMode && s.userAnswers[idx]) return;

    s.userAnswers[idx] = letter;
    renderCurrentQuestion();
    renderQuestionPalette();
  }

  function finishQuiz() {
    const s = State.session;
    if (!s) return;

    const total = s.questions.length;
    const answeredCount = Object.keys(s.userAnswers).length;

    if (answeredCount < total) {
      const ok = window.confirm(
        `Siz ${total} ta savoldan ${answeredCount} tasiga javob belgiladingiz. Testni yakunlashni tasdiqlaysizmi?`
      );
      if (!ok) return;
    }

    stopTimer();

    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    const topicStats = {};
    const details = [];

    s.questions.forEach((item, idx) => {
      const chosen = s.userAnswers[idx] || null;
      const isCorrect = chosen === item.answer;

      if (!topicStats[item.topic]) {
        topicStats[item.topic] = { topic: item.topic, total: 0, correct: 0 };
      }
      topicStats[item.topic].total += 1;

      if (!chosen) {
        skippedCount += 1;
      } else if (isCorrect) {
        correctCount += 1;
        topicStats[item.topic].correct += 1;
        State.progress.solvedIds[item.id] = true;
      } else {
        wrongCount += 1;
        if (!State.progress.solvedIds[item.id]) {
          State.progress.solvedIds[item.id] = false;
        }
      }

      details.push({
        order: idx + 1,
        questionObj: item,
        chosen,
        isCorrect
      });
    });

    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

    if (s.mode === 'block' && s.blockIndex !== null) {
      const prev = State.progress.blocks[s.blockIndex];
      if (!prev || pct >= prev.pct) {
        State.progress.blocks[s.blockIndex] = { correct: correctCount, total, pct };
      }
    } else if (s.mode === 'exam') {
      State.progress.examsCount += 1;
    }

    saveProgress();

    State.lastResult = {
      mode: s.mode,
      title: s.title,
      blockIndex: s.blockIndex,
      questions: s.questions,
      total,
      correctCount,
      wrongCount,
      skippedCount,
      pct,
      secondsElapsed: s.secondsElapsed,
      topicStats: Object.values(topicStats),
      details
    };

    renderResultsView('wrong');
    showView('results');
  }

  /* -------------------- Results & Mistake Analysis -------------------- */
  function renderResultsView(activeFilter = 'wrong') {
    const r = State.lastResult;
    if (!r) return;

    // Grade evaluation
    let gradeText = 'A’lo natija';
    let gradeClass = 'result-grade-pill';
    if (r.pct < 60) {
      gradeText = 'Qayta tayyorlanish tavsiya etiladi';
      gradeClass = 'result-grade-pill low';
    } else if (r.pct < 85) {
      gradeText = 'Yaxshi natija';
      gradeClass = 'result-grade-pill mid';
    }

    DOM.resGradeBadge.textContent = `${gradeText} • ${r.pct}%`;
    DOM.resGradeBadge.className = gradeClass;
    DOM.resTitle.textContent = `${r.title} — Yakuniy tahlil`;
    DOM.resSubtitle.textContent = `Jami ${r.total} ta savoldan ${r.correctCount} tasiga to‘g‘ri javob berdingiz.`;

    DOM.resCorrectCount.textContent = r.correctCount;
    DOM.resCorrectPct.textContent = `${r.pct}% aniqlik`;
    DOM.resWrongCount.textContent = r.wrongCount;
    DOM.resSkippedCount.textContent = r.skippedCount;
    DOM.resTimeSpent.textContent = formatTime(r.secondsElapsed);

    const avgSec = r.total > 0 ? Math.round(r.secondsElapsed / r.total) : 0;
    DOM.resAvgSpeed.textContent = `Har savolga ~${avgSec} soniya`;

    // Donut chart
    renderDonutSVG(
      DOM.resDonutContainer,
      [
        { color: '#059669', value: r.correctCount },
        { color: '#dc2626', value: r.wrongCount },
        { color: '#cbd5e1', value: r.skippedCount }
      ],
      `${r.pct}%`,
      `${r.correctCount}/${r.total}`
    );

    DOM.resDonutLegend.innerHTML = `
      <li>
        <span class="leg-left"><i class="leg-swatch" style="background:#059669"></i>To‘g‘ri javoblar</span>
        <strong>${r.correctCount} ta</strong>
      </li>
      <li>
        <span class="leg-left"><i class="leg-swatch" style="background:#dc2626"></i>Noto‘g‘ri javoblar</span>
        <strong>${r.wrongCount} ta</strong>
      </li>
      <li>
        <span class="leg-left"><i class="leg-swatch" style="background:#cbd5e1"></i>Belgilanmagan</span>
        <strong>${r.skippedCount} ta</strong>
      </li>
    `;

    // Topic bar chart
    DOM.resTopicBars.innerHTML = r.topicStats
      .map((ts) => {
        const tPct = ts.total > 0 ? Math.round((ts.correct / ts.total) * 100) : 0;
        const barCls = tPct >= 80 ? '' : tPct >= 50 ? 'mid' : 'low';
        return `
          <div class="topic-bar-item">
            <div class="topic-bar-top">
              <span class="topic-bar-name" title="${escapeHTML(ts.topic)}">${escapeHTML(ts.topic)}</span>
              <span class="topic-bar-score">${ts.correct}/${ts.total} (${tPct}%)</span>
            </div>
            <div class="topic-bar-track">
              <div class="topic-bar-fill ${barCls}" style="width: ${tPct}%"></div>
            </div>
          </div>
        `;
      })
      .join('');

    // Retry wrong button visibility
    const wrongItems = r.details.filter((d) => !d.isCorrect);
    DOM.btnRetryWrong.disabled = wrongItems.length === 0;
    DOM.btnRetryWrong.textContent =
      wrongItems.length > 0
        ? `Xatolarni qayta ishlash (${wrongItems.length})`
        : 'Barcha javoblar to‘g‘ri!';

    // Analysis tabs counts
    DOM.countTabWrong.textContent = wrongItems.length;
    DOM.countTabAll.textContent = r.details.length;
    DOM.countTabCorrect.textContent = r.correctCount;

    // Default to 'all' if 0 mistakes so user immediately sees their full review
    const effectiveFilter = activeFilter === 'wrong' && wrongItems.length === 0 ? 'all' : activeFilter;
    document.querySelectorAll('#analysis-filters .pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.afilter === effectiveFilter);
    });

    renderAnalysisList(effectiveFilter);
  }

  function renderAnalysisList(filterType) {
    const r = State.lastResult;
    if (!r) return;

    const items = r.details.filter((d) => {
      if (filterType === 'wrong') return !d.isCorrect;
      if (filterType === 'correct') return d.isCorrect;
      return true;
    });

    if (items.length === 0) {
      DOM.analysisList.innerHTML = `<div class="empty-analysis">Bu bo‘limda savollar mavjud emas.</div>`;
      return;
    }

    DOM.analysisList.innerHTML = items
      .map((d) => {
        const q = d.questionObj;
        const statusClass = d.isCorrect ? 'is-correct' : d.chosen ? 'is-wrong' : 'is-skipped';
        const badgeClass = d.isCorrect ? 'correct' : d.chosen ? 'wrong' : 'skipped';
        const badgeLabel = d.isCorrect ? '✓ To‘g‘ri' : d.chosen ? '✕ Xato' : '! Belgilanmagan';

        const userText = d.chosen
          ? `<strong>${d.chosen})</strong> ${escapeHTML(q.options[d.chosen])}`
          : 'Javob belgilanmagan';

        const rightText = `<strong>${q.answer})</strong> ${escapeHTML(q.options[q.answer])}`;

        return `
          <div class="review-item ${statusClass}">
            <div class="review-top">
              <span class="topic-badge">${escapeHTML(q.topic)} • Baza #${q.id}</span>
              <span class="review-status ${badgeClass}">${badgeLabel}</span>
            </div>
            <p class="review-q-text">${d.order}. ${escapeHTML(q.question)}</p>
            <div class="review-answers">
              <div class="ans-box ${d.isCorrect ? 'right-ans' : d.chosen ? 'user-wrong' : 'user-skipped'}">
                <small>Sizning javobingiz</small>
                <div>${userText}</div>
              </div>
              <div class="ans-box right-ans">
                <small>To‘g‘ri javob</small>
                <div>${rightText}</div>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  /* -------------------- Event Listeners -------------------- */
  function bindEvents() {
    DOM.btnLogoHome.addEventListener('click', () => showView('home'));
    DOM.btnNavHome.addEventListener('click', () => showView('home'));
    DOM.btnResultsHome.addEventListener('click', () => showView('home'));

    // Start 25-question random exam
    DOM.btnStartExam.addEventListener('click', () => {
      const random25 = shuffleArray(State.allQuestions).slice(0, EXAM_SIZE);
      startSession({
        mode: 'exam',
        title: `Imtihon rejimi (${EXAM_SIZE} ta random savol)`,
        questions: random25
      });
    });

    // Reset local progress
    DOM.btnResetStats.addEventListener('click', () => {
      if (window.confirm('Barcha saqlangan blok va imtihon statistikalarini tozalaysizmi?')) {
        State.progress = { blocks: {}, solvedIds: {}, examsCount: 0 };
        saveProgress();
        renderHomeDashboard();
      }
    });

    // Search & filter blocks
    DOM.blockSearch.addEventListener('input', (e) => {
      State.searchQuery = e.target.value;
      renderBlocksGrid();
    });

    document.querySelectorAll('.blocks-controls .pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('.blocks-controls .pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        State.filter = pill.dataset.filter;
        renderBlocksGrid();
      });
    });

    // Start a 30-question block
    DOM.blocksGrid.addEventListener('click', (e) => {
      const card = e.target.closest('.block-card');
      if (!card) return;
      const blkIdx = Number(card.dataset.blockIndex);
      const blk = State.blocks.find((b) => b.index === blkIdx);
      if (!blk) return;

      startSession({
        mode: 'block',
        title: `${blk.index}-blok (${blk.startId}–${blk.endId})`,
        blockIndex: blk.index,
        questions: blk.questions
      });
    });

    // Option selection
    DOM.optionsList.addEventListener('click', (e) => {
      const btn = e.target.closest('.option-btn');
      if (!btn) return;
      handleOptionSelect(btn.dataset.option);
    });

    // Prev / Next / Finish
    DOM.btnPrevQ.addEventListener('click', () => {
      if (!State.session || State.session.currentIndex <= 0) return;
      State.session.currentIndex -= 1;
      renderCurrentQuestion();
      renderQuestionPalette();
    });

    DOM.btnNextQ.addEventListener('click', () => {
      if (!State.session) return;
      if (State.session.currentIndex < State.session.questions.length - 1) {
        State.session.currentIndex += 1;
        renderCurrentQuestion();
        renderQuestionPalette();
      } else {
        finishQuiz();
      }
    });

    DOM.btnFinishQuiz.addEventListener('click', finishQuiz);

    // Question Palette jump
    DOM.questionPalette.addEventListener('click', (e) => {
      const btn = e.target.closest('.pal-btn');
      if (!btn || !State.session) return;
      State.session.currentIndex = Number(btn.dataset.qindex);
      renderCurrentQuestion();
      renderQuestionPalette();
    });

    // Results actions
    DOM.btnRetryWrong.addEventListener('click', () => {
      const r = State.lastResult;
      if (!r) return;
      const wrongQuestions = r.details.filter((d) => !d.isCorrect).map((d) => d.questionObj);
      if (wrongQuestions.length === 0) return;

      startSession({
        mode: 'retry',
        title: `Xatolar ustida ishlash (${wrongQuestions.length} ta savol)`,
        questions: wrongQuestions
      });
    });

    DOM.btnRetakeSame.addEventListener('click', () => {
      const r = State.lastResult;
      if (!r) return;
      if (r.mode === 'exam') {
        const fresh25 = shuffleArray(State.allQuestions).slice(0, EXAM_SIZE);
        startSession({
          mode: 'exam',
          title: `Imtihon rejimi (${EXAM_SIZE} ta random savol)`,
          questions: fresh25
        });
      } else {
        startSession({
          mode: r.mode,
          title: r.title,
          blockIndex: r.blockIndex,
          questions: r.questions
        });
      }
    });

    // Analysis tabs
    document.querySelectorAll('#analysis-filters .pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#analysis-filters .pill').forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        renderAnalysisList(pill.dataset.afilter);
      });
    });

    // Keyboard shortcuts during active quiz
    document.addEventListener('keydown', (e) => {
      if (DOM.viewQuiz.classList.contains('hidden') || !State.session) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const key = e.key.toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(key)) {
        handleOptionSelect(key);
      } else if (['1', '2', '3', '4'].includes(key)) {
        const map = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
        handleOptionSelect(map[key]);
      } else if (e.key === 'ArrowLeft') {
        DOM.btnPrevQ.click();
      } else if (e.key === 'ArrowRight') {
        DOM.btnNextQ.click();
      }
    });
  }

  /* -------------------- Bootstrap -------------------- */
  async function init() {
    loadProgress();
    bindEvents();

    try {
      const res = await fetch('questions.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const questions = Array.isArray(data) ? data : data.questions;

      if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Test savollari ro‘yxati bo‘sh.');
      }

      State.allQuestions = questions;
      State.blocks = buildBlocks(questions);
      showView('home');
    } catch (err) {
      DOM.viewLoading.classList.add('hidden');
      DOM.viewError.classList.remove('hidden');
      DOM.errorMessage.textContent =
        'questions.json faylini yuklab bo‘lmadi. Vercel yoki lokal HTTP server orqali ochilganiga ishonch hosil qiling.';
      console.error(err);
    }
  }

  init();
})();
