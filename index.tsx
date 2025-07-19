/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Chat, Content } from '@google/genai';

// --- Type Definitions ---
interface ChatSession {
  id: string;
  title: string;
  history: Content[];
}

// --- DOM Element Selection ---
const app = document.getElementById('app')!;
const chatContainer = document.getElementById('chat-container')!;
const chatForm = document.getElementById('chat-form')!;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const sendButton = document.getElementById('send-button') as HTMLButtonElement;
const cursorGlow = document.getElementById('cursor-glow')!;
const customCursor = document.getElementById('custom-cursor')!;
const historyPanel = document.getElementById('history-panel')!;
const historyButton = document.getElementById('history-button')!;
const newChatButton = document.getElementById('new-chat-button')!;
const historyList = document.getElementById('history-list')!;
const splashScreen = document.getElementById('splash-screen');


// --- State Management ---
let chat: Chat;
let sessions: Record<string, ChatSession> = {};
let currentSessionId: string | null = null;


// --- Gemini AI Initialization ---
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
const chatConfig = {
    systemInstruction: "You are Void, a witty and charming AI with a great sense of humor. You are playful, a little bit flirty, and love to tell clever, goofy jokes. Keep your responses engaging and fun, but always keep it clean and respectful. Never mention that you are an AI or a language model."
};


// --- UI Helper Functions ---

function setFormDisabled(disabled: boolean) {
  chatInput.disabled = disabled;
  sendButton.disabled = disabled;
  sendButton.setAttribute('aria-disabled', disabled.toString());
}

function addMessage(text: string, sender: 'user' | 'model', isLoading = false) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message', `${sender}-message`);
  if (sender === 'user') messageElement.setAttribute('role', 'log');

  if (isLoading) {
    messageElement.classList.add('loading');
    messageElement.setAttribute('aria-label', 'AI is thinking');
  } else {
    messageElement.textContent = text;
  }
  
  chatContainer.appendChild(messageElement);
  scrollToBottom();
  return messageElement;
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function clearChatUI() {
    chatContainer.innerHTML = '';
}

// --- History Management ---

async function generateChatTitle(userMessage: string, modelResponse: string): Promise<string> {
    try {
        const titlePrompt = `Based on the following exchange, create a short, clever, and funny title (max 4 words).
        User: "${userMessage}"
        Model: "${modelResponse}"
        Title:`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: titlePrompt,
          config: {
              systemInstruction: "You are a witty AI that creates short, clever, and funny titles (max 4 words) for conversations. The titles should reflect a playful, goofy, and slightly flirty personality."
          }
        });

        return response.text.trim().replace(/"/g, ''); // Clean up quotes
    } catch (error) {
        console.error("Title generation failed:", error);
        return "A Fateful Encounter";
    }
}


function loadSessionsFromStorage() {
    const storedSessions = localStorage.getItem('chatSessions');
    if (storedSessions) {
        sessions = JSON.parse(storedSessions);
    }
    const storedCurrentId = localStorage.getItem('currentSessionId');
    if (storedCurrentId && sessions[storedCurrentId]) {
        currentSessionId = storedCurrentId;
    }
}

function saveSessionsToStorage() {
    localStorage.setItem('chatSessions', JSON.stringify(sessions));
    if (currentSessionId) {
        localStorage.setItem('currentSessionId', currentSessionId);
    }
}

function renderHistoryList() {
    historyList.innerHTML = '';
    Object.values(sessions).sort((a, b) => b.id.localeCompare(a.id)).forEach(session => {
        const li = document.createElement('li');
        li.textContent = session.title;
        li.dataset.sessionId = session.id;
        li.setAttribute('role', 'button');
        if(session.id === currentSessionId) {
            li.classList.add('active');
        }
        li.addEventListener('click', () => loadChat(session.id));
        historyList.appendChild(li);
    });
}

function startNewChat() {
    if (historyPanel.classList.contains('visible')) {
        toggleHistoryPanel();
    }
    clearChatUI();
    const welcomeMessage = document.createElement('div');
    welcomeMessage.className = 'message model-message welcome-message';
    welcomeMessage.textContent = 'The Void is listening... What secrets are we sharing today?';
    chatContainer.appendChild(welcomeMessage);
    
    currentSessionId = `session_${Date.now()}`;
    sessions[currentSessionId] = {
        id: currentSessionId,
        title: "New Chat",
        history: []
    };
    chat = ai.chats.create({ model: 'gemini-2.5-flash', history: [], config: chatConfig });
    saveSessionsToStorage();
    renderHistoryList();
    chatInput.value = '';
    handleInputChange();
    chatInput.focus();
}

