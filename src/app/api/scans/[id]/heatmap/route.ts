import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

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

        const results = await prisma.result.findMany({ where, orderBy: { capturedAt: 'asc' } });

        // CTR-based visibility weights
        const ctrByRank: Record<number, number> = {
            1: 32.5, 2: 17.5, 3: 11.5, 4: 8.5, 5: 6.5, 6: 5.5, 7: 4.5, 8: 3.5, 9: 3.0, 10: 2.5,
            11: 2.0, 12: 1.8, 13: 1.5, 14: 1.3, 15: 1.0, 16: 0.8, 17: 0.6, 18: 0.5, 19: 0.3, 20: 0.2,
        };

        const heatmapPoints = results.map(r => {
            const rank = r.rank ?? 21;
            const visibility = ctrByRank[Math.min(rank, 20)] ?? 0;

            // Color: green (rank 1-3) → yellow (4-7) → orange (8-13) → red (14-20) → dark red (not found)
            let color: string;
            let intensity: number;
            if (rank <= 3) {
                color = '#22c55e'; intensity = 1.0;
            } else if (rank <= 7) {
                color = '#eab308'; intensity = 0.75;
            } else if (rank <= 13) {
                color = '#f97316'; intensity = 0.5;
            } else if (rank <= 20) {
                color = '#ef4444'; intensity = 0.3;
            } else {
                color = '#991b1b'; intensity = 0.1;
            }

            let topCompetitor = null;
            try {
                const parsed = JSON.parse(r.topResults);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    topCompetitor = { name: parsed[0].name, rating: parsed[0].rating, reviews: parsed[0].reviews };
                }
            } catch { /* ignore */ }

            return {
                lat: r.lat,
                lng: r.lng,
                rank,
                visibility,
                color,
                intensity,
                topCompetitor,
                targetName: r.targetName,
            };
        });

        // Aggregate stats
        const ranked = heatmapPoints.filter(p => p.rank <= 20);
        const avgVisibility = ranked.length > 0
            ? ranked.reduce((sum, p) => sum + p.visibility, 0) / heatmapPoints.length
            : 0;

        // Quadrant analysis (split grid into 4 quadrants by median lat/lng)
        const lats = heatmapPoints.map(p => p.lat).sort((a, b) => a - b);
        const lngs = heatmapPoints.map(p => p.lng).sort((a, b) => a - b);
        const medLat = lats[Math.floor(lats.length / 2)] ?? 0;
        const medLng = lngs[Math.floor(lngs.length / 2)] ?? 0;

        const quadrants = {
            NE: { points: 0, avgRank: 0, totalRank: 0 },
            NW: { points: 0, avgRank: 0, totalRank: 0 },
            SE: { points: 0, avgRank: 0, totalRank: 0 },
            SW: { points: 0, avgRank: 0, totalRank: 0 },
        };

        for (const p of heatmapPoints) {
            const key = `${p.lat >= medLat ? 'N' : 'S'}${p.lng >= medLng ? 'E' : 'W'}` as keyof typeof quadrants;
            quadrants[key].points++;
            quadrants[key].totalRank += p.rank;
        }

        for (const q of Object.values(quadrants)) {
            q.avgRank = q.points > 0 ? Math.round((q.totalRank / q.points) * 10) / 10 : 0;
        }

        return NextResponse.json({
            scanId: id,
            keyword: scan.keyword,
            businessName: scan.businessName,
            totalPoints: heatmapPoints.length,
            avgVisibility: Math.round(avgVisibility * 100) / 100,
            quadrants,
            points: heatmapPoints,
        });
    } catch (error) {
        logger.error('Heatmap data error', 'API', { scanId: id, error: String(error) });
        return NextResponse.json({ error: 'Failed to generate heatmap data' }, { status: 500 });
    }
}
