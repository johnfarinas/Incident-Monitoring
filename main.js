// --- CONFIGURATION ---
const services = [
    // --- THE BIG 3 (XML/RSS) ---
    { name: "AWS Global", apiUrl: "https://status.aws.amazon.com/rss/all.rss", pageUrl: "https://health.aws.amazon.com/health/status", type: "rss_aws" },
    { name: "Google Cloud", apiUrl: "https://status.cloud.google.com/en/feed.atom", pageUrl: "https://status.cloud.google.com/", type: "rss_gcp" },
    { name: "Microsoft Azure", apiUrl: "https://azure.status.microsoft.com/en-us/status/feed/", pageUrl: "https://azure.status.microsoft.com/", type: "rss_azure" },

    // --- INFRASTRUCTURE ---
    { name: "GitHub", apiUrl: "https://www.githubstatus.com/api/v2/status.json", pageUrl: "https://www.githubstatus.com/", type: "std" },
    { name: "DigitalOcean", apiUrl: "https://status.digitalocean.com/api/v2/status.json", pageUrl: "https://status.digitalocean.com/", type: "std" },
    { name: "Cloudflare", apiUrl: "https://www.cloudflarestatus.com/api/v2/status.json", pageUrl: "https://www.cloudflarestatus.com/", type: "std" },
    { name: "Vercel", apiUrl: "https://www.vercel-status.com/api/v2/status.json", pageUrl: "https://www.vercel-status.com/", type: "std" },
    { name: "Heroku", apiUrl: "https://status.heroku.com/api/v4/current-status", pageUrl: "https://status.heroku.com/", type: "heroku" },
    { name: "Linode", apiUrl: "https://status.linode.com/api/v2/status.json", pageUrl: "https://status.linode.com/", type: "std" },

    // --- COMMUNICATION ---
    { name: "Slack", apiUrl: "https://status.slack.com/api/v2.0.0/current", pageUrl: "https://status.slack.com/", type: "slack" },
    { name: "Twilio", apiUrl: "https://status.twilio.com/api/v2/status.json", pageUrl: "https://status.twilio.com/", type: "std" },
    { name: "Discord", apiUrl: "https://discordstatus.com/api/v2/status.json", pageUrl: "https://discordstatus.com/", type: "std" },
    { name: "Zoom", apiUrl: "https://status.zoom.us/api/v2/status.json", pageUrl: "https://status.zoom.us/", type: "std" },
    { name: "OpenAI API", apiUrl: "https://status.openai.com/api/v2/status.json", pageUrl: "https://status.openai.com/", type: "std" },

    // --- SAAS ---
    { name: "Stripe", apiUrl: "https://status.stripe.com/api/v2/status.json", pageUrl: "https://status.stripe.com/", type: "std" },
    { name: "Shopify", apiUrl: "https://www.shopifystatus.com/api/v2/status.json", pageUrl: "https://www.shopifystatus.com/", type: "std" },
    { name: "Zendesk", apiUrl: "https://status.zendesk.com/api/incidents/active", pageUrl: "https://status.zendesk.com/", type: "zendesk" },
];

const dashboard = document.getElementById('dashboard');
const lastUpdatedEl = document.getElementById('last-updated');

// --- HELPER: DELAY FUNCTION ---
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- INITIALIZATION ---
function init() {
    renderCards();
    fetchSequentially();
    
    // Auto-refresh every 5 minutes (300000ms) to avoid hitting limits
    setInterval(fetchSequentially, 300000); 
}

function renderCards() {
    dashboard.innerHTML = '';
    services.forEach(service => {
        const card = document.createElement('div');
        card.className = 'card';
        // Sanitize ID
        const safeId = service.name.replace(/[^a-zA-Z0-9]/g, '-');
        card.id = `card-${safeId}`;
        
        card.innerHTML = `
            <div class="card-header">
                <div class="service-name">${service.name}</div>
                <a href="${service.pageUrl}" target="_blank" class="service-link">Page ↗</a>
            </div>
            <div class="status-container loading" id="status-${safeId}">
                <div class="status-dot"></div>
                <div class="status-text">WAITING...</div>
            </div>
        `;
        dashboard.appendChild(card);
    });
}

// --- SEQUENTIAL FETCHING ---
async function fetchSequentially() {
    updateTime();
    
    for (const service of services) {
        // Fetch one, then wait, then fetch next
        await checkService(service);
        // Wait 800ms between requests to prevent 429 Errors
        await delay(800); 
    }
}

