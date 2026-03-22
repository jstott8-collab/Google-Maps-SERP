'use client';

import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui';
import {
    ArrowUpDown, ArrowUp, ArrowDown, Search, Filter,
    Star, ExternalLink, Phone, Globe, MapPin, Copy,
    CheckCircle2, ChevronDown, ChevronUp, Crown, Medal,
    Award, Eye, Hash
} from 'lucide-react';

interface RankedBusiness {
    name: string;
    rank: number;
    url?: string;
    address?: string;
    rating?: number;
    reviews?: number;
    category?: string;
    allCategories?: string[];
    phone?: string;
    website?: string;
    cid?: string;
    placeId?: string;
    profileCompleteness?: number;
    isSAB?: boolean;
    photosCount?: number;
}

interface ListingEntry {
    name: string;
    appearances: number;
    avgRank: number;
    bestRank: number;
    worstRank: number;
    top3: number;
    top10: number;
    below10: number;
    rating?: number;
    reviews?: number;
    category?: string;
    allCategories?: string[];
    phone?: string;
    website?: string;
    address?: string;
    cid?: string;
    placeId?: string;
    profileCompleteness?: number;
    isSAB?: boolean;
    photosCount?: number;
    url?: string;
    dominance: number; // percentage of grid points where this business appears
    top3Rate: number;  // percentage of appearances that are top 3
}

type SortField = 'appearances' | 'avgRank' | 'top3' | 'top10' | 'rating' | 'reviews' | 'name' | 'dominance' | 'top3Rate' | 'profileCompleteness';
type SortDir = 'asc' | 'desc';
type RankFilter = 'all' | 'top3' | 'top10' | 'top20' | 'hasRating' | 'hasWebsite' | 'hasPhone';

interface AllListingsTableProps {
    results: Array<{ topResults: string; lat: number; lng: number }>;
    totalPoints: number;
    targetBusinessName?: string;
}

function parseTopResults(jsonStr: string): RankedBusiness[] {
    try {
        return JSON.parse(jsonStr);
    } catch {
        return [];
    }
}

