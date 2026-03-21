import { runScan } from './scanner';
import { logger } from './logger';

/**
 * In-process scan queue with concurrency control.
 * Prevents the system from launching unlimited browser instances.
 * 
 * MAX_CONCURRENT = 2 means at most 2 Chromium browsers run at once.
 * Additional scans are queued and started as slots become available.
 */

const MAX_CONCURRENT = 2;

interface QueueItem {
    scanId: string;
    addedAt: Date;
}

// In-process state (lives as long as the Next.js server process)
const activeScanIds = new Set<string>();
const queue: QueueItem[] = [];

function processQueue() {
    while (activeScanIds.size < MAX_CONCURRENT && queue.length > 0) {
        const next = queue.shift()!;
        startScan(next.scanId);
    }
}

function startScan(scanId: string) {
    activeScanIds.add(scanId);
    logger.info(`[Queue] Starting scan ${scanId}. Active: ${activeScanIds.size}/${MAX_CONCURRENT}, Queued: ${queue.length}`, 'QUEUE');

    runScan(scanId)
        .catch(err => {
            logger.error(`[Queue] Scan ${scanId} crashed: ${err.message}`, 'QUEUE', { scanId, stack: err.stack });
        })
        .finally(() => {
            activeScanIds.delete(scanId);
            logger.info(`[Queue] Scan ${scanId} finished. Active: ${activeScanIds.size}/${MAX_CONCURRENT}, Queued: ${queue.length}`, 'QUEUE');
            processQueue(); // Start next queued scan
        });
}

/**
 * Enqueue a scan. Starts immediately if under the concurrency limit,
 * otherwise waits in FIFO order.
 * 
 * Returns: 'started' | 'queued' | 'duplicate'
 */
export function enqueueScan(scanId: string): 'started' | 'queued' | 'duplicate' {
    // Prevent double-enqueue
    if (activeScanIds.has(scanId)) {
        logger.warn(`[Queue] Scan ${scanId} is already running. Ignoring duplicate enqueue.`, 'QUEUE');
        return 'duplicate';
    }
    if (queue.some(q => q.scanId === scanId)) {
        logger.warn(`[Queue] Scan ${scanId} is already queued. Ignoring duplicate enqueue.`, 'QUEUE');
        return 'duplicate';
    }

    if (activeScanIds.size < MAX_CONCURRENT) {
        startScan(scanId);
        return 'started';
    } else {
        queue.push({ scanId, addedAt: new Date() });
        logger.info(`[Queue] Scan ${scanId} queued. Position: ${queue.length}. Active: ${activeScanIds.size}/${MAX_CONCURRENT}`, 'QUEUE');
        return 'queued';
    }
}

/**
 * Check if a specific scan is currently active (running).
 */
export function isScanActive(scanId: string): boolean {
    return activeScanIds.has(scanId);
}

/**
 * Get the current queue status.
 */
export function getQueueStatus() {
    return {
        maxConcurrent: MAX_CONCURRENT,
        activeCount: activeScanIds.size,
        activeScanIds: Array.from(activeScanIds),
        queuedCount: queue.length,
        queuedScanIds: queue.map(q => q.scanId),
    };
}