async function checkService(service) {
    const safeId = service.name.replace(/[^a-zA-Z0-9]/g, '-');
    const el = document.getElementById(`status-${safeId}`);
    
    // Update UI to show we are currently checking this one
    el.querySelector('.status-text').textContent = "CHECKING...";

    // PRIMARY PROXY (AllOrigins)
    let proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(service.apiUrl)}`;
    
    try {
        let rawBody = null;

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error("Proxy Error");
            const data = await response.json();
            rawBody = data.contents;
        } catch (err) {
            console.warn(`Primary proxy failed for ${service.name}, trying backup...`);
            // BACKUP PROXY (CorsProxy.io)
            const backupUrl = `https://corsproxy.io/?${encodeURIComponent(service.apiUrl)}`;
            const backupResp = await fetch(backupUrl);
            if (!backupResp.ok) throw new Error("Backup Proxy Error");
            rawBody = await backupResp.text();
        }

        if(!rawBody) throw new Error("Empty response");

        // --- PARSING LOGIC ---
        let status = "UNKNOWN";
        let state = "loading";

        if (service.type === 'std') {
            const json = JSON.parse(rawBody);
            const indicator = json.status.indicator || json.status.description; 
            if (indicator === 'none' || indicator === 'All Systems Operational') { state = 'up'; status = 'OPERATIONAL'; }
            else if (indicator === 'minor') { state = 'warn'; status = 'DEGRADED'; }
            else { state = 'down'; status = 'OUTAGE'; }
        }
        else if (service.type === 'slack') {
            const json = JSON.parse(rawBody);
            if (json.status === 'ok') { state = 'up'; status = 'OPERATIONAL'; }
            else { state = 'warn'; status = 'ISSUES'; }
        }
        else if (service.type === 'heroku') {
            const json = JSON.parse(rawBody);
            const prod = json.status.find(s => s.system === 'Apps');
            if (prod && prod.status === 'green') { state = 'up'; status = 'OPERATIONAL'; }
            else { state = 'warn'; status = 'ISSUES'; }
        }
        else if (service.type === 'zendesk') {
            const json = JSON.parse(rawBody);
            if (json.incidents && json.incidents.length === 0) { state = 'up'; status = 'OPERATIONAL'; }
            else { state = 'warn'; status = 'INCIDENTS'; }
        }
        else if (service.type.startsWith('rss')) {
            const parser = new DOMParser();
            const xml = parser.parseFromString(rawBody, "text/xml");
            
            if (service.type === 'rss_aws') {
                const items = xml.querySelectorAll('item');
                if (items.length === 0) { state = 'up'; status = 'OPERATIONAL'; }
                else { 
                    const pubDate = new Date(items[0].querySelector('pubDate').textContent);
                    if ((new Date() - pubDate) < 86400000) { state = 'warn'; status = 'ISSUES'; }
                    else { state = 'up'; status = 'OPERATIONAL'; }
                }
            }
            else if (service.type === 'rss_gcp') {
                const entries = xml.querySelectorAll('entry');
                if (entries.length === 0) { state = 'up'; status = 'OPERATIONAL'; }
                else {
                    const updated = new Date(entries[0].querySelector('updated').textContent);
                    if ((new Date() - updated) < 86400000) { state = 'warn'; status = 'ISSUES'; }
                    else { state = 'up'; status = 'OPERATIONAL'; }
                }
            }
            else if (service.type === 'rss_azure') {
                const items = xml.querySelectorAll('item');
                let foundIssue = false;
                items.forEach(item => {
                    const title = item.querySelector('title').textContent.toLowerCase();
                    if (title.includes('warning') || title.includes('error') || title.includes('degraded')) {
                        foundIssue = true;
                    }
                });
                if (foundIssue) { state = 'warn'; status = 'WARNING'; }
                else { state = 'up'; status = 'OPERATIONAL'; }
            }
        }

        updateCard(el, state, status);

    } catch (e) {
        console.error(`Error fetching ${service.name}:`, e);
        updateCard(el, 'down', 'ERROR');
    }
}

function updateCard(el, state, text) {
    el.className = 'status-container'; 
    el.classList.add(state);
    el.querySelector('.status-text').textContent = text;
}

function updateTime() {
    const now = new Date();
    lastUpdatedEl.textContent = `Last check: ${now.toLocaleTimeString()}`;
}

init();