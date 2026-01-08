// ============================================
// Section configuration
// ============================================
const SECTIONS = {
  vocab: { title: "Vocabulary Review", bank: window.VOCAB_BANK },
  comp:  { title: "Comprehension Review", bank: window.COMP_BANK },
  cloze: { title: "Cloze Review", bank: window.CLOZE_BANK },
};

// ============================================
// DOM references
// ============================================
const coverSection   = document.getElementById("coverSection");
const quizSection    = document.getElementById("view-quiz");
const resultSection  = document.getElementById("view-result");

const tabs           = document.querySelectorAll(".tab");
const startBtn       = document.getElementById("startBtn");

const backToCoverBtn = document.getElementById("backToCover");
const quizTitleEl    = document.getElementById("quizTitle");
const counterEl      = document.getElementById("questionCounter");
const progressBarEl  = document.getElementById("progressBar");
const promptEl       = document.getElementById("prompt");
const choicesWrap    = document.getElementById("choicesWrap");
const feedbackEl     = document.getElementById("feedback");
const checkBtn       = document.getElementById("checkBtn");
const nextBtn        = document.getElementById("nextBtn");

const resultTitleEl  = document.getElementById("resultTitle");
const resultStatsEl  = document.getElementById("resultStats");
const retryBtn       = document.getElementById("retryBtn");
const toTopBtn       = document.getElementById("toTop");

// ============================================
// State
// ============================================
let currentSectionKey = "vocab";
let session = null;    // { key, bank, idx, correct, total }
let selected = new Set();
let questionLocked = false;

// ============================================
// WebAudio chime (simple correct / incorrect sound)
// ============================================
let audioCtx;

function chime(ok = true) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    o.type = "sine";
    const now = audioCtx.currentTime;

    if (ok) {
      // Upward, happy beep
      o.frequency.setValueAtTime(880, now);
      o.frequency.linearRampToValueAtTime(1320, now + 0.18);
    } else {
      // Slightly downward, “oops” beep
      o.frequency.setValueAtTime(260, now);
      o.frequency.linearRampToValueAtTime(180, now + 0.18);
    }

    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.25, now + 0.03);
    g.gain.linearRampToValueAtTime(0.0001, now + 0.30);

    o.connect(g);
    g.connect(audioCtx.destination);

    o.start(now);
    o.stop(now + 0.32);
  } catch (e) {
    console.warn("Audio chime unavailable:", e);
  }
}

// ============================================
// Helper functions
// ============================================
function showView(which) {
  [coverSection, quizSection, resultSection].forEach(sec => {
    if (!sec) return;
    sec.classList.remove("visible");
  });
  if (which) which.classList.add("visible");
}

function setActiveTab(key) {
  currentSectionKey = key;
  tabs.forEach(tab => {
    if (tab.dataset.section === key) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });
}

// Fisher–Yates shuffle so kids can't memorize order
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function startQuiz() {
  const config = SECTIONS[currentSectionKey];
  const bank = config.bank.slice(); // copy so we don't mutate original

  // Randomize the order each time a review starts
  shuffleArray(bank);

  session = {
    key: currentSectionKey,
    bank,
    idx: 0,
    correct: 0,
    total: bank.length
  };

  quizTitleEl.textContent = config.title;
  selected = new Set();
  questionLocked = false;
  showView(quizSection);
  renderQuestion();
}

