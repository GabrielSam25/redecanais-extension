// injected.js
export class VideoJSDebugger {
  constructor() {
    this.localNotify = this.createNotificationSystem();
    this.initialize();
  }

  createNotificationSystem() {
    const style = document.createElement('style');
    style.textContent = `
      .videojs-debug-notification {
        position: fixed;
        top: 60px;
        right: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 10px;
        border-radius: 6px;
        font-family: Arial, sans-serif;
        font-size: 12px;
        z-index: 10000;
        max-width: 300px;
        border-left: 3px solid #4CAF50;
      }
      .videojs-debug-notification.error { border-left-color: #f44336; }
      .videojs-debug-notification.warning { border-left-color: #ff9800; }
      .videojs-debug-notification.info { border-left-color: #2196F3; }
    `;
    document.head.appendChild(style);
    
    return {
      show: (message, type = 'info') => {
        const notification = document.createElement('div');
        notification.className = `videojs-debug-notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
          position: fixed;
          top: 60px;
          right: 10px;
          background: rgba(0, 0, 0, 0.9);
          color: white;
          padding: 10px;
          border-radius: 6px;
          font-family: Arial, sans-serif;
          font-size: 12px;
          z-index: 10000;
          max-width: 300px;
          border-left: 3px solid ${type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196F3'};
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 3000);
      }
    };
  }

  sendNotification(message, level = 'info') {
    window.postMessage({
      type: 'VIDEOJS_DEBUG_NOTIFICATION',
      message: message,
      level: level
    }, '*');
    
    if (level === 'error' || level === 'warning') {
      this.localNotify.show(message, level);
    }
  }

  initialize() {
    this.setupVideoJSDebugging();
    
    window.addEventListener('message', (event) => {
      if (event.data.type === 'VIDEOJS_DEBUG_REFRESH') {
        this.sendNotification('🔄 Atualizando players...', 'info');
        this.setupVideoJSDebugging();
      }
    });
  }

  setupVideoJSDebugging() {
    this.sendNotification('🎥 Iniciando debug do Video.js...', 'info');
    
    if (typeof videojs !== 'undefined') {
      this.sendNotification('🎯 Video.js detectado! Configurando monitoramento...', 'success');
      this.setupVideoJSListeners();
    } else {
      this.sendNotification('⏳ Video.js não encontrado, tentando novamente...', 'warning');
      setTimeout(() => this.setupVideoJSDebugging(), 2000);
    }
    
    this.setupVideoElementDebugging();
    this.setupVJSElementObservation();
  }

  setupVideoJSListeners() {
    try {
      const originalGetPlayer = videojs.getPlayer;
      videojs.getPlayer = (id) => {
        const player = originalGetPlayer.call(this, id);
        if (player && !player._debugEnhanced) {
          this.enhanceVideoJSPlayer(player);
        }
        return player;
      };
      
      setTimeout(() => {
        try {
          const players = videojs.getPlayers && videojs.getPlayers();
          if (players) {
            Object.keys(players).forEach(playerId => {
              const player = players[playerId];
              if (player && !player._debugEnhanced) {
                this.enhanceVideoJSPlayer(player);
              }
            });
          }
        } catch (e) {
          this.sendNotification('Erro ao melhorar players: ' + e.message, 'error');
        }
      }, 1000);
      
    } catch (error) {
      this.sendNotification('Erro ao configurar Video.js: ' + error.message, 'error');
    }
  }

  enhanceVideoJSPlayer(player) {
    if (player._debugEnhanced) return;
    player._debugEnhanced = true;
    
    const playerId = player.id_ || 'unknown';
    this.sendNotification(`🔧 Configurando debug para player: ${playerId}`, 'success');
    
    window.postMessage({
      type: 'VIDEOJS_DEBUG_PLAYER_FOUND',
      playerId: playerId
    }, '*');
    
    const debugEvents = {
      'loadstart': 'Carregamento iniciado',
      'loadedmetadata': 'Metadados carregados',
      'loadeddata': 'Dados carregados', 
      'canplay': 'Pode reproduzir',
      'play': '▶️ Reproduzindo',
      'pause': '⏸️ Pausado',
      'ended': '🏁 Finalizado',
      'error': '❌ Erro',
      'timeupdate': 'Tempo atualizado',
      'progress': '📊 Progresso'
    };
    
    Object.keys(debugEvents).forEach(event => {
      player.on(event, function() {
        const currentTime = this.currentTime();
        const duration = this.duration();
        const progress = duration ? (currentTime / duration * 100).toFixed(1) : 0;
        
        let message = `${debugEvents[event]}`;
        
        if (event === 'play' || event === 'pause') {
          this.sendNotification(message, 'info');
        } else if (event === 'error') {
          this.sendNotification(`❌ Erro no player: ${this.error()}`, 'error');
        } else if (event === 'loadedmetadata') {
          message += ` | Duração: ${this.formatTime(duration)}`;
          this.sendNotification(message, 'success');
        } else if (event === 'timeupdate' && progress % 10 < 1) {
          message = `📊 Progresso: ${progress}% (${this.formatTime(currentTime)}/${this.formatTime(duration)})`;
          this.sendNotification(message, 'info');
        }
        
        this.updatePlayerStats();
      }.bind(this));
    });
    
    player.getDebugInfo = function() {
      return {
        id: this.id_,
        currentTime: this.currentTime(),
        duration: this.duration(),
        progress: this.duration() ? (this.currentTime() / this.duration() * 100).toFixed(1) + '%' : '0%',
        formattedTime: `${this.formatTime(this.currentTime())} / ${this.formatTime(this.duration())}`,
        paused: this.paused(),
        volume: this.volume(),
        muted: this.muted(),
        currentSrc: this.currentSrc()
      };
    }.bind(this);
    
    window._videoDebugPlayers = window._videoDebugPlayers || {};
    window._videoDebugPlayers[playerId] = player;
  }

  setupVideoElementDebugging() {
    const videos = document.querySelectorAll('video');
    if (videos.length > 0) {
      this.sendNotification(`🎬 Encontrados ${videos.length} elementos de vídeo`, 'info');
    }
    
    videos.forEach((video, index) => {
      if (!video._debugEnhanced) {
        video._debugEnhanced = true;
        
        ['play', 'pause', 'ended', 'error'].forEach(event => {
          video.addEventListener(event, function() {
            const message = event === 'play' ? '▶️ Vídeo reproduzindo' :
                           event === 'pause' ? '⏸️ Vídeo pausado' :
                           event === 'ended' ? '🏁 Vídeo finalizado' : '❌ Erro no vídeo';
            this.sendNotification(message, 'info');
          }.bind(this));
        });
      }
    });
  }

  setupVJSElementObservation() {
    const vjsSelectors = ['.vjs-control-bar', '.video-js', '.vjs-progress-holder'];
    
    vjsSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        this.sendNotification(`🎯 ${elements.length} elementos ${selector} encontrados`, 'info');
      }
    });
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  updatePlayerStats() {
    const stats = {};
    
    if (window._videoDebugPlayers) {
      Object.keys(window._videoDebugPlayers).forEach(playerId => {
        const player = window._videoDebugPlayers[playerId];
        if (player && player.getDebugInfo) {
          stats[playerId] = player.getDebugInfo();
        }
      });
    }
    
    window.postMessage({
      type: 'VIDEOJS_DEBUG_STATS_UPDATE',
      stats: stats
    }, '*');
  }
}

// Exportação para uso direto
export function initializeVideoJSDebugger() {
  return new VideoJSDebugger();
}

// Auto-inicialização quando importado como script
if (typeof module === 'undefined') {
  // Está sendo executado diretamente no navegador
  initializeVideoJSDebugger();
}