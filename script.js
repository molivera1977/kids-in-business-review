// ============================================
// 1. CONFIGURATION & DATA
// ============================================
const SECTIONS = {
  vocab: { title: "Vocabulary", bank: window.VOCAB_BANK },
  comp:  { title: "Comprehension", bank: window.COMP_BANK },
  cloze: { title: "Cloze", bank: window.CLOZE_BANK },
};

// ============================================
// 2. DOM ELEMENTS
// ============================================
// Views
const coverSection   = document.getElementById("coverSection");
const statsSection   = document.getElementById("view-stats");
const quizSection    = document.getElementById("view-quiz");
const resultSection  = document.getElementById("view-result");

// Buttons & Inputs
const tabs           = document.querySelectorAll(".tab");
const startBtn       = document.getElementById("startBtn");
const statsBtn       = document.getElementById("statsBtn");
const backFromStats  = document.getElementById("backFromStats");
const clearStatsBtn  = document.getElementById("clearStatsBtn");

// Quiz Interface
const quizTitleEl    = document.getElementById("quizTitle");
const counterEl      = document.getElementById("questionCounter");
const progressBarEl  = document.getElementById("progressBar");
const promptEl       = document.getElementById("prompt");
const readAloudBtn   = document.getElementById("readAloudBtn");
const choicesWrap    = document.getElementById("choicesWrap");
const feedbackEl     = document.getElementById("feedback");
const checkBtn       = document.getElementById("checkBtn");
const nextBtn        = document.getElementById("nextBtn");

// Results Interface
const resultTitleEl  = document.getElementById("resultTitle");
const resultStatsEl  = document.getElementById("resultStats");
const retryBtn       = document.getElementById("retryBtn");
const viewStatsResult= document.getElementById("viewStatsFromResult");
const toTopBtn       = document.getElementById("toTop");

// Stats Tables
const vocabHistoryEl = document.getElementById("vocabHistory");
const compHistoryEl  = document.getElementById("compHistory");
const clozeHistoryEl = document.getElementById("clozeHistory");

// ============================================
// 3. STATE MANAGEMENT
// ============================================
let currentSectionKey = "vocab";
let session = null;    
let selected = new Set();
let questionLocked = false;
let isQuizActive = false; // Safety lock flag

// ============================================
// 4. HELPER FUNCTIONS
// ============================================

function showView(which) {
  // Hide all
  [coverSection, statsSection, quizSection, resultSection].forEach(sec => {
    sec.classList.remove("visible");
  });
  // Show target
  which.classList.add("visible");
  // Always stop audio when switching screens
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
// 5. BROWSER SAFETY LOCK
// ============================================
// Prevents students from refreshing or closing tab while quiz is active
window.addEventListener("beforeunload", function (e) {
  if (isQuizActive) {
    e.preventDefault();
    e.returnValue = "You haven't finished the section yet!";
    return e.returnValue;
  }
});

// ============================================
// 6. TEXT TO SPEECH (Edge-Friendly + "Blank" Fix)
// ============================================

// Helper to find the most "American" sounding voice available
function getBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  
  // 1. TOP TIER: The high-quality "Natural" or "Google" US voices
  // (This strict check keeps Edge sounding natural)
  let best = voices.find(v => 
    (v.lang === "en-US" && v.name.includes("Google")) || 
    (v.name.includes("Microsoft") && v.name.includes("Natural") && v.name.includes("United States"))
  );

  // 2. SECOND TIER: Any standard "en-US" voice
  if (!best) {
    best = voices.find(v => v.lang === "en-US");
  }

  // 3. FALLBACK: Any English voice
  if (!best) {
    best = voices.find(v => v.lang.startsWith("en"));
  }

  return best;
}

// Ensure voices load
if (speechSynthesis.onvoiceschanged !== undefined) {
  speechSynthesis.onvoiceschanged = getBestVoice;
}

