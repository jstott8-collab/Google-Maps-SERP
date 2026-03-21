import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// Detects keyword cannibalization: multiple scans for same business
// competing for overlapping geographic areas
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const businessName = searchParams.get('businessName');

    if (!businessName) {
        return NextResponse.json({ error: 'businessName is required' }, { status: 400 });
    }

    try {
        const scans = await prisma.scan.findMany({
            where: { businessName, status: 'COMPLETED' },
            orderBy: { createdAt: 'desc' },
            include: { results: true },
        });

        if (scans.length < 2) {
            return NextResponse.json({
                businessName,
                cannibalization: [],
                message: 'Need at least 2 completed scans to detect cannibalization',
            });
        }

        const conflicts: any[] = [];

        // Compare each pair of scans
        for (let i = 0; i < scans.length; i++) {
            for (let j = i + 1; j < scans.length; j++) {
                const scanA = scans[i];
                const scanB = scans[j];

                // Calculate geographic overlap using Haversine distance between centers
                const distKm = haversine(scanA.centerLat, scanA.centerLng, scanB.centerLat, scanB.centerLng);
                const combinedRadius = scanA.radius + scanB.radius;

                if (distKm >= combinedRadius) continue; // No overlap

                const overlapRatio = Math.max(0, 1 - (distKm / combinedRadius));

                // Check keyword similarity
                const keywordSimilarity = jaccardSimilarity(
                    scanA.keyword.toLowerCase().split(/\s+/),
                    scanB.keyword.toLowerCase().split(/\s+/)
                );

                // Only flag if keywords are similar AND areas overlap
                if (keywordSimilarity < 0.3 && overlapRatio < 0.3) continue;

                // Get latest run results for each
                const resultsA = getLatestRunResults(scanA.results);
                const resultsB = getLatestRunResults(scanB.results);

                const avgRankA = calcAvgRank(resultsA);
                const avgRankB = calcAvgRank(resultsB);

                // Find overlapping grid points
                const overlappingPoints = countOverlappingPoints(resultsA, resultsB);

                conflicts.push({
                    scanA: { id: scanA.id, keyword: scanA.keyword, avgRank: avgRankA, gridSize: scanA.gridSize },
                    scanB: { id: scanB.id, keyword: scanB.keyword, avgRank: avgRankB, gridSize: scanB.gridSize },
                    overlapRatio: Math.round(overlapRatio * 100),
                    keywordSimilarity: Math.round(keywordSimilarity * 100),
                    overlappingPoints,
                    severity: overlapRatio > 0.7 && keywordSimilarity > 0.5 ? 'high'
                        : overlapRatio > 0.4 || keywordSimilarity > 0.3 ? 'medium' : 'low',
                    recommendation: generateRecommendation(scanA, scanB, overlapRatio, keywordSimilarity),
                });
            }
        }

        conflicts.sort((a, b) => {
            const sev = { high: 3, medium: 2, low: 1 };
            return (sev[b.severity as keyof typeof sev] || 0) - (sev[a.severity as keyof typeof sev] || 0);
        });

        return NextResponse.json({
            businessName,
            totalScans: scans.length,
            cannibalization: conflicts,
        });
    } catch (error) {
        logger.error('Cannibalization detection error', 'API', { error: String(error) });
        return NextResponse.json({ error: 'Failed to detect cannibalization' }, { status: 500 });
    }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function jaccardSimilarity(a: string[], b: string[]): number {
    const setA = new Set(a);
    const setB = new Set(b);
    const intersection = [...setA].filter(x => setB.has(x)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
}

function getLatestRunResults(results: any[]): any[] {
    if (results.length === 0) return [];
    const byRunId = new Map<string | null, any[]>();
    for (const r of results) {
        const key = r.runId ?? '__legacy__';
        if (!byRunId.has(key)) byRunId.set(key, []);
        byRunId.get(key)!.push(r);
    }
    // Latest run = most recent runAt
    let latestRun: any[] = [];
    let latestTime = 0;
    for (const group of byRunId.values()) {
        const maxTime = Math.max(...group.map((r: any) => new Date(r.runAt).getTime()));
        if (maxTime > latestTime) {
            latestTime = maxTime;
            latestRun = group;
        }
    }
    return latestRun;
}

function calcAvgRank(results: any[]): number {
    const ranked = results.filter(r => r.rank !== null);
    if (ranked.length === 0) return 21;
    return Math.round((ranked.reduce((sum: number, r: any) => sum + r.rank, 0) / ranked.length) * 10) / 10;
}

function countOverlappingPoints(a: any[], b: any[]): number {
    const tolerance = 0.005; // ~500m
    let count = 0;
    for (const pa of a) {
        for (const pb of b) {
            if (Math.abs(pa.lat - pb.lat) < tolerance && Math.abs(pa.lng - pb.lng) < tolerance) {
                count++;
                break;
            }
        }
    }
    return count;
}

function generateRecommendation(scanA: any, scanB: any, overlap: number, similarity: number): string {
    if (similarity > 0.7 && overlap > 0.7) {
        return `These scans have nearly identical keywords and coverage areas. Consider merging "${scanA.keyword}" and "${scanB.keyword}" into a single scan with a larger grid.`;
    }
    if (similarity > 0.5) {
        return `Keywords "${scanA.keyword}" and "${scanB.keyword}" are similar. Consider differentiating your targeting or consolidating into one scan.`;
    }
    if (overlap > 0.5) {
        return `These scans cover overlapping areas. Consider adjusting grid centers to reduce redundant coverage.`;
    }
    return `Minor overlap detected. Monitor both scans to ensure they serve distinct ranking insights.`;
}
