import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * CTR model: estimated click-through rate by rank position.
 * Used to compute a weighted visibility score (0-100).
 */
const CTR_BY_RANK: Record<number, number> = {
    1: 32.5,
    2: 17.5,
    3: 11.5,
    4: 7,
    5: 5,
    6: 4,
    7: 3,
    8: 2.5,
    9: 2,
    10: 1.5,
};

function getCtr(rank: number): number {
    if (rank >= 1 && rank <= 10) return CTR_BY_RANK[rank];
    if (rank >= 11 && rank <= 20) return 0.5;
    return 0;
}

/**
 * Recursively convert BigInt values to Number and Date objects to ISO strings
 * for safe JSON serialization. SQLite raw queries return COUNT(*) and similar
 * aggregates as BigInt, which JSON.stringify cannot serialize.
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

interface TopResultEntry {
    name?: string;
    rank?: number;
    position?: number;
}

interface CompetitorAgg {
    totalRank: number;
    appearances: number;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // 1. Fetch the scan
        const scan = await prisma.scan.findUnique({
            where: { id },
        });

        if (!scan) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }

        if (scan.status !== 'COMPLETED') {
            return NextResponse.json(
                { error: 'Scan has not completed yet', status: scan.status },
                { status: 400 }
            );
        }

        // 2. Determine the latest run
        const rawRuns: any[] = sanitizeBigInts(
            await prisma.$queryRaw(
                Prisma.sql`SELECT runId, MIN(runAt) as runAt, COUNT(*) as resultCount
                 FROM Result
                 WHERE scanId = ${id}
                 GROUP BY runId
                 ORDER BY MIN(runAt) ASC`
            )
        ) as any[];

        const latestRunId = scan.currentRunId
            || (rawRuns.length > 0 ? rawRuns[rawRuns.length - 1].runId : null);

        // 3. Fetch results for the latest run
        const results: any[] = sanitizeBigInts(
            latestRunId
                ? await prisma.$queryRaw(
                    Prisma.sql`SELECT * FROM Result WHERE scanId = ${id} AND runId = ${latestRunId}`
                )
                : await prisma.$queryRaw(
                    Prisma.sql`SELECT * FROM Result WHERE scanId = ${id}`
                )
        ) as any[];

        if (results.length === 0) {
            return NextResponse.json(
                { error: 'No results found for this scan' },
                { status: 404 }
            );
        }

        // 4. Calculate key metrics
        const totalPoints = results.length;
        const NOT_FOUND_RANK = 20;

        let rankSum = 0;
        let ctrSum = 0;
        let top3Count = 0;
        let top10Count = 0;
        let notFoundCount = 0;

        const competitorMap = new Map<string, CompetitorAgg>();

        for (const result of results) {
            const rank = result.rank != null ? Number(result.rank) : NOT_FOUND_RANK;

            rankSum += rank;
            ctrSum += getCtr(rank);

            if (result.rank != null) {
                if (rank <= 3) top3Count++;
                if (rank <= 10) top10Count++;
            } else {
                notFoundCount++;
            }

            // Parse topResults JSON for competitor data
            let topResults: TopResultEntry[] = [];
            try {
                if (result.topResults) {
                    topResults = JSON.parse(result.topResults);
                }
            } catch {
                // Skip malformed JSON
            }

            if (Array.isArray(topResults)) {
                for (const entry of topResults) {
                    const name = entry?.name;
                    if (!name || typeof name !== 'string') continue;
                    // Skip the tracked business itself
                    if (
                        scan.businessName &&
                        name.toLowerCase() === scan.businessName.toLowerCase()
                    ) {
                        continue;
                    }

                    const entryRank = entry.rank ?? entry.position ?? NOT_FOUND_RANK;
                    const existing = competitorMap.get(name);
                    if (existing) {
                        existing.totalRank += Number(entryRank);
                        existing.appearances += 1;
                    } else {
                        competitorMap.set(name, {
                            totalRank: Number(entryRank),
                            appearances: 1,
                        });
                    }
                }
            }
        }

        const avgRank = Math.round((rankSum / totalPoints) * 10) / 10;
        // Normalize visibility: max possible CTR is 32.5% per point
        const visibilityScore = Math.round((ctrSum / (totalPoints * 32.5)) * 100 * 10) / 10;
        const top3Pct = Math.round((top3Count / totalPoints) * 100 * 10) / 10;
        const top10Pct = Math.round((top10Count / totalPoints) * 100 * 10) / 10;
        const notFoundPct = Math.round((notFoundCount / totalPoints) * 100 * 10) / 10;

        // 5. Top competitors sorted by appearances descending, then by avgRank ascending
        const topCompetitors = Array.from(competitorMap.entries())
            .map(([name, agg]) => ({
                name,
                avgRank: Math.round((agg.totalRank / agg.appearances) * 10) / 10,
                appearances: agg.appearances,
            }))
            .sort((a, b) => b.appearances - a.appearances || a.avgRank - b.avgRank)
            .slice(0, 10);

        // 6. Build the natural language summary
        const businessLabel = scan.businessName || 'Your business';
        const completedAt = scan.createdAt
            ? new Date(scan.createdAt).toISOString()
            : null;

        const summaryParts: string[] = [
            `${businessLabel} ranks an average of ${avgRank} across ${totalPoints} grid points for '${scan.keyword}'.`,
        ];

        if (top3Count > 0) {
            summaryParts.push(
                `You appear in the top 3 at ${top3Pct}% of locations (${top3Count} of ${totalPoints}).`
            );
        }

        if (top10Count > 0) {
            summaryParts.push(
                `You appear in the top 10 at ${top10Pct}% of locations (${top10Count} of ${totalPoints}).`
            );
        }

        if (notFoundCount > 0) {
            summaryParts.push(
                `Your business was not found at ${notFoundPct}% of grid points (${notFoundCount} of ${totalPoints}).`
            );
        }

        summaryParts.push(
            `Overall visibility score: ${visibilityScore}% (weighted by click-through rate model).`
        );

        // 7. Generate actionable recommendations
        const recommendations: string[] = [];

        if (notFoundPct > 50) {
            recommendations.push(
                `Your business was not found at ${notFoundPct}% of grid points — consider expanding your service area or optimizing your GBP listing.`
            );
        }

        if (avgRank > 10) {
            recommendations.push(
                `Your average rank is ${avgRank}, which places you outside the top 10 on average. Focus on GBP optimization: complete all business categories, add high-quality photos, and gather more reviews.`
            );
        }

        if (topCompetitors.length > 0) {
            const topComp = topCompetitors[0];
            // Check if top competitor has 2x more appearances than the tracked business's top-10 count
            if (topComp.appearances >= top10Count * 2 && top10Count > 0) {
                recommendations.push(
                    `Competitor '${topComp.name}' dominates with ${topComp.appearances} appearances — review their profile for category and keyword optimization.`
                );
            } else if (top10Count === 0 && topComp.appearances > 0) {
                recommendations.push(
                    `Competitor '${topComp.name}' dominates with ${topComp.appearances} appearances — review their profile for category and keyword optimization.`
                );
            }
        }

        if (visibilityScore < 20) {
            recommendations.push(
                `Your visibility score is ${visibilityScore}%, which is critically low. Urgent improvement is needed: optimize your GBP listing, increase review velocity, and ensure NAP consistency across directories.`
            );
        }

        if (top3Pct > 60) {
            recommendations.push(
                `Strong position: you appear in the top 3 at ${top3Pct}% of locations. Focus on defending this position by maintaining review velocity and monitoring competitor activity.`
            );
        }

        // Ensure at least 3 recommendations
        if (recommendations.length < 3) {
            if (!recommendations.some(r => r.includes('review velocity'))) {
                recommendations.push(
                    `Consistently generate new reviews to maintain and improve your local ranking. Aim for a steady cadence rather than bursts.`
                );
            }
            if (recommendations.length < 3) {
                recommendations.push(
                    `Ensure your Google Business Profile is fully completed: business hours, categories, attributes, and a detailed description with relevant keywords.`
                );
            }
            if (recommendations.length < 3) {
                recommendations.push(
                    `Post regularly on your GBP profile with updates, offers, and events to signal activity to Google's algorithm.`
                );
            }
        }

        // Cap at 5 recommendations
        const finalRecommendations = recommendations.slice(0, 5);

        // 8. Assemble the response
        const response = {
            scan: {
                keyword: scan.keyword,
                businessName: scan.businessName,
                gridSize: scan.gridSize,
                radius: scan.radius,
                completedAt,
            },
            metrics: {
                avgRank,
                visibilityScore,
                top3Pct,
                top10Pct,
                notFoundPct,
                totalPoints,
            },
            topCompetitors,
            summary: summaryParts.join(' '),
            recommendations: finalRecommendations,
        };

        return NextResponse.json(response);
    } catch (error: any) {
        logger.error('Scan summary GET error', 'API', {
            message: error?.message,
            stack: error?.stack,
        });
        return NextResponse.json(
            { error: 'Failed to generate scan summary', details: error?.message },
            { status: 500 }
        );
    }
}