function speakQuestion() {
  window.speechSynthesis.cancel();
  
  // 1. Define parts to read
  const parts = [];
  
  // THE FIX: We replace underscores with the word "blank" for the audio only
  // The regex /_+/g means "find any group of underscores"
  const promptText = promptEl.innerText.replace(/_+/g, "blank");
  parts.push({ text: promptText, prefix: 'prompt' });

  const choiceBtns = document.querySelectorAll(".choice");
  choiceBtns.forEach((btn, index) => {
    // Grab text from the span we created in Section 8
    const textSpan = btn.querySelector(".choice-text");
    let rawText = textSpan ? textSpan.innerText : btn.innerText;
    
    // Also fix underscores in choices if they exist
    const cleanText = rawText.replace(/_+/g, "blank");
    
    parts.push({
      text: `Choice ${String.fromCharCode(65 + index)}. ${cleanText}`,
      prefix: `choice-${index}`
    });
  });

  let partIndex = 0;
  
  // Grab the voice RIGHT NOW
  const selectedVoice = getBestVoice();

  function speakNext() {
    if (partIndex >= parts.length) {
      document.querySelectorAll('.highlight-word').forEach(el => el.classList.remove('highlight-word'));
      return; 
    }

    const part = parts[partIndex];
    const utterance = new SpeechSynthesisUtterance(part.text);
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    // FORCE English language code to prevent foreign accent reading
    utterance.lang = "en-US"; 
    utterance.rate = 0.9; 

    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        const textUpToHere = part.text.substring(0, event.charIndex);
        let wordIndex = textUpToHere.split(/\s+/).length - 1;
        
        if (part.prefix.startsWith('choice')) {
          wordIndex = wordIndex - 2; 
        }

        document.querySelectorAll('.highlight-word').forEach(el => el.classList.remove('highlight-word'));

        if (wordIndex >= 0) {
          const targetId = `${part.prefix}-${wordIndex}`;
          const targetSpan = document.getElementById(targetId);
          if (targetSpan) targetSpan.classList.add('highlight-word');
        }
      }
    };

    utterance.onend = () => {
      partIndex++;
      speakNext();
    };

    window.speechSynthesis.speak(utterance);
  }

  speakNext();
}

// ============================================
// 7. SESSION HISTORY (Progress Report)
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
    el.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#999; padding:15px;">No attempts today.</td></tr>`;
  };

  // Filter by section key
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
// 8. QUIZ LOGIC
// ============================================

// Helper to wrap words in spans for highlighting
function wrapWords(text, idPrefix) {
  // Split by space, wrap each word in a span with a unique ID
  return text.split(' ').map((word, i) => 
    `<span id="${idPrefix}-${i}">${word}</span>`
  ).join(' ');
}

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
  isQuizActive = true; 
  
  showView(quizSection);
  renderQuestion();
}

function renderQuestion() {
  const q = session.bank[session.idx];
  
  // Update UI
  counterEl.textContent = `Question ${session.idx + 1} of ${session.total}`;
  const pct = (session.idx / session.total) * 100;
  progressBarEl.style.width = pct + "%";

  // PREPARE TEXT: Clean it, then wrap words for audio highlighting
  const safeText = q.q.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // We replace \n with <br> first, but for wrapping logic we treat them as text first
  // Simple approach: Wrap the whole text
  promptEl.innerHTML = wrapWords(safeText, 'prompt');

  // Reset State
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
    // Add a class so we can find this text easily later
    textSpan.className = "choice-text"; 
    // Wrap words for audio
    textSpan.innerHTML = " " + wrapWords(choiceText, `choice-${idx}`);
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

  // Highlight choices
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
  isQuizActive = false; // Unlock browser tab

  // Save specific section history
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
// 9. EVENT LISTENERS
// ============================================
tabs.forEach(tab => {
  tab.addEventListener("click", () => setActiveTab(tab.dataset.section));
});

startBtn.addEventListener("click", startQuiz);
statsBtn.addEventListener("click", showStats);
backFromStats.addEventListener("click", () => showView(coverSection));
clearStatsBtn.addEventListener("click", clearHistory);

toTopBtn.addEventListener("click", () => showView(coverSection));
viewStatsResult.addEventListener("click", showStats);

checkBtn.addEventListener("click", gradeCurrentQuestion);
nextBtn.addEventListener("click", nextQuestion);
readAloudBtn.addEventListener("click", speakQuestion);

retryBtn.addEventListener("click", () => {
  if (!session) return;
  startQuiz();
});

// Initialize
showView(coverSection);
setActiveTab("vocab");