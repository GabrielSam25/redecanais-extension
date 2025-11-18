class VideoJSAutoPlayer {
    constructor() {
        this.player = null;
        this.isAutoPlaying = true;
        this.currentSeason = 0;
        this.currentEpisode = 0;
        this.episodesData = null;
        this.videoEnded = false;
        this.progressCheckInterval = null;

        this.init();
    }

    init() {
        this.showNotification('🎬 Inicializando Auto Player...', 'info');
        this.extractCurrentEpisodeFromPage(); 

        this.waitForPlayer().then(() => {
            this.setupPlayerListeners();
            this.loadEpisodesData();
        });
    }

    extractCurrentEpisodeFromPage() {
        console.log('🔍 Extraindo episódio da página...');

        const titleElement = document.querySelector('h1[itemprop="name"]');
        if (titleElement) {
            const titleText = titleElement.textContent.trim();
            console.log('📝 Título encontrado:', titleText);

            const episodeInfo = extractEpisodeInfoFromTitle(titleText);

            if (episodeInfo) {
                this.currentSeason = episodeInfo.season;
                this.currentEpisode = episodeInfo.episode;
                console.log('✅ Episódio extraído:', { 
                    season: this.currentSeason, 
                    episode: this.currentEpisode,
                    series: episodeInfo.seriesName 
                });
                this.showNotification(`📺 Assistindo ${episodeInfo.seriesName} T${this.currentSeason}E${this.currentEpisode}`, 'info');
                return;
            }
        }

        this.extractCurrentEpisodeFromUrl();

        console.log('❌ Não foi possível extrair informações de temporada/episódio');
    }

    extractCurrentEpisodeFromUrl() {
        const url = window.location.href;
        console.log('🔍 Tentando extrair da URL:', url);

        const patterns = [
            /(\d+)a-temporada-episodio-(\d+)/i,
            /-(\d+)a-temporada-(\d+)-/i,
            /temporada-(\d+)-episodio-(\d+)/i
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                this.currentSeason = parseInt(match[1]);
                this.currentEpisode = parseInt(match[2]);
                console.log('✅ Episódio extraído da URL:', { season: this.currentSeason, episode: this.currentEpisode });
                this.showNotification(`📺 Assistindo T${this.currentSeason}E${this.currentEpisode}`, 'info');
                return;
            }
        }
    }

    extractFromTitle() {
        const titleElement = document.querySelector('h1[itemprop="name"]') || 
                            document.querySelector('h1') ||
                            document.querySelector('title');

        if (titleElement) {
            const titleText = titleElement.textContent.trim();
            console.log('📝 Tentando extrair do título:', titleText);

            const match = titleText.match(/(\d+)[ªa]\s*Temporada.*?Episódio\s*(\d+)/i);

            if (match) {
                this.currentSeason = parseInt(match[1]);
                this.currentEpisode = parseInt(match[2]);
                this.showNotification(`📺 Assistindo T${this.currentSeason}E${this.currentEpisode} (do título)`, 'info');
            }
        }
    }

    waitForPlayer() {
        return new Promise((resolve) => {
            const checkPlayer = () => {

                const videoElement = document.querySelector('video.vjs-tech') || 
                                   document.querySelector('video.vjs-tech-native') ||
                                   document.querySelector('.vjs-tech video') ||
                                   document.querySelector('video');

                const playerElement = document.querySelector('.vjs-control-bar');

                if (videoElement && playerElement && videoElement.readyState > 0) {
                    this.player = {
                        video: videoElement,
                        controls: playerElement,
                        element: videoElement
                    };
                    this.showNotification('✅ Player Video.js detectado', 'success');
                    resolve();
                    return;
                }

                const iframe = document.querySelector('iframe');
                if (iframe) {
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        const iframeVideo = iframeDoc.querySelector('video');
                        const iframeControls = iframeDoc.querySelector('.vjs-control-bar');

                        if (iframeVideo && iframeControls) {
                            this.player = {
                                video: iframeVideo,
                                controls: iframeControls,
                                element: iframeVideo,
                                isIframe: true
                            };
                            this.showNotification('✅ Player em iframe detectado', 'success');
                            resolve();
                            return;
                        }
                    } catch (e) {

                    }
                }

                setTimeout(checkPlayer, 1500);
            };

            checkPlayer();
        });
    }

    setupPlayerListeners() {
        if (!this.player || !this.player.video) {
            this.showNotification('❌ Player não encontrado', 'error');
            return;
        }

        const video = this.player.video;

        video.removeEventListener('ended', this.handleVideoEnded);
        video.removeEventListener('timeupdate', this.handleTimeUpdate);

        this.handleVideoEnded = () => {
            if (!this.videoEnded) {
                this.videoEnded = true;
                this.showNotification('⏹️ Episódio terminado! Indo para o próximo...', 'success');
                console.log('🎯 Evento "ended" disparado - vídeo terminou naturalmente');
                this.playNextEpisode();
            }
        };

        this.handleTimeUpdate = () => {
            this.monitorVideoProgress();
        };

        video.addEventListener('ended', this.handleVideoEnded);
        video.addEventListener('timeupdate', this.handleTimeUpdate);

        this.setupAccurateProgressMonitoring();

        this.showNotification('🎧 Auto-play ativado', 'success');
    }

    setupAccurateProgressMonitoring() {
        if (!this.player || !this.player.video) return;

        const video = this.player.video;
        let lastCurrentTime = 0;
        let stuckCount = 0;
        let nearEndNotified = false;

        if (this.progressCheckInterval) {
            clearInterval(this.progressCheckInterval);
        }

        this.progressCheckInterval = setInterval(() => {
            if (!video.duration || video.duration === Infinity || isNaN(video.duration)) {
                return; 
            }

            const currentTime = video.currentTime;
            const duration = video.duration;

            if (!nearEndNotified && duration - currentTime <= 10 && duration - currentTime > 5) {
                this.showNotification('⏩ Terminando em 10 segundos...', 'info');
                nearEndNotified = true;
            }

            if (Math.abs(currentTime - lastCurrentTime) < 0.5) {
                stuckCount++;
                if (stuckCount > 10) { 
                    this.showNotification('🔄 Vídeo travado? Verificando...', 'warning');

                    if (!video.paused) {
                        video.pause();
                        setTimeout(() => video.play(), 1000);
                    }
                    stuckCount = 0;
                }
            } else {
                stuckCount = 0;
            }

            lastCurrentTime = currentTime;

            if (currentTime >= duration - 2 && currentTime > 0 && duration > 0) {
                if (!this.videoEnded && !video.paused) {
                    this.videoEnded = true;
                    this.showNotification('✅ Episódio finalizado! Próximo...', 'success');
                    this.playNextEpisode();
                }
            }

        }, 1000);
    }

    monitorVideoProgress() {

        if (!this.player || !this.player.video || this.videoEnded) return;

        const video = this.player.video;
        const currentTime = video.currentTime;
        const duration = video.duration;

        if (duration && duration > 0 && currentTime > 0) {
            const progress = (currentTime / duration) * 100;

            if (progress > 95 && !this.videoEnded) {
                console.log(`📊 Progresso: ${progress.toFixed(1)}% - Aguardando término natural`);
            }
        }
    }

    loadEpisodesData() {
        const overlay = window._playerOverlay;
        if (overlay && overlay.episodesData) {
            this.episodesData = overlay.episodesData;
            this.showNotification('✅ Lista de episódios carregada', 'success');
            return;
        }

        chrome.runtime.sendMessage(
            { 
                action: 'getSeriesData', 
                seriesUrl: getSeriesUrl() 
            },
            response => {
                if (response?.data?.episodes) {
                    this.episodesData = response.data.episodes;
                    this.showNotification('✅ Episódios sincronizados', 'success');
                } else {
                    this.showNotification('⚠️ Lista de episódios não encontrada', 'warning');
                }
            }
        );
    }

    playNextEpisode() {
        if (!this.isAutoPlaying) {
            this.showNotification('⏸️ Auto-play pausado', 'info');
            return;
        }

        setTimeout(() => {
            const nextEpisode = this.getNextEpisode();
            if (!nextEpisode) {
                this.showNotification('🎉 Último episódio da série!', 'info');
                return;
            }

            this.showNotification(`➡️ Indo para T${nextEpisode.season}E${nextEpisode.episode}...`, 'success');
            this.navigateToEpisode(nextEpisode.season, nextEpisode.episode);
        }, 2000);
    }

    getNextEpisode() {
        if (!this.episodesData) return null;

        console.log('🔍 Buscando próximo episódio:', {
            currentSeason: this.currentSeason,
            currentEpisode: this.currentEpisode,
            seasons: Object.keys(this.episodesData)
        });

        const currentSeasonEps = this.episodesData[this.currentSeason];
        if (currentSeasonEps && currentSeasonEps[this.currentEpisode + 1]) {
            console.log('✅ Próximo episódio na mesma temporada:', {
                season: this.currentSeason,
                episode: this.currentEpisode + 1
            });
            return {
                season: this.currentSeason,
                episode: this.currentEpisode + 1
            };
        }

        const nextSeason = this.currentSeason + 1;
        if (this.episodesData[nextSeason] && this.episodesData[nextSeason][1]) {
            console.log('✅ Primeiro episódio da próxima temporada:', {
                season: nextSeason,
                episode: 1
            });
            return {
                season: nextSeason,
                episode: 1
            };
        }

        console.log('❌ Não há próximo episódio');
        return null;
    }

    navigateToEpisode(season, episode) {
        const episodeData = this.episodesData[season]?.[episode];
        if (!episodeData) {
            this.showNotification(`❌ Episódio T${season}E${episode} não encontrado`, 'error');
            return;
        }

        const url = episodeData.links.dubbed || 
                   episodeData.links.subtitled || 
                   episodeData.links.watch;

        if (url) {

            setTimeout(() => {
                window.location.href = url;
            }, 3000);
        } else {
            this.showNotification('❌ Link do próximo episódio não encontrado', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const existingNotification = document.getElementById('auto-player-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const colors = {
            info: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            success: 'linear-gradient(135deg, #10b981, #047857)',
            warning: 'linear-gradient(135deg, #f59e0b, #d97706)',
            error: 'linear-gradient(135deg, #ef4444, #dc2626)'
        };

        const icons = {
            info: '💡',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        };

        const notification = document.createElement('div');
        notification.id = 'auto-player-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${colors[type] || colors.info};
            color: white;
            padding: 12px 20px;
            border-radius: 10px;
            z-index: 1000000;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-weight: 600;
            font-size: 13px;
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.2);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            gap: 8px;
            max-width: 350px;
            text-align: center;
            animation: slideDown 0.3s ease-out;
        `;

        notification.innerHTML = `
            <span style="font-size: 14px;">${icons[type] || '💡'}</span>
            <span>${message}</span>
        `;

        if (!document.getElementById('auto-player-notification-styles')) {
            const style = document.createElement('style');
            style.id = 'auto-player-notification-styles';
            style.textContent = `
                @keyframes slideDown {
                    from {
                        transform: translate(-50%, -100%);
                        opacity: 0;
                    }
                    to {
                        transform: translate(-50%, 0);
                        opacity: 1;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 3000);
    }

    toggleAutoPlay() {
        this.isAutoPlaying = !this.isAutoPlaying;
        const status = this.isAutoPlaying ? '✅ ATIVADO' : '⏸️ PAUSADO';
        const message = this.isAutoPlaying ? 
            'Próximo episódio automático' : 
            'Clique para ativar';

        this.showNotification(`${status} - ${message}`, this.isAutoPlaying ? 'success' : 'warning');

        return this.isAutoPlaying;
    }

    destroy() {
        if (this.progressCheckInterval) {
            clearInterval(this.progressCheckInterval);
        }
        if (this.player && this.player.video) {
            this.player.video.removeEventListener('ended', this.handleVideoEnded);
            this.player.video.removeEventListener('timeupdate', this.handleTimeUpdate);
        }
    }
}

(function() {
    const url = window.location.href;

    console.log('🚀 Inicializando sistema para URL:', url);

    const isEpisodePage = () => {
        const titleElement = document.querySelector('h1[itemprop="name"]');
        if (titleElement) {
            const titleText = titleElement.textContent.trim();
            console.log('📝 Título encontrado:', titleText);

            const hasSeasonEpisode = /(\d+)[ªa]\s*Temporada.*Episódio\s*(\d+)/i.test(titleText) || 
                                   /Temporada\s*(\d+).*Episódio\s*(\d+)/i.test(titleText);

            if (hasSeasonEpisode) {
                console.log('✅ Página de episódio detectada pelo título');
                return true;
            }
        }

        const seasonEpisodePattern = /(\d+)a-temporada-(\d+)/i;
        if (seasonEpisodePattern.test(url)) {
            console.log('✅ Página de episódio detectada pela URL');
            return true;
        }

        return false;
    };

    if (isEpisodePage()) {
        console.log('🎬 Página de episódio detectada, inicializando auto-player...');

        setTimeout(() => {
            if (!window._videoJSAutoPlayer) {
                console.log('🎧 Inicializando VideoJSAutoPlayer...');
                window._videoJSAutoPlayer = new VideoJSAutoPlayer();
            } else {
                console.log('⚠️ VideoJSAutoPlayer já está inicializado');
            }
        }, 2000);
    } else {
        console.log('❌ Não é uma página de episódio - título ou URL não contém informações de temporada/episódio');
    }
})();

class RealTimeEpisodeExtractor {
    constructor() {
        this.baseUrl = 'https://redecanais.pe';
    }

    extractRealTimeLinks() {
        const episodes = [];
        const seasonMarkers = this.findSeasonMarkers();

        seasonMarkers.forEach(marker => {
            const seasonNumber = this.extractSeasonNumber(marker.textContent);
            const seasonEpisodes = this.extractEpisodesFromSeason(marker, seasonNumber);
            episodes.push(...seasonEpisodes);
        });

        return this.organizeEpisodes(episodes);
    }

    findSeasonMarkers() {
        const markers = [];
        const largeSpans = document.querySelectorAll('span[style*="font-size: x-large"]');

        largeSpans.forEach(span => {
            const strongElement = span.querySelector('strong');
            if (strongElement && strongElement.textContent.includes('Temporada')) {
                markers.push(strongElement);
            }
        });

        const alternativeMarkers = document.querySelectorAll('strong');
        alternativeMarkers.forEach(strong => {
            const text = strong.textContent.trim();
            if ((text.includes('Temporada') || text.includes('ª Temporada')) && 
                !markers.includes(strong)) {
                markers.push(strong);
            }
        });

        return markers.sort((a, b) => {
            return this.getElementPosition(a) - this.getElementPosition(b);
        });
    }

    getElementPosition(element) {
        return element.getBoundingClientRect().top;
    }

    extractSeasonNumber(text) {
        const match = text.match(/(\d+)[ªa]/);
        return match ? parseInt(match[1]) : 1;
    }

    extractEpisodesFromSeason(seasonMarker, seasonNumber) {
        const episodes = [];
        let currentElement = seasonMarker.parentElement.nextElementSibling;

        while (currentElement) {
            if (this.isSeasonMarker(currentElement)) break;

            if (this.isEpisodeMarker(currentElement)) {
                const episodeData = this.parseEpisodeElement(currentElement, seasonNumber);
                if (episodeData) episodes.push(episodeData);
            }

            currentElement = currentElement.nextElementSibling;
        }

        return episodes;
    }

    isSeasonMarker(element) {
        if (element.querySelector && element.querySelector('strong')) {
            const strongText = element.querySelector('strong').textContent;
            return strongText.includes('Temporada');
        }
        return false;
    }

    isEpisodeMarker(element) {
        if (element.tagName === 'STRONG') {
            return element.textContent.includes('Episódio');
        }
        if (element.innerHTML) {
            return element.innerHTML.includes('<strong>Episódio');
        }
        return false;
    }

    parseEpisodeElement(episodeElement, seasonNumber) {
        const episodeText = episodeElement.textContent;
        const episodeMatch = episodeText.match(/Episódio\s+(\d+)/i);

        if (!episodeMatch) return null;

        const episodeNumber = parseInt(episodeMatch[1]);
        const links = this.extractLinksFromEpisode(episodeElement);

        return {
            season: seasonNumber,
            episode: episodeNumber,
            links: links,
            extractedAt: Date.now()
        };
    }

    extractLinksFromEpisode(episodeElement) {
        const links = {
            dubbed: null,
            subtitled: null,
            watch: null
        };

        let currentElement = episodeElement.nextElementSibling;

        while (currentElement && currentElement.tagName !== 'BR') {
            if (currentElement.tagName === 'A') {
                const href = currentElement.getAttribute('href');
                const linkText = currentElement.textContent.toLowerCase();

                if (linkText.includes('dublado')) {
                    links.dubbed = this.cleanUrl(href);
                } else if (linkText.includes('legendado')) {
                    links.subtitled = this.cleanUrl(href);
                } else if (linkText.includes('assistir') || linkText === 'assistir') {
                    links.watch = this.cleanUrl(href);
                }
            }
            currentElement = currentElement.nextElementSibling;
        }

        const linksInElement = episodeElement.querySelectorAll('a');
        linksInElement.forEach(link => {
            const href = link.getAttribute('href');
            const linkText = link.textContent.toLowerCase();

            if (linkText.includes('dublado')) {
                links.dubbed = this.cleanUrl(href);
            } else if (linkText.includes('legendado')) {
                links.subtitled = this.cleanUrl(href);
            } else if (linkText.includes('assistir') || linkText === 'assistir') {
                links.watch = this.cleanUrl(href);
            }
        });

        return links;
    }

    cleanUrl(url) {
        if (!url) return null;
        return url.startsWith('http') ? url : `${this.baseUrl}${url}`;
    }

    organizeEpisodes(episodes) {
        const organized = {};

        episodes.forEach(ep => {
            if (!organized[ep.season]) {
                organized[ep.season] = {};
            }

            if (!organized[ep.season][ep.episode]) {
                organized[ep.season][ep.episode] = {
                    season: ep.season,
                    episode: ep.episode,
                    links: ep.links
                };
            } else {
                Object.assign(organized[ep.season][ep.episode].links, ep.links);
            }
        });

        return organized;
    }
}

class PlayerOverlay {
    constructor(episodesData, currentSeason, currentEpisode) {
        this.episodesData = episodesData;
        this.currentSeason = currentSeason;
        this.currentEpisode = currentEpisode;
        this.overlay = null;
    }

    inject() {
        if (document.getElementById('auto-player-overlay')) return;

        this.overlay = document.createElement('div');
        this.overlay.id = 'auto-player-overlay';
        this.overlay.innerHTML = this.getHTML();
        document.body.appendChild(this.overlay);

        this.attachStyles();
        this.attachEventListeners();
    }

    getHTML() {
        const nextEp = this.getNextEpisode();
        const prevEp = this.getPreviousEpisode();
        const upcomingEps = this.getUpcomingEpisodes(5);

        return `
            <div class="ap-container">
                <div class="ap-header">
                     <img src="https://redecanais.pe/uploads/custom-logo.png?1" alt="Redecanais Logo" class="logo">
                    <button class="ap-close" id="ap-close">✕</button>
                </div>

                <div class="ap-current">
                    <div class="ap-badge">Assistindo Agora</div>
                    <div class="ap-episode-info">
                        <span class="ap-season">T${this.currentSeason}</span>
                        <span class="ap-separator">•</span>
                        <span class="ap-episode">E${this.currentEpisode}</span>
                    </div>
                </div>

                <div class="ap-controls">
                    ${prevEp ? `
                        <button class="ap-btn ap-btn-prev" data-season="${prevEp.season}" data-episode="${prevEp.episode}">
                            ⏮ Anterior
                        </button>
                    ` : '<button class="ap-btn ap-btn-disabled" disabled>⏮ Anterior</button>'}

                    ${nextEp ? `
                        <button class="ap-btn ap-btn-next" data-season="${nextEp.season}" data-episode="${nextEp.episode}">
                            Próximo ⏭
                        </button>
                    ` : '<button class="ap-btn ap-btn-disabled" disabled>Próximo ⏭</button>'}
                </div>

                ${upcomingEps.length > 0 ? `
                    <div class="ap-upcoming">
                        <div class="ap-upcoming-title">📋 Próximos Episódios</div>
                        <div class="ap-upcoming-list">
                            ${upcomingEps.map(ep => `
                                <div class="ap-upcoming-item" data-season="${ep.season}" data-episode="${ep.episode}">
                                    <span class="ap-upcoming-label">T${ep.season} E${ep.episode}</span>
                                    <button class="ap-upcoming-play">▶</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <div class="ap-toggle" id="ap-toggle">
                    <span>◀</span>
                </div>
            </div>
        `;
    }

    attachStyles() {
        if (document.getElementById('auto-player-styles')) return;

        const style = document.createElement('style');
        style.id = 'auto-player-styles';
        style.textContent = `
            #auto-player-overlay {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 999999;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            }

            .ap-container {
                background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                border-radius: 16px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                padding: 20px;
                min-width: 320px;
                max-width: 400px;
                color: #e2e8f0;
                transition: transform 0.3s ease, opacity 0.3s ease;
                border: 1px solid rgba(59, 130, 246, 0.3);
                position: relative;
            }

            .ap-container.minimized {
                transform: translateX(calc(100% + 20px));
            }

            .ap-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                padding-bottom: 15px;
                border-bottom: 1px solid rgba(59, 130, 246, 0.3);
            }

            .ap-header h3 {
                margin: 0;
                font-size: 18px;
                font-weight: 600;
                background: linear-gradient(90deg, #e2e8f0, #93c5fd);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
            }

            .ap-close {
                background: rgba(59, 130, 246, 0.2);
                border: none;
                color: #e2e8f0;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 16px;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .ap-close:hover {
                background: rgba(59, 130, 246, 0.3);
                transform: rotate(90deg);
            }

            .ap-current {
                background: rgba(30, 64, 175, 0.2);
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 16px;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(59, 130, 246, 0.2);
            }

            .ap-badge {
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 1px;
                opacity: 0.9;
                margin-bottom: 8px;
                font-weight: 600;
                color: #3b82f6;
            }

            .ap-episode-info {
                display: flex;
                align-items: center;
                font-size: 24px;
                font-weight: 700;
                color: #e2e8f0;
            }

            .ap-season {
                color: #ffd700;
            }

            .ap-separator {
                margin: 0 12px;
                opacity: 0.5;
                color: #64748b;
            }

            .ap-controls {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 16px;
            }

            .ap-btn {
                background: linear-gradient(135deg, #1e293b 0%, #64748b 100%);
                border: 2px solid rgba(100, 116, 139, 0.3);
                color: #e2e8f0;
                padding: 12px 16px;
                border-radius: 10px;
                cursor: pointer;
                font-weight: 600;
                font-size: 14px;
                transition: all 0.2s;
                backdrop-filter: blur(10px);
                font-family: inherit;
            }

            .ap-btn:hover:not(:disabled) {
                background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(37, 99, 235, 0.3);
            }

            .ap-btn-next {
                background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
                border-color: rgba(37, 99, 235, 0.5);
            }

            .ap-btn-next:hover:not(:disabled) {
                background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
            }

            .ap-btn-disabled {
                opacity: 0.4;
                cursor: not-allowed !important;
                background: #1e293b !important;
                transform: none !important;
                box-shadow: none !important;
            }

            .ap-upcoming {
                background: rgba(30, 41, 59, 0.5);
                border-radius: 12px;
                padding: 14px;
                backdrop-filter: blur(10px);
                border: 1px solid rgba(71, 85, 105, 0.3);
            }

            .ap-upcoming-title {
                font-size: 13px;
                font-weight: 600;
                margin-bottom: 10px;
                color: #3b82f6;
            }

            .ap-upcoming-list {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .ap-upcoming-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: rgba(30, 41, 59, 0.7);
                padding: 10px 12px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
                border: 1px solid rgba(71, 85, 105, 0.3);
            }

            .ap-upcoming-item:hover {
                background: rgba(37, 99, 235, 0.2);
                transform: translateX(4px);
                border-color: #2563eb;
            }

            .ap-upcoming-label {
                font-weight: 600;
                font-size: 13px;
                color: #e2e8f0;
            }

            .ap-upcoming-play {
                background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
                border: none;
                color: white;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 12px;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .ap-upcoming-play:hover {
                background: linear-gradient(135deg, #1e40af 0%, #1e3a8a 100%);
                transform: scale(1.1);
            }

            .ap-toggle {
                position: absolute;
                left: -40px;
                top: 50%;
                transform: translateY(-50%);
                background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
                width: 40px;
                height: 60px;
                border-radius: 12px 0 0 12px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                box-shadow: -5px 0 15px rgba(0, 0, 0, 0.2);
                transition: all 0.2s;
                border: none;
                color: #e2e8f0;
            }

            .ap-toggle:hover {
                left: -42px;
            }

            .ap-toggle span {
                font-size: 20px;
                transition: transform 0.3s;
                color: #e2e8f0;
            }

            .ap-container.minimized + .ap-toggle span {
                transform: rotate(180deg);
            }

            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            #auto-player-overlay {
                animation: slideIn 0.3s ease;
            }

            .ap-btn:disabled {
                opacity: 0.4;
                cursor: not-allowed;
                background: #1e293b;
                transform: none;
                box-shadow: none;
            }

            .ap-btn:disabled:hover {
                background: #1e293b;
                transform: none;
                box-shadow: none;
            }
        `;
        document.head.appendChild(style);
    }

    attachEventListeners() {

        document.getElementById('ap-close')?.addEventListener('click', () => {
            this.overlay.remove();
        });

        document.getElementById('ap-toggle')?.addEventListener('click', () => {
            const container = document.querySelector('.ap-container');
            container.classList.toggle('minimized');
        });

        document.querySelectorAll('.ap-btn-prev, .ap-btn-next').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const season = parseInt(e.target.dataset.season);
                const episode = parseInt(e.target.dataset.episode);
                this.navigateToEpisode(season, episode);
            });
        });

        document.querySelectorAll('.ap-upcoming-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const season = parseInt(e.currentTarget.dataset.season);
                const episode = parseInt(e.currentTarget.dataset.episode);
                this.navigateToEpisode(season, episode);
            });
        });
    }

    getNextEpisode() {
        const currentSeasonEps = this.episodesData[this.currentSeason];
        if (!currentSeasonEps) return null;

        if (currentSeasonEps[this.currentEpisode + 1]) {
            return {
                season: this.currentSeason,
                episode: this.currentEpisode + 1
            };
        }

        const nextSeason = this.currentSeason + 1;
        if (this.episodesData[nextSeason] && this.episodesData[nextSeason][1]) {
            return {
                season: nextSeason,
                episode: 1
            };
        }

        return null;
    }

    getPreviousEpisode() {

        if (this.currentEpisode > 1) {
            const prevEp = this.episodesData[this.currentSeason][this.currentEpisode - 1];
            if (prevEp) {
                return {
                    season: this.currentSeason,
                    episode: this.currentEpisode - 1
                };
            }
        }

        if (this.currentSeason > 1) {
            const prevSeason = this.currentSeason - 1;
            const prevSeasonEps = this.episodesData[prevSeason];
            if (prevSeasonEps) {
                const lastEpNum = Math.max(...Object.keys(prevSeasonEps).map(Number));
                return {
                    season: prevSeason,
                    episode: lastEpNum
                };
            }
        }

        return null;
    }

    getUpcomingEpisodes(count = 5) {
        const upcoming = [];
        let season = this.currentSeason;
        let episode = this.currentEpisode + 1;

        while (upcoming.length < count) {
            if (this.episodesData[season] && this.episodesData[season][episode]) {
                upcoming.push({ season, episode });
                episode++;
            } else {
                season++;
                episode = 1;
                if (!this.episodesData[season]) break;
            }
        }

        return upcoming;
    }

    navigateToEpisode(season, episode) {
        const episodeData = this.episodesData[season]?.[episode];
        if (!episodeData) {
            console.log('❌ Dados do episódio não encontrados:', { season, episode });
            return;
        }

        const url = episodeData.links.dubbed || episodeData.links.subtitled || episodeData.links.watch;

        if (url) {
            console.log('🚀 Navegando para episódio:', url);

            chrome.runtime.sendMessage({
                action: 'saveProgress',
                seriesUrl: getSeriesUrl(), 
                season: season,
                episode: episode
            });

            window.location.href = url;
        } else {
            console.log('❌ Link do episódio não encontrado:', { season, episode });
        }
    }
}

