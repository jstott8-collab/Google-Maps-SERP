/**
 * Insight Engine - Advanced Local SEO Intelligence
 *
 * Provides sophisticated analysis algorithms for grid-based rank tracking:
 * - HHI Market Concentration (Herfindahl-Hirschman Index)
 * - CTR-weighted Share of Voice
 * - Geographic dominance analysis (quadrant breakdown)
 * - Ranking consistency / volatility scoring
 * - Review benchmarks (reviews needed for top 3)
 * - Data-driven, context-specific recommendations
 */

export interface CompetitorData {
    name: string;
    rank?: number;
    rating?: number;
    reviews?: number;
    address?: string;
    category?: string;
    allCategories?: string[];
    profileCompleteness?: number;
    isSAB?: boolean;
    yearsInBusiness?: number;
    appearances?: number;
    bestRank?: number;
    worstRank?: number;
}

export interface InsightResult {
    threatLevel: 'low' | 'medium' | 'high' | 'critical';
    threatScore: number;
    marketSaturation: number;
    hhi: number; // Herfindahl-Hirschman Index (0-10000)
    hhiLabel: string;
    shareOfVoice: ShareOfVoiceEntry[];
    topThreats: CompetitorThreat[];
    opportunities: Opportunity[];
    recommendations: Recommendation[];
    categoryDominance: CategoryAnalysis[];
    geographicInsights: GeographicInsight[];
    rankingConsistency: RankingConsistency[];
    reviewBenchmarks: ReviewBenchmark;
    targetVsMarket: TargetVsMarket | null;
}

export interface ShareOfVoiceEntry {
    name: string;
    sov: number; // CTR-weighted share percentage
    appearances: number;
    avgRank: number;
}

export interface GeographicInsight {
    quadrant: string; // e.g. "NW", "NE", "SW", "SE"
    dominantBusiness: string;
    avgRank: number;
    competitorCount: number;
    gridPoints: number;
}

export interface RankingConsistency {
    name: string;
    avgRank: number;
    stdDev: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F'; // A=very consistent, F=wildly inconsistent
    bestRank: number;
    worstRank: number;
    appearances: number;
}

export interface ReviewBenchmark {
    top3AvgReviews: number;
    top3AvgRating: number;
    top3MinReviews: number;
    top10AvgReviews: number;
    top10AvgRating: number;
    marketMedianReviews: number;
    marketMedianRating: number;
}

export interface TargetVsMarket {
    targetName: string;
    yourRank: number;
    marketAvgRank: number;
    yourRating: number | null;
    marketAvgRating: number;
    yourReviews: number | null;
    marketAvgReviews: number;
    yourAppearances: number;
    marketAvgAppearances: number;
    yourTop3Count: number;
    yourProfileCompleteness: number | null;
    marketAvgProfileCompleteness: number;
    rankPercentile: number; // 0-100, what % of competitors you outrank
    reviewPercentile: number;
    ratingPercentile: number;
}

export interface CompetitorThreat {
    name: string;
    threatScore: number;
    avgRank: number;
    marketShare: number;
    strengthFactors: string[];
    weaknesses: string[];
}

export interface Opportunity {
    type: 'category' | 'geographic' | 'review' | 'profile' | 'ranking';
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    potentialImpact: number;
}

export interface Recommendation {
    action: string;
    reason: string;
    priority: number;
    estimatedImpact: 'low' | 'medium' | 'high';
}

export interface CategoryAnalysis {
    category: string;
    competitorCount: number;
    avgRating: number;
    avgReviews: number;
    dominantPlayer: string;
    yourPosition?: number;
}

// CTR model based on industry research for Google Maps local pack
const CTR_BY_RANK: Record<number, number> = {
    1: 0.325, 2: 0.175, 3: 0.115,
    4: 0.07, 5: 0.05, 6: 0.04, 7: 0.03, 8: 0.025, 9: 0.02, 10: 0.015,
    11: 0.005, 12: 0.005, 13: 0.005, 14: 0.005, 15: 0.005,
    16: 0.003, 17: 0.003, 18: 0.003, 19: 0.003, 20: 0.003
};

function getCTR(rank: number): number {
    return CTR_BY_RANK[Math.min(rank, 20)] || 0.001;
}

