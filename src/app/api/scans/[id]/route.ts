import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

/**
 * Recursively convert all BigInt values in an object/array to Number,
 * and Date objects to ISO strings for safe JSON serialization.
 * SQLite raw queries return COUNT(*) and similar aggregates as BigInt,
 * which JSON.stringify cannot serialize.
 */
function sanitizeBigInts(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'bigint') return Number(obj);
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map(sanitizeBigInts);
    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            result[key] = sanitizeBigInts(value);
        }
        return result;
    }
    return obj;
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const url = new URL(request.url);
        const requestedRunId = url.searchParams.get('runId');

        const scan = await prisma.scan.findUnique({
            where: { id },
        });

        if (!scan) {
            return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
        }

        // Get all distinct runs for the timeline using raw SQL
        // (avoids Prisma client cache issues with new columns)
        // IMPORTANT: Sanitize ALL raw SQL results immediately to convert BigInt → Number
        // before any Date/Number operations, as SQLite returns BigInt for aggregates.
        const rawRuns: any[] = sanitizeBigInts(
            await prisma.$queryRaw(
                Prisma.sql`SELECT runId, MIN(runAt) as runAt, COUNT(*) as resultCount
                 FROM Result
                 WHERE scanId = ${id}
                 GROUP BY runId
                 ORDER BY MIN(runAt) ASC`
            )
        ) as any[];

        const runs = rawRuns.map(r => ({
            runId: r.runId || `${id}-legacy`,
            runAt: r.runAt ? new Date(r.runAt).toISOString() : scan.createdAt.toISOString(),
            resultCount: Number(r.resultCount),
        }));

        // Determine which run to show
        const activeRunId = requestedRunId || scan.currentRunId || (runs.length > 0 ? runs[runs.length - 1].runId : null);

        // Fetch results for the active run using raw query
        const results: any[] = sanitizeBigInts(
            activeRunId
                ? await prisma.$queryRaw(
                    Prisma.sql`SELECT * FROM Result WHERE scanId = ${id} AND runId = ${activeRunId}`
                )
                : await prisma.$queryRaw(
                    Prisma.sql`SELECT * FROM Result WHERE scanId = ${id}`
                )
        ) as any[];

        // Also sanitize the scan object (Prisma findUnique can also return BigInt in some SQLite configs)
        const safeScan = sanitizeBigInts(scan);

        return NextResponse.json({
            scan: { ...(safeScan as object), results },
            runs,
            activeRunId,
        });
    } catch (error: any) {
        logger.error('Scan GET error', 'SCANNER', { message: error?.message, stack: error?.stack });
        return NextResponse.json({ error: 'Failed to fetch scan', details: error?.message }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.result.deleteMany({ where: { scanId: id } });
        await prisma.scan.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Scan DELETE error', 'SCANNER', { error: String(error) });
        return NextResponse.json({ error: 'Failed to delete scan' }, { status: 500 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();

        // Whitelist only fields that should be updatable via PATCH
        const allowedFields = ['keyword', 'businessName', 'radius', 'frequency', 'gridSize', 'shape'];
        const safeData: Record<string, any> = {};
        for (const key of allowedFields) {
            if (body[key] !== undefined) {
                safeData[key] = body[key];
            }
        }

        if (Object.keys(safeData).length === 0) {
            return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
        }

        const scan = await prisma.scan.update({
            where: { id },
            data: safeData,
        });

        return NextResponse.json(scan);
    } catch (error) {
        logger.error('Scan PATCH error', 'SCANNER', { error: String(error) });
        return NextResponse.json({ error: 'Failed to update scan' }, { status: 500 });
    }
}
