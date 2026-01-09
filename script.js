// ============================================
// Section configuration
// ============================================
const SECTIONS = {
  vocab: { title: "Vocabulary", bank: window.VOCAB_BANK },
  comp:  { title: "Comprehension", bank: window.COMP_BANK },
  cloze: { title: "Cloze", bank: window.CLOZE_BANK },
};

// ============================================
// DOM references
// ============================================
const coverSection   = document.getElementById("coverSection");
const statsSection   = document.getElementById("view-stats");
const quizSection    = document.getElementById("view-quiz");
const resultSection  = document.getElementById("view-result");

const tabs           = document.querySelectorAll(".tab");
const startBtn       = document.getElementById("startBtn");
const statsBtn       = document.getElementById("statsBtn");
const backFromStats  = document.getElementById("backFromStats");
const clearStatsBtn  = document.getElementById("clearStatsBtn");

// Note: backToCoverBtn removed to force completion
const quizTitleEl    = document.getElementById("quizTitle");
const counterEl      = document.getElementById("questionCounter");
const progressBarEl  = document.getElementById("progressBar");
const promptEl       = document.getElementById("prompt");
const readAloudBtn   = document.getElementById("readAloudBtn");
const choicesWrap    = document.getElementById("choicesWrap");
const feedbackEl     = document.getElementById("feedback");
const checkBtn       = document.getElementById("checkBtn");
const nextBtn        = document.getElementById("nextBtn");

const resultTitleEl  = document.getElementById("resultTitle");
const resultStatsEl  = document.getElementById("resultStats");
const retryBtn       = document.getElementById("retryBtn");
const viewStatsResult= document.getElementById("viewStatsFromResult");
const toTopBtn       = document.getElementById("toTop");

// Table References
const vocabHistoryEl = document.getElementById("vocabHistory");
const compHistoryEl  = document.getElementById("compHistory");
const clozeHistoryEl = document.getElementById("clozeHistory");

// ============================================
// State
// ============================================
let currentSectionKey = "vocab";
let session = null;    
let selected = new Set();
let questionLocked = false;
let isQuizActive = false; // Safety lock

// ============================================
// Helper functions
// ============================================
function showView(which) {
  [coverSection, statsSection, quizSection, resultSection].forEach(sec => {
    sec.classList.remove("visible");
  });
  which.classList.add("visible");
  window.speechSynthesis.cancel();
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

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ============================================
// BROWSER SAFETY LOCK (Prevents Refresh)
// ============================================
window.addEventListener("beforeunload", function (e) {
  if (isQuizActive) {
    e.preventDefault();
    e.returnValue = "You haven't finished the section yet!";
    return e.returnValue;
  }
});

// ============================================
// SESSION HISTORY LOGIC
// ============================================
function getHistory() {
  const raw = localStorage.getItem("kids_review_history");
  return raw ? JSON.parse(raw) : [];
}

function saveSessionToHistory(sectionKey, sectionTitle, score, total) {
  const history = getHistory();
  const pct = Math.round((score / total) * 100);
  
  const newEntry = {
    key: sectionKey, 
    title: sectionTitle,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: new Date().toLocaleDateString(),
    score: score,
    total: total,
    pct: pct
  };

  history.push(newEntry);
  localStorage.setItem("kids_review_history", JSON.stringify(history));
}

function createHistoryRow(entry) {
  const row = document.createElement("tr");
  
  let pctClass = "bad";
  if (entry.pct >= 80) pctClass = "good";
  else if (entry.pct >= 60) pctClass = "okay";

  row.innerHTML = `
    <td>${entry.time}</td>
    <td>${entry.score}/${entry.total}</td>
    <td class="${pctClass}">${entry.pct}%</td>
  `;
  return row;
}

function showStats() {
  const history = getHistory();
  const today = new Date().toLocaleDateString();
  const todaysSessions = history.filter(h => h.date === today);

  // Clear tables
  vocabHistoryEl.innerHTML = "";
  compHistoryEl.innerHTML = "";
  clozeHistoryEl.innerHTML = "";

  const addEmpty = (el) => {
    el.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#999;">No attempts yet</td></tr>`;
  };

  const vocabList = todaysSessions.filter(h => h.key === "vocab").reverse();
  const compList  = todaysSessions.filter(h => h.key === "comp").reverse();
  const clozeList = todaysSessions.filter(h => h.key === "cloze").reverse();

  if (vocabList.length === 0) addEmpty(vocabHistoryEl);
  else vocabList.forEach(entry => vocabHistoryEl.appendChild(createHistoryRow(entry)));

  if (compList.length === 0) addEmpty(compHistoryEl);
  else compList.forEach(entry => compHistoryEl.appendChild(createHistoryRow(entry)));

  if (clozeList.length === 0) addEmpty(clozeHistoryEl);
  else clozeList.forEach(entry => clozeHistoryEl.appendChild(createHistoryRow(entry)));

  showView(statsSection);
}

function clearHistory() {
  if (confirm("Are you sure you want to erase your progress history?")) {
    localStorage.removeItem("kids_review_history");
    showStats(); 
  }
}

// ============================================
// TEXT TO SPEECH
// ============================================
function speakQuestion() {
  window.speechSynthesis.cancel();
  const parts = [];
  parts.push({ el: promptEl, text: promptEl.innerText, originalHTML: promptEl.innerHTML });

  const choiceBtns = Array.from(document.querySelectorAll(".choice"));
  choiceBtns.forEach((btn, index) => {
    const span = btn.querySelector("span");
    parts.push({
      el: span,
      text: `Choice ${String.fromCharCode(65 + index)}. ${span.innerText}`,
      originalHTML: span.innerHTML
    });
  });

  let index = 0;
  function speakNext() {
    if (index >= parts.length) return;
    const part = parts[index];
    const utterance = new SpeechSynthesisUtterance(part.text);
    utterance.rate = 0.9; 
    utterance.lang = "en-US";
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        const charIndex = event.charIndex;
        let nextSpace = part.text.indexOf(' ', charIndex + 1);
        if (nextSpace === -1) nextSpace = part.text.length;
        const before = part.text.substring(0, charIndex).replace(/\n/g, "<br>");
        const word = part.text.substring(charIndex, nextSpace);
        const after = part.text.substring(nextSpace).replace(/\n/g, "<br>");
        part.el.innerHTML = `${before}<span class="highlight-word">${word}</span>${after}`;
      }
    };
    utterance.onend = () => {
      part.el.innerHTML = part.originalHTML;
      index++;
      speakNext();
    };
    window.speechSynthesis.speak(utterance);
  }
  speakNext();
}