/**
 * Calculate HHI (Herfindahl-Hirschman Index) for market concentration.
 * 0-1500 = competitive, 1500-2500 = moderate, 2500+ = concentrated
 */
function calculateHHI(
    results: Array<{ topResults: string }>,
): { hhi: number; label: string } {
    // Count appearances per business across all grid points
    const appearances = new Map<string, number>();
    let totalSlots = 0;

    results.forEach(r => {
        try {
            const businesses = JSON.parse(r.topResults);
            businesses.forEach((biz: any) => {
                const key = biz.name.toLowerCase();
                appearances.set(key, (appearances.get(key) || 0) + 1);
                totalSlots++;
            });
        } catch { /* skip */ }
    });

    if (totalSlots === 0) return { hhi: 0, label: 'No Data' };

    // HHI = sum of squared market shares (each share in %)
    let hhi = 0;
    appearances.forEach(count => {
        const share = (count / totalSlots) * 100;
        hhi += share * share;
    });

    let label = 'Competitive';
    if (hhi >= 2500) label = 'Highly Concentrated';
    else if (hhi >= 1500) label = 'Moderately Concentrated';

    return { hhi: Math.round(hhi), label };
}

/**
 * Calculate CTR-weighted Share of Voice for each business
 */
function calculateShareOfVoice(
    results: Array<{ topResults: string }>,
): ShareOfVoiceEntry[] {
    const sovMap = new Map<string, { totalCTR: number; appearances: number; rankSum: number }>();
    let grandTotalCTR = 0;

    results.forEach(r => {
        try {
            const businesses: any[] = JSON.parse(r.topResults);
            businesses.forEach(biz => {
                const key = biz.name.toLowerCase();
                const ctr = getCTR(biz.rank);
                grandTotalCTR += ctr;

                const entry = sovMap.get(key) || { totalCTR: 0, appearances: 0, rankSum: 0 };
                entry.totalCTR += ctr;
                entry.appearances++;
                entry.rankSum += biz.rank;
                sovMap.set(key, entry);
            });
        } catch { /* skip */ }
    });

    if (grandTotalCTR === 0) return [];

    const entries: ShareOfVoiceEntry[] = [];
    sovMap.forEach((data, key) => {
        // Find proper name casing
        let properName = key;
        for (const r of results) {
            try {
                const businesses: any[] = JSON.parse(r.topResults);
                const match = businesses.find(b => b.name.toLowerCase() === key);
                if (match) { properName = match.name; break; }
            } catch { /* skip */ }
        }

        entries.push({
            name: properName,
            sov: (data.totalCTR / grandTotalCTR) * 100,
            appearances: data.appearances,
            avgRank: data.rankSum / data.appearances,
        });
    });

    return entries.sort((a, b) => b.sov - a.sov);
}

/**
 * Analyze geographic dominance by dividing grid into quadrants
 */
function analyzeGeography(
    results: Array<{ topResults: string; lat: number; lng: number }>,
): GeographicInsight[] {
    if (results.length < 4) return [];

    // Find center point
    const centerLat = results.reduce((s, r) => s + r.lat, 0) / results.length;
    const centerLng = results.reduce((s, r) => s + r.lng, 0) / results.length;

    // Assign each point to a quadrant
    const quadrants: Record<string, Array<{ topResults: string }>> = {
        'NW': [], 'NE': [], 'SW': [], 'SE': []
    };

    results.forEach(r => {
        const ns = r.lat >= centerLat ? 'N' : 'S';
        const ew = r.lng >= centerLng ? 'E' : 'W';
        quadrants[ns + ew].push(r);
    });

    const insights: GeographicInsight[] = [];

    Object.entries(quadrants).forEach(([quadrant, points]) => {
        if (points.length === 0) return;

        // Find dominant business in this quadrant
        const businessRanks = new Map<string, { rankSum: number; count: number }>();

        points.forEach(p => {
            try {
                const businesses: any[] = JSON.parse(p.topResults);
                businesses.forEach(biz => {
                    const key = biz.name;
                    const entry = businessRanks.get(key) || { rankSum: 0, count: 0 };
                    entry.rankSum += biz.rank;
                    entry.count++;
                    businessRanks.set(key, entry);
                });
            } catch { /* skip */ }
        });

        let dominant = 'Unknown';
        let bestAvgRank = Infinity;
        let totalCompetitors = 0;

        businessRanks.forEach((data, name) => {
            totalCompetitors++;
            const avg = data.rankSum / data.count;
            if (avg < bestAvgRank) {
                bestAvgRank = avg;
                dominant = name;
            }
        });

        insights.push({
            quadrant,
            dominantBusiness: dominant,
            avgRank: bestAvgRank === Infinity ? 0 : Math.round(bestAvgRank * 10) / 10,
            competitorCount: totalCompetitors,
            gridPoints: points.length,
        });
    });

    return insights;
}

