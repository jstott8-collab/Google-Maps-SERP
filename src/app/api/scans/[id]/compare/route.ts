import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Recursively convert all BigInt values to Number and Date objects to ISO
 * strings so the result is safe for JSON.stringify.
 */
function sanitizeBigInts(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return Number(obj);
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map(sanitizeBigInts);
    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            result[key] = sanitizeBigInts(value);
        }
        return result;
    }
    return obj;
}

/**
 * CTR-based visibility score model.
 * Returns a percentage (0-100) representing the weighted visibility across all
 * grid points for a single run.
 *
 * Rank  1  => 32.5%
 * Rank  2  => 17.5%
 * Rank  3  => 11.5%
 * Rank  4  =>  8.5%
 * Rank  5  =>  7.0%
 * Rank  6  =>  5.5%
 * Rank  7  =>  4.0%
 * Rank  8  =>  3.0%
 * Rank  9  =>  2.0%
 * Rank 10  =>  1.5%
 * Rank 11-20 => 0.5%
 * null / not found => 0%
 */
function ctrWeight(rank: number | null): number {
    if (rank === null || rank <= 0) return 0;
    const weights: Record<number, number> = {
        1: 32.5,
        2: 17.5,
        3: 11.5,
        4: 8.5,
        5: 7.0,
        6: 5.5,
        7: 4.0,
        8: 3.0,
        9: 2.0,
        10: 1.5,
    };
    if (rank <= 10) return weights[rank];
    if (rank <= 20) return 0.5;
    return 0;
}

function visibilityScore(ranks: (number | null)[]): number {
    if (ranks.length === 0) return 0;
    const totalWeight = ranks.reduce((sum, r) => sum + ctrWeight(r), 0);
    // Max possible = ranks.length * 32.5 (all rank 1). Normalise to 0-100.
    return Math.round((totalWeight / (ranks.length * 32.5)) * 10000) / 100;
}

function avgRank(ranks: (number | null)[]): number | null {
    const valid = ranks.filter((r): r is number => r !== null && r > 0);
    if (valid.length === 0) return null;
    return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100;
}

/** Round coordinates to a fixed key for matching with tolerance ~0.0001 deg */
function coordKey(lat: number, lng: number): string {
    return `${Math.round(lat * 10000) / 10000}_${Math.round(lng * 10000) / 10000}`;
}

interface ResultRow {
    lat: number;
    lng: number;
    rank: number | null;
    runId: string | null;
    runAt: string | null;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const url = new URL(request.url);
        const runA = url.searchParams.get('runA');
        const runB = url.searchParams.get('runB');

        if (!runA || !runB) {
            return NextResponse.json(
                { error: 'Both runA and runB query parameters are required' },
                { status: 400 }
            );
        }

