// Cub Stars Parent App - Service Worker for Push Notifications
const CACHE_NAME = 'cubstars-parent-v1';

// Install event
self.addEventListener('install', function(event) {
    console.log('[SW] Installing service worker...');
    self.skipWaiting();
});

// Activate event
self.addEventListener('activate', function(event) {
    console.log('[SW] Service worker activated');
    event.waitUntil(clients.claim());
});

// Push event - handle incoming push notifications
self.addEventListener('push', function(event) {
    console.log('[SW] Push received:', event);
    
    let data = {
        title: '🌟 Cub Stars',
        body: 'New activity from your kids!',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⭐</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔔</text></svg>',
        tag: 'cubstars-notification',
        requireInteraction: true,
        actions: [
            { action: 'open', title: '📱 Open App' },
            { action: 'dismiss', title: '✖ Dismiss' }
        ]
    };
    
    // Try to parse push data
    if (event.data) {
        try {
            const payload = event.data.json();
            data = { ...data, ...payload };
        } catch (e) {
            data.body = event.data.text();
        }
    }
    
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: data.icon,
            badge: data.badge,
            tag: data.tag,
            requireInteraction: data.requireInteraction,
            actions: data.actions,
            data: data.url || './'
        })
    );
});

// Notification click event
self.addEventListener('notificationclick', function(event) {
    console.log('[SW] Notification clicked:', event.action);
    
    event.notification.close();
    
    if (event.action === 'dismiss') {
        return;
    }
    
    // Open or focus the app
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Try to focus existing window
            for (let client of clientList) {
                if (client.url.includes('parent_app') && 'focus' in client) {
                    return client.focus();
                }
            }
            // Open new window if none exists
            if (clients.openWindow) {
                return clients.openWindow(event.notification.data || './parent_app.html');
            }
        })
    );
});

// Background sync for checking approvals
self.addEventListener('sync', function(event) {
    if (event.tag === 'check-approvals') {
        event.waitUntil(checkForPendingApprovals());
    }
});

// Periodic background sync (if supported)
self.addEventListener('periodicsync', function(event) {
    if (event.tag === 'check-approvals') {
        event.waitUntil(checkForPendingApprovals());
    }
});

// Check for pending approvals
async function checkForPendingApprovals() {
    try {
        const apiUrl = await getApiUrl();
        if (!apiUrl) return;
        
        const response = await fetch(apiUrl + '?action=getData');
        const result = await response.json();
        
        if (result.success && result.data) {
            let pendingCount = 0;
            let pendingTasks = [];
            
            result.data.children.forEach(function(child) {
                if (child.pendingApprovals && child.pendingApprovals.length > 0) {
                    pendingCount += child.pendingApprovals.length;
                    child.pendingApprovals.forEach(function(approval) {
                        pendingTasks.push({
                            childName: child.name,
                            taskName: approval.taskName
                        });
                    });
                }
            });
            
            if (pendingCount > 0) {
                const lastNotified = await getLastNotifiedCount();
                if (pendingCount > lastNotified) {
                    await setLastNotifiedCount(pendingCount);
                    
                    const taskList = pendingTasks.slice(0, 3).map(t => t.childName + ': ' + t.taskName).join(', ');
                    
                    self.registration.showNotification('📋 ' + pendingCount + ' Task' + (pendingCount > 1 ? 's' : '') + ' Waiting!', {
                        body: taskList + (pendingTasks.length > 3 ? '...' : ''),
                        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✅</text></svg>',
                        tag: 'pending-approvals',
                        requireInteraction: true,
                        actions: [
                            { action: 'open', title: '📱 Review Now' }
                        ]
                    });
                }
            }
        }
    } catch (error) {
        console.error('[SW] Error checking approvals:', error);
    }
}

// Helper functions using IndexedDB for persistence
async function getApiUrl() {
    return new Promise((resolve) => {
        const request = indexedDB.open('cubstars-parent', 1);
        request.onupgradeneeded = function(e) {
            e.target.result.createObjectStore('settings');
        };
        request.onsuccess = function(e) {
            const db = e.target.result;
            const tx = db.transaction('settings', 'readonly');
            const store = tx.objectStore('settings');
            const get = store.get('apiUrl');
            get.onsuccess = () => resolve(get.result);
            get.onerror = () => resolve(null);
        };
        request.onerror = () => resolve(null);
    });
}

async function getLastNotifiedCount() {
    return new Promise((resolve) => {
        const request = indexedDB.open('cubstars-parent', 1);
        request.onsuccess = function(e) {
            const db = e.target.result;
            const tx = db.transaction('settings', 'readonly');
            const store = tx.objectStore('settings');
            const get = store.get('lastNotifiedCount');
            get.onsuccess = () => resolve(get.result || 0);
            get.onerror = () => resolve(0);
        };
        request.onerror = () => resolve(0);
    });
}

async function setLastNotifiedCount(count) {
    return new Promise((resolve) => {
        const request = indexedDB.open('cubstars-parent', 1);
        request.onsuccess = function(e) {
            const db = e.target.result;
            const tx = db.transaction('settings', 'readwrite');
            const store = tx.objectStore('settings');
            store.put(count, 'lastNotifiedCount');
            tx.oncomplete = () => resolve();
        };
    });
}