function renderQuestion() {
  const q = session.bank[session.idx];

  // Counter + progress
  counterEl.textContent = `Question ${session.idx + 1} of ${session.total}`;
  const pct = (session.idx / session.total) * 100;
  progressBarEl.style.width = pct + "%";

  // Question text (preserve line breaks)
  const safeText = q.q.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  promptEl.innerHTML = safeText.replace(/\\n/g, "<br>");

  // Choices
  choicesWrap.innerHTML = "";
  selected.clear();
  questionLocked = false;
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";
  nextBtn.disabled = true;
  checkBtn.disabled = false;

  const letters = ["A", "B", "C", "D"];
  const isMulti = Array.isArray(q.answers);

  q.choices.forEach((choiceText, idx) => {
    const choiceBtn = document.createElement("button");
    choiceBtn.className = "choice";
    choiceBtn.dataset.index = idx;

    const letterSpan = document.createElement("strong");
    letterSpan.textContent = letters[idx] + ".";
    choiceBtn.appendChild(letterSpan);

    const textSpan = document.createElement("span");
    textSpan.textContent = " " + choiceText;
    choiceBtn.appendChild(textSpan);

    choiceBtn.addEventListener("click", () => {
      if (questionLocked) return;
      if (selected.has(idx)) {
        selected.delete(idx);
        choiceBtn.classList.remove("selected");
      } else {
        if (!isMulti) {
          // single-select question
          selected.forEach(i => {
            const oldBtn = choicesWrap.querySelector(`.choice[data-index="${i}"]`);
            if (oldBtn) oldBtn.classList.remove("selected");
          });
          selected.clear();
        }
        selected.add(idx);
        choiceBtn.classList.add("selected");
      }
      feedbackEl.textContent = "";
      feedbackEl.className = "feedback";
    });

    choicesWrap.appendChild(choiceBtn);
  });

  // Update Check button label for multi-answer items
  if (isMulti) {
    checkBtn.textContent = "Check Answers";
  } else {
    checkBtn.textContent = "Check Answer";
  }
}

function gradeCurrentQuestion() {
  // 🔒 Prevent double-scoring the same question
  if (!session || questionLocked) return;

  const q = session.bank[session.idx];

  if (selected.size === 0) {
    feedbackEl.textContent = "Choose an answer before checking.";
    feedbackEl.className = "feedback warning";
    return;
  }

  const isMulti = Array.isArray(q.answers);
  let isCorrect = false;
  let correctIndices = [];

  if (isMulti) {
    correctIndices = q.answers.slice().sort();
    const chosen = Array.from(selected).slice().sort();
    isCorrect = chosen.length === correctIndices.length &&
                chosen.every((val, i) => val === correctIndices[i]);
  } else {
    const ansIndex = q.answer;
    correctIndices = [ansIndex];
    isCorrect = selected.has(ansIndex);
  }

  if (isCorrect) {
    session.correct += 1;
    chime(true);  // ✅ happy beep
    feedbackEl.textContent = "Correct!";
    feedbackEl.className = "feedback correct";
  } else {
    chime(false); // ❌ “oops” beep
    feedbackEl.textContent = isMulti
      ? "Not quite. Look at which choices should be selected."
      : "Not quite. The correct answer is highlighted.";
    feedbackEl.className = "feedback incorrect";
  }

  // Highlight answers
  choicesWrap.querySelectorAll(".choice").forEach(btn => {
    const idx = Number(btn.dataset.index);
    if (correctIndices.includes(idx)) {
      btn.classList.add("correct");
    } else if (selected.has(idx)) {
      btn.classList.add("incorrect");
    }
  });

  questionLocked = true;
  checkBtn.disabled = true;   // ✅ stop extra scoring clicks
  nextBtn.disabled = false;
}

function nextQuestion() {
  if (!session) return;
  session.idx += 1;
  if (session.idx >= session.total) {
    showResults();
  } else {
    renderQuestion();
  }
}

function showResults() {
  const correct = session.correct;
  const total = session.total;
  const rawPct = (correct / total) * 100;
  const pct = Math.min(100, Math.round(rawPct)); // safety clamp at 100

  if (pct === 100) {
    resultTitleEl.textContent = "Perfect score!";
  } else if (pct >= 80) {
    resultTitleEl.textContent = "Great work!";
  } else if (pct >= 60) {
    resultTitleEl.textContent = "Nice effort!";
  } else {
    resultTitleEl.textContent = "Keep practicing!";
  }

  resultStatsEl.textContent = `You answered ${correct} out of ${total} questions correctly (${pct}%).`;

  showView(resultSection);
}

// ============================================
// Event wiring
// ============================================

// Tabs on cover
tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    setActiveTab(tab.dataset.section);
  });
});

// Start / Back / Navigation buttons
startBtn.addEventListener("click", startQuiz);
backToCoverBtn.addEventListener("click", () => showView(coverSection));
toTopBtn.addEventListener("click", () => showView(coverSection));

checkBtn.addEventListener("click", gradeCurrentQuestion);
nextBtn.addEventListener("click", nextQuestion);

retryBtn.addEventListener("click", () => {
  if (!session) return;
  // restart same section (and reshuffle)
  const key = session.key;
  setActiveTab(key);
  startQuiz();
});

// Show cover on initial load
showView(coverSection);
setActiveTab("vocab");