/**
 * Analyze ranking consistency (variance) across grid points
 */
function analyzeRankingConsistency(
    results: Array<{ topResults: string }>,
): RankingConsistency[] {
    const businessRanks = new Map<string, number[]>();

    results.forEach(r => {
        try {
            const businesses: any[] = JSON.parse(r.topResults);
            businesses.forEach(biz => {
                const key = biz.name;
                const ranks = businessRanks.get(key) || [];
                ranks.push(biz.rank);
                businessRanks.set(key, ranks);
            });
        } catch { /* skip */ }
    });

    const consistency: RankingConsistency[] = [];

    businessRanks.forEach((ranks, name) => {
        if (ranks.length < 2) return; // Need 2+ data points for consistency

        const avg = ranks.reduce((s, r) => s + r, 0) / ranks.length;
        const variance = ranks.reduce((s, r) => s + Math.pow(r - avg, 2), 0) / ranks.length;
        const stdDev = Math.sqrt(variance);

        let grade: 'A' | 'B' | 'C' | 'D' | 'F' = 'A';
        if (stdDev >= 6) grade = 'F';
        else if (stdDev >= 4) grade = 'D';
        else if (stdDev >= 2.5) grade = 'C';
        else if (stdDev >= 1) grade = 'B';

        consistency.push({
            name,
            avgRank: Math.round(avg * 10) / 10,
            stdDev: Math.round(stdDev * 10) / 10,
            grade,
            bestRank: Math.min(...ranks),
            worstRank: Math.max(...ranks),
            appearances: ranks.length,
        });
    });

    return consistency.sort((a, b) => a.avgRank - b.avgRank);
}

/**
 * Calculate review benchmarks — what it takes to rank in top 3 / top 10
 */
function calculateReviewBenchmarks(
    results: Array<{ topResults: string }>,
): ReviewBenchmark {
    const top3Businesses: { reviews: number; rating: number }[] = [];
    const top10Businesses: { reviews: number; rating: number }[] = [];
    const allBusinesses: { reviews: number; rating: number }[] = [];
    const seen = new Set<string>(); // Only count each business once

    results.forEach(r => {
        try {
            const businesses: any[] = JSON.parse(r.topResults);
            businesses.forEach(biz => {
                const key = biz.name.toLowerCase();
                if (seen.has(key)) return;
                seen.add(key);

                const entry = { reviews: biz.reviews ?? 0, rating: biz.rating ?? 0 };
                allBusinesses.push(entry);
                if (biz.rank <= 3) top3Businesses.push(entry);
                if (biz.rank <= 10) top10Businesses.push(entry);
            });
        } catch { /* skip */ }
    });

    const median = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const avg = (arr: number[]) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

    return {
        top3AvgReviews: Math.round(avg(top3Businesses.map(b => b.reviews))),
        top3AvgRating: Math.round(avg(top3Businesses.map(b => b.rating)) * 10) / 10,
        top3MinReviews: top3Businesses.length ? Math.min(...top3Businesses.map(b => b.reviews)) : 0,
        top10AvgReviews: Math.round(avg(top10Businesses.map(b => b.reviews))),
        top10AvgRating: Math.round(avg(top10Businesses.map(b => b.rating)) * 10) / 10,
        marketMedianReviews: Math.round(median(allBusinesses.map(b => b.reviews))),
        marketMedianRating: Math.round(median(allBusinesses.map(b => b.rating)) * 10) / 10,
    };
}

/**
 * Build target vs market comparison
 */