export function AllListingsTable({ results, totalPoints, targetBusinessName }: AllListingsTableProps) {
    const [sortField, setSortField] = useState<SortField>('appearances');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [searchQuery, setSearchQuery] = useState('');
    const [rankFilter, setRankFilter] = useState<RankFilter>('all');
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showOnlyTarget, setShowOnlyTarget] = useState(false);

    // Build the full listings data from all grid results
    const allListings = useMemo(() => {
        const map = new Map<string, ListingEntry>();

        results.forEach(r => {
            const businesses = parseTopResults(r.topResults);
            businesses.forEach(biz => {
                const key = biz.name.toLowerCase();
                if (!map.has(key)) {
                    map.set(key, {
                        name: biz.name,
                        appearances: 0,
                        avgRank: 0,
                        bestRank: Infinity,
                        worstRank: 0,
                        top3: 0,
                        top10: 0,
                        below10: 0,
                        rating: biz.rating,
                        reviews: biz.reviews,
                        category: biz.category,
                        allCategories: biz.allCategories,
                        phone: biz.phone,
                        website: biz.website,
                        address: biz.address,
                        cid: biz.cid,
                        placeId: biz.placeId,
                        profileCompleteness: biz.profileCompleteness,
                        isSAB: biz.isSAB,
                        photosCount: biz.photosCount,
                        url: biz.url,
                        dominance: 0,
                        top3Rate: 0,
                    });
                }

                const entry = map.get(key)!;
                entry.appearances++;
                entry.avgRank = ((entry.avgRank * (entry.appearances - 1)) + biz.rank) / entry.appearances;
                entry.bestRank = Math.min(entry.bestRank, biz.rank);
                entry.worstRank = Math.max(entry.worstRank, biz.rank);
                if (biz.rank <= 3) entry.top3++;
                else if (biz.rank <= 10) entry.top10++;
                else entry.below10++;

                // Update with latest data
                if (biz.rating !== undefined) entry.rating = biz.rating;
                if (biz.reviews !== undefined) entry.reviews = biz.reviews;
                if (biz.phone) entry.phone = biz.phone;
                if (biz.website) entry.website = biz.website;
                if (biz.address) entry.address = biz.address;
                if (biz.cid) entry.cid = biz.cid;
                if (biz.placeId) entry.placeId = biz.placeId;
                if (biz.profileCompleteness) entry.profileCompleteness = biz.profileCompleteness;
                if (biz.photosCount) entry.photosCount = Math.max(entry.photosCount || 0, biz.photosCount);
                if (biz.allCategories && biz.allCategories.length > 0) entry.allCategories = biz.allCategories;
                if (biz.category) entry.category = biz.category;
            });
        });

        // Calculate derived metrics
        return Array.from(map.values()).map(e => ({
            ...e,
            bestRank: e.bestRank === Infinity ? 0 : e.bestRank,
            dominance: totalPoints > 0 ? (e.appearances / totalPoints) * 100 : 0,
            top3Rate: e.appearances > 0 ? (e.top3 / e.appearances) * 100 : 0,
        }));
    }, [results, totalPoints]);

    // Get unique categories for filter
    const categories = useMemo(() => {
        const cats = new Set<string>();
        allListings.forEach(l => {
            if (l.category) cats.add(l.category);
        });
        return Array.from(cats).sort();
    }, [allListings]);

    // Filter and sort
    const filteredListings = useMemo(() => {
        let filtered = allListings;

        // Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(l =>
                l.name.toLowerCase().includes(q) ||
                l.category?.toLowerCase().includes(q) ||
                l.address?.toLowerCase().includes(q)
            );
        }

        // Target filter
        if (showOnlyTarget && targetBusinessName) {
            filtered = filtered.filter(l =>
                l.name.toLowerCase() === targetBusinessName.toLowerCase()
            );
        }

        // Rank filter
        switch (rankFilter) {
            case 'top3':
                filtered = filtered.filter(l => l.top3 > 0);
                break;
            case 'top10':
                filtered = filtered.filter(l => l.top3 > 0 || l.top10 > 0);
                break;
            case 'top20':
                filtered = filtered.filter(l => l.appearances > 0);
                break;
            case 'hasRating':
                filtered = filtered.filter(l => l.rating !== undefined && l.rating > 0);
                break;
            case 'hasWebsite':
                filtered = filtered.filter(l => !!l.website);
                break;
            case 'hasPhone':
                filtered = filtered.filter(l => !!l.phone);
                break;
        }

        // Sort
        filtered.sort((a, b) => {
            let cmp = 0;
            switch (sortField) {
                case 'name': cmp = a.name.localeCompare(b.name); break;
                case 'appearances': cmp = a.appearances - b.appearances; break;
                case 'avgRank': cmp = a.avgRank - b.avgRank; break;
                case 'top3': cmp = a.top3 - b.top3; break;
                case 'top10': cmp = (a.top3 + a.top10) - (b.top3 + b.top10); break;
                case 'rating': cmp = (a.rating || 0) - (b.rating || 0); break;
                case 'reviews': cmp = (a.reviews || 0) - (b.reviews || 0); break;
                case 'dominance': cmp = a.dominance - b.dominance; break;
                case 'top3Rate': cmp = a.top3Rate - b.top3Rate; break;
                case 'profileCompleteness': cmp = (a.profileCompleteness || 0) - (b.profileCompleteness || 0); break;
            }
            return sortDir === 'desc' ? -cmp : cmp;
        });

        return filtered;
    }, [allListings, searchQuery, rankFilter, sortField, sortDir, showOnlyTarget, targetBusinessName]);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            // Default to desc for numeric fields, asc for name
            setSortDir(field === 'name' ? 'asc' : 'desc');
        }
    };

    const copyToClipboard = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <ArrowUpDown size={12} className="text-gray-300" />;
        return sortDir === 'asc'
            ? <ArrowUp size={12} className="text-blue-600" />
            : <ArrowDown size={12} className="text-blue-600" />;
    };

    const SortHeader = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
        <th
            className={`pb-3 pt-3 px-3 font-black text-gray-400 uppercase tracking-widest text-[10px] cursor-pointer hover:text-gray-600 transition-colors select-none whitespace-nowrap ${className}`}
            onClick={() => handleSort(field)}
        >
            <div className="flex items-center gap-1">
                {children}
                <SortIcon field={field} />
            </div>
        </th>
    );

    // Summary stats
    const top3Count = allListings.filter(l => l.top3 > 0).length;
    const avgRating = allListings.filter(l => l.rating).reduce((sum, l) => sum + (l.rating || 0), 0) / (allListings.filter(l => l.rating).length || 1);

    const getRankBadge = (rank: number) => {
        if (rank <= 3) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
        if (rank <= 10) return 'bg-amber-100 text-amber-700 border-amber-200';
        return 'bg-gray-100 text-gray-600 border-gray-200';
    };

    const getPositionIcon = (index: number) => {
        if (index === 0) return <Crown size={14} className="text-amber-500" />;
        if (index === 1) return <Medal size={14} className="text-gray-400" />;
        if (index === 2) return <Award size={14} className="text-amber-600" />;
        return <span className="text-[10px] font-bold text-gray-400 w-3.5 text-center">{index + 1}</span>;
    };

    return (
        <div className="h-full flex flex-col bg-white">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-100 space-y-3">
                {/* Stats Bar */}
                <div className="flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg">
                        <Hash size={12} className="text-blue-500" />
                        <span className="font-bold text-blue-700">{allListings.length}</span>
                        <span className="text-blue-500">total listings</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-lg">
                        <Crown size={12} className="text-emerald-500" />
                        <span className="font-bold text-emerald-700">{top3Count}</span>
                        <span className="text-emerald-500">in top 3</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 rounded-lg">
                        <Star size={12} className="text-amber-500" />
                        <span className="font-bold text-amber-700">{avgRating.toFixed(1)}</span>
                        <span className="text-amber-500">avg rating</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg">
                        <Eye size={12} className="text-gray-500" />
                        <span className="font-bold text-gray-700">{filteredListings.length}</span>
                        <span className="text-gray-500">showing</span>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="flex items-center gap-3">
                    <div className="relative flex-1 max-w-xs">
                        <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by name, category, or address..."
                            className="w-full pl-9 pr-3 py-2 text-xs bg-gray-50 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Filter size={12} className="text-gray-400" />
                        <select
                            className="text-xs font-medium bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 outline-none focus:ring-2 focus:ring-blue-500"
                            value={rankFilter}
                            onChange={(e) => setRankFilter(e.target.value as RankFilter)}
                        >
                            <option value="all">All Listings</option>
                            <option value="top3">Appeared in Top 3</option>
                            <option value="top10">Appeared in Top 10</option>
                            <option value="top20">Appeared in Top 20</option>
                            <option value="hasRating">Has Rating</option>
                            <option value="hasWebsite">Has Website</option>
                            <option value="hasPhone">Has Phone</option>
                        </select>
                    </div>
                    {targetBusinessName && (
                        <button
                            onClick={() => setShowOnlyTarget(!showOnlyTarget)}
                            className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all ${showOnlyTarget
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            Show Target Only
                        </button>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
                        <tr>
                            <th className="pb-3 pt-3 px-3 w-8"></th>
                            <SortHeader field="name">Business</SortHeader>
                            <SortHeader field="appearances" className="text-center">Grid Points</SortHeader>
                            <SortHeader field="dominance" className="text-center">Visibility</SortHeader>
                            <SortHeader field="top3" className="text-center">Top 3</SortHeader>
                            <SortHeader field="top3Rate" className="text-center">Top 3 Rate</SortHeader>
                            <SortHeader field="avgRank" className="text-center">Avg Rank</SortHeader>
                            <SortHeader field="rating" className="text-center">Rating</SortHeader>
                            <SortHeader field="reviews" className="text-center">Reviews</SortHeader>
                            <SortHeader field="profileCompleteness" className="text-center">Profile</SortHeader>
                            <th className="pb-3 pt-3 px-3 font-black text-gray-400 uppercase tracking-widest text-[10px]">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filteredListings.map((listing, index) => {
                            const isTarget = targetBusinessName && listing.name.toLowerCase() === targetBusinessName.toLowerCase();
                            const isExpanded = expandedRow === listing.name;

                            return (
                                <ListingRow
                                    key={listing.name}
                                    listing={listing}
                                    index={index}
                                    totalPoints={totalPoints}
                                    isTarget={!!isTarget}
                                    isExpanded={isExpanded}
                                    onToggle={() => setExpandedRow(isExpanded ? null : listing.name)}
                                    onCopy={copyToClipboard}
                                    copiedId={copiedId}
                                    getRankBadge={getRankBadge}
                                    getPositionIcon={getPositionIcon}
                                />
                            );
                        })}
                    </tbody>
                </table>

                {filteredListings.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                        <Search size={32} className="mb-3 opacity-50" />
                        <p className="font-medium">No listings match your filters</p>
                        <p className="text-xs mt-1">Try adjusting your search or filter criteria</p>
                    </div>
                )}
            </div>
        </div>
    );
}

