import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Recursively convert BigInt values to Number and Date objects to ISO strings
 * for safe JSON serialization (SQLite raw queries return BigInt for aggregates).
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

interface LocationSummary {
    scanId: string;
    keyword: string;
    centerLat: number;
    centerLng: number;
    avgRank: number | null;
    visibilityScore: number;
    lastRunAt: string;
    gridSize: number;
    radius: number;
    trend: 'improving' | 'declining' | 'stable';
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);
        const businessName = url.searchParams.get('businessName');

        if (!businessName) {
            return NextResponse.json(
                { error: 'Missing required query parameter: businessName' },
                { status: 400 }
            );
        }

        // 1. Find all COMPLETED scans matching the businessName
        const scans: any[] = sanitizeBigInts(
            await prisma.$queryRaw(
                Prisma.sql`SELECT * FROM Scan
                 WHERE status = 'COMPLETED'
                   AND businessName = ${businessName}
                 ORDER BY createdAt DESC`
            )
        ) as any[];

        if (scans.length === 0) {
            return NextResponse.json(
                { error: 'No completed scans found for this business', businessName },
                { status: 404 }
            );
        }

        const locations: LocationSummary[] = [];

        for (const scan of scans) {
            const targetNameLower = businessName.toLowerCase().trim();

            // Get all distinct runIds for this scan, ordered by time
            const allRuns: any[] = sanitizeBigInts(
                await prisma.$queryRaw(
                    Prisma.sql`SELECT runId, MIN(runAt) as runAt, COUNT(*) as resultCount
                     FROM Result
                     WHERE scanId = ${scan.id}
                     GROUP BY runId
                     ORDER BY MIN(runAt) ASC`
                )
            ) as any[];

            if (allRuns.length === 0) continue;

            // Latest run
            const latestRun = allRuns[allRuns.length - 1];
            const latestRunId = latestRun.runId;

            // Previous run (for trend calculation)
            const previousRun = allRuns.length >= 2 ? allRuns[allRuns.length - 2] : null;

            // Fetch results for the latest run
            const latestResults: any[] = sanitizeBigInts(
                latestRunId
                    ? await prisma.$queryRaw(
                        Prisma.sql`SELECT topResults, rank FROM Result
                         WHERE scanId = ${scan.id} AND runId = ${latestRunId}`
                    )
                    : await prisma.$queryRaw(
                        Prisma.sql`SELECT topResults, rank FROM Result
                         WHERE scanId = ${scan.id}`
                    )
            ) as any[];

            // Calculate avgRank and visibility for latest run
            const latestStats = computeRankAndVisibility(latestResults, targetNameLower);

            // Calculate trend
            let trend: 'improving' | 'declining' | 'stable' = 'stable';
            if (previousRun && previousRun.runId) {
                const previousResults: any[] = sanitizeBigInts(
                    await prisma.$queryRaw(
                        Prisma.sql`SELECT topResults, rank FROM Result
                         WHERE scanId = ${scan.id} AND runId = ${previousRun.runId}`
                    )
                ) as any[];

                const previousStats = computeRankAndVisibility(previousResults, targetNameLower);

                if (latestStats.avgRank !== null && previousStats.avgRank !== null) {
                    const diff = previousStats.avgRank - latestStats.avgRank; // positive = improved
                    if (diff > 0.5) {
                        trend = 'improving';
                    } else if (diff < -0.5) {
                        trend = 'declining';
                    }
                }
            }

            locations.push({
                scanId: scan.id,
                keyword: scan.keyword,
                centerLat: scan.centerLat,
                centerLng: scan.centerLng,
                avgRank: latestStats.avgRank,
                visibilityScore: latestStats.visibilityScore,
                lastRunAt: latestRun.runAt
                    ? new Date(latestRun.runAt).toISOString()
                    : new Date(scan.createdAt).toISOString(),
                gridSize: scan.gridSize,
                radius: scan.radius,
                trend,
            });
        }

        // 3. Build aggregate metrics
        const rankedLocations = locations.filter(l => l.avgRank !== null);
        const overallAvgRank = rankedLocations.length > 0
            ? Math.round(
                (rankedLocations.reduce((sum, l) => sum + l.avgRank!, 0) / rankedLocations.length) * 100
            ) / 100
            : null;

        const overallVisibility = locations.length > 0
            ? Math.round(
                (locations.reduce((sum, l) => sum + l.visibilityScore, 0) / locations.length) * 100
            ) / 100
            : 0;

        let bestKeyword: { keyword: string; avgRank: number } | null = null;
        let worstKeyword: { keyword: string; avgRank: number } | null = null;

        for (const loc of rankedLocations) {
            if (!bestKeyword || loc.avgRank! < bestKeyword.avgRank) {
                bestKeyword = { keyword: loc.keyword, avgRank: loc.avgRank! };
            }
            if (!worstKeyword || loc.avgRank! > worstKeyword.avgRank) {
                worstKeyword = { keyword: loc.keyword, avgRank: loc.avgRank! };
            }
        }

        const response = {
            businessName,
            locations,
            aggregate: {
                totalScans: scans.length,
                overallAvgRank: overallAvgRank ?? 0,
                overallVisibility,
                bestKeyword: bestKeyword ?? { keyword: '', avgRank: 0 },
                worstKeyword: worstKeyword ?? { keyword: '', avgRank: 0 },
            },
        };

        return NextResponse.json(response);
    } catch (error: any) {
        logger.error('Overview GET error', 'API', {
            message: error?.message,
            stack: error?.stack,
        });
        return NextResponse.json(
            { error: 'Failed to generate overview', details: error?.message },
            { status: 500 }
        );
    }
}

/**
 * Compute average rank and visibility score from a set of results for a target business.
 * Parses topResults JSON to find the target by name match.
 */
function computeRankAndVisibility(
    results: any[],
    targetNameLower: string
): { avgRank: number | null; visibilityScore: number } {
    let appearances = 0;
    let rankSum = 0;
    const totalPoints = results.length;

    for (const result of results) {
        let businesses: any[] = [];
        try {
            businesses = JSON.parse(result.topResults);
        } catch {
            continue;
        }

        if (!Array.isArray(businesses)) continue;

        const target = businesses.find(
            (b: any) => b.name && b.name.toLowerCase().trim() === targetNameLower
        );

        if (target) {
            appearances++;
            rankSum += target.rank;
        }
    }

    const avgRank = appearances > 0
        ? Math.round((rankSum / appearances) * 100) / 100
        : null;

    const visibilityScore = totalPoints > 0
        ? Math.round((appearances / totalPoints) * 100 * 100) / 100
        : 0;

    return { avgRank, visibilityScore };
}
