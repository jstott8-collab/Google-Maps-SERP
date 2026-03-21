import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const VALID_EVENT_TYPES = [
    'SCAN_COMPLETE',
    'RANK_CHANGE',
    'SCAN_FAILED',
    'REVIEW_COMPLETE',
] as const;

function isValidUrl(str: string): boolean {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

export async function GET() {
    try {
        const webhooks = await prisma.webhook.findMany({
            orderBy: { createdAt: 'desc' },
        });

        const parsed = webhooks.map((w) => ({
            ...w,
            events: JSON.parse(w.events) as string[],
        }));

        return NextResponse.json({ webhooks: parsed });
    } catch (error) {
        logger.error('Webhooks GET error', 'WEBHOOK', { error: String(error) });
        return NextResponse.json(
            { webhooks: [], error: 'Failed to fetch webhooks' },
            { status: 500 }
        );
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { url, events, secret } = body;

        // Validate url
        if (!url || typeof url !== 'string' || !isValidUrl(url)) {
            return NextResponse.json(
                { error: 'A valid HTTP/HTTPS url is required' },
                { status: 400 }
            );
        }

        // Validate events
        if (!Array.isArray(events) || events.length === 0) {
            return NextResponse.json(
                { error: 'events must be a non-empty array' },
                { status: 400 }
            );
        }

        const invalidEvents = events.filter(
            (e: unknown) => typeof e !== 'string' || !(VALID_EVENT_TYPES as readonly string[]).includes(e)
        );
        if (invalidEvents.length > 0) {
            return NextResponse.json(
                {
                    error: `Invalid event types: ${invalidEvents.join(', ')}. Valid types: ${VALID_EVENT_TYPES.join(', ')}`,
                },
                { status: 400 }
            );
        }

        const webhook = await prisma.webhook.create({
            data: {
                url,
                events: JSON.stringify(events),
                secret: secret || null,
            },
        });

        logger.info(`Webhook created: ${webhook.id} -> ${url}`, 'WEBHOOK', {
            events,
        });

        return NextResponse.json({
            ...webhook,
            events: JSON.parse(webhook.events) as string[],
        });
    } catch (error) {
        logger.error('Webhook creation failed', 'WEBHOOK', {
            error: String(error),
        });
        return NextResponse.json(
            { error: 'Failed to create webhook', details: String(error) },
            { status: 500 }
        );
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json(
                { error: 'id query parameter is required' },
                { status: 400 }
            );
        }

        await prisma.webhook.delete({ where: { id } });

        logger.info(`Webhook deleted: ${id}`, 'WEBHOOK');

        return NextResponse.json({ success: true, id });
    } catch (error) {
        logger.error('Webhook deletion failed', 'WEBHOOK', {
            error: String(error),
        });
        return NextResponse.json(
            { error: 'Failed to delete webhook', details: String(error) },
            { status: 500 }
        );
    }
}