(function autoInjectPlayer() {
    const url = window.location.href;

    console.log('🚀 Inicializando auto-inject para URL:', url);

    const isEpisodePage = document.querySelector('h1[itemprop="name"]') && 
                         document.querySelector('h1[itemprop="name"]').textContent.includes('Temporada');

    if (isEpisodePage) {
        console.log('🎬 Página de episódio detectada, inicializando sistema...');

        const titleElement = document.querySelector('h1[itemprop="name"]');
        const titleText = titleElement.textContent.trim();
        console.log('📝 Título encontrado:', titleText);

        const episodeInfo = extractEpisodeInfoFromTitle(titleText);

        if (episodeInfo) {
            console.log('📺 Episódio detectado:', episodeInfo);

            setTimeout(() => {
                const seriesUrl = getSeriesUrl();
                console.log('🔍 Buscando dados para série:', seriesUrl);

                chrome.runtime.sendMessage(
                    { action: 'getSeriesData', seriesUrl: seriesUrl },
                    response => {
                        if (response?.data?.episodes) {
                            console.log('✅ Dados encontrados, injetando player...');

                            const player = new PlayerOverlay(
                                response.data.episodes,
                                episodeInfo.season,
                                episodeInfo.episode
                            );
                            player.inject();

                            window._playerOverlay = player;

                            chrome.runtime.sendMessage({
                                action: 'saveProgress',
                                seriesUrl: seriesUrl,
                                season: episodeInfo.season,
                                episode: episodeInfo.episode
                            });

                            console.log('🎧 Inicializando VideoJSAutoPlayer...');
                            window._videoJSAutoPlayer = new VideoJSAutoPlayer();

                        } else {
                            console.log('⚠️ Nenhum dado salvo encontrado para esta série');
                            console.log('💡 Visite a página principal da série primeiro para extrair os episódios');
                        }
                    }
                );
            }, 2000);
        } else {
            console.log('❌ Não foi possível extrair informações do episódio do título');
        }
    }
})();

    function extractEpisodeInfoFromTitle(titleText) {
        console.log('🔍 Extraindo informações do título:', titleText);

        let match = titleText.match(/(.+?)\s*-\s*(\d+)[ªa]\s*Temporada\s*-\s*Episodio\s*(\d+)(?:\s*-\s*(.+))?/i);

        if (match) {
            return {
                seriesName: match[1].trim(),
                season: parseInt(match[2]),
                episode: parseInt(match[3]),
                episodeName: match[4] ? match[4].trim() : '',
                fullTitle: titleText
            };
        }

        match = titleText.match(/(.+?)\s*-\s*(\d+)[ªa]\s*Temporada\s*-\s*Episódio\s*(\d+)(?:\s*-\s*(.+))?/i);
        if (match) {
            return {
                seriesName: match[1].trim(),
                season: parseInt(match[2]),
                episode: parseInt(match[3]),
                episodeName: match[4] ? match[4].trim() : '',
                fullTitle: titleText
            };
        }

        match = titleText.match(/(.+?)\s*-\s*Temporada\s*(\d+)\s*Episódio\s*(\d+)/i);
        if (match) {
            return {
                seriesName: match[1].trim(),
                season: parseInt(match[2]),
                episode: parseInt(match[3]),
                episodeName: '',
                fullTitle: titleText
            };
        }

        match = titleText.match(/(.+?)\s*-\s*Temporada\s*(\d+)\s*Episodio\s*(\d+)/i);
        if (match) {
            return {
                seriesName: match[1].trim(),
                season: parseInt(match[2]),
                episode: parseInt(match[3]),
                episodeName: '',
                fullTitle: titleText
            };
        }

        match = titleText.match(/(\d+)[ªa]\s*Temporada\s*-\s*Episodio\s*(\d+)(?:\s*-\s*(.+))?/i);
        if (match) {
            return {
                seriesName: this.extractSeriesNameFromUrl() || 'Série Desconhecida',
                season: parseInt(match[1]),
                episode: parseInt(match[2]),
                episodeName: match[3] ? match[3].trim() : '',
                fullTitle: titleText
            };
        }

        console.log('❌ Padrão do título não reconhecido:', titleText);
        return null;
    }

    function extractSeriesNameFromUrl() {
        const url = window.location.href;
        const match = url.match(/\/([^\/]+?)(?:-\d+a-temporada|$)/);
        return match ? match[1].replace(/-/g, ' ') : null;
    }

    function getSeriesUrl() {
        const currentUrl = window.location.href;

        console.log('🔗 Analisando URL:', currentUrl);

        const titleElement = document.querySelector('h1[itemprop="name"]');
        if (titleElement) {
            const titleText = titleElement.textContent.trim();
            const episodeInfo = extractEpisodeInfoFromTitle(titleText);

            if (episodeInfo && episodeInfo.seriesName) {

                const cleanSeriesName = episodeInfo.seriesName
                    .toLowerCase()
                    .replace(/\s+/g, '-')
                    .replace(/[^\w\-]/g, '')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '');

                const url = new URL(currentUrl);
                const baseUrl = `${url.origin}/${cleanSeriesName}`;
                console.log('🎯 URL base extraída do título:', baseUrl);
                return baseUrl;
            }
        }

        const url = new URL(currentUrl);
        const pathname = url.pathname;

        console.log('📁 Usando fallback para path:', pathname);

        let cleanPath = pathname.replace(/-\d+.*$/, '');
        cleanPath = cleanPath.replace(/\/$/, '');

        const fallbackUrl = url.origin + cleanPath;
        console.log('⚠️ URL base (fallback):', fallbackUrl);

        return fallbackUrl;
    }

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getRealTimeEpisodes') {
        const extractor = new RealTimeEpisodeExtractor();
        const episodes = extractor.extractRealTimeLinks();

        const totalSeasons = Object.keys(episodes).length;
        const totalEpisodes = Object.values(episodes).reduce((sum, season) => sum + Object.keys(season).length, 0);

        sendResponse({
            success: true,
            episodes: episodes,
            extractedAt: new Date().toISOString(),
            url: window.location.href,
            totalSeasons: totalSeasons,
            totalEpisodes: totalEpisodes,
            structure: 'season-based'
        });
    }

    if (request.action === 'injectPlayer') {
        const player = new PlayerOverlay(
            request.episodesData,
            request.currentSeason,
            request.currentEpisode
        );
        player.inject();
        sendResponse({ success: true });
    }

    if (request.action === 'checkAndInjectPlayer') {

        const urlParams = new URLSearchParams(window.location.search);

        sendResponse({ success: true });
    }

        if (request.action === 'toggleAutoPlay') {
        if (window._videoJSAutoPlayer) {
            window._videoJSAutoPlayer.toggleAutoPlay();
            sendResponse({ success: true, autoPlay: window._videoJSAutoPlayer.isAutoPlaying });
        } else {
            sendResponse({ success: false, error: 'Auto player não encontrado' });
        }
    }

    if (request.action === 'getAutoPlayStatus') {
        if (window._videoJSAutoPlayer) {
            sendResponse({ 
                success: true, 
                autoPlay: window._videoJSAutoPlayer.isAutoPlaying,
                playerFound: !!window._videoJSAutoPlayer.player,
                currentEpisode: `${window._videoJSAutoPlayer.currentSeason}E${window._videoJSAutoPlayer.currentEpisode}`
            });
        } else {
            sendResponse({ success: false, autoPlay: false });
        }
    }

    return true;
});