        // Fetch the scan
        const scan = await prisma.scan.findUnique({ where: { id } });
        if (!scan) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }

        // Fetch results for both runs in parallel using parameterized queries
        const [rawResultsA, rawResultsB] = await Promise.all([
            prisma.$queryRaw(
                Prisma.sql`SELECT lat, lng, rank, runId, runAt
                           FROM Result
                           WHERE scanId = ${id} AND runId = ${runA}`
            ),
            prisma.$queryRaw(
                Prisma.sql`SELECT lat, lng, rank, runId, runAt
                           FROM Result
                           WHERE scanId = ${id} AND runId = ${runB}`
            ),
        ]);

        const resultsA = sanitizeBigInts(rawResultsA) as ResultRow[];
        const resultsB = sanitizeBigInts(rawResultsB) as ResultRow[];

        // Build lookup maps keyed by rounded (lat, lng)
        const mapA = new Map<string, ResultRow>();
        for (const r of resultsA) {
            mapA.set(coordKey(r.lat, r.lng), r);
        }

        const mapB = new Map<string, ResultRow>();
        for (const r of resultsB) {
            mapB.set(coordKey(r.lat, r.lng), r);
        }

        // Collect all unique coordinate keys
        const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);

        // Build the per-point comparison
        type Direction = 'improved' | 'declined' | 'unchanged' | 'new' | 'lost';

        interface PointComparison {
            lat: number;
            lng: number;
            rankA: number | null;
            rankB: number | null;
            change: number | null;
            direction: Direction;
        }

        const points: PointComparison[] = [];
        let improvedPoints = 0;
        let declinedPoints = 0;
        let unchangedPoints = 0;
        let newPoints = 0;
        let lostPoints = 0;

        for (const key of allKeys) {
            const a = mapA.get(key);
            const b = mapB.get(key);

            const lat = a?.lat ?? b!.lat;
            const lng = a?.lng ?? b!.lng;
            const rankAVal = a?.rank ?? null;
            const rankBVal = b?.rank ?? null;

            let direction: Direction;
            let change: number | null = null;

            if (!a) {
                // Point exists only in run B
                direction = 'new';
                newPoints++;
            } else if (!b) {
                // Point exists only in run A
                direction = 'lost';
                lostPoints++;
            } else if (rankAVal === null && rankBVal === null) {
                direction = 'unchanged';
                unchangedPoints++;
            } else if (rankAVal === null && rankBVal !== null) {
                // Was not ranking, now is — that's an improvement
                direction = 'improved';
                change = rankBVal;
                improvedPoints++;
            } else if (rankAVal !== null && rankBVal === null) {
                // Was ranking, now isn't — that's a decline
                direction = 'declined';
                change = -rankAVal;
                declinedPoints++;
            } else {
                // Both have ranks: lower rank number = better
                change = rankAVal! - rankBVal!;
                if (change > 0) {
                    direction = 'improved';
                    improvedPoints++;
                } else if (change < 0) {
                    direction = 'declined';
                    declinedPoints++;
                } else {
                    direction = 'unchanged';
                    unchangedPoints++;
                }
            }

            points.push({ lat, lng, rankA: rankAVal, rankB: rankBVal, change, direction });
        }

        // Compute aggregate stats for each run
        const ranksA = resultsA.map(r => r.rank);
        const ranksB = resultsB.map(r => r.rank);

        const runAtA = resultsA.length > 0 && resultsA[0].runAt
            ? new Date(resultsA[0].runAt).toISOString()
            : null;
        const runAtB = resultsB.length > 0 && resultsB[0].runAt
            ? new Date(resultsB[0].runAt).toISOString()
            : null;

        const avgRankA = avgRank(ranksA);
        const avgRankB = avgRank(ranksB);
        const visA = visibilityScore(ranksA);
        const visB = visibilityScore(ranksB);

        const avgRankChange =
            avgRankA !== null && avgRankB !== null
                ? Math.round((avgRankA - avgRankB) * 100) / 100
                : null;
        const visibilityChange = Math.round((visB - visA) * 100) / 100;

        const safeScan = sanitizeBigInts(scan) as Record<string, unknown>;

        return NextResponse.json({
            scan: {
                id: safeScan.id,
                keyword: safeScan.keyword,
                businessName: safeScan.businessName,
            },
            runA: {
                runId: runA,
                runAt: runAtA,
                avgRank: avgRankA,
                visibilityScore: visA,
                pointCount: resultsA.length,
            },
            runB: {
                runId: runB,
                runAt: runAtB,
                avgRank: avgRankB,
                visibilityScore: visB,
                pointCount: resultsB.length,
            },
            delta: {
                avgRankChange,
                visibilityChange,
                improvedPoints,
                declinedPoints,
                unchangedPoints,
                newPoints,
                lostPoints,
            },
            points,
        });
    } catch (error: any) {
        logger.error('Scan compare error', 'SCANNER', {
            message: error?.message,
            stack: error?.stack,
        });
        return NextResponse.json(
            { error: 'Failed to compare scan runs', details: error?.message },
            { status: 500 }
        );
    }
}
