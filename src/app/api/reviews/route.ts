import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scrapeGoogleReviews } from '@/lib/reviewScraper';
import { analyzeReviews } from '@/lib/reviewAnalyzer';
import { analyzeSentiment } from '@/lib/sentimentEngine';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const analyses = await prisma.reviewAnalysis.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                businessName: true,
                businessUrl: true,
                totalReviews: true,
                averageRating: true,
                status: true,
                error: true,
                createdAt: true,
            }
        });
        return NextResponse.json(analyses);
    } catch (error: any) {
        logger.error('Reviews GET error', 'REVIEWS', { error: error.message });
        return NextResponse.json({ error: 'Failed to fetch reviews' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const encoder = new TextEncoder();
    const customReadable = new TransformStream();
    const writer = customReadable.writable.getWriter();

    // Helper to send progress logs
    const sendLog = async (msg: string, type: 'info' | 'error' | 'success' = 'info') => {
        try {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ msg, type })}\n\n`));
        } catch { /* connection closed */ }
    };

    // Helper to send final result
    const sendResult = async (data: any) => {
        try {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ result: data, type: 'complete' })}\n\n`));
            await writer.close();
        } catch { /* connection closed */ }
    };

    // Run analysis loosely detached but piping logs
    (async () => {
        try {
            const body = await req.json();
            const { url, businessName, totalReviews, averageRating, placeId } = body;

            if (!url || typeof url !== 'string') {
                await sendLog('Business URL is required', 'error');
                await writer.close();
                return;
            }

            // Create entry
            await sendLog(`Creating analysis record for "${businessName}"...`);
            const analysis = await prisma.reviewAnalysis.create({
                data: {
                    businessName: businessName || 'Unknown Business',
                    businessUrl: url,
                    totalReviews: totalReviews || 0,
                    averageRating: averageRating || 0,
                    placeId: placeId || null,
                    status: 'SCRAPING',
                },
            });

            const runId = `${analysis.id}-run0`;
            const runAt = new Date().toISOString();

            // Set the initial currentRunId via raw SQL (Prisma client doesn't know this field)
            await prisma.$executeRawUnsafe(
                `UPDATE ReviewAnalysis SET currentRunId = ? WHERE id = ?`,
                runId, analysis.id
            );

            // Start scraping
            await sendLog(`Starting scrape for ${url}...`);

            // Pass a progress callback that writes to the stream
            const onProgress = (msg: string) => sendLog(msg);

            const { business, reviews } = await scrapeGoogleReviews(url, onProgress);

            await sendLog(`Scraped ${reviews.length} reviews. Saving to database...`);
            await prisma.reviewAnalysis.update({
                where: { id: analysis.id },
                data: {
                    businessName: business.name,
                    totalReviews: business.totalReviews,
                    averageRating: business.averageRating,
                    placeId: business.placeId,
                    status: 'ANALYZING',
                },
            });

            // Save reviews in chunks via raw SQL (runId/runAt are new fields)
            const chunkSize = 50;
            for (let i = 0; i < reviews.length; i += chunkSize) {
                const chunk = reviews.slice(i, i + chunkSize);
                for (const r of chunk) {
                    await prisma.$executeRawUnsafe(
                        `INSERT INTO Review (id, analysisId, runId, runAt, reviewerName, reviewerUrl, reviewImage, reviewCount, photoCount, rating, text, publishedDate, responseText, responseDate, sentimentScore, sentimentLabel, isLikelyFake, fakeScore)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL)`,
                        `${analysis.id}-r0-${i + chunk.indexOf(r)}`,
                        analysis.id, runId, runAt,
                        r.reviewerName || '', r.reviewerUrl || null, r.reviewImage || null,
                        r.reviewCount ?? null, r.photoCount ?? null, r.rating,
                        r.text || null, r.publishedDate || null,
                        r.responseText || null, r.responseDate || null
                    );
                }
                await sendLog(`Saved ${Math.min(i + chunkSize, reviews.length)} / ${reviews.length} reviews...`);
            }

            await sendLog('Running 150+ metric deep analysis...');
            const analysisResult = analyzeReviews(reviews);

            // Sentiment enrichment
            await sendLog('Analyzing sentiment and fake patterns...');
            const dbReviews = await prisma.review.findMany({
                where: { analysisId: analysis.id },
                select: { id: true, text: true, rating: true, reviewCount: true, photoCount: true }
            });

            // Batch sentiment updates (50 per transaction) instead of 1-by-1
            const SENTIMENT_BATCH_SIZE = 50;
            for (let i = 0; i < dbReviews.length; i += SENTIMENT_BATCH_SIZE) {
                const batch = dbReviews.slice(i, i + SENTIMENT_BATCH_SIZE);
                const updates = batch.map(r => {
                    const sent = analyzeSentiment(r.text, r.rating);

                    let fakeScore = 0;
                    if (!r.text || r.text.length < 20) fakeScore += 15;
                    if (r.reviewCount !== undefined && r.reviewCount <= 1) fakeScore += 20;
                    if (!r.photoCount) fakeScore += 5;
                    if ((r.rating === 1 || r.rating === 5) && (!r.text || r.text.length < 30)) fakeScore += 10;
                    if (r.text && r.rating === 5 && sent.label === 'NEGATIVE') fakeScore += 15;
                    if (r.text && r.rating === 1 && sent.label === 'POSITIVE') fakeScore += 15;

                    return prisma.review.update({
                        where: { id: r.id },
                        data: {
                            sentimentScore: sent.compound,
                            sentimentLabel: sent.label,
                            fakeScore: Math.min(fakeScore, 100),
                            isLikelyFake: fakeScore >= 50,
                        },
                    });
                });

                await prisma.$transaction(updates);

                if (i % 200 === 0) await sendLog(`Analyzed ${Math.min(i + SENTIMENT_BATCH_SIZE, dbReviews.length)} / ${dbReviews.length} reviews...`);
            }

            await prisma.reviewAnalysis.update({
                where: { id: analysis.id },
                data: {
                    analysisData: JSON.stringify(analysisResult),
                    status: 'COMPLETED',
                },
            });

            await sendLog(`Analysis complete! Redirecting...`, 'success');
            await sendResult(analysis);

        } catch (error: any) {
            logger.error('Review stream error', 'REVIEWS', { error: error.message });
            await sendLog(`Error: ${error.message}`, 'error');
            await writer.close();
        }
    })();

    return new NextResponse(customReadable.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
