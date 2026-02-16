// --- CONFIGURATION ---
const services = [
    // --- THE BIG 3 (XML/RSS) ---
    { 
        name: "AWS Global", 
        apiUrl: "https://status.aws.amazon.com/rss/all.rss", 
        pageUrl: "https://health.aws.amazon.com/health/status",
        type: "rss_aws" 
    },
    { 
        name: "Google Cloud", 
        apiUrl: "https://status.cloud.google.com/en/feed.atom", 
        pageUrl: "https://status.cloud.google.com/",
        type: "rss_gcp" 
    },
    { 
        name: "Microsoft Azure", 
        apiUrl: "https://azure.status.microsoft.com/en-us/status/feed/", 
        pageUrl: "https://azure.status.microsoft.com/",
        type: "rss_azure" 
    },

    // --- INFRASTRUCTURE (Standard JSON) ---
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

    // --- SAAS & PAYMENTS ---
    { name: "Stripe", apiUrl: "https://status.stripe.com/api/v2/status.json", pageUrl: "https://status.stripe.com/", type: "std" },
    { name: "Shopify", apiUrl: "https://www.shopifystatus.com/api/v2/status.json", pageUrl: "https://www.shopifystatus.com/", type: "std" },
    { name: "Zendesk", apiUrl: "https://status.zendesk.com/api/incidents/active", pageUrl: "https://status.zendesk.com/", type: "zendesk" },
];

const dashboard = document.getElementById('dashboard');
const lastUpdatedEl = document.getElementById('last-updated');

// --- INITIALIZATION ---
function init() {
    renderCards();
    fetchAllStatuses();
    
    // Auto-refresh every 60 seconds
    setInterval(fetchAllStatuses, 60000);
}

// 1. Render the HTML Cards (Initial State)
function renderCards() {
    dashboard.innerHTML = '';
    services.forEach(service => {
        const card = document.createElement('div');
        card.className = 'card';
        card.id = `card-${service.name.replace(/\s+/g, '-')}`;
        
        card.innerHTML = `
            <div class="card-header">
                <div class="service-name">${service.name}</div>
                <a href="${service.pageUrl}" target="_blank" class="service-link" title="Visit Status Page">
                    Visit Page ↗
                </a>
            </div>
            <div class="status-container loading" id="status-${service.name.replace(/\s+/g, '-')}">
                <div class="status-dot"></div>
                <div class="status-text">LOADING...</div>
            </div>
        `;
        dashboard.appendChild(card);
    });
}

// 2. Fetch Logic
async function fetchAllStatuses() {
    updateTime();
    
    // We process these in parallel
    const promises = services.map(service => checkService(service));
    await Promise.all(promises);
}

async function checkService(service) {
    const elementId = `status-${service.name.replace(/\s+/g, '-')}`;
    const el = document.getElementById(elementId);
    
    // Using AllOrigins to bypass CORS
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(service.apiUrl)}`;

    try {
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        // 'contents' is the string body from the proxy
        const rawBody = data.contents;
        if(!rawBody) throw new Error("Empty response");

        let status = "UNKNOWN";
        let state = "loading"; // 'up', 'warn', 'down'

        // --- PARSERS ---

        if (service.type === 'std') {
            // Atlassian Statuspage Standard
            const json = JSON.parse(rawBody);
            const indicator = json.status.indicator; // none, minor, major, critical
            if (indicator === 'none') { state = 'up'; status = 'OPERATIONAL'; }
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
            // Check production status
            const prod = json.status.find(s => s.system === 'Apps');
            if (prod && prod.status === 'green') { state = 'up'; status = 'OPERATIONAL'; }
            else { state = 'warn'; status = 'ISSUES'; }
        }
        else if (service.type === 'zendesk') {
            const json = JSON.parse(rawBody);
            // If incidents list is empty, all good
            if (json.incidents && json.incidents.length === 0) { state = 'up'; status = 'OPERATIONAL'; }
            else { state = 'warn'; status = 'INCIDENTS'; }
        }
        else if (service.type.startsWith('rss')) {
            // XML Parsing for Big 3
            const parser = new DOMParser();
            const xml = parser.parseFromString(rawBody, "text/xml");
            
            if (service.type === 'rss_aws') {
                const items = xml.querySelectorAll('item');
                // AWS RSS only contains ACTIVE incidents.
                if (items.length === 0) { state = 'up'; status = 'OPERATIONAL'; }
                else { 
                    // Check if item is recent (last 24h)
                    const pubDate = new Date(items[0].querySelector('pubDate').textContent);
                    if ((new Date() - pubDate) < 86400000) { state = 'warn'; status = 'ISSUES'; }
                    else { state = 'up'; status = 'OPERATIONAL'; } // Old incident in feed
                }
            }
            else if (service.type === 'rss_gcp') {
                // Google Atom feed
                const entries = xml.querySelectorAll('entry');
                // Usually lists recent incidents. We assume OK unless we see a very recent entry.
                if (entries.length === 0) { state = 'up'; status = 'OPERATIONAL'; }
                else {
                    const updated = new Date(entries[0].querySelector('updated').textContent);
                    if ((new Date() - updated) < 86400000) { state = 'warn'; status = 'ISSUES'; }
                    else { state = 'up'; status = 'OPERATIONAL'; }
                }
            }
            else if (service.type === 'rss_azure') {
                // Azure is chatty. We scan titles for keywords.
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

        // Update UI
        updateCard(el, state, status);

    } catch (e) {
        console.error(`Error fetching ${service.name}:`, e);
        updateCard(el, 'down', 'ERROR');
    }
}

function updateCard(el, state, text) {
    // Reset classes
    el.className = 'status-container'; 
    el.classList.add(state);
    
    // Update text
    el.querySelector('.status-text').textContent = text;
}

function updateTime() {
    const now = new Date();
    lastUpdatedEl.textContent = `Last check: ${now.toLocaleTimeString()}`;
}

// Start
init();