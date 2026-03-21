import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface PointMetrics {
  lat: number;
  lng: number;
  volatilityScore: number;
  trend: 'improving' | 'declining' | 'stable';
  currentRank: number | null;
  bestRank: number | null;
  worstRank: number | null;
}

function pointKey(lat: number, lng: number): string {
  return `${Math.round(lat * 10000) / 10000},${Math.round(lng * 10000) / 10000}`;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

// Least-squares slope: positive slope = rank number increasing = declining performance
function linearRegressionSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function stabilityGrade(volatility: number): string {
  if (volatility < 1.0) return 'A';
  if (volatility < 2.0) return 'B';
  if (volatility < 3.5) return 'C';
  if (volatility < 5.0) return 'D';
  return 'F';
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const scan = await prisma.scan.findUnique({ where: { id } });
    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
    }

    const results = await prisma.result.findMany({
      where: { scanId: id },
      orderBy: { runAt: 'asc' },
    });

    if (results.length === 0) {
      return NextResponse.json({ error: 'No results found for this scan' }, { status: 404 });
    }

    // Group results by runId, preserving chronological order
    const runOrder: string[] = [];
    const runsSeen = new Set<string>();
    for (const r of results) {
      const rid = r.runId || 'legacy';
      if (!runsSeen.has(rid)) {
        runsSeen.add(rid);
        runOrder.push(rid);
      }
    }

    if (runOrder.length < 2) {
      return NextResponse.json({
        error: 'At least 2 runs are required to calculate volatility',
        runsAvailable: runOrder.length,
      }, { status: 400 });
    }

    // Group by grid point, then collect ranks in run order
    const pointData = new Map<string, { lat: number; lng: number; ranksByRun: Map<string, number> }>();

    for (const r of results) {
      if (r.rank == null) continue;
      const key = pointKey(r.lat, r.lng);
      if (!pointData.has(key)) {
        pointData.set(key, {
          lat: Math.round(r.lat * 10000) / 10000,
          lng: Math.round(r.lng * 10000) / 10000,
          ranksByRun: new Map(),
        });
      }
      const rid = r.runId || 'legacy';
      pointData.get(key)!.ranksByRun.set(rid, r.rank);
    }

    const pointMetrics: PointMetrics[] = [];

    for (const [, data] of pointData) {
      const ranksInOrder = runOrder
        .filter(rid => data.ranksByRun.has(rid))
        .map(rid => data.ranksByRun.get(rid)!);

      if (ranksInOrder.length < 2) continue;

      const vol = standardDeviation(ranksInOrder);
      const slope = linearRegressionSlope(ranksInOrder);

      // Negative slope = rank number decreasing = improving; positive = declining
      let trend: 'improving' | 'declining' | 'stable';
      if (slope < -0.3) trend = 'improving';
      else if (slope > 0.3) trend = 'declining';
      else trend = 'stable';

      pointMetrics.push({
        lat: data.lat,
        lng: data.lng,
        volatilityScore: Math.round(vol * 100) / 100,
        trend,
        currentRank: ranksInOrder[ranksInOrder.length - 1],
        bestRank: Math.min(...ranksInOrder),
        worstRank: Math.max(...ranksInOrder),
      });
    }

    if (pointMetrics.length === 0) {
      return NextResponse.json({ error: 'Not enough ranked data points across runs' }, { status: 400 });
    }

    const overallVolatility =
      Math.round(
        (pointMetrics.reduce((sum, p) => sum + p.volatilityScore, 0) / pointMetrics.length) * 100
      ) / 100;

    const sorted = [...pointMetrics].sort((a, b) => b.volatilityScore - a.volatilityScore);
    const sortedStable = [...pointMetrics].sort((a, b) => a.volatilityScore - b.volatilityScore);

    return NextResponse.json({
      scanId: id,
      runsAnalyzed: runOrder.length,
      totalPoints: pointMetrics.length,
      overallVolatility,
      stabilityGrade: stabilityGrade(overallVolatility),
      mostVolatilePoints: sorted.slice(0, 5),
      mostStablePoints: sortedStable.slice(0, 5),
      improvingPoints: pointMetrics.filter(p => p.trend === 'improving').length,
      decliningPoints: pointMetrics.filter(p => p.trend === 'declining').length,
      stablePoints: pointMetrics.filter(p => p.trend === 'stable').length,
      points: pointMetrics,
    });
  } catch (error: any) {
    logger.error('Volatility calculation error', 'VOLATILITY', {
      message: error?.message,
      stack: error?.stack,
    });
    return NextResponse.json(
      { error: 'Failed to calculate volatility', details: error?.message },
      { status: 500 }
    );
  }
}
