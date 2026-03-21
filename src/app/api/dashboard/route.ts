import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const scansCount = await prisma.scan.count();
        const completedScans = await prisma.scan.count({ where: { status: 'COMPLETED' } });
        const activeScans = await prisma.scan.count({ where: { status: { in: ['RUNNING', 'PENDING'] } } });
        const recentScans = await prisma.scan.findMany({
            orderBy: { createdAt: 'desc' },
            take: 5,
        });

        return NextResponse.json({ scansCount, completedScans, activeScans, recentScans });
    } catch (error) {
        logger.error('Dashboard API error', 'DASHBOARD', { error: String(error) });
        return NextResponse.json({ scansCount: 0, completedScans: 0, activeScans: 0, recentScans: [], error: 'Failed to fetch dashboard data' }, { status: 500 });
    }
}