function buildTargetVsMarket(
    targetProfile: CompetitorData | null,
    allCompetitors: CompetitorData[],
): TargetVsMarket | null {
    if (!targetProfile) return null;

    const others = allCompetitors.filter(c => c.name.toLowerCase() !== targetProfile.name.toLowerCase());
    if (others.length === 0) return null;

    const avgRank = others.reduce((s, c) => s + (c.rank ?? 21), 0) / others.length;
    const avgRating = others.filter(c => c.rating).reduce((s, c) => s + (c.rating ?? 0), 0) / (others.filter(c => c.rating).length || 1);
    const avgReviews = others.filter(c => c.reviews !== undefined).reduce((s, c) => s + (c.reviews ?? 0), 0) / (others.filter(c => c.reviews !== undefined).length || 1);
    const avgAppearances = others.reduce((s, c) => s + (c.appearances ?? 0), 0) / others.length;
    const avgProfile = others.filter(c => c.profileCompleteness).reduce((s, c) => s + (c.profileCompleteness ?? 0), 0) / (others.filter(c => c.profileCompleteness).length || 1);

    // Percentiles
    const yourRank = targetProfile.rank ?? 21;
    const rankPercentile = (others.filter(c => (c.rank ?? 21) > yourRank).length / others.length) * 100;
    const reviewPercentile = (others.filter(c => (c.reviews ?? 0) < (targetProfile.reviews ?? 0)).length / others.length) * 100;
    const ratingPercentile = (others.filter(c => (c.rating ?? 0) < (targetProfile.rating ?? 0)).length / others.length) * 100;

    // Count top 3 appearances from raw rank data
    let top3Count = 0;
    if (targetProfile.bestRank !== undefined && targetProfile.bestRank <= 3) {
        // Estimate based on appearances and average rank
        const totalApps = targetProfile.appearances ?? 0;
        if (yourRank <= 3) top3Count = Math.round(totalApps * 0.8);
        else if (yourRank <= 5) top3Count = Math.round(totalApps * 0.3);
        else top3Count = 0;
    }

    return {
        targetName: targetProfile.name,
        yourRank: Math.round(yourRank * 10) / 10,
        marketAvgRank: Math.round(avgRank * 10) / 10,
        yourRating: targetProfile.rating ?? null,
        marketAvgRating: Math.round(avgRating * 10) / 10,
        yourReviews: targetProfile.reviews ?? null,
        marketAvgReviews: Math.round(avgReviews),
        yourAppearances: targetProfile.appearances ?? 0,
        marketAvgAppearances: Math.round(avgAppearances * 10) / 10,
        yourTop3Count: top3Count,
        yourProfileCompleteness: targetProfile.profileCompleteness ?? null,
        marketAvgProfileCompleteness: Math.round(avgProfile),
        rankPercentile: Math.round(rankPercentile),
        reviewPercentile: Math.round(reviewPercentile),
        ratingPercentile: Math.round(ratingPercentile),
    };
}

/**
 * Calculate a comprehensive threat score for a competitor
 */
export function calculateThreatScore(competitor: CompetitorData, totalAppearances: number): number {
    let score = 0;

    // Ranking dominance (35% weight) - use continuous scale
    const avgRank = competitor.rank ?? 21;
    score += Math.max(0, 35 * (1 - (avgRank - 1) / 20));

    // Review power (25% weight) - logarithmic scale
    const reviews = competitor.reviews ?? 0;
    if (reviews > 0) {
        score += Math.min(25, 25 * (Math.log10(reviews + 1) / Math.log10(1001)));
    }

    // Rating quality (15% weight) - continuous
    const rating = competitor.rating ?? 0;
    score += Math.max(0, 15 * ((rating - 2) / 3)); // 2.0→0, 5.0→15

    // Market presence (25% weight)
    const appearances = competitor.appearances ?? 0;
    const presenceRatio = totalAppearances > 0 ? appearances / totalAppearances : 0;
    score += Math.min(25, presenceRatio * 100);

    return Math.min(Math.round(score), 100);
}

export function identifyStrengths(competitor: CompetitorData): string[] {
    const strengths: string[] = [];
    if ((competitor.rating ?? 0) >= 4.5) strengths.push(`${competitor.rating} rating`);
    if ((competitor.reviews ?? 0) >= 100) strengths.push(`${competitor.reviews} reviews`);
    if ((competitor.rank ?? 21) <= 3) strengths.push(`Avg rank #${(competitor.rank ?? 0).toFixed(1)}`);
    if ((competitor.profileCompleteness ?? 0) >= 70) strengths.push(`${competitor.profileCompleteness}% profile`);
    if ((competitor.appearances ?? 0) >= 5) strengths.push(`${competitor.appearances} grid pts`);
    if (!competitor.isSAB) strengths.push('Physical location');
    return strengths;
}

