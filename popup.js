class PopupController {
    constructor() {
        this.currentTab = null;
        this.seriesData = null;
        this.currentSeason = 1;
        this.currentProgress = null;
        this.init();
    }

    async init() {
        try {
            this.currentTab = await this.getCurrentTab();

            if (!this.isValidSite()) {
                this.renderInvalidSite();
                return;
            }

            const episodeInfo = this.detectEpisodeFromUrl();
            if (episodeInfo) {
                await this.loadDataForPlayer(episodeInfo);
            } else {
                await this.loadData();
            }
        } catch (error) {
            this.renderError('Erro ao inicializar', error.message);
        }
    }

    async getCurrentTab() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return tab;
    }

    isValidSite() {
        return this.currentTab?.url?.includes('redecanais.fm');
    }

    detectEpisodeFromUrl() {
        const url = this.currentTab.url;

        const seasonEpisodePattern = /(\d+)a-temporada-episodio-(\d+)/i;
        const match = url.match(seasonEpisodePattern);

        if (match) {
            return {
                season: parseInt(match[1]),
                episode: parseInt(match[2]),
                isPlayerPage: true
            };
        }

        return null;
    }

    async loadDataForPlayer(episodeInfo) {
        this.renderLoading();

        try {
            const seriesUrl = this.getSeriesUrl();
            console.log('🔍 Buscando dados para:', seriesUrl);

            const savedData = await this.getSavedData();
            console.log('📦 Dados encontrados:', savedData ? 'SIM' : 'NÃO');

            if (savedData && savedData.episodes && Object.keys(savedData.episodes).length > 0) {
                this.seriesData = savedData;
                this.currentSeason = episodeInfo.season;

                await this.saveProgress(episodeInfo.season, episodeInfo.episode);

                this.injectPlayerOverlay(episodeInfo.season, episodeInfo.episode);

                setTimeout(() => window.close(), 1000);

            } else {
                this.renderPlayerWithoutData(episodeInfo);
            }
        } catch (error) {
            console.error('❌ Erro ao carregar dados:', error);
            this.renderError('Erro ao carregar dados', error.message);
        }
    }

    async loadData() {
        this.renderLoading();

        try {

            const savedData = await this.getSavedData();

            if (savedData && this.isDataRecent(savedData.extractedAt)) {
                this.seriesData = savedData;
                this.currentProgress = await this.getProgress();
                this.render();
                return;
            }

            const extractedData = await this.extractFromPage();

            if (extractedData.success && Object.keys(extractedData.episodes).length > 0) {
                this.seriesData = extractedData;
                await this.saveData(extractedData);
                this.currentProgress = await this.getProgress();
                this.render();
            } else {
                this.renderEmptyState();
            }
        } catch (error) {
            this.renderError('Erro ao carregar dados', error.message);
        }
    }

    async extractFromPage() {
        return new Promise((resolve, reject) => {
            chrome.tabs.sendMessage(
                this.currentTab.id,
                { action: 'getRealTimeEpisodes' },
                response => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                }
            );
        });
    }

    async getSavedData() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: 'getSeriesData', seriesUrl: this.getSeriesUrl() },
                response => {
                    resolve(response?.data || null);
                }
            );
        });
    }

    async saveData(data) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                {
                    action: 'saveSeriesData',
                    seriesUrl: this.getSeriesUrl(),
                    data: data
                },
                response => resolve(response)
            );
        });
    }

    async getProgress() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: 'getProgress', seriesUrl: this.getSeriesUrl() },
                response => {
                    resolve(response?.progress || null);
                }
            );
        });
    }

    async saveProgress(season, episode) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(
                {
                    action: 'saveProgress',
                    seriesUrl: this.getSeriesUrl(),
                    season: season,
                    episode: episode
                },
                response => resolve(response)
            );
        });
    }

    getSeriesUrl() {
        const url = new URL(this.currentTab.url);
        const path = url.pathname;

        console.log('🔗 URL original:', this.currentTab.url);

        let seriesPath = path;

        seriesPath = seriesPath

            .replace(/^\/browse-/, '/')
            .replace(/-videos-\d+(-date)?/g, '') 

            .replace(/-\d+a-temporada-episodio-\d+[^/]*$/i, '')

            .replace(/\.(html|php)$/i, '')

            .replace(/_[a-z0-9]+$/i, '')

            .replace(/\/$/, '');

        const finalUrl = url.origin + seriesPath;
        console.log('🎯 URL normalizada:', finalUrl);

        return finalUrl;
    }

    isDataRecent(timestamp) {
        const ONE_HOUR = 60 * 60 * 1000;
        return (Date.now() - new Date(timestamp).getTime()) < ONE_HOUR;
    }

    render() {
        const app = document.getElementById('app');

        const totalSeasons = Object.keys(this.seriesData.episodes).length;
        const totalEpisodes = Object.values(this.seriesData.episodes).reduce(
            (sum, season) => sum + Object.keys(season).length, 0
        );

        const seriesUrl = this.getSeriesUrl();
        console.log('📺 Série identificada como:', seriesUrl);

        app.innerHTML = `
            <div class="status">
                <div class="status-indicator">
                    <div class="status-dot"></div>
                    <span class="status-text">Série Detectada</span>
                </div>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Temporadas</div>
                        <div class="info-value">${totalSeasons}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Episódios</div>
                        <div class="info-value">${totalEpisodes}</div>
                    </div>  
                </div>
            </div>

            <button class="btn btn-primary" id="extract-btn">
                <span>🔄</span>
                <span>Atualizar Episódios</span>
            </button>

            ${this.currentProgress ? `
                <div class="status" style="margin-top: 16px;">
                    <div class="status-indicator">
                        <div class="status-dot"></div>
                        <span class="status-text">Último assistido</span>
                    </div>
                    <div class="progress-info">
                        T${this.currentProgress.season} • E${this.currentProgress.episode}
                    </div>
                </div>
            ` : ''}

            <div class="episodes-section">
                <div class="section-title">
                    <span>📺</span>
                    <span>Selecionar Episódio</span>
                </div>

                <div class="season-selector" id="season-selector">
                    ${Object.keys(this.seriesData.episodes).map(season => `
                        <button class="season-btn ${season == this.currentSeason ? 'active' : ''}" 
                                data-season="${season}">
                            Temporada ${season}
                        </button>
                    `).join('')}
                </div>

                <div class="episodes-grid" id="episodes-grid">
                    ${this.renderEpisodes()}
                </div>
            </div>

        `;

        this.attachEventListeners();
    }

    renderEpisodes() {
        const seasonEpisodes = this.seriesData.episodes[this.currentSeason];
        if (!seasonEpisodes) return '<p>Nenhum episódio encontrado</p>';

        return Object.keys(seasonEpisodes)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(epNum => {
                const isCurrent = this.currentProgress?.season == this.currentSeason && 
                                 this.currentProgress?.episode == epNum;
                const isWatched = this.currentProgress && 
                                 (this.currentProgress.season > this.currentSeason ||
                                  (this.currentProgress.season == this.currentSeason && 
                                   this.currentProgress.episode > epNum));

                return `
                    <button class="episode-btn ${isCurrent ? 'current' : ''} ${isWatched ? 'watched' : ''}" 
                            data-season="${this.currentSeason}" 
                            data-episode="${epNum}">
                        ${epNum}
                    </button>
                `;
            }).join('');
    }

    attachEventListeners() {

        document.querySelectorAll('.season-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.currentSeason = parseInt(e.target.dataset.season);
                document.querySelectorAll('.season-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById('episodes-grid').innerHTML = this.renderEpisodes();
                this.attachEpisodeListeners();
            });
        });

        this.attachEpisodeListeners();

        document.getElementById('extract-btn')?.addEventListener('click', async () => {
            const btn = document.getElementById('extract-btn');
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0;"></div>';

            try {
                const data = await this.extractFromPage();
                if (data.success) {
                    this.seriesData = data;
                    await this.saveData(data);
                    this.render();
                }
            } catch (error) {
                alert('Erro ao atualizar: ' + error.message);
            }
        });

        document.getElementById('download-json')?.addEventListener('click', () => {
            this.downloadJSON();
        });
    }

    attachEpisodeListeners() {
        document.querySelectorAll('.episode-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const season = parseInt(e.target.dataset.season);
                const episode = parseInt(e.target.dataset.episode);

                e.target.disabled = true;
                const originalContent = e.target.textContent;
                e.target.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin: 0 auto;"></div>';

                await this.playEpisode(season, episode);
            });
        });
    }

    async playEpisode(season, episode) {
        const episodeData = this.seriesData.episodes[season]?.[episode];
        if (!episodeData) return;

        const url = episodeData.links.dubbed || episodeData.links.subtitled || episodeData.links.watch;
        if (!url) {
            alert('Link não encontrado para este episódio');
            return;
        }

        await this.saveProgress(season, episode);

        document.getElementById('app').innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p style="font-weight: 600; margin-bottom: 8px;">Carregando Episódio</p>
                <p style="font-size: 24px; font-weight: 700; margin-bottom: 8px;">
                    <span style="color: #ffd700;">T${season}</span> • E${episode}
                </p>
                <p style="font-size: 12px; opacity: 0.7;">Preparando o player...</p>
            </div>
        `;

        await chrome.tabs.update(this.currentTab.id, { url: url });

        await new Promise(resolve => setTimeout(resolve, 800));

        await this.waitForPageLoad();

        this.currentTab = await this.getCurrentTab();

        this.renderPlayerInterface(season, episode);
        this.injectPlayerOverlay(season, episode);
    }

    async waitForPageLoad() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 20;

            const checkTab = async () => {
                attempts++;
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

                if (tab && tab.status === 'complete') {
                    resolve();
                } else if (attempts < maxAttempts) {
                    setTimeout(checkTab, 300);
                } else {
                    resolve(); 
                }
            };

            checkTab();
        });
    }

    downloadJSON() {
        const dataStr = JSON.stringify({
            series: this.getSeriesUrl(),
            extractedAt: this.seriesData.extractedAt,
            totalSeasons: this.seriesData.totalSeasons,
            totalEpisodes: this.seriesData.totalEpisodes,
            episodes: this.seriesData.episodes
        }, null, 2);

        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `series-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    injectPlayerOverlay(season, episode) {
        chrome.tabs.sendMessage(this.currentTab.id, {
            action: 'injectPlayer',
            episodesData: this.seriesData.episodes,
            currentSeason: season,
            currentEpisode: episode
        });
    }

    renderPlayerInterface(season, episode) {
        const app = document.getElementById('app');

        const totalSeasons = Object.keys(this.seriesData.episodes).length;
        const totalEpisodes = Object.values(this.seriesData.episodes).reduce(
            (sum, season) => sum + Object.keys(season).length, 0
        );

        const nextEp = this.getNextEpisode(season, episode);
        const prevEp = this.getPreviousEpisode(season, episode);
        const upcomingEps = this.getUpcomingEpisodes(season, episode, 4);

        app.innerHTML = `
            <div class="status">
                <div class="status-indicator">
                    <div class="status-dot"></div>
                    <span class="status-text"> Assistindo Agora</span>
                </div>
                <div style="text-align: center; margin-top: 12px;">
                    <span style="font-size: 28px; font-weight: 700;">
                        <span style="color: #ffd700;">T${season}</span> 
                        <span style="opacity: 0.5; margin: 0 8px;">•</span> 
                        <span>E${episode}</span>
                    </span>
                </div>
                <div class="info-grid" style="margin-top: 12px;">
                    <div class="info-item">
                        <div class="info-label">Temporadas</div>
                        <div class="info-value">${totalSeasons}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Episódios</div>
                        <div class="info-value">${totalEpisodes}</div>
                    </div>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px;">
                ${prevEp ? `
                    <button class="btn btn-primary" id="prev-ep" style="padding: 12px;"
                            data-season="${prevEp.season}" data-episode="${prevEp.episode}">
                        <span>⏮</span>
                        <span>Anterior</span>
                    </button>
                ` : '<button class="btn btn-primary" disabled style="padding: 12px; opacity: 0.4;">⏮ Anterior</button>'}

                ${nextEp ? `
                    <button class="btn btn-secondary" id="next-ep" style="padding: 12px;"
                            data-season="${nextEp.season}" data-episode="${nextEp.episode}">
                        <span>Próximo</span>
                        <span>⏭</span>
                    </button>
                ` : '<button class="btn btn-secondary" disabled style="padding: 12px; opacity: 0.4;">Próximo ⏭</button>'}
            </div>

            ${upcomingEps.length > 0 ? `
                <div class="episodes-section">
                    <div class="section-title">
                        <span>📋</span>
                        <span>Próximos Episódios</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${upcomingEps.map(ep => `
                            <button class="btn btn-primary" 
                                    data-season="${ep.season}" 
                                    data-episode="${ep.episode}"
                                    style="justify-content: space-between;">
                                <span style="font-weight: 700;">T${ep.season} • E${ep.episode}</span>
                                <span>▶</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            <button class="btn btn-primary" id="back-to-series" style="margin-top: 16px;">
                <span>📺</span>
                <span>Ver Todos os Episódios</span>
            </button>
        `;

        this.attachPlayerEventListeners();
    }

    attachPlayerEventListeners() {

        document.getElementById('prev-ep')?.addEventListener('click', async (e) => {
            const season = parseInt(e.currentTarget.dataset.season);
            const episode = parseInt(e.currentTarget.dataset.episode);

            e.currentTarget.disabled = true;
            e.currentTarget.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin: 0;"></div>';

            await this.playEpisode(season, episode);
        });

        document.getElementById('next-ep')?.addEventListener('click', async (e) => {
            const season = parseInt(e.currentTarget.dataset.season);
            const episode = parseInt(e.currentTarget.dataset.episode);

            e.currentTarget.disabled = true;
            e.currentTarget.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin: 0;"></div>';

            await this.playEpisode(season, episode);
        });

        document.querySelectorAll('[data-season][data-episode]').forEach(btn => {
            if (btn.id !== 'prev-ep' && btn.id !== 'next-ep' && btn.id !== 'back-to-series') {
                btn.addEventListener('click', async (e) => {
                    const season = parseInt(e.currentTarget.dataset.season);
                    const episode = parseInt(e.currentTarget.dataset.episode);

                    e.currentTarget.disabled = true;
                    const originalContent = e.currentTarget.innerHTML;
                    e.currentTarget.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; border-width: 2px; margin: 0 auto;"></div>';

                    await this.playEpisode(season, episode);
                });
            }
        });

        document.getElementById('back-to-series')?.addEventListener('click', async () => {
            const btn = document.getElementById('back-to-series');
            btn.disabled = true;
            btn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0 auto;"></div>';

            const seriesUrl = this.getSeriesUrl();
            await chrome.tabs.update(this.currentTab.id, { url: seriesUrl });

            this.renderLoading();
            await this.waitForPageLoad();

            this.currentTab = await this.getCurrentTab();
            await this.loadData();
        });
    }

    getNextEpisode(currentSeason, currentEpisode) {
        const seasonEps = this.seriesData.episodes[currentSeason];
        if (!seasonEps) return null;

        if (seasonEps[currentEpisode + 1]) {
            return { season: currentSeason, episode: currentEpisode + 1 };
        }

        const nextSeason = currentSeason + 1;
        if (this.seriesData.episodes[nextSeason] && this.seriesData.episodes[nextSeason][1]) {
            return { season: nextSeason, episode: 1 };
        }

        return null;
    }

    getPreviousEpisode(currentSeason, currentEpisode) {

        if (currentEpisode > 1) {
            const prevEp = this.seriesData.episodes[currentSeason][currentEpisode - 1];
            if (prevEp) {
                return { season: currentSeason, episode: currentEpisode - 1 };
            }
        }

        if (currentSeason > 1) {
            const prevSeason = currentSeason - 1;
            const prevSeasonEps = this.seriesData.episodes[prevSeason];
            if (prevSeasonEps) {
                const lastEpNum = Math.max(...Object.keys(prevSeasonEps).map(Number));
                return { season: prevSeason, episode: lastEpNum };
            }
        }

        return null;
    }

    getUpcomingEpisodes(currentSeason, currentEpisode, count = 4) {
        const upcoming = [];
        let season = currentSeason;
        let episode = currentEpisode + 1;

        while (upcoming.length < count) {
            if (this.seriesData.episodes[season] && this.seriesData.episodes[season][episode]) {
                upcoming.push({ season, episode });
                episode++;
            } else {
                season++;
                episode = 1;
                if (!this.seriesData.episodes[season]) break;
            }
        }

        return upcoming;
    }

    renderPlayerWithoutData(episodeInfo) {
        const app = document.getElementById('app');

        app.innerHTML = `
            <div class="status">
                <div class="status-indicator">
                    <div class="status-dot"></div>
                    <span class="status-text">🎬 Assistindo</span>
                </div>
                <div style="text-align: center; margin-top: 12px;">
                    <span style="font-size: 28px; font-weight: 700;">
                        <span style="color: #ffd700;">T${episodeInfo.season}</span> 
                        <span style="opacity: 0.5; margin: 0 8px;">•</span> 
                        <span>E${episodeInfo.episode}</span>
                    </span>
                </div>
            </div>

            <div class="error" style="margin-top: 16px;">
                <div class="error-title">📋 Dados não encontrados</div>
                <div class="error-message">
                    Para habilitar a navegação entre episódios, visite a página principal da série primeiro.
                </div>
            </div>

            <button class="btn btn-secondary" id="go-to-series">
                <span>📺</span>
                <span>Ir para Página da Série</span>
            </button>
        `;

        document.getElementById('go-to-series')?.addEventListener('click', () => {
            const seriesUrl = this.getSeriesUrl();
            chrome.tabs.update(this.currentTab.id, { url: seriesUrl });
            window.close();
        });
    }

    renderLoading() {
        document.getElementById('app').innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p style="font-weight: 600; margin-bottom: 8px;">Carregando...</p>
                <p style="font-size: 12px; opacity: 0.7;">Aguarde um momento</p>
            </div>
        `;
    }

    renderError(title, message) {
        document.getElementById('app').innerHTML = `
            <div class="error">
                <div class="error-title">⚠️ ${title}</div>
                <div class="error-message">${message}</div>
            </div>
            <button class="btn btn-primary" onclick="location.reload()">
                <span>🔄</span>
                <span>Tentar Novamente</span>
            </button>
        `;
    }

    renderEmptyState() {
        document.getElementById('app').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📺</div>
                <div class="empty-title">Nenhum episódio encontrado</div>
                <div class="empty-text">
                    Certifique-se de estar na página principal da série com a lista de episódios.
                </div>
            </div>
            <button class="btn btn-primary" onclick="location.reload()">
                <span>🔄</span>
                <span>Tentar Novamente</span>
            </button>
        `;
    }

    renderInvalidSite() {
        document.getElementById('app').innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">🌐</div>
                <div class="empty-title">Site não suportado</div>
                <div class="empty-text">
                    Esta extensão funciona apenas no site redecanais.sh. 
                    Por favor, navegue até o site para usar o Auto Player Pro.
                </div>
            </div>
        `;
    }
}

new PopupController();