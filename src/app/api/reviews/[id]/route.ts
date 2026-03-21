import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const url = new URL(req.url);
        const requestedRunId = url.searchParams.get('runId');

        const analysis = await prisma.reviewAnalysis.findUnique({
            where: { id },
        });

        if (!analysis) {
            return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
        }

        // Pagination params (default: page 1, 200 per page; use limit=0 for all)
        const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
        const limit = parseInt(url.searchParams.get('limit') || '200');
        const fetchAll = limit === 0;

        // Get currentRunId via raw SQL (Prisma client doesn't know this field)
        const currentRunIdResult: any[] = await prisma.$queryRaw(
            Prisma.sql`SELECT currentRunId FROM ReviewAnalysis WHERE id = ${id}`
        );
        const currentRunId = currentRunIdResult[0]?.currentRunId || null;

        // Get all distinct runs for history timeline via raw SQL
        const rawRuns: any[] = await prisma.$queryRaw(
            Prisma.sql`SELECT runId, MIN(runAt) as runAt, COUNT(*) as reviewCount
             FROM Review
             WHERE analysisId = ${id}
             GROUP BY runId
             ORDER BY MIN(runAt) ASC`
        );

        const runs = rawRuns.map((r: any, idx: number) => ({
            runId: r.runId || `${id}-legacy`,
            runAt: r.runAt ? new Date(r.runAt).toISOString() : analysis.createdAt.toISOString(),
            reviewCount: Number(r.reviewCount),
            label: `Run ${idx + 1}`,
        }));

        // Determine which run to show
        const activeRunId = requestedRunId || currentRunId || (runs.length > 0 ? runs[runs.length - 1].runId : null);

        // Build pagination SQL fragments
        const offset = (page - 1) * limit;
        const limitClause = fetchAll ? Prisma.sql`` : Prisma.sql` LIMIT ${limit} OFFSET ${offset}`;

        // Fetch reviews for the active run with pagination
        let reviews: any[];
        let totalReviewCount: number;
        if (activeRunId && runs.some(r => r.runId === activeRunId)) {
            const matchingRun = rawRuns.find(r => (r.runId || `${id}-legacy`) === activeRunId);
            if (matchingRun && matchingRun.runId) {
                reviews = await prisma.$queryRaw(
                    Prisma.sql`SELECT * FROM Review WHERE analysisId = ${id} AND runId = ${matchingRun.runId} ORDER BY rating ASC${limitClause}`
                );
                const countResult: any[] = await prisma.$queryRaw(
                    Prisma.sql`SELECT COUNT(*) as cnt FROM Review WHERE analysisId = ${id} AND runId = ${matchingRun.runId}`
                );
                totalReviewCount = Number(countResult[0]?.cnt || 0);
            } else {
                reviews = await prisma.$queryRaw(
                    Prisma.sql`SELECT * FROM Review WHERE analysisId = ${id} AND runId IS NULL ORDER BY rating ASC${limitClause}`
                );
                const countResult: any[] = await prisma.$queryRaw(
                    Prisma.sql`SELECT COUNT(*) as cnt FROM Review WHERE analysisId = ${id} AND runId IS NULL`
                );
                totalReviewCount = Number(countResult[0]?.cnt || 0);
            }
        } else {
            reviews = await prisma.$queryRaw(
                Prisma.sql`SELECT * FROM Review WHERE analysisId = ${id} ORDER BY rating ASC${limitClause}`
            );
            const countResult: any[] = await prisma.$queryRaw(
                Prisma.sql`SELECT COUNT(*) as cnt FROM Review WHERE analysisId = ${id}`
            );
            totalReviewCount = Number(countResult[0]?.cnt || 0);
        }

        // Convert SQLite booleans and BigInts for JSON serialization
        reviews = reviews.map((r: any) => ({
            ...r,
            isLikelyFake: Boolean(r.isLikelyFake),
            reviewCount: r.reviewCount != null ? Number(r.reviewCount) : null,
            photoCount: r.photoCount != null ? Number(r.photoCount) : null,
            rating: Number(r.rating),
            sentimentScore: r.sentimentScore != null ? Number(r.sentimentScore) : null,
            fakeScore: r.fakeScore != null ? Number(r.fakeScore) : null,
        }));

        return NextResponse.json({
            ...analysis,
            createdAt: analysis.createdAt.toISOString(),
            reviews,
            runs,
            activeRunId,
            pagination: fetchAll ? undefined : {
                page,
                limit,
                total: totalReviewCount,
                totalPages: Math.ceil(totalReviewCount / limit),
                hasMore: page * limit < totalReviewCount,
            },
        });
    } catch (error: any) {
        logger.error('Reviews detail GET error', 'REVIEWS', { error: error.message });
        return NextResponse.json({ error: 'Failed to fetch analysis', details: error.message }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        await prisma.reviewAnalysis.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: 'Failed to delete analysis', details: error.message }, { status: 500 });
    }
}