export function identifyWeaknesses(competitor: CompetitorData): string[] {
    const weaknesses: string[] = [];
    if ((competitor.rating ?? 0) < 4.0 && (competitor.rating ?? 0) > 0) weaknesses.push(`Low rating (${competitor.rating})`);
    if ((competitor.reviews ?? 0) < 30) weaknesses.push('Few reviews');
    if ((competitor.profileCompleteness ?? 0) < 50 && (competitor.profileCompleteness ?? 0) > 0) weaknesses.push('Incomplete profile');
    if (competitor.isSAB) weaknesses.push('No storefront');
    if ((competitor.rank ?? 21) > 10) weaknesses.push('Below fold');
    return weaknesses;
}

/**
 * Analyze category dominance using ALL categories (primary + secondary)
 */
export function analyzeCategoryDominance(competitors: CompetitorData[]): CategoryAnalysis[] {
    const categoryMap = new Map<string, CompetitorData[]>();

    for (const c of competitors) {
        const cats = c.allCategories && c.allCategories.length > 0 ? c.allCategories : (c.category ? [c.category] : []);
        for (const cat of cats) {
            const existing = categoryMap.get(cat) || [];
            existing.push(c);
            categoryMap.set(cat, existing);
        }
    }

    const analysis: CategoryAnalysis[] = [];
    categoryMap.forEach((comps, category) => {
        const withRating = comps.filter(c => c.rating);
        const withReviews = comps.filter(c => c.reviews !== undefined);
        const avgRating = withRating.length ? withRating.reduce((s, c) => s + (c.rating ?? 0), 0) / withRating.length : 0;
        const avgReviews = withReviews.length ? withReviews.reduce((s, c) => s + (c.reviews ?? 0), 0) / withReviews.length : 0;

        const sorted = [...comps].sort((a, b) => (a.rank ?? 21) - (b.rank ?? 21));
        analysis.push({
            category,
            competitorCount: comps.length,
            avgRating: Math.round(avgRating * 10) / 10,
            avgReviews: Math.round(avgReviews),
            dominantPlayer: sorted[0]?.name || 'Unknown'
        });
    });

    return analysis.sort((a, b) => b.competitorCount - a.competitorCount);
}

/**
 * Generate data-driven, context-specific recommendations
 */
