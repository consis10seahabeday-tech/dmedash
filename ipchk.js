/**
 * Iterates through a list of backend IPs in priority order
 * and returns the first one that responds to the /check endpoint.
 */
async function getAvailableBackend() {
    const servers = [
        "http://ip1:8000",
        "http://ip2:8000",
        "http://ip3:8000",
        "http://ip4:8000"
    ];

    for (const baseUrl of servers) {
        try {
            // We set a 2-second timeout so we don't wait forever on a dead server
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);

            const response = await fetch(`${baseUrl}/check`, { 
                method: 'GET',
                signal: controller.signal 
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                console.log(`Using available server: ${baseUrl}`);
                return baseUrl;
            }
        } catch (error) {
            console.warn(`${baseUrl} is down, trying next...`);
            // Continue to the next server in the loop
        }
    }

    throw new Error("All backend servers are currently unavailable.");
}

// Example Usage:
async function updateSpreadsheet(data) {
    try {
        const bestIp = await getAvailableBackend();
        
        const response = await fetch(`${bestIp}/update-spreadsheet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        return await response.json();
    } catch (err) {
        console.error("Failed to update spreadsheet:", err.message);
    }
}