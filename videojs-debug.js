// videojs-debug-module.js - Módulo simplificado para debug de Video.js
(function() {
    'use strict';
    
    // Configuração do módulo
    const config = {
        debugLevel: 'info', // info, warning, error
        enableStats: true,
        refreshInterval: 2000
    };
    
    // Sistema de logging simplificado
    const logger = {
        log: function(message, type = 'info') {
            if (type === 'error' || config.debugLevel === 'info') {
                console.log(`[VideoJS Debug] ${message}`);
            }
        }
    };
    
    // Monitor principal
    class VideoJSDebugMonitor {
        constructor() {
            this.players = new Map();
            this.stats = {};
            this.init();
        }
        
        init() {
            logger.log('🎥 Iniciando monitor Video.js');
            
            // Tenta detectar Video.js imediatamente
            this.setupVideoJSDetection();
            
            // Configura observação de elementos de vídeo
            this.setupVideoElements();
            
            // Inicia monitoramento periódico
            if (config.enableStats) {
                this.startStatsMonitoring();
            }
        }
        
        setupVideoJSDetection() {
            if (typeof videojs !== 'undefined') {
                logger.log('✅ Video.js detectado', 'info');
                this.enhanceVideoJSPlayers();
            } else {
                // Tenta novamente após 2 segundos
                setTimeout(() => this.setupVideoJSDetection(), 2000);
            }
        }
        
        enhanceVideoJSPlayers() {
            try {
                // Monitora players existentes
                if (videojs.getPlayers) {
                    const players = videojs.getPlayers();
                    Object.keys(players).forEach(playerId => {
                        this.enhancePlayer(players[playerId], playerId);
                    });
                }
                
                // Intercepta criação de novos players
                this.interceptPlayerCreation();
                
            } catch (error) {
                logger.log(`Erro ao melhorar players: ${error.message}`, 'error');
            }
        }
        
        interceptPlayerCreation() {
            const originalGetPlayer = videojs.getPlayer;
            const self = this;
            
            videojs.getPlayer = function(id) {
                const player = originalGetPlayer.call(this, id);
                if (player && !player._debugEnhanced) {
                    self.enhancePlayer(player, id);
                }
                return player;
            };
        }
        
        enhancePlayer(player, playerId) {
            if (player._debugEnhanced) return;
            
            player._debugEnhanced = true;
            this.players.set(playerId, player);
            
            logger.log(`🔧 Monitorando player: ${playerId}`, 'info');
            
            // Eventos principais para monitorar
            const keyEvents = ['play', 'pause', 'ended', 'error', 'loadedmetadata'];
            
            keyEvents.forEach(event => {
                player.on(event, () => {
                    this.handlePlayerEvent(player, playerId, event);
                });
            });
            
            // Adiciona informações de debug
            player.getDebugStats = () => ({
                id: playerId,
                currentTime: player.currentTime(),
                duration: player.duration(),
                paused: player.paused(),
                progress: player.duration() ? 
                    ((player.currentTime() / player.duration()) * 100).toFixed(1) + '%' : '0%'
            });
        }
        
        handlePlayerEvent(player, playerId, event) {
            const stats = player.getDebugStats ? player.getDebugStats() : {};
            
            switch(event) {
                case 'play':
                    logger.log(`▶️ Player ${playerId} reproduzindo`, 'info');
                    break;
                case 'pause':
                    logger.log(`⏸️ Player ${playerId} pausado`, 'info');
                    break;
                case 'ended':
                    logger.log(`🏁 Player ${playerId} finalizado`, 'info');
                    break;
                case 'error':
                    logger.log(`❌ Erro no player ${playerId}: ${player.error()}`, 'error');
                    break;
                case 'loadedmetadata':
                    logger.log(`📊 Player ${playerId} carregado - Duração: ${this.formatTime(stats.duration)}`, 'info');
                    break;
            }
            
            this.updateStats();
        }
        
        setupVideoElements() {
            const videos = document.querySelectorAll('video');
            if (videos.length > 0) {
                logger.log(`🎬 Encontrados ${videos.length} elementos de vídeo`, 'info');
            }
            
            videos.forEach((video, index) => {
                if (!video._debugMonitored) {
                    video._debugMonitored = true;
                    
                    ['play', 'pause', 'error'].forEach(event => {
                        video.addEventListener(event, () => {
                            const action = event === 'play' ? 'reproduzindo' :
                                         event === 'pause' ? 'pausado' : 'erro';
                            logger.log(`📹 Vídeo ${index + 1} ${action}`, 'info');
                        });
                    });
                }
            });
        }
        
        startStatsMonitoring() {
            setInterval(() => {
                this.updateStats();
            }, config.refreshInterval);
        }
        
        updateStats() {
            this.stats = {};
            
            this.players.forEach((player, playerId) => {
                if (player.getDebugStats) {
                    this.stats[playerId] = player.getDebugStats();
                }
            });
            
            // Log resumo a cada 10 segundos
            if (Date.now() % 10000 < config.refreshInterval) {
                this.logStatsSummary();
            }
        }
        
        logStatsSummary() {
            const activePlayers = Array.from(this.players.keys());
            if (activePlayers.length > 0) {
                logger.log(`📈 Players ativos: ${activePlayers.join(', ')}`, 'info');
            }
        }
        
        formatTime(seconds) {
            if (!seconds || isNaN(seconds)) return '0:00';
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
        
        // Métodos públicos
        getStats() {
            return this.stats;
        }
        
        getPlayers() {
            return Array.from(this.players.keys());
        }
        
        refresh() {
            logger.log('🔄 Atualizando monitoramento', 'info');
            this.players.clear();
            this.setupVideoJSDetection();
            this.setupVideoElements();
        }
    }
    
    // Inicialização automática quando o DOM estiver pronto
    let monitorInstance = null;
    
    function initializeMonitor() {
        if (!monitorInstance) {
            monitorInstance = new VideoJSDebugMonitor();
            window.VideoJSDebugMonitor = monitorInstance;
        }
        return monitorInstance;
    }
    
    // Auto-inicialização
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeMonitor);
    } else {
        initializeMonitor();
    }
    
    // Exporta para uso como módulo
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { VideoJSDebugMonitor, initializeMonitor };
    }
    
})();