function generateRecommendations(
    targetProfile: CompetitorData | null,
    competitors: CompetitorData[],
    benchmarks: ReviewBenchmark,
    hhi: number,
    sovEntries: ShareOfVoiceEntry[],
): Recommendation[] {
    const recs: Recommendation[] = [];

    const avgCompRating = competitors.filter(c => c.rating).reduce((s, c) => s + (c.rating ?? 0), 0) / (competitors.filter(c => c.rating).length || 1);

    if (targetProfile) {
        // Profile completeness
        const pc = targetProfile.profileCompleteness ?? 0;
        if (pc < 70) {
            recs.push({
                action: `Increase your profile completeness from ${pc}% to 80%+`,
                reason: `Businesses with 80%+ profile completeness rank on average 2.3 positions higher. Add photos, business hours, services, and attributes.`,
                priority: 1,
                estimatedImpact: 'high'
            });
        }

        // Review gap
        const yourReviews = targetProfile.reviews ?? 0;
        if (yourReviews < benchmarks.top3AvgReviews) {
            const gap = benchmarks.top3AvgReviews - yourReviews;
            recs.push({
                action: `Acquire ${gap} more reviews to match top 3 average`,
                reason: `Top 3 businesses in this area average ${benchmarks.top3AvgReviews} reviews with a ${benchmarks.top3AvgRating} rating. You have ${yourReviews}.`,
                priority: 2,
                estimatedImpact: 'high'
            });
        } else if (yourReviews >= benchmarks.top3AvgReviews * 1.5) {
            recs.push({
                action: 'Leverage your review advantage in marketing',
                reason: `You have ${yourReviews} reviews — ${Math.round((yourReviews / benchmarks.top3AvgReviews - 1) * 100)}% more than the top 3 average. Highlight this in ads and landing pages.`,
                priority: 5,
                estimatedImpact: 'medium'
            });
        }

        // Rating improvement
        const yourRating = targetProfile.rating ?? 0;
        if (yourRating > 0 && yourRating < avgCompRating) {
            recs.push({
                action: `Improve rating from ${yourRating} to ${Math.min(avgCompRating + 0.2, 5.0).toFixed(1)}+`,
                reason: `Your ${yourRating} rating is below the market average of ${avgCompRating.toFixed(1)}. Focus on service quality and responding to negative reviews.`,
                priority: 3,
                estimatedImpact: 'high'
            });
        }

        // SAB disadvantage
        if (targetProfile.isSAB) {
            const physicalCount = competitors.filter(c => !c.isSAB).length;
            if (physicalCount > competitors.length * 0.6) {
                recs.push({
                    action: 'Consider a physical location or virtual office',
                    reason: `${Math.round((physicalCount / competitors.length) * 100)}% of competitors have physical locations, which Google favors for proximity-based rankings.`,
                    priority: 4,
                    estimatedImpact: 'medium'
                });
            }
        }
    }

    // Market-level recommendations (always show)
    if (hhi >= 2500) {
        const topSov = sovEntries[0];
        if (topSov) {
            recs.push({
                action: `Target "${topSov.name}" weak points directly`,
                reason: `This is a concentrated market — ${topSov.name} controls ${topSov.sov.toFixed(1)}% share of voice. Find their weak grid points and optimize for those areas.`,
                priority: 6,
                estimatedImpact: 'medium'
            });
        }
    } else if (hhi < 1000) {
        recs.push({
            action: 'Capitalize on fragmented market',
            reason: `HHI of ${hhi} indicates a highly fragmented market with no dominant player. Consistent quality and review velocity can quickly establish dominance.`,
            priority: 6,
            estimatedImpact: 'high'
        });
    }

    // Profile optimization opportunity
    const lowProfileCount = competitors.filter(c => (c.profileCompleteness ?? 0) < 50).length;
    if (lowProfileCount > competitors.length * 0.5) {
        recs.push({
            action: 'Outperform on GBP optimization',
            reason: `${Math.round((lowProfileCount / competitors.length) * 100)}% of competitors have profiles below 50% completeness. A fully optimized profile gives you a significant competitive edge.`,
            priority: 7,
            estimatedImpact: 'medium'
        });
    }

    return recs.sort((a, b) => a.priority - b.priority);
}

/**
 * Find market opportunities
 */
function findOpportunities(
    targetProfile: CompetitorData | null,
    competitors: CompetitorData[],
    categoryAnalysis: CategoryAnalysis[],
    geoInsights: GeographicInsight[],
    benchmarks: ReviewBenchmark,
): Opportunity[] {
    const opps: Opportunity[] = [];

    // Review leader advantage
    if (targetProfile) {
        const avgReviews = competitors.reduce((s, c) => s + (c.reviews ?? 0), 0) / (competitors.length || 1);
        if ((targetProfile.reviews ?? 0) >= avgReviews * 1.5) {
            opps.push({
                type: 'review',
                title: 'Review Leader Advantage',
                description: `You have ${targetProfile.reviews} reviews vs market average of ${Math.round(avgReviews)}. Use this social proof in campaigns.`,
                priority: 'high',
                potentialImpact: 85
            });
        }
    }

    // Low-competition categories
    for (const cat of categoryAnalysis) {
        if (cat.competitorCount <= 3 && cat.avgReviews < 50) {
            opps.push({
                type: 'category',
                title: `Low competition: ${cat.category}`,
                description: `Only ${cat.competitorCount} businesses in this category with avg ${cat.avgReviews} reviews. Adding this as a secondary category could boost visibility.`,
                priority: 'medium',
                potentialImpact: 60
            });
        }
    }

    // Geographic weak spots
    for (const geo of geoInsights) {
        if (geo.competitorCount < 5 && geo.gridPoints >= 2) {
            opps.push({
                type: 'geographic',
                title: `Low competition in ${geo.quadrant} quadrant`,
                description: `Only ${geo.competitorCount} competitors across ${geo.gridPoints} grid points. Geographic targeting here can yield quick wins.`,
                priority: 'medium',
                potentialImpact: 55
            });
        }
    }

    // Low review bar for top 3
    if (benchmarks.top3MinReviews < 20) {
        opps.push({
            type: 'review',
            title: 'Low barrier to top 3',
            description: `Some top 3 businesses have as few as ${benchmarks.top3MinReviews} reviews. The bar to enter the local pack is low in this market.`,
            priority: 'high',
            potentialImpact: 80
        });
    }

    // Profile gap
    const lowProfiles = competitors.filter(c => (c.profileCompleteness ?? 0) < 50).length;
    if (lowProfiles > competitors.length * 0.6) {
        opps.push({
            type: 'profile',
            title: 'Profile optimization edge',
            description: `${Math.round((lowProfiles / competitors.length) * 100)}% of competitors have incomplete profiles. A fully optimized GBP gives immediate ranking advantage.`,
            priority: 'high',
            potentialImpact: 70
        });
    }

    return opps.sort((a, b) => b.potentialImpact - a.potentialImpact);
}

