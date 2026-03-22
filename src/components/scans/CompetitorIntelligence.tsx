'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui';
import {
    BarChart3,
    Users,
    Star,
    TrendingUp,
    Building2,
    Phone,
    Globe,
    MapPin,
    CheckCircle2,
    AlertTriangle,
    BrainCircuit
} from 'lucide-react';
import { analyzeCompetitors, type CompetitorIntelligence } from '@/lib/analysis';
import { StrategicAnalysis } from './StrategicAnalysis';

interface CompetitorIntelligenceProps {
    results: Array<{ topResults: string; lat: number; lng: number }>;
    targetBusinessName?: string;
    totalPoints: number;
}

export function CompetitorIntelligenceDashboard({ results, targetBusinessName, totalPoints }: CompetitorIntelligenceProps) {
    const [analysis, setAnalysis] = useState<CompetitorIntelligence | null>(null);
    const [activeTab, setActiveTab] = useState<'categories' | 'reviews' | 'profiles' | 'strategic'>('strategic');

    useEffect(() => {
        if (results && results.length > 0) {
            const intel = analyzeCompetitors(results, targetBusinessName);
            setAnalysis(intel);
        }
    }, [results, targetBusinessName]);

    if (!analysis) {
        return (
            <Card className="p-6 bg-white border border-gray-100">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                    <div className="h-32 bg-gray-100 rounded"></div>
                </div>
            </Card>
        );
    }

    const { competitors, categoryMetrics, reviewMetrics, profileMetrics } = analysis;

    return (
        <div className="space-y-6">
            {/* Header with Stats */}
            <Card className="p-6 bg-gradient-to-br from-indigo-50 to-white border border-indigo-100">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                            <BarChart3 className="text-indigo-600" size={24} />
                            Competitor Intelligence
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Deep analysis of {competitors.length} competitors across {totalPoints} grid points</p>
                    </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
                            <Users size={14} />
                            Competitors
                        </div>
                        <div className="text-2xl font-black text-gray-900">{competitors.length}</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
                            <Star size={14} />
                            Avg Rating
                        </div>
                        <div className="text-2xl font-black text-gray-900">{reviewMetrics.avgRating.toFixed(1)}</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
                            <TrendingUp size={14} />
                            Avg Reviews
                        </div>
                        <div className="text-2xl font-black text-gray-900">{reviewMetrics.avgReviews.toFixed(0)}</div>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-2 text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
                            <Building2 size={14} />
                            Categories
                        </div>
                        <div className="text-2xl font-black text-gray-900">{categoryMetrics.totalCategories}</div>
                    </div>
                </div>
            </Card>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
                {(['strategic', 'categories', 'reviews', 'profiles'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === tab
                            ? 'bg-indigo-600 text-white'
                            : 'text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        {tab === 'strategic' ? (
                            <div className="flex items-center gap-2">
                                <BrainCircuit size={16} />
                                <span>Insights</span>
                            </div>
                        ) : (
                            tab.charAt(0).toUpperCase() + tab.slice(1)
                        )}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            {activeTab === 'strategic' && (
                <StrategicAnalysis
                    competitors={competitors}
                    categoryMetrics={categoryMetrics}
                    reviewMetrics={reviewMetrics}
                    targetBusinessName={targetBusinessName}
                    rawResults={results}
                />
            )}
            {activeTab === 'categories' && (
                <Card className="p-6 border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-4">Top Categories in Market</h3>
                    <div className="space-y-3">
                        {categoryMetrics.topCategories.map((cat, i) => (
                            <div key={cat.category} className="flex items-center gap-4">
                                <div className="w-8 text-sm font-bold text-gray-400">#{i + 1}</div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="font-medium text-gray-900">{cat.category}</span>
                                        <span className="text-sm text-gray-500">{cat.count} businesses</span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-500 rounded-full transition-all"
                                            style={{ width: `${cat.percentage}%` }}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span className="text-gray-500">Avg Categories/Business:</span>
                                <span className="ml-2 font-bold">{categoryMetrics.avgCategoriesPerBusiness.toFixed(1)}</span>
                            </div>
                            <div>
                                <span className="text-gray-500">Max Categories:</span>
                                <span className="ml-2 font-bold">{categoryMetrics.maxCategories}</span>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {activeTab === 'reviews' && (
                <Card className="p-6 border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-4">Review Analysis</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Total Reviews</div>
                            <div className="text-xl font-black">{reviewMetrics.totalReviews.toLocaleString()}</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Max Reviews</div>
                            <div className="text-xl font-black">{reviewMetrics.maxReviews.toLocaleString()}</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Min Reviews</div>
                            <div className="text-xl font-black">{reviewMetrics.minReviews.toLocaleString()}</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">No Reviews</div>
                            <div className="text-xl font-black text-amber-600">{reviewMetrics.withoutReviews}</div>
                        </div>
                    </div>

                    <h4 className="font-medium text-gray-700 mb-3">Rating Distribution</h4>
                    <div className="space-y-2">
                        {['5', '4', '3', '2', '1'].map(rating => {
                            const count = reviewMetrics.ratingDistribution[rating] || 0;
                            const total = Object.values(reviewMetrics.ratingDistribution).reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? (count / total) * 100 : 0;
                            return (
                                <div key={rating} className="flex items-center gap-3">
                                    <div className="w-12 flex items-center gap-1">
                                        <Star size={14} className="text-amber-400 fill-amber-400" />
                                        <span className="text-sm font-medium">{rating}</span>
                                    </div>
                                    <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-amber-400 rounded-full"
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                    <div className="w-16 text-right text-sm text-gray-500">{count}</div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {activeTab === 'profiles' && (
                <Card className="p-6 border border-gray-100">
                    <h3 className="font-bold text-gray-900 mb-4">Profile Completeness Analysis</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                        <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-xl border border-green-200">
                            <div className="flex items-center gap-2 text-green-700 text-xs uppercase tracking-wider mb-1">
                                <CheckCircle2 size={14} />
                                Avg Completeness
                            </div>
                            <div className="text-2xl font-black text-green-800">{profileMetrics.avgCompleteness.toFixed(0)}%</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider mb-1">
                                <Phone size={14} />
                                With Phone
                            </div>
                            <div className="text-xl font-black">{profileMetrics.withPhone}</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider mb-1">
                                <Globe size={14} />
                                With Website
                            </div>
                            <div className="text-xl font-black">{profileMetrics.withWebsite}</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider mb-1">
                                <MapPin size={14} />
                                With Address
                            </div>
                            <div className="text-xl font-black">{profileMetrics.withAddress}</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl">
                            <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider mb-1">
                                <Building2 size={14} />
                                Physical Locations
                            </div>
                            <div className="text-xl font-black">{profileMetrics.physicalLocations}</div>
                        </div>
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                            <div className="flex items-center gap-2 text-amber-700 text-xs uppercase tracking-wider mb-1">
                                <AlertTriangle size={14} />
                                Service Area Only
                            </div>
                            <div className="text-xl font-black text-amber-800">{profileMetrics.serviceAreaBusinesses}</div>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
}

export default CompetitorIntelligenceDashboard;
