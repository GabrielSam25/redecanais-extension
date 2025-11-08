class StorageManager {
    static async saveSeriesData(seriesUrl, data) {
        try {
            const key = `series_${await this.hashUrl(seriesUrl)}`;
            console.log('💾 Salvando dados da série:', { 
                key, 
                seriesUrl, 
                temporadas: data.totalSeasons,
                episodios: data.totalEpisodes
            });

            const dataToSave = {
                url: seriesUrl,
                episodes: data.episodes || {},
                extractedAt: data.extractedAt || new Date().toISOString(),
                totalSeasons: data.totalSeasons || Object.keys(data.episodes || {}).length,
                totalEpisodes: data.totalEpisodes || this.calculateTotalEpisodes(data.episodes)
            };

            await chrome.storage.local.set({
                [key]: dataToSave
            });

            const verify = await chrome.storage.local.get(key);
            console.log('✅ Dados salvos - Verificação:', {
                success: !!verify[key],
                temp: verify[key]?.totalSeasons,
                eps: verify[key]?.totalEpisodes,
                hasEpisodes: !!verify[key]?.episodes
            });

        } catch (error) {
            console.error('❌ Erro ao salvar dados:', error);
            throw error;
        }
    }

    static async getSeriesData(seriesUrl) {
        try {
            const key = `series_${await this.hashUrl(seriesUrl)}`;
            console.log('🔍 Buscando dados da série:', { key, seriesUrl });

            const result = await chrome.storage.local.get(key);

            if (result[key]) {
                const data = result[key];
                console.log('✅ Dados encontrados:', {
                    temporadas: data.totalSeasons,
                    episodios: data.totalEpisodes,
                    temEpisodes: !!data.episodes,
                    qtdTemporadas: data.episodes ? Object.keys(data.episodes).length : 0,
                    estrutura: Object.keys(data)
                });
                return data;
            } else {
                console.log('❌ Nenhum dado encontrado para esta chave');

                const allData = await chrome.storage.local.get(null);
                const seriesKeys = Object.keys(allData).filter(k => k.startsWith('series_'));
                console.log('📦 Chaves de série no storage:', seriesKeys);

                seriesKeys.forEach(k => {
                    console.log(`   ${k}:`, {
                        temp: allData[k]?.totalSeasons,
                        eps: allData[k]?.totalEpisodes,
                        tipo: allData[k]?.episodes ? 'dados' : 'progresso?'
                    });
                });

                return null;
            }
        } catch (error) {
            console.error('❌ Erro ao buscar dados:', error);
            return null;
        }
    }

    static async saveProgress(seriesUrl, season, episode) {
        try {
            const key = `progress_${await this.hashUrl(seriesUrl)}`; 
            const progressData = {
                season: parseInt(season),
                episode: parseInt(episode),
                timestamp: Date.now()
            };

            await chrome.storage.local.set({
                [key]: progressData
            });
            console.log('💾 Progresso salvo:', { key, season: progressData.season, episode: progressData.episode });
        } catch (error) {
            console.error('❌ Erro ao salvar progresso:', error);
            throw error;
        }
    }

    static async getProgress(seriesUrl) {
        try {
            const key = `progress_${await this.hashUrl(seriesUrl)}`; 
            const result = await chrome.storage.local.get(key);
            const progress = result[key] || null;

            if (progress) {
                console.log('📊 Progresso encontrado:', { 
                    key, 
                    season: progress.season, 
                    episode: progress.episode
                });
            } else {
                console.log('📊 Nenhum progresso encontrado para:', key);
            }

            return progress;
        } catch (error) {
            console.error('❌ Erro ao buscar progresso:', error);
            return null;
        }
    }

    static calculateTotalEpisodes(episodes) {
        if (!episodes) return 0;
        let total = 0;
        Object.values(episodes).forEach(season => {
            total += Object.keys(season).length;
        });
        return total;
    }

    static async hashUrl(url) {
        return new Promise((resolve) => {
            try {
                let normalized = url
                    .toLowerCase()
                    .replace(/^(https?:\/\/)?(www\.)?/, '')
                    .replace(/\/+$/, '')
                    .trim();

                let hash = 0;
                for (let i = 0; i < normalized.length; i++) {
                    const char = normalized.charCodeAt(i);
                    hash = ((hash << 5) - hash) + char;
                    hash = hash & hash;
                }

                const hashStr = Math.abs(hash).toString(36);
                resolve(hashStr);

            } catch (error) {
                console.error('❌ Erro no hash, usando fallback:', error);
                const fallbackHash = btoa(url).replace(/[^a-z0-9]/gi, '').substring(0, 8);
                resolve(fallbackHash);
            }
        });
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveSeriesData') {
        StorageManager.saveSeriesData(request.seriesUrl, request.data)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'getSeriesData') {
        StorageManager.getSeriesData(request.seriesUrl)
            .then(data => sendResponse({ success: true, data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'saveProgress') {
        StorageManager.saveProgress(request.seriesUrl, request.season, request.episode)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'getProgress') {
        StorageManager.getProgress(request.seriesUrl)
            .then(progress => sendResponse({ success: true, progress }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'navigateToEpisode') {
        chrome.tabs.update(sender.tab.id, { url: request.url })
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }

    if (request.action === 'logMessage') {
        const timestamp = new Date().toLocaleTimeString();
        const logMessage = `[ContentScript ${timestamp}] ${request.message}`;

        let emoji = '📝';
        if (request.level === 'error') emoji = '❌';
        if (request.level === 'warn') emoji = '⚠️';
        if (request.level === 'info') emoji = 'ℹ️';

        switch (request.level) {
            case 'error':
                console.error(`${emoji} ${logMessage}`, request.data || '');
                break;
            case 'warn':
                console.warn(`${emoji} ${logMessage}`, request.data || '');
                break;
            case 'info':
                console.info(`${emoji} ${logMessage}`, request.data || '');
                break;
            default:
                console.log(`${emoji} ${logMessage}`, request.data || '');
        }

        sendResponse({ success: true, received: true });
        return true;
    }

    if (request.action === 'logDebug') {
        console.log(`[Tab ${sender.tab.id}] ${request.level?.toUpperCase() || 'DEBUG'}: ${request.message}`);
    }

    return true;
});