interface ListingRowProps {
    listing: ListingEntry;
    index: number;
    totalPoints: number;
    isTarget: boolean;
    isExpanded: boolean;
    onToggle: () => void;
    onCopy: (text: string, id: string) => void;
    copiedId: string | null;
    getRankBadge: (rank: number) => string;
    getPositionIcon: (index: number) => React.ReactNode;
}

function ListingRow({ listing, index, totalPoints, isTarget, isExpanded, onToggle, onCopy, copiedId, getRankBadge, getPositionIcon }: ListingRowProps) {
    return (
        <>
            <tr
                className={`hover:bg-gray-50/80 transition-colors cursor-pointer group ${isTarget ? 'bg-blue-50/40' : ''} ${isExpanded ? 'bg-gray-50' : ''}`}
                onClick={onToggle}
            >
                {/* Position */}
                <td className="py-3 px-3 text-center">
                    {getPositionIcon(index)}
                </td>

                {/* Business Name */}
                <td className="py-3 px-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                                    {listing.name}
                                </span>
                                {isTarget && (
                                    <Badge variant="blue" className="text-[9px] shrink-0">YOUR BUSINESS</Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                {listing.category && (
                                    <span className="text-[10px] text-gray-400 truncate">{listing.category}</span>
                                )}
                                {listing.isSAB && (
                                    <span className="text-[9px] text-amber-500 font-medium">SAB</span>
                                )}
                            </div>
                        </div>
                        {isExpanded ? <ChevronUp size={14} className="text-gray-400 shrink-0" /> : <ChevronDown size={14} className="text-gray-300 shrink-0" />}
                    </div>
                </td>

                {/* Appearances */}
                <td className="py-3 px-3 text-center">
                    <span className="font-bold text-gray-800">{listing.appearances}</span>
                    <span className="text-gray-400 text-[10px]"> / {totalPoints}</span>
                </td>

                {/* Visibility (Dominance) */}
                <td className="py-3 px-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                        <span className={`font-black text-xs ${listing.dominance >= 50 ? 'text-red-600' : listing.dominance >= 25 ? 'text-amber-600' : 'text-gray-700'}`}>
                            {listing.dominance.toFixed(1)}%
                        </span>
                        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${listing.dominance >= 50 ? 'bg-red-500' : listing.dominance >= 25 ? 'bg-amber-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(listing.dominance, 100)}%` }}
                            />
                        </div>
                    </div>
                </td>

                {/* Top 3 Count */}
                <td className="py-3 px-3 text-center">
                    {listing.top3 > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-black text-[11px]">
                            <Crown size={10} />
                            {listing.top3}
                        </span>
                    ) : (
                        <span className="text-gray-300">-</span>
                    )}
                </td>

                {/* Top 3 Rate */}
                <td className="py-3 px-3 text-center">
                    {listing.top3 > 0 ? (
                        <span className={`font-bold text-[11px] ${listing.top3Rate >= 75 ? 'text-emerald-600' : listing.top3Rate >= 50 ? 'text-blue-600' : 'text-gray-600'}`}>
                            {listing.top3Rate.toFixed(0)}%
                        </span>
                    ) : (
                        <span className="text-gray-300">-</span>
                    )}
                </td>

                {/* Avg Rank */}
                <td className="py-3 px-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-md border text-[11px] font-black ${getRankBadge(Math.round(listing.avgRank))}`}>
                        #{listing.avgRank.toFixed(1)}
                    </span>
                    <div className="text-[9px] text-gray-400 mt-0.5">
                        {listing.bestRank}-{listing.worstRank}
                    </div>
                </td>

                {/* Rating */}
                <td className="py-3 px-3 text-center">
                    {listing.rating ? (
                        <div className="flex items-center justify-center gap-1">
                            <Star size={12} className="text-amber-400 fill-amber-400" />
                            <span className="font-bold text-gray-800">{listing.rating.toFixed(1)}</span>
                        </div>
                    ) : (
                        <span className="text-gray-300">-</span>
                    )}
                </td>

                {/* Reviews */}
                <td className="py-3 px-3 text-center">
                    {listing.reviews !== undefined ? (
                        <span className="font-medium text-gray-700">{listing.reviews.toLocaleString()}</span>
                    ) : (
                        <span className="text-gray-300">-</span>
                    )}
                </td>

                {/* Profile Completeness */}
                <td className="py-3 px-3 text-center">
                    {listing.profileCompleteness !== undefined ? (
                        <div className="flex flex-col items-center gap-1">
                            <span className={`text-[11px] font-bold ${listing.profileCompleteness >= 70 ? 'text-emerald-600' : listing.profileCompleteness >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                                {listing.profileCompleteness}%
                            </span>
                            <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${listing.profileCompleteness >= 70 ? 'bg-emerald-500' : listing.profileCompleteness >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                    style={{ width: `${listing.profileCompleteness}%` }}
                                />
                            </div>
                        </div>
                    ) : (
                        <span className="text-gray-300">-</span>
                    )}
                </td>

                {/* Actions */}
                <td className="py-3 px-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {listing.website && (
                            <a
                                href={listing.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="p-1.5 hover:bg-blue-50 rounded-md transition-colors"
                                title="Visit website"
                            >
                                <Globe size={14} className="text-blue-500" />
                            </a>
                        )}
                        {listing.cid && (
                            <a
                                href={`https://maps.google.com/?cid=${listing.cid}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="p-1.5 hover:bg-blue-50 rounded-md transition-colors"
                                title="Open in Google Maps"
                            >
                                <MapPin size={14} className="text-red-500" />
                            </a>
                        )}
                    </div>
                </td>
            </tr>

            {/* Expanded Detail Row */}
            {isExpanded && (
                <tr>
                    <td colSpan={11} className="p-0">
                        <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm">
                                {/* Rank Distribution */}
                                <div>
                                    <h4 className="text-[10px] text-gray-400 uppercase font-black tracking-wider mb-2">Rank Distribution</h4>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-600">Top 3</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${listing.appearances > 0 ? (listing.top3 / listing.appearances) * 100 : 0}%` }} />
                                                </div>
                                                <span className="text-xs font-bold text-emerald-600 w-6 text-right">{listing.top3}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-600">4-10</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${listing.appearances > 0 ? (listing.top10 / listing.appearances) * 100 : 0}%` }} />
                                                </div>
                                                <span className="text-xs font-bold text-amber-600 w-6 text-right">{listing.top10}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-gray-600">11+</span>
                                            <div className="flex items-center gap-2">
                                                <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gray-400 rounded-full" style={{ width: `${listing.appearances > 0 ? (listing.below10 / listing.appearances) * 100 : 0}%` }} />
                                                </div>
                                                <span className="text-xs font-bold text-gray-500 w-6 text-right">{listing.below10}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-[10px] text-gray-400">
                                        Best: #{listing.bestRank} | Worst: #{listing.worstRank}
                                    </div>
                                </div>

                                {/* Contact Info */}
                                <div>
                                    <h4 className="text-[10px] text-gray-400 uppercase font-black tracking-wider mb-2">Contact</h4>
                                    <div className="space-y-2">
                                        {listing.address && (
                                            <div className="flex items-start gap-2">
                                                <MapPin size={12} className="text-gray-400 mt-0.5 shrink-0" />
                                                <span className="text-xs text-gray-700">{listing.address}</span>
                                            </div>
                                        )}
                                        {listing.phone && (
                                            <div className="flex items-center gap-2">
                                                <Phone size={12} className="text-gray-400 shrink-0" />
                                                <span className="text-xs text-gray-700">{listing.phone}</span>
                                            </div>
                                        )}
                                        {listing.website && (
                                            <div className="flex items-center gap-2">
                                                <Globe size={12} className="text-gray-400 shrink-0" />
                                                <a href={listing.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate">{listing.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
                                            </div>
                                        )}
                                        {!listing.address && !listing.phone && !listing.website && (
                                            <span className="text-xs text-gray-400 italic">No contact info available</span>
                                        )}
                                    </div>
                                </div>

                                {/* Categories */}
                                <div>
                                    <h4 className="text-[10px] text-gray-400 uppercase font-black tracking-wider mb-2">Categories</h4>
                                    {listing.allCategories && listing.allCategories.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {listing.allCategories.map((cat, i) => (
                                                <Badge key={i} className="bg-indigo-50 text-indigo-700 text-[10px]">{cat}</Badge>
                                            ))}
                                        </div>
                                    ) : listing.category ? (
                                        <Badge className="bg-indigo-50 text-indigo-700 text-[10px]">{listing.category}</Badge>
                                    ) : (
                                        <span className="text-xs text-gray-400 italic">Unknown</span>
                                    )}
                                </div>

                                {/* IDs & Tools */}
                                <div>
                                    <h4 className="text-[10px] text-gray-400 uppercase font-black tracking-wider mb-2">IDs & Tools</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {listing.cid && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onCopy(listing.cid!, `cid-${listing.name}`); }}
                                                className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded-md text-[10px] font-medium hover:bg-gray-50 transition-colors"
                                            >
                                                {copiedId === `cid-${listing.name}` ? <CheckCircle2 size={10} className="text-green-500" /> : <Copy size={10} className="text-gray-400" />}
                                                CID
                                            </button>
                                        )}
                                        {listing.placeId && (
                                            <>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onCopy(listing.placeId!, `pid-${listing.name}`); }}
                                                    className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded-md text-[10px] font-medium hover:bg-gray-50 transition-colors"
                                                >
                                                    {copiedId === `pid-${listing.name}` ? <CheckCircle2 size={10} className="text-green-500" /> : <Copy size={10} className="text-gray-400" />}
                                                    Place ID
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); onCopy(`https://search.google.com/local/writereview?placeid=${listing.placeId}`, `rev-${listing.name}`); }}
                                                    className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md text-[10px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                                                >
                                                    {copiedId === `rev-${listing.name}` ? <CheckCircle2 size={10} className="text-green-500" /> : <Copy size={10} />}
                                                    Review Link
                                                </button>
                                            </>
                                        )}
                                        {listing.cid && (
                                            <a
                                                href={`https://maps.google.com/?cid=${listing.cid}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={e => e.stopPropagation()}
                                                className="flex items-center gap-1.5 px-2 py-1 bg-white border border-gray-200 rounded-md text-[10px] font-medium hover:bg-gray-50 transition-colors"
                                            >
                                                <ExternalLink size={10} className="text-gray-400" />
                                                Maps
                                            </a>
                                        )}
                                        {listing.photosCount !== undefined && listing.photosCount > 0 && (
                                            <span className="flex items-center gap-1 px-2 py-1 bg-gray-50 rounded-md text-[10px] text-gray-500">
                                                {listing.photosCount} photos
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}
