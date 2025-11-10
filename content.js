// content.js
export class VideoJSDebugContent {
  constructor() {
    this.notify = null;
    this.initialize();
  }

  injectCSS() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = chrome.runtime.getURL('notification.css');
    document.head.appendChild(link);
  }

  createNotificationSystem() {
    const notificationContainer = document.createElement('div');
    notificationContainer.id = 'videojs-debug-notifications';
    notificationContainer.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 10000;
      max-width: 500px;
    `;
    document.body.appendChild(notificationContainer);
    
    return {
      show: (message, type = 'info', duration = 5000) => {
        const notification = document.createElement('div');
        notification.className = `videojs-debug-notification ${type}`;
        
        const time = new Date().toLocaleTimeString();
        
        notification.innerHTML = `
          <button class="videojs-debug-close">&times;</button>
          <div class="videojs-debug-header">
            ${this.getIcon(type)} ${this.getTitle(type)}
          </div>
          <div class="videojs-debug-content">${message}</div>
          <div class="videojs-debug-time">${time}</div>
          <div class="videojs-debug-progress">
            <div class="videojs-debug-progress-bar" style="width: 100%"></div>
          </div>
        `;
        
        const container = document.getElementById('videojs-debug-notifications');
        container.appendChild(notification);
        
        const progressBar = notification.querySelector('.videojs-debug-progress-bar');
        let width = 100;
        const interval = setInterval(() => {
          width -= (100 / (duration / 100));
          progressBar.style.width = width + '%';
        }, 100);
        
        const closeBtn = notification.querySelector('.videojs-debug-close');
        closeBtn.addEventListener('click', () => {
          clearInterval(interval);
          notification.remove();
        });
        
        setTimeout(() => {
          clearInterval(interval);
          notification.classList.add('notification-fade-out');
          setTimeout(() => notification.remove(), 500);
        }, duration);
      },
      
      createStatsPanel: () => {
        const statsPanel = document.createElement('div');
        statsPanel.id = 'videojs-debug-stats';
        statsPanel.className = 'videojs-debug-stats';
        statsPanel.innerHTML = `
          <h3>🎥 Video.js Stats</h3>
          <div id="stats-content">Carregando...</div>
        `;
        document.body.appendChild(statsPanel);
        return statsPanel;
      },
      
      createControls: () => {
        const controls = document.createElement('div');
        controls.id = 'videojs-debug-controls';
        controls.className = 'videojs-debug-controls';
        controls.innerHTML = `
          <div style="margin-bottom: 5px; font-weight: bold;">🎮 Debug Controls</div>
          <button id="toggle-stats">Stats</button>
          <button id="refresh-players">Refresh</button>
          <button id="clear-notifications">Clear</button>
        `;
        document.body.appendChild(controls);
        
        document.getElementById('toggle-stats').addEventListener('click', () => {
          const stats = document.getElementById('videojs-debug-stats');
          if (stats) stats.style.display = stats.style.display === 'none' ? 'block' : 'none';
        });
        
        document.getElementById('refresh-players').addEventListener('click', () => {
          window.postMessage({ type: 'VIDEOJS_DEBUG_REFRESH' }, '*');
        });
        
        document.getElementById('clear-notifications').addEventListener('click', () => {
          const container = document.getElementById('videojs-debug-notifications');
          if (container) container.innerHTML = '';
        });
        
        return controls;
      }
    };
  }

  getIcon(type) {
    const icons = {
      'info': 'ℹ️',
      'success': '✅',
      'warning': '⚠️',
      'error': '❌'
    };
    return icons[type] || '📝';
  }

  getTitle(type) {
    const titles = {
      'info': 'Informação',
      'success': 'Sucesso',
      'warning': 'Aviso',
      'error': 'Erro'
    };
    return titles[type] || 'Debug';
  }

  injectDebugScript() {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('injected.js');
      script.onload = function() {
        this.remove();
        this.notify.show('Script de debug injetado com sucesso', 'success');
      }.bind(this);
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      this.notify.show('Erro ao injetar script: ' + error.message, 'error');
    }
  }

  setupFrameCommunication() {
    const iframes = document.querySelectorAll('iframe');
    this.notify.show(`Encontrados ${iframes.length} iframes na página`, 'info');
    
    iframes.forEach((iframe, index) => {
      try {
        iframe.addEventListener('load', function() {
          setTimeout(() => {
            this.notify.show(`Iframe ${index} carregado - Verificando Video.js...`, 'info');
          }, 1000);
        }.bind(this));
      } catch (error) {
        this.notify.show(`Erro ao processar iframe ${index}: ${error.message}`, 'warning');
      }
    });
  }

  setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.data.type && event.data.type.startsWith('VIDEOJS_DEBUG_')) {
        switch(event.data.type) {
          case 'VIDEOJS_DEBUG_NOTIFICATION':
            this.notify.show(event.data.message, event.data.level || 'info');
            break;
          case 'VIDEOJS_DEBUG_STATS_UPDATE':
            this.updateStatsPanel(event.data.stats);
            break;
          case 'VIDEOJS_DEBUG_PLAYER_FOUND':
            this.notify.show(`🎬 Player Video.js encontrado: ${event.data.playerId}`, 'success');
            break;
        }
      }
    });
  }

  updateStatsPanel(stats) {
    const statsContent = document.getElementById('stats-content');
    if (statsContent) {
      let html = '';
      Object.keys(stats).forEach(playerId => {
        const playerStats = stats[playerId];
        html += `
          <div style="border-bottom: 1px solid #333; padding: 5px 0; margin-bottom: 5px;">
            <strong>${playerId}</strong><br>
            Tempo: ${playerStats.currentTime || 'N/A'}<br>
            Duração: ${playerStats.duration || 'N/A'}<br>
            Progresso: ${playerStats.progress || '0%'}<br>
            Estado: ${playerStats.paused ? '⏸️ Pausado' : '▶️ Reproduzindo'}
          </div>
        `;
      });
      statsContent.innerHTML = html || 'Nenhum player ativo';
    }
  }

  initialize() {
    this.injectCSS();
    this.notify = this.createNotificationSystem();
    this.notify.createStatsPanel();
    this.notify.createControls();
    
    this.notify.show('🚀 Video.js Debug Extension Iniciada', 'success');
    
    this.injectDebugScript();
    this.setupFrameCommunication();
    this.setupMessageListener();
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.tagName === 'IFRAME') {
            this.notify.show('🆕 Novo iframe detectado', 'info');
            setTimeout(() => this.setupFrameCommunication(), 1000);
          }
        });
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

export function initializeVideoJSDebugContent() {
  return new VideoJSDebugContent();
}

if (typeof module === 'undefined') {
  initializeVideoJSDebugContent();
}