// ============================================
// QUIZ LOGIC
// ============================================
function startQuiz() {
  const config = SECTIONS[currentSectionKey];
  const bank = config.bank.slice(); 
  shuffleArray(bank);

  session = {
    key: currentSectionKey,
    title: config.title,
    bank,
    idx: 0,
    correct: 0,
    total: bank.length
  };

  quizTitleEl.textContent = config.title;
  selected = new Set();
  questionLocked = false;
  isQuizActive = true; // LOCK NAVIGATION
  
  showView(quizSection);
  renderQuestion();
}

function renderQuestion() {
  const q = session.bank[session.idx];
  counterEl.textContent = `Question ${session.idx + 1} of ${session.total}`;
  const pct = (session.idx / session.total) * 100;
  progressBarEl.style.width = pct + "%";

  const safeText = q.q.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  promptEl.innerHTML = safeText.replace(/\\n/g, "<br>");

  choicesWrap.innerHTML = "";
  selected.clear();
  questionLocked = false;
  feedbackEl.textContent = "";
  feedbackEl.className = "feedback";
  nextBtn.disabled = true;
  checkBtn.disabled = false;

  const letters = ["A", "B", "C", "D"];
  const isMulti = Array.isArray(q.answer) && q.answer.length > 1;

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
          selected.clear();
          document.querySelectorAll(".choice").forEach(b => b.classList.remove("selected"));
        }
        selected.add(idx);
        choiceBtn.classList.add("selected");
      }
    });
    choicesWrap.appendChild(choiceBtn);
  });
  checkBtn.textContent = isMulti ? "Check Answers" : "Check Answer";
}

function gradeCurrentQuestion() {
  if (!session || questionLocked) return;
  const q = session.bank[session.idx];
  
  if (selected.size === 0) {
    feedbackEl.textContent = "Please choose an answer first.";
    feedbackEl.className = "feedback warning";
    return;
  }

  let correctIndices = Array.isArray(q.answer) ? q.answer : [q.answer];
  const chosen = Array.from(selected).sort();
  const correctSorted = correctIndices.slice().sort();
  const isCorrect = (chosen.length === correctSorted.length) &&
                    chosen.every((val, index) => val === correctSorted[index]);

  if (isCorrect) {
    session.correct += 1;
    feedbackEl.textContent = "Correct! Great job!";
    feedbackEl.className = "feedback correct";
  } else {
    feedbackEl.textContent = "Not quite. Review the highlighted answer.";
    feedbackEl.className = "feedback incorrect";
  }

  choicesWrap.querySelectorAll(".choice").forEach(btn => {
    const idx = Number(btn.dataset.index);
    if (correctIndices.includes(idx)) {
      btn.classList.add("correct");
    } else if (selected.has(idx)) {
      btn.classList.add("incorrect");
    }
  });

  questionLocked = true;
  checkBtn.disabled = true;
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
  isQuizActive = false; // UNLOCK NAVIGATION

  // SAVE TO HISTORY (using the key 'vocab', 'comp', etc.)
  saveSessionToHistory(session.key, session.title, session.correct, session.total);

  const correct = session.correct;
  const total = session.total;
  const pct = Math.round((correct / total) * 100);

  if (pct === 100) resultTitleEl.textContent = "Perfect score!";
  else if (pct >= 80) resultTitleEl.textContent = "Great work!";
  else resultTitleEl.textContent = "Keep practicing!";

  resultStatsEl.textContent = `You answered ${correct} out of ${total} correctly (${pct}%).`;
  showView(resultSection);
}

// ============================================
// Events
// ============================================
tabs.forEach(tab => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.section));
});
startBtn.addEventListener("click", startQuiz);
statsBtn.addEventListener("click", showStats);
backFromStats.addEventListener("click", () => showView(coverSection));
clearStatsBtn.addEventListener("click", clearHistory);

// Remove any backToCoverBtn listener if we removed the button from HTML
toTopBtn.addEventListener("click", () => showView(coverSection));
viewStatsResult.addEventListener("click", showStats);

checkBtn.addEventListener("click", gradeCurrentQuestion);
nextBtn.addEventListener("click", nextQuestion);
readAloudBtn.addEventListener("click", speakQuestion);

retryBtn.addEventListener("click", () => {
  if (!session) return;
  startQuiz();
});

showView(coverSection);
setActiveTab("vocab");