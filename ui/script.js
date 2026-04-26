const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const statusBox = document.getElementById("statusBox");

let model;
let isRunning = false;
let selectedLanguage = "en";
let lastSpoken = "";
let lastSpokenTime = 0;

// 🔊 Voice
function speak(text) {
  const now = Date.now();
  if (text === lastSpoken && now - lastSpokenTime < 3000) return;
  lastSpoken = text;
  lastSpokenTime = now;

  const msg = new SpeechSynthesisUtterance(text);
  msg.lang = selectedLanguage === "hi" ? "hi-IN" : "en-US";
  msg.rate = 0.9;
  msg.volume = 1.0;

  speechSynthesis.cancel();
  speechSynthesis.speak(msg);

  if (statusBox) statusBox.innerText = text;
}
/* --- KEEP ALL YOUR TOP CONSTANTS & SPEAK FUNCTION THE SAME --- */

// --- 1. WELCOME PAGE LOGIC ---
// Uses Web Audio API to silently unlock audio without requiring a user tap
window.addEventListener('DOMContentLoaded', () => {
  window.speechSynthesis.cancel();

  const welcomeScreen = document.getElementById("welcomeScreen");

  // Wait for user to tap the welcome screen (this unlocks browser audio)
  welcomeScreen.addEventListener("click", function onFirstTap() {
    welcomeScreen.removeEventListener("click", onFirstTap); // only once

    // Unlock audio engine
    const unlock = new SpeechSynthesisUtterance("");
    speechSynthesis.speak(unlock);

    // Show language screen and speak the prompt in both languages
    setTimeout(() => {
      welcomeScreen.classList.remove("active");
      document.getElementById("languageScreen").classList.add("active");

      // Speak English part first
      const msgEn = new SpeechSynthesisUtterance("For English, tap left.");
      msgEn.lang = "en-US";
      msgEn.rate = 0.9;

      // Then speak Hindi part after English finishes
      const msgHi = new SpeechSynthesisUtterance("हिंदी के लिए दायाँ दबाएं।");
      msgHi.lang = "hi-IN";
      msgHi.rate = 0.9;

      speechSynthesis.cancel();
      speechSynthesis.speak(msgEn);
      speechSynthesis.speak(msgHi);
    }, 300);
  });
});


// 🌍 Language selection
function selectLanguage(lang) {
  selectedLanguage = lang;
  navigator.vibrate(200);

  document.getElementById("languageScreen").classList.remove("active");
  document.getElementById("startScreen").classList.add("active");

  speak(
    lang === "hi"
      ? "हिंदी चुनी गई। शुरू करने के लिए कहीं भी टैप करें।"
      : "English selected. Tap anywhere to start."
  );
}

// 📷 Camera
async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: "environment"  // rear camera
    }
  });

  video.srcObject = stream;

  return new Promise(resolve => {
    video.onloadedmetadata = () => {
      video.play();
      resolve();
    };
  });
}

// 🤖 Load AI Model
async function loadModel() {
  statusBox.innerText = "AI loading, please wait...";
  model = await cocoSsd.load();
  statusBox.innerText = "AI Ready!";
}

// 🎯 Draw boxes on canvas
function drawBoxes(predictions) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  predictions.forEach(p => {
    if (p.score > 0.5) {
      const [x, y, w, h] = p.bbox;

      ctx.strokeStyle = "lime";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = "lime";
      ctx.font = "16px Arial";
      ctx.fillText(
        `${p.class} ${Math.round(p.score * 100)}%`,
        x, y > 10 ? y - 5 : 10
      );
    }
  });
}

// 📍 Get position of object
function getPosition(bbox) {
  const centerX = bbox[0] + bbox[2] / 2;
  const frameWidth = video.videoWidth;

  if (centerX < frameWidth * 0.4) return "left";
  if (centerX > frameWidth * 0.6) return "right";
  return "center";
}

// 📏 Estimate distance from bounding box size (no extra model needed)
// Larger box on screen = object is closer
function estimateDistance(bbox) {
  const boxHeight = bbox[3]; // pixel height of the bounding box
  const frameHeight = video.videoHeight || 480;
  const relativeSize = boxHeight / frameHeight; // 0.0 (tiny/far) to 1.0 (huge/close)

  // Tuned scale: fills full screen ≈ 0.5m, tiny 5% ≈ 8m
  const distanceMeters = (0.5 / relativeSize).toFixed(1);

  // Cap between 0.5m and 10m for sensible speech
  return Math.min(10, Math.max(0.5, parseFloat(distanceMeters))).toFixed(1);
}

// 💬 Generate instruction
function generateMessage(predictions) {
  const dangerous = [
    "person", "car", "truck", "bus",
    "motorcycle", "bicycle", "chair",
    "dining table", "couch", "dog",
    "potted plant", "bed", "tv", "sofa",
    "fire hydrant", "stop sign", "parking meter"
  ];

  for (let p of predictions) {
    if (p.score < 0.5) continue;

    const pos = getPosition(p.bbox);
    const isDangerous = dangerous.includes(p.class);
    const dist = estimateDistance(p.bbox);

    if (selectedLanguage === "hi") {
      if (isDangerous) {
        if (pos === "center") return `${p.class} ${dist} meter सामने है। रुको।`;
        if (pos === "left") return `${p.class} ${dist} meter बाएं है। दाहिने चलें।`;
        if (pos === "right") return `${p.class} ${dist} meter दाहिने है। बाएं चलें।`;
      } else {
        if (pos === "center") return `${p.class} ${dist} meter सामने है।`;
        if (pos === "left") return `${p.class} ${dist} meter बाएं तरफ है।`;
        if (pos === "right") return `${p.class} ${dist} meter दाहिनी तरफ है।`;
      }
    } else {
      if (isDangerous) {
        if (pos === "center") return `${p.class} ${dist} meters ahead. Slow down.`;
        if (pos === "left") return `${p.class} ${dist} meters on your left. Move right.`;
        if (pos === "right") return `${p.class} ${dist} meters on your right. Move left.`;
      } else {
        if (pos === "center") return `${p.class} ${dist} meters ahead.`;
        if (pos === "left") return `${p.class} ${dist} meters on your left.`;
        if (pos === "right") return `${p.class} ${dist} meters on your right.`;
      }
    }
  }

  return selectedLanguage === "hi"
    ? "रास्ता 5 meter तक साफ है।"
    : "Path clear for 5 meters ahead.";
}

// 🧠 Detection loop
async function detect() {
  if (!isRunning) return;

  const predictions = await model.detect(video);
  drawBoxes(predictions);

  const message = generateMessage(predictions);
  if (message) {
    speak(message);
  }

  setTimeout(detect, 1500);
}

// ▶ START
startBtn.onclick = async () => {
  if (isRunning) return;
  isRunning = true;

  navigator.vibrate([200, 100, 200]);

  document.getElementById("startScreen").classList.remove("active");
  document.getElementById("cameraScreen").classList.add("active");

  speak(
    selectedLanguage === "hi"
      ? "नेविगेशन शुरू हो रही है।"
      : "Navigation starting."
  );

  await startCamera();
  await loadModel();
  detect();
};

// ⏹ STOP
stopBtn.onclick = () => {
  isRunning = false;

  navigator.vibrate(300);

  speak(
    selectedLanguage === "hi"
      ? "नेविगेशन बंद कर दी गई।"
      : "Navigation stopped."
  );

  const stream = video.srcObject;
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  document.getElementById("cameraScreen").classList.remove("active");
  document.getElementById("startScreen").classList.add("active");

  lastSpoken = "";
};