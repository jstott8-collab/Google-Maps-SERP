import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { enqueueScan } from '@/lib/scanQueue';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const now = new Date();
        const missedScans = await prisma.scan.findMany({
            where: {
                nextRun: {
                    lt: now
                },
                status: 'COMPLETED', // Or PENDING if it never started
                frequency: {
                    not: 'ONCE'
                }
            },
            orderBy: { nextRun: 'asc' }
        });

        return NextResponse.json({ missedScans });
    } catch (error) {
        logger.error('Lookback check error', 'SCHEDULER', { error: String(error) });
        return NextResponse.json({ missedScans: [], error: 'Failed to check missed scans' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { scanIds } = await req.json();

        if (!Array.isArray(scanIds)) {
            return NextResponse.json({ error: 'scanIds must be an array' }, { status: 400 });
        }

        const results = [];
        for (const id of scanIds) {
            const result = enqueueScan(id);
            results.push({ id, result });
        }

        return NextResponse.json({ success: true, count: scanIds.length, results });
    } catch (error) {
        logger.error('Lookback execution error', 'SCHEDULER', { error: String(error) });
        return NextResponse.json({ error: 'Failed to run missed scans' }, { status: 500 });
    }
}
