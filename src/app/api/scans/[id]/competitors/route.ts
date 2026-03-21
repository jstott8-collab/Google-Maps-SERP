import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface TopResult {
    rank: number;
    name: string;
    placeId?: string;
    address?: string;
    rating?: number;
    reviews?: number;
    type?: string;
    cid?: string;
}

interface CompetitorAgg {
    name: string;
    placeId: string | null;
    appearances: number;
    rankSum: number;
    bestRank: number;
    address?: string;
    rating?: number;
    reviews?: number;
    type?: string;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const url = new URL(request.url);
        const requestedRunId = url.searchParams.get('runId');

        const scan = await prisma.scan.findUnique({ where: { id } });
        if (!scan) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }

        // Determine runId: requested > scan.currentRunId > latest from DB
        let runId = requestedRunId || scan.currentRunId;
        if (!runId) {
            const latest: any[] = await prisma.$queryRaw(
                Prisma.sql`SELECT runId FROM Result WHERE scanId = ${id} ORDER BY runAt DESC LIMIT 1`
            );
            runId = latest[0]?.runId ?? null;
        }

        // Fetch results
        const results: any[] = runId
            ? await prisma.$queryRaw(
                  Prisma.sql`SELECT topResults FROM Result WHERE scanId = ${id} AND runId = ${runId}`
              )
            : await prisma.$queryRaw(
                  Prisma.sql`SELECT topResults FROM Result WHERE scanId = ${id}`
              );

        const totalGridPoints = results.length;
        if (totalGridPoints === 0) {
            return NextResponse.json({
                competitors: [],
                totalGridPoints: 0,
                uniqueCompetitors: 0,
                marketConcentration: 0,
                runId,
            });
        }

        // Aggregate competitors across all grid points
        const competitorMap = new Map<string, CompetitorAgg>();
        let rank1Counts = new Map<string, number>(); // for HHI

        for (const row of results) {
            let top: TopResult[];
            try {
                top = typeof row.topResults === 'string' ? JSON.parse(row.topResults) : row.topResults;
                if (!Array.isArray(top)) continue;
            } catch {
                continue;
            }

            for (const entry of top) {
                if (!entry.name) continue;
                const key = entry.placeId || entry.name;

                const existing = competitorMap.get(key);
                if (existing) {
                    existing.appearances++;
                    existing.rankSum += entry.rank;
                    if (entry.rank < existing.bestRank) existing.bestRank = entry.rank;
                    // Keep freshest metadata
                    if (entry.rating != null) existing.rating = entry.rating;
                    if (entry.reviews != null) existing.reviews = entry.reviews;
                } else {
                    competitorMap.set(key, {
                        name: entry.name,
                        placeId: entry.placeId || null,
                        appearances: 1,
                        rankSum: entry.rank,
                        bestRank: entry.rank,
                        address: entry.address,
                        rating: entry.rating,
                        reviews: entry.reviews,
                        type: entry.type,
                    });
                }

                // Track #1 rank appearances for HHI
                if (entry.rank === 1) {
                    rank1Counts.set(key, (rank1Counts.get(key) || 0) + 1);
                }
            }
        }

        // Build sorted competitor list
        const competitors = Array.from(competitorMap.values())
            .map((c) => {
                const avgRank = c.rankSum / c.appearances;
                const coveragePercent = (c.appearances / totalGridPoints) * 100;
                const dominanceScore = c.appearances * (21 - avgRank);
                return {
                    name: c.name,
                    placeId: c.placeId,
                    appearances: c.appearances,
                    avgRank: Math.round(avgRank * 100) / 100,
                    bestRank: c.bestRank,
                    dominanceScore: Math.round(dominanceScore * 100) / 100,
                    coveragePercent: Math.round(coveragePercent * 100) / 100,
                    address: c.address,
                    rating: c.rating,
                    reviews: c.reviews,
                    type: c.type,
                };
            })
            .sort((a, b) => b.dominanceScore - a.dominanceScore)
            .slice(0, 20);

        // HHI: sum of squared market shares based on #1 rank appearances
        const totalRank1 = Array.from(rank1Counts.values()).reduce((s, v) => s + v, 0);
        const marketConcentration =
            totalRank1 > 0
                ? Math.round(
                      Array.from(rank1Counts.values()).reduce((sum, count) => {
                          const share = (count / totalRank1) * 100;
                          return sum + share * share;
                      }, 0)
                  )
                : 0;

        return NextResponse.json({
            competitors,
            totalGridPoints,
            uniqueCompetitors: competitorMap.size,
            marketConcentration,
            runId,
        });
    } catch (error: any) {
        logger.error('Competitors GET error', 'SCANNER', { message: error?.message, stack: error?.stack });
        return NextResponse.json({ error: 'Failed to analyze competitors', details: error?.message }, { status: 500 });
    }
}
