import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// Clone an existing scan's configuration as a new PENDING scan
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const original = await prisma.scan.findUnique({ where: { id } });
        if (!original) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }

        // Allow overrides from request body
        let overrides: any = {};
        try {
            overrides = await request.json();
        } catch { /* no body is fine */ }

        const clone = await prisma.scan.create({
            data: {
                keyword: overrides.keyword || original.keyword,
                centerLat: overrides.centerLat ?? original.centerLat,
                centerLng: overrides.centerLng ?? original.centerLng,
                radius: overrides.radius ?? original.radius,
                gridSize: overrides.gridSize ?? original.gridSize,
                shape: overrides.shape || original.shape,
                customPoints: original.customPoints,
                frequency: overrides.frequency || 'ONCE',
                businessName: overrides.businessName ?? original.businessName,
                placeId: overrides.placeId ?? original.placeId,
                status: 'PENDING',
            },
        });

        logger.info(`Scan cloned: ${id} → ${clone.id}`, 'API', { originalId: id, cloneId: clone.id });

        return NextResponse.json({ success: true, scan: clone });
    } catch (error: any) {
        logger.error('Scan clone error', 'API', { scanId: id, error: error.message });
        return NextResponse.json({ error: 'Failed to clone scan' }, { status: 500 });
    }
}
