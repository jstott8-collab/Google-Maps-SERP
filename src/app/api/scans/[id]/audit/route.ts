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

interface ScrapeEntry {
    name: string;
    rank: number;
    rating?: number;
    reviews?: number;
    address?: string;
    category?: string;
    phone?: string;
    website?: string;
    placeId?: string;
    cid?: string;
    allCategories?: string[];
}

interface AuditCategory {
    name: string;
    score: number;
    maxScore: number;
    tips: string[];
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        // 1. Fetch the scan
        const scan = await prisma.scan.findUnique({ where: { id } });
        if (!scan) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }

        if (scan.status !== 'COMPLETED') {
            return NextResponse.json(
                { error: 'Scan has not completed yet', status: scan.status },
                { status: 400 }
            );
        }

        if (!scan.businessName) {
            return NextResponse.json(
                { error: 'No business name tracked for this scan. Set businessName to generate an audit.' },
                { status: 400 }
            );
        }

        // 2. Determine the latest runId
        const latestRunRow: any[] = sanitizeBigInts(
            await prisma.$queryRaw(
                Prisma.sql`SELECT runId, MAX(runAt) as runAt
                 FROM Result
                 WHERE scanId = ${id} AND runId IS NOT NULL
                 GROUP BY runId
                 ORDER BY MAX(runAt) DESC
                 LIMIT 1`
            )
        ) as any[];

        const latestRunId = latestRunRow.length > 0
            ? latestRunRow[0].runId
            : scan.currentRunId;

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

        const totalPoints = results.length;
        const targetNameLower = scan.businessName.toLowerCase().trim();

        // 4. Parse topResults and aggregate data
        let appearances = 0;
        let rankSum = 0;
        let targetRating: number | null = null;
        let targetReviews: number | null = null;
        let targetAddress: string | null = null;
        let targetCategory: string | null = null;
        let targetPhone: string | null = null;
        let targetWebsite: string | null = null;
        let pointsWhereTargetOutranksTopCompetitor = 0;

        // Competitor aggregation
        const competitorMap = new Map<string, {
            name: string;
            ranks: number[];
            reviews: number[];
            ratings: number[];
        }>();

        for (const result of results) {
            let businesses: ScrapeEntry[] = [];
            try {
                businesses = JSON.parse(result.topResults);
            } catch {
                continue;
            }

            if (!Array.isArray(businesses) || businesses.length === 0) continue;

            // Find our target business in this grid point
            const target = businesses.find(
                (b) => b.name && b.name.toLowerCase().trim() === targetNameLower
            );

            // Find the best non-target competitor at this point
            const topCompetitor = businesses.find(
                (b) => b.name && b.name.toLowerCase().trim() !== targetNameLower
            );

            if (target) {
                appearances++;
                rankSum += target.rank;

                // Capture profile data from the first appearance where data is available
                if (target.rating != null && targetRating === null) targetRating = target.rating;
                if (target.reviews != null && targetReviews === null) targetReviews = target.reviews;
                if (target.address && !targetAddress) targetAddress = target.address;
                if (target.category && !targetCategory) targetCategory = target.category;
                if (target.phone && !targetPhone) targetPhone = target.phone;
                if (target.website && !targetWebsite) targetWebsite = target.website;

                // Update with best (most recent/complete) data
                if (target.rating != null) targetRating = target.rating;
                if (target.reviews != null) targetReviews = target.reviews;

                // Check if target outranks the top competitor at this point
                if (topCompetitor && target.rank < topCompetitor.rank) {
                    pointsWhereTargetOutranksTopCompetitor++;
                }
            }

            // Aggregate competitors (non-target businesses)
            for (const biz of businesses) {
                if (!biz.name) continue;
                const key = biz.name.toLowerCase().trim();
                if (key === targetNameLower) continue;

                if (!competitorMap.has(key)) {
                    competitorMap.set(key, {
                        name: biz.name,
                        ranks: [],
                        reviews: [],
                        ratings: [],
                    });
                }
                const comp = competitorMap.get(key)!;
                comp.ranks.push(biz.rank);
                if (biz.reviews != null) comp.reviews.push(biz.reviews);
                if (biz.rating != null) comp.ratings.push(biz.rating);
            }
        }

        // 5. Compute competitor averages
        const competitors = Array.from(competitorMap.values());
        const competitorAvgRank = competitors.length > 0
            ? competitors.reduce((sum, c) => sum + c.ranks.reduce((a, b) => a + b, 0) / c.ranks.length, 0) / competitors.length
            : 0;

        const competitorsWithReviews = competitors.filter(c => c.reviews.length > 0);
        const competitorAvgReviews = competitorsWithReviews.length > 0
            ? competitorsWithReviews.reduce((sum, c) => sum + c.reviews.reduce((a, b) => a + b, 0) / c.reviews.length, 0) / competitorsWithReviews.length
            : 0;

        const competitorsWithRatings = competitors.filter(c => c.ratings.length > 0);
        const competitorAvgRating = competitorsWithRatings.length > 0
            ? competitorsWithRatings.reduce((sum, c) => sum + c.ratings.reduce((a, b) => a + b, 0) / c.ratings.length, 0) / competitorsWithRatings.length
            : 0;

        // Count competitors that outrank the target at a majority of points
        const topCompetitors = competitors
            .filter(c => c.ranks.length >= 3) // Must appear at multiple points
            .filter(c => {
                const compAvg = c.ranks.reduce((a, b) => a + b, 0) / c.ranks.length;
                const targetAvg = appearances > 0 ? rankSum / appearances : 20;
                return compAvg < targetAvg;
            });

        const avgRank = appearances > 0 ? Math.round((rankSum / appearances) * 100) / 100 : null;

        // 6. Scoring

        // Visibility: (appearances / totalPoints) * 100
        const visibilityScore = Math.round((appearances / totalPoints) * 100);
        const visibilityTips: string[] = [];
        if (visibilityScore < 100) {
            visibilityTips.push(
                `Found at ${appearances}/${totalPoints} grid points. Expand service area keywords to improve local presence.`
            );
        }
        if (visibilityScore >= 100) {
            visibilityTips.push('Excellent! Your business appears at every grid point.');
        }
        if (visibilityScore < 50) {
            visibilityTips.push(
                'Low visibility detected. Ensure NAP consistency and consider adding more location-relevant content.'
            );
        }

        // Rankings: max(0, 100 - (avgRank - 1) * 5.26)  -- rank 1 = 100, rank 20 = 0
        const rankingsScore = avgRank !== null
            ? Math.round(Math.max(0, 100 - (avgRank - 1) * 5.26))
            : 0;
        const rankingsTips: string[] = [];
        if (avgRank !== null) {
            if (avgRank > 3) {
                rankingsTips.push(
                    `Average rank ${avgRank}. Target top 3 by optimizing primary category and adding relevant attributes.`
                );
            } else {
                rankingsTips.push(
                    `Strong average rank of ${avgRank}. Maintain position by keeping your profile updated and responding to reviews.`
                );
            }
        } else {
            rankingsTips.push(
                'Business not found in any grid point. Verify your GBP listing is active and indexed.'
            );
        }

        // Reviews: min(100, (yourReviews / max(competitorAvgReviews, 1)) * 100)
        const yourReviews = targetReviews ?? 0;
        const reviewsScore = Math.round(Math.min(100, (yourReviews / Math.max(competitorAvgReviews, 1)) * 100));
        const reviewsTips: string[] = [];
        if (yourReviews < competitorAvgReviews) {
            reviewsTips.push(
                `Average ${yourReviews} reviews vs competitor avg of ${Math.round(competitorAvgReviews)}. Request reviews from recent customers.`
            );
        } else {
            reviewsTips.push(
                `Your review count (${yourReviews}) meets or exceeds the competitor average (${Math.round(competitorAvgReviews)}). Focus on review quality and responses.`
            );
        }

        // Profile Completeness: +25 for each of rating, reviews, address, category
        let profileScore = 0;
        const profileTips: string[] = [];
        const profileParts: string[] = [];
        const missingParts: string[] = [];

        if (targetRating != null) { profileScore += 25; profileParts.push('rating'); }
        else { missingParts.push('rating'); }

        if (targetReviews != null && targetReviews > 0) { profileScore += 25; profileParts.push('reviews'); }
        else { missingParts.push('reviews'); }

        if (targetAddress) { profileScore += 25; profileParts.push('address'); }
        else { missingParts.push('address'); }

        if (targetCategory) { profileScore += 25; profileParts.push('category'); }
        else { missingParts.push('category'); }

        if (profileParts.length > 0) {
            profileTips.push(`Detected: ${profileParts.join(', ')}.`);
        }
        if (missingParts.length > 0) {
            profileTips.push(`Missing or undetected: ${missingParts.join(', ')}. Ensure your GBP profile is fully completed.`);
        }
        if (targetWebsite && targetPhone) {
            profileTips.push('Website and phone detected. Add business hours if not set.');
        } else if (!targetWebsite) {
            profileTips.push('No website detected. Adding a website URL to your GBP listing improves trust and rankings.');
        }

        // Competitive Position: based on how many points you outrank the top competitor
        const competitiveScore = appearances > 0
            ? Math.round((pointsWhereTargetOutranksTopCompetitor / totalPoints) * 100)
            : 0;
        const competitiveTips: string[] = [];
        if (topCompetitors.length > 0) {
            competitiveTips.push(
                `${topCompetitors.length} competitor(s) outrank you on average. Analyze their categories and review strategies.`
            );
        }
        const outrankedPct = totalPoints > 0
            ? Math.round(((totalPoints - pointsWhereTargetOutranksTopCompetitor) / totalPoints) * 100)
            : 100;
        if (outrankedPct > 50) {
            competitiveTips.push(
                `You are outranked at ${outrankedPct}% of locations. Focus on the weakest grid areas to close the gap.`
            );
        } else {
            competitiveTips.push(
                `You outrank the closest competitor at ${100 - outrankedPct}% of locations. Maintain your competitive edge.`
            );
        }

        // Overall score: weighted average
        const categories: AuditCategory[] = [
            { name: 'Visibility', score: visibilityScore, maxScore: 100, tips: visibilityTips },
            { name: 'Rankings', score: rankingsScore, maxScore: 100, tips: rankingsTips },
            { name: 'Reviews', score: reviewsScore, maxScore: 100, tips: reviewsTips },
            { name: 'Profile Completeness', score: profileScore, maxScore: 100, tips: profileTips },
            { name: 'Competitive Position', score: competitiveScore, maxScore: 100, tips: competitiveTips },
        ];

        const overallScore = Math.round(
            categories.reduce((sum, c) => sum + c.score, 0) / categories.length
        );

        // 7. Build response
        const response = {
            business: {
                name: scan.businessName,
                avgRank,
                appearances,
                totalPoints,
            },
            audit: {
                overallScore,
                categories,
            },
            competitorBenchmark: {
                yourAvgRank: avgRank ?? 0,
                competitorAvgRank: Math.round(competitorAvgRank * 100) / 100,
                yourReviews,
                competitorAvgReviews: Math.round(competitorAvgReviews),
                yourRating: targetRating ?? 0,
                competitorAvgRating: Math.round(competitorAvgRating * 100) / 100,
            },
        };

        return NextResponse.json(response);
    } catch (error: any) {
        logger.error('Audit GET error', 'API', {
            message: error?.message,
            stack: error?.stack,
        });
        return NextResponse.json(
            { error: 'Failed to generate audit', details: error?.message },
            { status: 500 }
        );
    }
}
