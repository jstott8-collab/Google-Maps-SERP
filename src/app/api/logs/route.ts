import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '50');
        const level = searchParams.get('level');
        const source = searchParams.get('source');

        const where: { level?: string; source?: string } = {};
        if (level) where.level = level;
        if (source) where.source = source;

        const logs = await prisma.systemLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit
        });

        return NextResponse.json({ logs });
    } catch (error) {
        logger.error('Logs API error', 'SYSTEM', { error: String(error) });
        return NextResponse.json({ logs: [], error: 'Failed to fetch logs' }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        await prisma.systemLog.deleteMany({});
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ success: false }, { status: 500 });
    }
}