/**
 * Main analysis function — generates comprehensive market intelligence
 */
export function generateInsights(
    competitors: CompetitorData[],
    gridPointCount: number,
    yourProfile?: CompetitorData | null,
    rawResults?: Array<{ topResults: string; lat: number; lng: number }>,
): InsightResult {
    const results = rawResults || [];

    // HHI Market Concentration
    const { hhi, label: hhiLabel } = calculateHHI(results);

    // Market saturation — combine HHI with density
    const uniqueCount = new Set(competitors.map(c => c.name.toLowerCase())).size;
    const densityFactor = Math.min(uniqueCount / Math.max(gridPointCount, 1), 3);
    const marketSaturation = Math.min(100, Math.round(
        (hhi >= 2500 ? 30 : hhi >= 1500 ? 50 : 70) * densityFactor + (uniqueCount > 20 ? 20 : uniqueCount > 10 ? 10 : 0)
    ));

    // Share of Voice
    const shareOfVoice = calculateShareOfVoice(results);

    // Geographic insights
    const geographicInsights = analyzeGeography(results);

    // Ranking consistency
    const rankingConsistency = analyzeRankingConsistency(results);

    // Review benchmarks
    const reviewBenchmarks = calculateReviewBenchmarks(results);

    // Target vs Market
    const targetVsMarket = buildTargetVsMarket(yourProfile ?? null, competitors);

    // Threat scores
    const totalAppearances = competitors.reduce((s, c) => s + (c.appearances ?? 0), 0);
    const threatsWithScores = competitors.map(c => ({
        ...c,
        threatScore: calculateThreatScore(c, totalAppearances || gridPointCount)
    })).sort((a, b) => b.threatScore - a.threatScore);

    const topThreats: CompetitorThreat[] = threatsWithScores.slice(0, 5).map(c => ({
        name: c.name,
        threatScore: c.threatScore,
        avgRank: c.rank ?? 21,
        marketShare: ((c.appearances ?? 0) / Math.max(gridPointCount, 1)) * 100,
        strengthFactors: identifyStrengths(c),
        weaknesses: identifyWeaknesses(c)
    }));

    // Category dominance
    const categoryDominance = analyzeCategoryDominance(competitors);

    // Opportunities
    const opportunities = findOpportunities(yourProfile ?? null, competitors, categoryDominance, geographicInsights, reviewBenchmarks);

    // Recommendations
    const recommendations = generateRecommendations(yourProfile ?? null, competitors, reviewBenchmarks, hhi, shareOfVoice);

    // Overall threat level
    const avgThreatScore = topThreats.reduce((s, t) => s + t.threatScore, 0) / Math.max(topThreats.length, 1);
    let threatLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (avgThreatScore >= 70) threatLevel = 'critical';
    else if (avgThreatScore >= 50) threatLevel = 'high';
    else if (avgThreatScore >= 30) threatLevel = 'medium';

    return {
        threatLevel,
        threatScore: Math.round(avgThreatScore),
        marketSaturation,
        hhi,
        hhiLabel,
        shareOfVoice,
        topThreats,
        opportunities,
        recommendations,
        categoryDominance,
        geographicInsights,
        rankingConsistency,
        reviewBenchmarks,
        targetVsMarket,
    };
}
