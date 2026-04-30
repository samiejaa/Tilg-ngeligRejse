/* =============================================
   AI CHATBOT - Qwen 7B via Ollama
   =============================================
   Integrates local Qwen 7B model via Ollama
   for a friendly, welcoming user experience
============================================= */

class TilgængeligRejseChatbot {
  constructor() {
    this.isOpen = false;
    this.messages = [];
    this.isLoading = false;
    this.ollamaUrl = 'http://localhost:11434/api/generate';
    this.model = 'qwen:7b';
    this.init();
  }

  init() {
    this.createChatbotUI();
    this.attachEventListeners();
    this.addWelcomeMessage();
  }

  createChatbotUI() {
    // Create chatbot container
    const chatbot = document.createElement('div');
    chatbot.id = 'tilgængeligrejse-chatbot';
    chatbot.className = 'chatbot-container';
    chatbot.innerHTML = `
      <!-- Chatbot Toggle Button -->
      <button class="chatbot-toggle" id="chatbot-toggle" aria-label="Åbn AI-assistent" aria-expanded="false">
        <span class="chatbot-icon">🤖</span>
        <span class="chatbot-label">Hjælp</span>
      </button>

      <!-- Chatbot Window -->
      <div class="chatbot-window" id="chatbot-window" style="display: none;">
        <div class="chatbot-header">
          <h3>TilgængeligRejse Assistent</h3>
          <p class="chatbot-subtitle">Spørg om tilgængelige rejser og elevatorer</p>
          <button class="chatbot-close" id="chatbot-close" aria-label="Luk chatbot">✕</button>
        </div>
        
        <div class="chatbot-messages" id="chatbot-messages" role="log" aria-live="polite" aria-label="Chat historik"></div>
        
        <div class="chatbot-input-area">
          <form class="chatbot-form" id="chatbot-form">
            <input 
              type="text" 
              id="chatbot-input" 
              class="chatbot-input"
              placeholder="Spørg mig hvad som helst..."
              aria-label="Skriv din besked"
              autocomplete="off"
            />
            <button 
              type="submit" 
              class="chatbot-send" 
              id="chatbot-send"
              aria-label="Send besked"
            >
              ➤
            </button>
          </form>
          <div class="chatbot-status" id="chatbot-status"></div>
        </div>
      </div>
    `;
    
    document.body.appendChild(chatbot);
  }

  attachEventListeners() {
    const toggle = document.getElementById('chatbot-toggle');
    const closeBtn = document.getElementById('chatbot-close');
    const form = document.getElementById('chatbot-form');
    const input = document.getElementById('chatbot-input');

    toggle.addEventListener('click', () => this.toggleChatbot());
    closeBtn.addEventListener('click', () => this.closeChatbot());
    form.addEventListener('submit', (e) => this.handleSubmit(e));
    
    // Auto-focus input when window opens
    input.addEventListener('focus', () => {
      if (this.isOpen) input.scrollIntoView({ behavior: 'smooth' });
    });
  }

  toggleChatbot() {
    this.isOpen ? this.closeChatbot() : this.openChatbot();
  }

  openChatbot() {
    this.isOpen = true;
    const window = document.getElementById('chatbot-window');
    const toggle = document.getElementById('chatbot-toggle');
    const input = document.getElementById('chatbot-input');
    
    window.style.display = 'flex';
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  closeChatbot() {
    this.isOpen = false;
    const window = document.getElementById('chatbot-window');
    const toggle = document.getElementById('chatbot-toggle');
    
    window.style.display = 'none';
    toggle.setAttribute('aria-expanded', 'false');
  }

  addWelcomeMessage() {
    const welcomeMsg = `Hej! 👋 Jeg er din AI-assistent for TilgængeligRejse. 

Jeg kan hjælpe dig med:
• 🚆 Søge efter tilgængelige rejseruter
• 🛗 Information om elevatorstatus
• ♿ Spørgsmål om tilgængelighed
• 📍 Finde stationer med tilgængelighedsfaciliteter

Hvad kan jeg hjælpe dig med?`;
    
    this.addMessage(welcomeMsg, 'assistant');
  }

  async handleSubmit(e) {
    e.preventDefault();
    const input = document.getElementById('chatbot-input');
    const message = input.value.trim();
    
    if (!message) return;

    // Add user message
    this.addMessage(message, 'user');
    input.value = '';
    this.isLoading = true;
    
    try {
      // Show loading indicator
      this.updateStatus('🤔 Tænker...');
      
      // Get response from Ollama
      const response = await this.getOllamaResponse(message);
      
      // Add assistant response
      this.addMessage(response, 'assistant');
      this.updateStatus('');
    } catch (error) {
      console.error('Chatbot error:', error);
      
      // Check if it's a connection error
      if (error.message.includes('Failed to fetch')) {
        this.addMessage(
          '❌ Jeg kunne ikke forbinde til AI-modellen. Sørg for at Ollama kører lokalt på port 11434.\n\nKommando: `ollama run qwen:7b`',
          'assistant'
        );
      } else {
        this.addMessage(
          `❌ Der opstod en fejl: ${error.message}\n\nTry igen eller spørg et andet spørgsmål.`,
          'assistant'
        );
      }
      this.updateStatus('');
    } finally {
      this.isLoading = false;
    }
  }

  async getOllamaResponse(userMessage) {
    // Build context about the website for better responses
    const contextPrompt = `Du er en venlig AI-assistent for TilgængeligRejse, en dansk webbplads der hjælper mennesker med at finde tilgængelige togrejser med virkende elevatorer.

Vigtig information:
- Websidets navn er "TilgængeligRejse" (♿)
- Det handler om tilgængelig rejseplanlægning i Danmark
- Brugere kan søge efter rejser mellem stationer
- Systemet viser elevatorstatus ved hver station
- Det er specielt for mennesker med mobilitetsbegrænsninger
- Vi prioriterer tilgængelige ruter med virkende elevatorer

Svar venligt og hjælpsomt på dansk. Vær kort og præcis i dine svar. Hvis brugeren spørger om noget uden for dit område, forklar venligt hvad du kan hjælpe med.

Bruger siger: "${userMessage}"`;

    try {
      const response = await fetch(this.ollamaUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          prompt: contextPrompt,
          stream: false,
          temperature: 0.7,
          top_p: 0.9,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Extract and clean the response
      let answer = data.response || 'Jeg kunne desværre ikke generere et svar.';
      
      // Remove the prompt from the response if it's included
      if (answer.includes('Bruger siger:')) {
        answer = answer.split('Bruger siger:')[0].trim();
      }
      
      // Trim to reasonable length and ensure it's readable
      answer = answer.trim().substring(0, 500);
      
      return answer || 'Jeg var ikke sikker på hvad jeg skulle sige. Kan du præcisere dit spørgsmål?';
    } catch (error) {
      throw error;
    }
  }

  addMessage(text, sender) {
    const messagesContainer = document.getElementById('chatbot-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chatbot-message ${sender}`;
    messageDiv.setAttribute('role', 'article');
    
    // Format the message with emoji for better readability
    const senderLabel = sender === 'assistant' ? '🤖' : '👤';
    messageDiv.innerHTML = `
      <div class="message-sender">${senderLabel}</div>
      <div class="message-text">${this.escapeHtml(text).replace(/\n/g, '<br>')}</div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    
    // Auto-scroll to latest message
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  updateStatus(text) {
    const statusEl = document.getElementById('chatbot-status');
    statusEl.textContent = text;
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

// Initialize chatbot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.chatbot = new TilgængeligRejseChatbot();
  });
} else {
  window.chatbot = new TilgængeligRejseChatbot();
}
