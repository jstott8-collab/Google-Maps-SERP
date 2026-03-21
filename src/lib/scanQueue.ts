import { runScan } from './scanner';
import { prisma } from './prisma';
import { logger } from './logger';

/**
 * In-process scan queue with concurrency control and DB-backed recovery.
 * Prevents the system from launching unlimited browser instances.
 *
 * MAX_CONCURRENT = 2 means at most 2 Chromium browsers run at once.
 * Additional scans are queued and started as slots become available.
 *
 * On process restart, call `recoverQueue()` to re-enqueue any scans
 * that were RUNNING (interrupted) or PENDING in the database.
 */

const MAX_CONCURRENT = 2;

interface QueueItem {
    scanId: string;
    addedAt: Date;
}

// In-process state (lives as long as the Next.js server process)
const activeScanIds = new Set<string>();
const queue: QueueItem[] = [];

// Guard to prevent concurrent recovery calls
let recoveryInProgress = false;
let recoveryDone = false;

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

/**
 * Recover the scan queue from database state after a process restart.
 *
 * 1. Finds all scans with status 'RUNNING' — these were interrupted mid-flight
 *    by the restart. Resets them to 'PENDING' so they start fresh.
 * 2. Finds all scans with status 'PENDING' — these were waiting to run.
 * 3. Enqueues all of them (RUNNING-turned-PENDING first, then already PENDING),
 *    ordered by createdAt so older scans get priority.
 *
 * Safe to call multiple times; only the first invocation does real work.
 */
export async function recoverQueue(): Promise<{ recovered: number }> {
    if (recoveryDone) {
        logger.info('[Queue] Recovery already completed. Skipping.', 'QUEUE');
        return { recovered: 0 };
    }
    if (recoveryInProgress) {
        logger.warn('[Queue] Recovery already in progress. Skipping concurrent call.', 'QUEUE');
        return { recovered: 0 };
    }

    recoveryInProgress = true;

    try {
        logger.info('[Queue] Starting queue recovery from database...', 'QUEUE');

        // Step 1: Reset any RUNNING scans back to PENDING (they were interrupted)
        const interruptedScans = await prisma.scan.findMany({
            where: { status: 'RUNNING' },
            select: { id: true, keyword: true },
            orderBy: { createdAt: 'asc' },
        });

        if (interruptedScans.length > 0) {
            await prisma.scan.updateMany({
                where: { status: 'RUNNING' },
                data: { status: 'PENDING' },
            });
            logger.info(
                `[Queue] Reset ${interruptedScans.length} interrupted (RUNNING) scan(s) to PENDING: ${interruptedScans.map(s => s.id).join(', ')}`,
                'QUEUE'
            );
        }

        // Step 2: Fetch all PENDING scans (including the ones we just reset)
        const pendingScans = await prisma.scan.findMany({
            where: { status: 'PENDING' },
            select: { id: true, keyword: true },
            orderBy: { createdAt: 'asc' },
        });

        if (pendingScans.length === 0) {
            logger.info('[Queue] No scans to recover.', 'QUEUE');
            recoveryDone = true;
            return { recovered: 0 };
        }

        // Step 3: Enqueue each scan (the existing enqueueScan handles dedup and concurrency)
        let enqueued = 0;
        for (const scan of pendingScans) {
            const result = enqueueScan(scan.id);
            if (result !== 'duplicate') {
                enqueued++;
                logger.info(
                    `[Queue] Recovered scan ${scan.id} (keyword: "${scan.keyword}") -> ${result}`,
                    'QUEUE'
                );
            }
        }

        logger.info(`[Queue] Recovery complete. Enqueued ${enqueued} scan(s).`, 'QUEUE');
        recoveryDone = true;
        return { recovered: enqueued };
    } catch (error: any) {
        logger.error(
            `[Queue] Recovery failed: ${error.message}`,
            'QUEUE',
            { stack: error.stack }
        );
        throw error;
    } finally {
        recoveryInProgress = false;
    }
}
