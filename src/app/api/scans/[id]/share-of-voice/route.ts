import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// Share of Voice (SOV): measures what % of the local pack a business "owns"
// across all grid points, weighted by CTR at each rank position
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get('runId');

    try {
        const scan = await prisma.scan.findUnique({ where: { id } });
        if (!scan) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }

        const where: any = { scanId: id };
        if (runId) {
            where.runId = runId;
        } else if (scan.currentRunId) {
            where.runId = scan.currentRunId;
        }

        const results = await prisma.result.findMany({ where });

        const ctrByRank: Record<number, number> = {
            1: 32.5, 2: 17.5, 3: 11.5, 4: 8.5, 5: 6.5, 6: 5.5, 7: 4.5, 8: 3.5, 9: 3.0, 10: 2.5,
            11: 2.0, 12: 1.8, 13: 1.5, 14: 1.3, 15: 1.0, 16: 0.8, 17: 0.6, 18: 0.5, 19: 0.3, 20: 0.2,
        };

        // Total possible CTR across all points (if rank 1 everywhere)
        const maxCTRPerPoint = 32.5;
        const totalMaxCTR = results.length * maxCTRPerPoint;

        // Target business SOV
        const targetCTR = results.reduce((sum, r) => {
            const rank = r.rank ?? 21;
            return sum + (ctrByRank[Math.min(rank, 20)] ?? 0);
        }, 0);

        const targetSOV = totalMaxCTR > 0 ? (targetCTR / totalMaxCTR) * 100 : 0;

        // Competitor SOV from topResults
        const competitorCTR: Record<string, { name: string; totalCTR: number; appearances: number }> = {};

        for (const r of results) {
            try {
                const top = JSON.parse(r.topResults);
                if (!Array.isArray(top)) continue;
                for (const entry of top) {
                    if (!entry.name) continue;
                    const key = entry.placeId || entry.name;
                    if (!competitorCTR[key]) {
                        competitorCTR[key] = { name: entry.name, totalCTR: 0, appearances: 0 };
                    }
                    const rank = entry.rank ?? 21;
                    competitorCTR[key].totalCTR += ctrByRank[Math.min(rank, 20)] ?? 0;
                    competitorCTR[key].appearances++;
                }
            } catch { /* ignore parse errors */ }
        }

        // Build SOV leaderboard
        const leaderboard = Object.values(competitorCTR)
            .map(c => ({
                name: c.name,
                sov: totalMaxCTR > 0 ? Math.round((c.totalCTR / totalMaxCTR) * 10000) / 100 : 0,
                appearances: c.appearances,
                coveragePercent: Math.round((c.appearances / (results.length || 1)) * 10000) / 100,
            }))
            .sort((a, b) => b.sov - a.sov)
            .slice(0, 20);

        // Insert target business at its position if it has a businessName
        const targetEntry = scan.businessName ? {
            name: scan.businessName,
            sov: Math.round(targetSOV * 100) / 100,
            appearances: results.filter(r => r.rank !== null && r.rank <= 20).length,
            coveragePercent: Math.round((results.filter(r => r.rank !== null && r.rank <= 20).length / (results.length || 1)) * 10000) / 100,
            isTarget: true,
        } : null;

        // Rank position distribution
        const distribution = { top3: 0, top5: 0, top10: 0, top20: 0, notFound: 0 };
        for (const r of results) {
            const rank = r.rank ?? 21;
            if (rank <= 3) distribution.top3++;
            else if (rank <= 5) distribution.top5++;
            else if (rank <= 10) distribution.top10++;
            else if (rank <= 20) distribution.top20++;
            else distribution.notFound++;
        }

        return NextResponse.json({
            scanId: id,
            keyword: scan.keyword,
            businessName: scan.businessName,
            totalPoints: results.length,
            targetSOV: Math.round(targetSOV * 100) / 100,
            targetEntry,
            leaderboard,
            distribution,
        });
    } catch (error) {
        logger.error('Share of voice error', 'API', { scanId: id, error: String(error) });
        return NextResponse.json({ error: 'Failed to calculate share of voice' }, { status: 500 });
    }
}
