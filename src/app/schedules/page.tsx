'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, RefreshCw, Trash2, Loader2, AlertTriangle, CheckCircle, Pause } from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import Link from 'next/link';

interface ScheduledScan {
    id: string;
    keyword: string;
    businessName?: string;
    frequency: string;
    status: string;
    gridSize: number;
    radius: number;
    centerLat: number;
    centerLng: number;
    nextRun: string | null;
    createdAt: string;
}

export default function SchedulesPage() {
    const [scans, setScans] = useState<ScheduledScan[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchScheduledScans();
        const interval = setInterval(fetchScheduledScans, 10000); // Refresh every 10s
        return () => clearInterval(interval);
    }, []);

    async function fetchScheduledScans() {
        try {
            const res = await fetch('/api/scans');
            const data = await res.json();
            // Filter to only show recurring scans (DAILY or WEEKLY)
            const recurring = (data.scans || []).filter(
                (s: ScheduledScan) => s.frequency === 'DAILY' || s.frequency === 'WEEKLY'
            );
            setScans(recurring);
        } catch {
            /* ignore */
        } finally {
            setLoading(false);
        }
    }

    function getStatusIcon(status: string) {
        switch (status) {
            case 'RUNNING': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
            case 'COMPLETED': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
            case 'FAILED': return <AlertTriangle className="w-4 h-4 text-red-500" />;
            case 'STOPPED': return <Pause className="w-4 h-4 text-gray-400" />;
            default: return <Clock className="w-4 h-4 text-amber-500" />;
        }
    }

    function formatNextRun(nextRun: string | null) {
        if (!nextRun) return 'Not scheduled';
        const date = new Date(nextRun);
        const now = new Date();
        const diffMs = date.getTime() - now.getTime();

        if (diffMs < 0) return 'Overdue — will trigger soon';
        if (diffMs < 60_000) return 'Less than a minute';
        if (diffMs < 3600_000) return `${Math.round(diffMs / 60_000)} min`;
        if (diffMs < 86400_000) return `${Math.round(diffMs / 3600_000)} hours`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    return (
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
                            <Calendar size={20} />
                        </div>
                        <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tight">Scan Schedules</h1>
                    </div>
                    <p className="text-xs text-gray-500 font-bold ml-1 uppercase tracking-widest opacity-70">Automated Recurring Intelligence</p>
                </div>
                <Link href="/scans/new">
                    <Button className="h-11 px-6 bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-500/20 font-black uppercase text-xs tracking-widest">
                        <Plus className="mr-2 w-4 h-4" /> New Schedule
                    </Button>
                </Link>
            </header>

            <main className="space-y-8">
                {loading ? (
                    <Card className="text-center py-24 border-none shadow-xl ring-1 ring-gray-200 bg-white">
                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
                        <p className="text-gray-400 text-sm font-medium">Loading schedules...</p>
                    </Card>
                ) : scans.length === 0 ? (
                    <Card className="text-center py-24 border-none shadow-xl ring-1 ring-gray-200 bg-white">
                        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-50 flex items-center justify-center ring-1 ring-gray-100">
                            <Calendar className="w-10 h-10 text-gray-300" />
                        </div>
                        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight mb-3">No Active Schedules</h2>
                        <p className="text-gray-400 max-w-md mx-auto mb-8 font-medium italic leading-relaxed">
                            Set up automated scans to track your rankings over time.
                            Create a new tracker with a Daily or Weekly frequency to get started.
                        </p>
                        <Link href="/scans/new">
                            <Button className="bg-blue-600 hover:bg-blue-700 font-black uppercase text-xs tracking-widest px-8 h-12">Create Scheduled Tracker</Button>
                        </Link>
                    </Card>
                ) : (
                    <Card noPadding className="overflow-hidden border-none shadow-xl ring-1 ring-gray-200">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-50/50 border-b border-gray-100">
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Keyword / Business</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Frequency</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Next Run</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Configuration</th>
                                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {scans.map(scan => (
                                        <tr key={scan.id} className="group hover:bg-blue-50/30 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    {getStatusIcon(scan.status)}
                                                    <Badge variant={
                                                        scan.status === 'COMPLETED' ? 'success' :
                                                            scan.status === 'RUNNING' ? 'blue' :
                                                                scan.status === 'FAILED' ? 'destructive' : 'default'
                                                    } className="font-black text-[9px] uppercase tracking-widest px-2 py-0.5">
                                                        {scan.status}
                                                    </Badge>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Link href={`/scans/${scan.id}`} className="block group/link">
                                                    <div className="font-bold text-gray-900 group-hover/link:text-blue-600 transition-colors">
                                                        {scan.keyword}
                                                    </div>
                                                    {scan.businessName && (
                                                        <div className="text-[10px] text-gray-400 font-medium mt-0.5 truncate max-w-[200px]">
                                                            {scan.businessName}
                                                        </div>
                                                    )}
                                                </Link>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge variant="blue" className="font-black text-[9px] uppercase tracking-widest px-2 py-0.5">
                                                    <RefreshCw className="w-3 h-3 mr-1" />
                                                    {scan.frequency}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2 text-xs text-gray-600 font-medium">
                                                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                                                    {formatNextRun(scan.nextRun)}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-[11px] text-gray-500 font-medium">
                                                    {scan.gridSize}×{scan.gridSize} grid • {scan.radius}km
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <Link href={`/scans/${scan.id}`}>
                                                    <Button variant="ghost" size="sm" className="h-8 px-3 text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 hover:text-blue-600">
                                                        View Results
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}
            </main>

            {/* Feature Preview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { icon: Clock, title: 'Automated Tracking', desc: 'Scans run automatically at set intervals without manual intervention.', color: 'text-blue-500', bg: 'bg-blue-50' },
                    { icon: RefreshCw, title: 'Rank Alerts', desc: 'Get notified when your rankings change significantly.', color: 'text-rose-500', bg: 'bg-rose-50' },
                    { icon: Calendar, title: 'Historical Trends', desc: 'Compare your performance across different time periods.', color: 'text-emerald-500', bg: 'bg-emerald-50' }
                ].map((feature, i) => (
                    <Card key={i} className="p-8 border-none shadow-lg ring-1 ring-gray-200 bg-white hover:ring-blue-500/30 transition-all">
                        <div className={`w-12 h-12 rounded-xl ${feature.bg} ${feature.color} flex items-center justify-center mb-6`}>
                            <feature.icon size={24} />
                        </div>
                        <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight mb-2">{feature.title}</h3>
                        <p className="text-sm text-gray-500 font-medium leading-relaxed">
                            {feature.desc}
                        </p>
                    </Card>
                ))}
            </div>
        </div>
    );
}
