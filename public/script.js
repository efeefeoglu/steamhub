let allGames = [];
let isCancelled = false;
let BATCH_SIZE = 20;

const elements = {
    form: document.getElementById('extract-form'),
    btnStart: document.getElementById('btn-start'),
    btnCancel: document.getElementById('btn-cancel'),
    progressSection: document.getElementById('progress-section'),
    progressBar: document.getElementById('progress-bar'),
    progressStatus: document.getElementById('progress-status'),
    resultsSection: document.getElementById('results-section'),
    gamesGrid: document.getElementById('games-grid'),
    emptyState: document.getElementById('empty-state'),
    minDiscount: document.getElementById('min-discount'),
    minRating: document.getElementById('min-rating'),
    minReviews: document.getElementById('min-reviews'),
    sortBy: document.getElementById('sort-by'),
    btnExport: document.getElementById('btn-export')
};

elements.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await startCollection();
});

elements.btnCancel.addEventListener('click', () => {
    isCancelled = true;
    updateStatus('Cancelling...');
});

[elements.minDiscount, elements.minRating, elements.minReviews, elements.sortBy].forEach(el => {
    el.addEventListener('input', renderGames);
});

elements.btnExport.addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(allGames, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "steam_games.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
});

async function startCollection() {
    // Reset state
    allGames = [];
    isCancelled = false;
    renderGames();

    const url = document.getElementById('url').value;
    const cc = document.getElementById('cc').value;
    const maxGames = parseInt(document.getElementById('max-games').value, 10);
    const includeDlc = document.getElementById('include-dlc').checked;
    const includeFree = document.getElementById('include-free').checked;

    elements.btnStart.classList.add('hidden');
    elements.btnCancel.classList.remove('hidden');
    elements.progressSection.classList.remove('hidden');
    elements.resultsSection.classList.add('hidden');

    updateStatus('Extracting App IDs from page (this may take a minute)...');
    updateProgress(5);

    try {
        const extractRes = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });

        if (!extractRes.ok) {
            throw new Error((await extractRes.json()).detail || 'Failed to extract App IDs');
        }

        const data = await extractRes.json();
        let appIds = data.app_ids;

        if (appIds.length === 0) {
            throw new Error('No games found on the provided page.');
        }

        if (maxGames && appIds.length > maxGames) {
            appIds = appIds.slice(0, maxGames);
        }

        elements.resultsSection.classList.remove('hidden');

        const totalBatches = Math.ceil(appIds.length / BATCH_SIZE);

        for (let i = 0; i < totalBatches; i++) {
            if (isCancelled) break;

            const batch = appIds.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
            updateStatus(`Fetching details... Batch ${i + 1} of ${totalBatches}`);

            try {
                const detailsRes = await fetch('/api/details', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        app_ids: batch,
                        cc: cc,
                        include_dlc: includeDlc,
                        include_free: includeFree
                    })
                });

                if (detailsRes.ok) {
                    const detailsData = await detailsRes.json();
                    allGames = [...allGames, ...detailsData.games];
                    renderGames();
                }
            } catch (err) {
                console.error('Batch failed:', err);
            }

            updateProgress(5 + (95 * ((i + 1) / totalBatches)));
        }

        updateStatus(isCancelled ? 'Collection cancelled.' : `Collection complete! Found ${allGames.length} games.`);
    } catch (error) {
        updateStatus(`Error: ${error.message}`);
    } finally {
        elements.btnStart.classList.remove('hidden');
        elements.btnCancel.classList.add('hidden');
        updateProgress(100);
    }
}

function updateStatus(message) {
    elements.progressStatus.textContent = message;
}

function updateProgress(percent) {
    elements.progressBar.style.width = `${percent}%`;
}

function renderGames() {
    const minDiscount = parseInt(elements.minDiscount.value) || 0;
    const minRating = parseInt(elements.minRating.value) || 0;
    const minReviews = parseInt(elements.minReviews.value) || 0;
    const sortField = elements.sortBy.value;

    let filtered = allGames.filter(g => {
        return g.discount_percent >= minDiscount &&
               g.positive_percent >= minRating &&
               g.total_reviews >= minReviews;
    });

    filtered.sort((a, b) => {
        switch (sortField) {
            case 'discount': return b.discount_percent - a.discount_percent;
            case 'rating': return b.positive_percent - a.positive_percent;
            case 'reviews': return b.total_reviews - a.total_reviews;
            case 'price': return a.sale_price - b.sale_price;
            case 'name': return a.name.localeCompare(b.name);
            default: return 0;
        }
    });

    elements.gamesGrid.innerHTML = '';

    if (filtered.length === 0 && allGames.length > 0) {
        elements.emptyState.classList.remove('hidden');
    } else {
        elements.emptyState.classList.add('hidden');

        filtered.forEach(g => {
            const card = document.createElement('div');
            card.className = 'game-card';

            const hasDiscount = g.discount_percent > 0;
            const priceHtml = g.currency === 'Free' ? '<span class="sale-price">Free to Play</span>' : `
                ${hasDiscount ? `<span class="discount">-${g.discount_percent}%</span>` : ''}
                ${hasDiscount ? `<span class="original-price">${g.original_price.toFixed(2)}</span>` : ''}
                <span class="sale-price">${g.sale_price.toFixed(2)} ${g.currency}</span>
            `;

            const metacriticHtml = g.metacritic_score ? ` | Meta: ${g.metacritic_score}` : '';

            card.innerHTML = `
                <img class="game-image" src="${g.header_image || 'https://via.placeholder.com/460x215.png?text=No+Image'}" alt="${g.name}" loading="lazy">
                <div class="game-info">
                    <h3 class="game-title"><a href="${g.url}" target="_blank">${g.name}</a></h3>
                    <div class="game-meta">
                        ${g.release_date}<br>
                        ${g.developers}
                    </div>
                    <div class="game-price">
                        ${priceHtml}
                    </div>
                    <div class="game-reviews">
                        <span class="review-positive">${g.review_description}</span>
                        (${g.positive_percent}% of ${g.total_reviews.toLocaleString()})
                        ${metacriticHtml}
                    </div>
                </div>
            `;
            elements.gamesGrid.appendChild(card);
        });
    }
}
