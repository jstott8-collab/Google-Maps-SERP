'use client';

import { useEffect, useRef } from 'react';

/**
 * SchedulePoller — client-side component that polls for overdue scheduled scans.
 * 
 * Mounts globally in the app layout. Every 60 seconds, it checks the lookback
 * API for scans whose nextRun has passed. If any are found, it triggers them.
 * 
 * This is the "missing piece" that makes DAILY/WEEKLY schedules actually work.
 */
export default function SchedulePoller() {
    const pollingRef = useRef(false);

    useEffect(() => {
        const POLL_INTERVAL_MS = 60_000; // 60 seconds

        async function checkSchedules() {
            if (pollingRef.current) return; // Prevent overlapping calls
            pollingRef.current = true;

            try {
                const res = await fetch('/api/system/lookback');
                if (!res.ok) return;

                const data = await res.json();
                const missedScans = data.missedScans || [];

                if (missedScans.length > 0) {
                    console.log(`[SchedulePoller] Found ${missedScans.length} overdue scan(s). Triggering...`);
                    await fetch('/api/system/lookback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scanIds: missedScans.map((s: any) => s.id) }),
                    });
                }
            } catch (err) {
                // Silently fail — this is a background poller
                console.debug('[SchedulePoller] Check failed:', err);
            } finally {
                pollingRef.current = false;
            }
        }

        // Run immediately on mount, then every 60 seconds
        checkSchedules();
        const interval = setInterval(checkSchedules, POLL_INTERVAL_MS);

        return () => clearInterval(interval);
    }, []);

    // This component renders nothing — it's a pure side-effect component
    return null;
}