function loadChat(sessionId: string) {
    if (historyPanel.classList.contains('visible')) {
        toggleHistoryPanel();
    }
    currentSessionId = sessionId;
    const session = sessions[sessionId];

    clearChatUI();
    session.history.forEach(message => {
        const sender = message.role === 'user' ? 'user' : 'model';
        // Assuming parts are text-based for history rendering
        const text = message.parts.map(part => (part as {text: string}).text).join('');
        addMessage(text, sender);
    });

    chat = ai.chats.create({ model: 'gemini-2.5-flash', history: session.history, config: chatConfig });
    saveSessionsToStorage();
    renderHistoryList();
    chatInput.focus();
}

// --- Event Handlers ---

async function handleFormSubmit(e: Event) {
  e.preventDefault();
  const messageText = chatInput.value.trim();
  if (!messageText || !currentSessionId) return;

  const isFirstMessage = sessions[currentSessionId].history.length === 0;

  setFormDisabled(true);
  document.querySelector('.welcome-message')?.remove();
  addMessage(messageText, 'user');
  chatInput.value = '';
  handleInputChange();

  const loadingIndicator = addMessage('', 'model', true);
  
  try {
    const responseStream = await chat.sendMessageStream({ message: messageText });
    
    loadingIndicator.innerHTML = '';
    loadingIndicator.classList.remove('loading');

    let fullResponse = '';
    for await (const chunk of responseStream) {
      fullResponse += chunk.text;
      loadingIndicator.textContent = fullResponse;
      scrollToBottom();
    }
    
    if (isFirstMessage) {
       const newTitle = await generateChatTitle(messageText, fullResponse);
       sessions[currentSessionId].title = newTitle;
       renderHistoryList();
    }

    sessions[currentSessionId].history = await chat.getHistory();
    saveSessionsToStorage();

  } catch (error) {
    console.error('Gemini API Error:', error);
    loadingIndicator.textContent = 'An anomaly was detected in the data stream. Please try again.';
    loadingIndicator.classList.add('error');
  } finally {
    setFormDisabled(false);
    chatInput.focus();
  }
}

function handleInputChange() {
  const hasText = chatInput.value.trim().length > 0;
  sendButton.disabled = !hasText;
  sendButton.setAttribute('aria-disabled', (!hasText).toString());
}

function toggleHistoryPanel() {
    historyPanel.classList.toggle('visible');
    app.classList.toggle('history-open');
}

// --- Interactive Effects ---
let targetX = 0, targetY = 0, currentX = 0, currentY = 0;

function handleMouseMove(e: MouseEvent) {
    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;
    
    targetX = (clientX / innerWidth - 0.5);
    targetY = (clientY / innerHeight - 0.5);

    cursorGlow.style.transform = `translate(${clientX}px, ${clientY}px)`;
    customCursor.style.transform = `translate(${clientX}px, ${clientY}px)`;
}

function animationLoop() {
  const easing = 0.05;
  currentX += (targetX - currentX) * easing;
  currentY += (targetY - currentY) * easing;
  
  const xDeg = -currentY * 5;
  const yDeg = currentX * 5;

  app.style.transform = `rotateX(${xDeg}deg) rotateY(${yDeg}deg)`;
  
  requestAnimationFrame(animationLoop);
}

// --- Initial Setup ---
function initialize() {
    if (splashScreen) {
      setTimeout(() => {
        splashScreen.classList.add('hidden');
      }, 2500);
    }
    
    loadSessionsFromStorage();

    if (!currentSessionId || !sessions[currentSessionId]) {
        startNewChat();
    } else {
        loadChat(currentSessionId);
    }
    
    renderHistoryList();
    
    chatForm.addEventListener('submit', handleFormSubmit);
    chatInput.addEventListener('input', handleInputChange);
    historyButton.addEventListener('click', toggleHistoryPanel);
    newChatButton.addEventListener('click', startNewChat);
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', () => customCursor.classList.add('active'));
    window.addEventListener('mouseup', () => customCursor.classList.remove('active'));

    animationLoop();
}

initialize();