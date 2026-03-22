import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { enqueueScan } from '@/lib/scanQueue';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const scans = await prisma.scan.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ scans });
    } catch (error) {
        logger.error('Scans GET error', 'SCANNER', { error: String(error) });
        return NextResponse.json({ scans: [], error: 'Failed to fetch scans' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const {
            keyword,
            radius,
            gridSize,
            frequency,
            businessName,
            shape,
            customPoints,
            lat,
            lng,
            placeId
        } = await req.json();

        if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
            return NextResponse.json({ error: 'Keyword is required' }, { status: 400 });
        }
        if (keyword.length > 200) {
            return NextResponse.json({ error: 'Keyword must be 200 characters or less' }, { status: 400 });
        }

        // Use provided coordinates or default to Chicago (Mock)
        const centerLat = typeof lat === 'number' ? lat : 41.8781;
        const centerLng = typeof lng === 'number' ? lng : -87.6298;

        // Validate and clamp bounds
        const parsedRadius = Math.min(Math.max(parseFloat(radius) || 5, 0.5), 100);
        const parsedGridSize = Math.min(Math.max(parseInt(gridSize) || 3, 1), 15);
        const validShapes = ['SQUARE', 'CIRCLE', 'ZIP', 'SMART'];
        const validFrequencies = ['ONCE', 'DAILY', 'WEEKLY'];

        const scan = await prisma.scan.create({
            data: {
                keyword: keyword.trim(),
                centerLat,
                centerLng,
                radius: parsedRadius,
                gridSize: parsedGridSize,
                shape: validShapes.includes(shape) ? shape : 'SQUARE',
                customPoints: customPoints ? JSON.stringify(customPoints) : null,
                frequency: validFrequencies.includes(frequency) ? frequency : 'ONCE',
                businessName: businessName || undefined,
                placeId: placeId || undefined,
                status: 'PENDING',
            },
        });

        // Start scan via queue (respects concurrency limit)
        logger.info(`New scan created: "${keyword}"`, 'API', { scanId: scan.id });
        const queueResult = enqueueScan(scan.id);
        logger.info(`Scan ${scan.id} enqueue result: ${queueResult}`, 'API');

        return NextResponse.json(scan);
    } catch (error) {
        logger.error('Scan creation failed', 'SCANNER', { error: String(error), stack: error instanceof Error ? error.stack : undefined });
        return NextResponse.json({ error: 'Failed to create scan', details: String(error) }, { status: 500 });
    }
}
