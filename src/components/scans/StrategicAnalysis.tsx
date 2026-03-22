import { useMemo } from 'react';
import { Card, Badge } from '@/components/ui';
import {
    Brain, TrendingUp, AlertTriangle, Trophy, Zap, Target, Shield, ArrowRight,
    Activity, Users, Gauge, Crown, MapPin, Star, BarChart3, Crosshair,
    ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import type { CompetitorProfile, CategoryMetrics, ReviewMetrics } from '@/lib/analysis';
import {
    generateInsights,
    type CompetitorData,
    type InsightResult,
    type TargetVsMarket
} from '@/lib/insightEngine';

interface StrategicAnalysisProps {
    competitors: CompetitorProfile[];
    categoryMetrics: CategoryMetrics;
    reviewMetrics: ReviewMetrics;
    targetBusinessName?: string;
    rawResults?: Array<{ topResults: string; lat: number; lng: number }>;
}

export function StrategicAnalysis({ competitors, categoryMetrics, reviewMetrics, targetBusinessName, rawResults }: StrategicAnalysisProps) {
    const insights: InsightResult | null = useMemo(() => {
        if (!competitors.length) return null;

        // Find the target business profile from the RAW results (not filtered competitors)
        let targetProfile: CompetitorData | null = null;
        if (targetBusinessName && rawResults) {
            // Build target profile from raw data since it's excluded from competitors
            const targetKey = targetBusinessName.toLowerCase();
            let appearances = 0;
            let rankSum = 0;
            let bestRank = Infinity;
            let worstRank = 0;
            let rating: number | undefined;
            let reviews: number | undefined;
            let category: string | undefined;
            let allCategories: string[] | undefined;
            let profileCompleteness: number | undefined;
            let isSAB: boolean | undefined;

            rawResults.forEach(r => {
                try {
                    const businesses = JSON.parse(r.topResults);
                    businesses.forEach((biz: any) => {
                        if (biz.name.toLowerCase().includes(targetKey)) {
                            appearances++;
                            rankSum += biz.rank;
                            bestRank = Math.min(bestRank, biz.rank);
                            worstRank = Math.max(worstRank, biz.rank);
                            if (biz.rating !== undefined) rating = biz.rating;
                            if (biz.reviews !== undefined) reviews = biz.reviews;
                            if (biz.category) category = biz.category;
                            if (biz.allCategories) allCategories = biz.allCategories;
                            if (biz.profileCompleteness !== undefined) profileCompleteness = biz.profileCompleteness;
                            if (biz.isSAB !== undefined) isSAB = biz.isSAB;
                        }
                    });
                } catch { /* skip */ }
            });

            if (appearances > 0) {
                targetProfile = {
                    name: targetBusinessName,
                    rank: rankSum / appearances,
                    rating,
                    reviews,
                    category,
                    allCategories,
                    profileCompleteness,
                    isSAB,
                    appearances,
                    bestRank: bestRank === Infinity ? undefined : bestRank,
                    worstRank: worstRank || undefined,
                };
            }
        }

        const competitorData: CompetitorData[] = competitors.map(c => ({
            name: c.name,
            rank: c.avgRank,
            rating: c.rating,
            reviews: c.reviews,
            address: c.address,
            category: c.category,
            allCategories: c.allCategories,
            profileCompleteness: c.profileCompleteness,
            isSAB: c.isSAB,
            yearsInBusiness: c.yearsInBusiness,
            appearances: c.appearances,
            bestRank: c.bestRank,
            worstRank: c.worstRank,
        }));

        return generateInsights(competitorData, competitors.length, targetProfile, rawResults);
    }, [competitors, targetBusinessName, rawResults]);

    if (!competitors.length || !insights) {
        return (
            <div className="p-8 text-center bg-gray-50 rounded-2xl border border-gray-200">
                <Brain className="mx-auto text-gray-400 mb-2" size={32} />
                <h3 className="font-semibold text-gray-900">No Insights Available</h3>
                <p className="text-sm text-gray-500">Not enough data to generate strategic insights.</p>
            </div>
        );
    }

    // Market stage analysis
    const totalReviews = reviewMetrics.totalReviews;
    const avgRating = competitors.reduce((sum, c) => sum + (c.rating || 0), 0) / competitors.length;
    const hasDominantPlayer = competitors.some(c => (c.reviews || 0) > totalReviews * 0.4);

    let marketStage = {
        title: "Established Market",
        description: "High review volume and stable leaders. Disruption requires niche differentiation.",
        color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", icon: Trophy
    };

    if (totalReviews < 100) {
        marketStage = {
            title: "Emerging Market",
            description: "Low competition volume. High opportunity for rapid dominance via review acquisition.",
            color: "text-green-600", bg: "bg-green-50", border: "border-green-200", icon: Zap
        };
    } else if (hasDominantPlayer) {
        marketStage = {
            title: "Monopolized Market",
            description: "One dominant player holds >40% of social proof. Direct confrontation is costly.",
            color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200", icon: Target
        };
    } else if (avgRating < 4.2) {
        marketStage = {
            title: "Volatile Market",
            description: "Customer satisfaction is inconsistent. Quality service can easily capture market share.",
            color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: AlertTriangle
        };
    }

    const threatStyles = {
        low: { bg: 'bg-green-500', text: 'text-green-600', label: 'Low Threat', hex: '#22c55e' },
        medium: { bg: 'bg-amber-500', text: 'text-amber-600', label: 'Medium Threat', hex: '#f59e0b' },
        high: { bg: 'bg-orange-500', text: 'text-orange-600', label: 'High Threat', hex: '#f97316' },
        critical: { bg: 'bg-red-500', text: 'text-red-600', label: 'Critical Threat', hex: '#ef4444' }
    };
    const threatStyle = threatStyles[insights.threatLevel];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Target vs Market Card */}
            {insights.targetVsMarket && (
                <TargetVsMarketCard data={insights.targetVsMarket} />
            )}

            {/* Header Row: Threat + HHI + Market Stage */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-5 text-white">
                    <div className="flex items-center gap-2 mb-3">
                        <Shield size={18} className="text-slate-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Threat Assessment</span>
                    </div>
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-2xl font-black" style={{ color: threatStyle.hex }}>{insights.threatScore}</p>
                            <p className="text-xs text-slate-400 font-bold uppercase mt-1">{threatStyle.label}</p>
                        </div>
                        <div className={`w-12 h-12 rounded-xl ${threatStyle.bg} flex items-center justify-center`}>
                            <Activity size={24} className="text-white" />
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                        <Gauge size={18} className="text-indigo-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">HHI Index</span>
                    </div>
                    <p className="text-2xl font-black text-gray-900">{insights.hhi.toLocaleString()}</p>
                    <p className="text-xs text-gray-500 font-bold uppercase mt-1">{insights.hhiLabel}</p>
                </div>

                <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                        <Users size={18} className="text-indigo-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Market Saturation</span>
                    </div>
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-2xl font-black text-gray-900">{insights.marketSaturation}%</p>
                            <p className="text-xs text-gray-500 font-bold uppercase mt-1">
                                {insights.marketSaturation > 70 ? 'Highly Saturated' : insights.marketSaturation > 40 ? 'Moderate' : 'Low Competition'}
                            </p>
                        </div>
                        <div className="w-16 h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ${insights.marketSaturation > 70 ? 'bg-red-500' : insights.marketSaturation > 40 ? 'bg-amber-500' : 'bg-green-500'}`}
                                style={{ width: `${insights.marketSaturation}%` }}
                            />
                        </div>
                    </div>
                </div>

                <div className={`${marketStage.bg} rounded-2xl p-5 border ${marketStage.border}`}>
                    <div className="flex items-center gap-2 mb-3">
                        <marketStage.icon size={18} className={marketStage.color} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${marketStage.color}`}>Market Stage</span>
                    </div>
                    <p className={`font-bold ${marketStage.color} text-lg`}>{marketStage.title}</p>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">{marketStage.description}</p>
                </div>
            </div>

            {/* Share of Voice */}
            {insights.shareOfVoice.length > 0 && (
                <Card className="p-6 border-none ring-1 ring-gray-100">
                    <div className="flex items-center gap-2 mb-5">
                        <BarChart3 className="text-blue-600" size={20} />
                        <h3 className="font-black text-gray-900">Share of Voice (CTR-Weighted)</h3>
                        <span className="text-[10px] text-gray-400 font-medium ml-2">Who gets the most clicks?</span>
                    </div>
                    <div className="space-y-2">
                        {insights.shareOfVoice.slice(0, 10).map((entry, i) => {
                            const isTarget = targetBusinessName && entry.name.toLowerCase().includes(targetBusinessName.toLowerCase());
                            return (
                                <div key={entry.name} className={`flex items-center gap-3 p-2 rounded-lg ${isTarget ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'}`}>
                                    <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${i < 3 ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                        {i + 1}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-900 text-sm truncate">{entry.name}</span>
                                            {isTarget && <Badge variant="blue" className="text-[8px]">YOU</Badge>}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${isTarget ? 'bg-blue-500' : i < 3 ? 'bg-indigo-500' : 'bg-gray-400'}`}
                                                    style={{ width: `${Math.min(entry.sov * 2, 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-black text-gray-700 w-14 text-right">{entry.sov.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="text-[10px] text-gray-400">Avg #{entry.avgRank.toFixed(1)}</div>
                                        <div className="text-[10px] text-gray-400">{entry.appearances} pts</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* Review Benchmarks + Geographic Insights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Review Benchmarks */}
                <Card className="p-6 border-none ring-1 ring-gray-100">
                    <div className="flex items-center gap-2 mb-5">
                        <Star className="text-amber-500" size={20} />
                        <h3 className="font-black text-gray-900">Review Benchmarks</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                            <div className="text-[10px] text-emerald-600 font-black uppercase tracking-wider mb-1">To Rank in Top 3</div>
                            <div className="flex items-center gap-4">
                                <div>
                                    <span className="text-2xl font-black text-emerald-700">{insights.reviewBenchmarks.top3AvgReviews}</span>
                                    <span className="text-xs text-emerald-600 ml-1">reviews</span>
                                </div>
                                <div className="text-gray-300">|</div>
                                <div>
                                    <span className="text-2xl font-black text-emerald-700">{insights.reviewBenchmarks.top3AvgRating}</span>
                                    <span className="text-xs text-emerald-600 ml-1">rating</span>
                                </div>
                            </div>
                            <div className="text-[10px] text-emerald-500 mt-1">Minimum: {insights.reviewBenchmarks.top3MinReviews} reviews</div>
                        </div>
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-100">
                            <div className="text-[10px] text-amber-600 font-black uppercase tracking-wider mb-1">To Rank in Top 10</div>
                            <div className="flex items-center gap-4">
                                <div>
                                    <span className="text-xl font-black text-amber-700">{insights.reviewBenchmarks.top10AvgReviews}</span>
                                    <span className="text-xs text-amber-600 ml-1">reviews</span>
                                </div>
                                <div className="text-gray-300">|</div>
                                <div>
                                    <span className="text-xl font-black text-amber-700">{insights.reviewBenchmarks.top10AvgRating}</span>
                                    <span className="text-xs text-amber-600 ml-1">rating</span>
                                </div>
                            </div>
                        </div>
                        <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-500">
                            <span className="font-bold">Market median:</span> {insights.reviewBenchmarks.marketMedianReviews} reviews, {insights.reviewBenchmarks.marketMedianRating} rating
                        </div>
                    </div>
                </Card>

                {/* Geographic Dominance */}
                {insights.geographicInsights.length > 0 && (
                    <Card className="p-6 border-none ring-1 ring-gray-100">
                        <div className="flex items-center gap-2 mb-5">
                            <Crosshair className="text-purple-600" size={20} />
                            <h3 className="font-black text-gray-900">Geographic Dominance</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {insights.geographicInsights.map(geo => (
                                <div key={geo.quadrant} className="p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-black text-gray-700">{geo.quadrant}</span>
                                        <MapPin size={14} className="text-gray-400" />
                                    </div>
                                    <p className="text-xs font-bold text-gray-900 truncate" title={geo.dominantBusiness}>{geo.dominantBusiness}</p>
                                    <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
                                        <span>#{geo.avgRank} avg</span>
                                        <span>{geo.competitorCount} biz</span>
                                        <span>{geo.gridPoints} pts</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}
            </div>

            {/* Ranking Consistency */}
            {insights.rankingConsistency.length > 0 && (
                <Card className="p-6 border-none ring-1 ring-gray-100">
                    <div className="flex items-center gap-2 mb-5">
                        <Activity className="text-indigo-600" size={20} />
                        <h3 className="font-black text-gray-900">Ranking Consistency</h3>
                        <span className="text-[10px] text-gray-400 font-medium ml-2">Who ranks consistently vs erratically?</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">
                                    <th className="pb-3 pr-4">Business</th>
                                    <th className="pb-3 pr-4 text-center">Avg Rank</th>
                                    <th className="pb-3 pr-4 text-center">Range</th>
                                    <th className="pb-3 pr-4 text-center">Std Dev</th>
                                    <th className="pb-3 text-center">Grade</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {insights.rankingConsistency.slice(0, 10).map((entry) => {
                                    const isTarget = targetBusinessName && entry.name.toLowerCase().includes(targetBusinessName.toLowerCase());
                                    const gradeColors: Record<string, string> = {
                                        A: 'bg-emerald-100 text-emerald-700',
                                        B: 'bg-blue-100 text-blue-700',
                                        C: 'bg-amber-100 text-amber-700',
                                        D: 'bg-orange-100 text-orange-700',
                                        F: 'bg-red-100 text-red-700',
                                    };
                                    return (
                                        <tr key={entry.name} className={`hover:bg-gray-50 ${isTarget ? 'bg-blue-50/40' : ''}`}>
                                            <td className="py-3 pr-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-gray-900 text-xs truncate max-w-[180px]">{entry.name}</span>
                                                    {isTarget && <Badge variant="blue" className="text-[8px]">YOU</Badge>}
                                                </div>
                                            </td>
                                            <td className="py-3 pr-4 text-center font-bold text-gray-700">#{entry.avgRank}</td>
                                            <td className="py-3 pr-4 text-center text-xs text-gray-500">#{entry.bestRank}-#{entry.worstRank}</td>
                                            <td className="py-3 pr-4 text-center text-xs text-gray-500">{entry.stdDev}</td>
                                            <td className="py-3 text-center">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${gradeColors[entry.grade]}`}>
                                                    {entry.grade}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-3 text-[10px] text-gray-400">
                        A = Very consistent | B = Stable | C = Variable | D = Unstable | F = Wildly inconsistent
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Threats */}
                <Card className="p-6 border-none ring-1 ring-gray-100">
                    <div className="flex items-center gap-2 mb-5">
                        <AlertTriangle className="text-red-500" size={20} />
                        <h3 className="font-black text-gray-900">Top Threats</h3>
                    </div>
                    <div className="space-y-3">
                        {insights.topThreats.slice(0, 5).map((threat, i) => (
                            <div key={threat.name} className="p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                            {i + 1}
                                        </span>
                                        <span className="font-bold text-gray-900 text-sm truncate max-w-[150px]">{threat.name}</span>
                                    </div>
                                    <span className={`text-xs font-black px-2 py-0.5 rounded ${threat.threatScore >= 60 ? 'bg-red-100 text-red-700' : threat.threatScore >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                        {threat.threatScore}
                                    </span>
                                </div>
                                <div className="flex gap-1 flex-wrap">
                                    {threat.strengthFactors.slice(0, 3).map((s, j) => (
                                        <span key={j} className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">{s}</span>
                                    ))}
                                    {threat.weaknesses.slice(0, 2).map((w, j) => (
                                        <span key={`w-${j}`} className="text-[9px] bg-red-50 text-red-500 px-1.5 py-0.5 rounded font-bold">{w}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>

                {/* Actionable Recommendations */}
                <Card className="p-6 border-none ring-1 ring-gray-100">
                    <div className="flex items-center gap-2 mb-5">
                        <Brain className="text-emerald-600" size={20} />
                        <h3 className="font-black text-gray-900">Recommendations</h3>
                    </div>
                    <div className="space-y-3">
                        {insights.recommendations.length > 0 ? (
                            insights.recommendations.map((rec, i) => (
                                <div key={i} className={`p-4 rounded-xl border ${rec.estimatedImpact === 'high' ? 'bg-emerald-50 border-emerald-100' : rec.estimatedImpact === 'medium' ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                                    <div className="flex items-start gap-3">
                                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${rec.estimatedImpact === 'high' ? 'bg-emerald-500' : rec.estimatedImpact === 'medium' ? 'bg-amber-500' : 'bg-gray-400'} text-white`}>
                                            <ArrowRight size={12} />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900 text-sm mb-1">{rec.action}</p>
                                            <p className="text-xs text-gray-600 leading-relaxed">{rec.reason}</p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-gray-400">
                                <Zap size={32} className="mx-auto mb-2 opacity-30" />
                                <p className="text-sm font-bold">All optimized!</p>
                                <p className="text-xs">No urgent recommendations at this time.</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>

            {/* Opportunities */}
            {insights.opportunities.length > 0 && (
                <Card className="p-6 border-none ring-1 ring-gray-100">
                    <div className="flex items-center gap-2 mb-5">
                        <TrendingUp className="text-blue-600" size={20} />
                        <h3 className="font-black text-gray-900">Market Opportunities</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {insights.opportunities.map((opp, i) => (
                            <div key={i} className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                                <div className="flex items-center justify-between mb-2">
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${opp.priority === 'high' ? 'text-emerald-600' : opp.priority === 'medium' ? 'text-amber-600' : 'text-gray-500'}`}>
                                        {opp.priority} priority
                                    </span>
                                    <span className="text-xs font-black text-blue-600">{opp.potentialImpact}%</span>
                                </div>
                                <p className="font-bold text-gray-900 text-sm mb-1">{opp.title}</p>
                                <p className="text-xs text-gray-600 leading-relaxed">{opp.description}</p>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Category Dominance */}
            {insights.categoryDominance.length > 0 && (
                <Card className="p-6 border-none ring-1 ring-gray-100">
                    <div className="flex items-center gap-2 mb-5">
                        <Crown className="text-purple-600" size={20} />
                        <h3 className="font-black text-gray-900">Category Dominance</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[10px] font-black uppercase tracking-widest text-gray-400 border-b border-gray-100">
                                    <th className="pb-3 pr-4">Category</th>
                                    <th className="pb-3 pr-4">Businesses</th>
                                    <th className="pb-3 pr-4">Avg Rating</th>
                                    <th className="pb-3 pr-4">Avg Reviews</th>
                                    <th className="pb-3">Leader</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {insights.categoryDominance.slice(0, 8).map((cat) => (
                                    <tr key={cat.category} className="hover:bg-gray-50">
                                        <td className="py-3 pr-4 font-bold text-gray-900">{cat.category}</td>
                                        <td className="py-3 pr-4 text-gray-600">{cat.competitorCount}</td>
                                        <td className="py-3 pr-4"><span className="text-amber-600 font-bold">{cat.avgRating}</span></td>
                                        <td className="py-3 pr-4 text-gray-600">{cat.avgReviews}</td>
                                        <td className="py-3 text-gray-700 truncate max-w-[120px]">{cat.dominantPlayer}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}

function TargetVsMarketCard({ data }: { data: TargetVsMarket }) {
    const CompareRow = ({ label, yours, market, unit, inverse }: { label: string; yours: number | null; market: number; unit?: string; inverse?: boolean }) => {
        if (yours === null) return null;
        const diff = yours - market;
        const better = inverse ? diff < 0 : diff > 0;
        const neutral = Math.abs(diff) < 0.1;
        return (
            <div className="flex items-center justify-between py-2">
                <span className="text-xs text-gray-500 font-medium">{label}</span>
                <div className="flex items-center gap-4">
                    <span className="text-xs font-black text-gray-900 w-16 text-right">{typeof yours === 'number' && yours % 1 !== 0 ? yours.toFixed(1) : yours}{unit}</span>
                    <span className="text-[10px] text-gray-400 w-12 text-center">vs</span>
                    <span className="text-xs text-gray-500 w-16 text-right">{typeof market === 'number' && market % 1 !== 0 ? market.toFixed(1) : market}{unit}</span>
                    <div className="w-5">
                        {neutral ? (
                            <Minus size={14} className="text-gray-400" />
                        ) : better ? (
                            <ArrowUpRight size={14} className="text-emerald-500" />
                        ) : (
                            <ArrowDownRight size={14} className="text-red-500" />
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <Card className="p-6 bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-none">
            <div className="flex items-center gap-2 mb-4">
                <Target size={20} className="text-blue-200" />
                <h3 className="font-black text-lg">{data.targetName}</h3>
                <span className="text-[10px] text-blue-200 font-bold uppercase tracking-widest ml-2">vs Market</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="bg-white/10 rounded-xl p-4">
                    <div className="text-[10px] text-blue-200 uppercase font-bold tracking-wider mb-1">Rank Percentile</div>
                    <div className="text-3xl font-black">{data.rankPercentile}%</div>
                    <div className="text-xs text-blue-200 mt-0.5">Better than {data.rankPercentile}% of competitors</div>
                </div>
                <div className="bg-white/10 rounded-xl p-4">
                    <div className="text-[10px] text-blue-200 uppercase font-bold tracking-wider mb-1">Review Percentile</div>
                    <div className="text-3xl font-black">{data.reviewPercentile}%</div>
                    <div className="text-xs text-blue-200 mt-0.5">More reviews than {data.reviewPercentile}% of market</div>
                </div>
                <div className="bg-white/10 rounded-xl p-4">
                    <div className="text-[10px] text-blue-200 uppercase font-bold tracking-wider mb-1">Rating Percentile</div>
                    <div className="text-3xl font-black">{data.ratingPercentile}%</div>
                    <div className="text-xs text-blue-200 mt-0.5">Higher rated than {data.ratingPercentile}% of market</div>
                </div>
            </div>

            <div className="bg-white rounded-xl p-4 text-gray-900">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Metric</span>
                    <div className="flex items-center gap-4">
                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 w-16 text-right">You</span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 w-12 text-center"></span>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 w-16 text-right">Market</span>
                        <div className="w-5"></div>
                    </div>
                </div>
                <div className="divide-y divide-gray-100">
                    <CompareRow label="Avg Rank" yours={data.yourRank} market={data.marketAvgRank} unit="#" inverse />
                    <CompareRow label="Rating" yours={data.yourRating} market={data.marketAvgRating} />
                    <CompareRow label="Reviews" yours={data.yourReviews} market={data.marketAvgReviews} />
                    <CompareRow label="Grid Presence" yours={data.yourAppearances} market={data.marketAvgAppearances} unit=" pts" />
                    <CompareRow label="Profile Score" yours={data.yourProfileCompleteness} market={data.marketAvgProfileCompleteness} unit="%" />
                </div>
            </div>
        </Card>
    );
}
