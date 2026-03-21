import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const proxies = await prisma.proxy.findMany({
            orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ proxies });
    } catch (error) {
        logger.error('Proxies GET error', 'PROXY', { error: String(error) });
        return NextResponse.json({ proxies: [], error: 'Failed to fetch proxies' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const data = await req.json();

        if (!data.host || !data.port) {
            return NextResponse.json({ error: 'Host and Port are required' }, { status: 400 });
        }

        const port = parseInt(data.port);
        if (isNaN(port)) {
            return NextResponse.json({ error: 'Invalid port number' }, { status: 400 });
        }

        // Check for duplicates
        const existing = await prisma.proxy.findFirst({
            where: {
                host: data.host,
                port: port
            }
        });

        if (existing) {
            return NextResponse.json({ error: 'Proxy already exists in pool' }, { status: 409 });
        }

        const proxy = await prisma.proxy.create({
            data: {
                host: data.host,
                port: port,
                username: data.username || null,
                password: data.password || null,
                type: data.type || 'RESIDENTIAL',
                enabled: data.enabled !== undefined ? data.enabled : true,
            },
        });
        return NextResponse.json(proxy);
    } catch (error: any) {
        logger.error('Proxy creation failed', 'PROXY', { message: error.message, code: error.code });
        return NextResponse.json({
            error: 'Failed to create proxy',
            details: error.message
        }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const { id, ...data } = await req.json();
        const proxy = await prisma.proxy.update({
            where: { id },
            data: {
                ...data,
                port: data.port ? parseInt(data.port) : undefined,
            },
        });
        return NextResponse.json(proxy);
    } catch (error) {
        logger.error('Proxy update failed', 'PROXY', { error: String(error) });
        return NextResponse.json({ error: 'Failed to update proxy' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (id === 'all') {
            await prisma.proxy.deleteMany({});
            return NextResponse.json({ success: true, message: 'Proxy pool purged' });
        }

        if (!id) throw new Error('Proxy ID required');

        await prisma.proxy.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Proxy delete failed', 'PROXY', { error: String(error) });
        return NextResponse.json({ error: 'Failed to delete proxy' }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const { action } = await req.json();
        const { validateProxyBatch } = await import('@/lib/proxy-tester');

        if (action === 'VALIDATE_ALL') {
            const proxies = await prisma.proxy.findMany({
                where: { enabled: true }
            });

            logger.info(`Validating ${proxies.length} proxies`, 'PROXY');

            // Limit to top 100 for safety in single request
            const poolToTest = proxies.slice(0, 100);
            const results = await validateProxyBatch(poolToTest, 20);

            for (const res of results) {
                await prisma.proxy.update({
                    where: { id: res.id },
                    data: {
                        status: res.success ? 'ACTIVE' : 'DEAD',
                        lastTestedAt: new Date()
                    }
                });
            }

            return NextResponse.json({
                success: true,
                tested: results.length,
                active: results.filter(r => r.success).length,
                dead: results.filter(r => !r.success).length
            });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    } catch (error: any) {
        logger.error('Proxy validation failed', 'PROXY', { error: error.message });
        return NextResponse.json({ error: 'Proxy validation failed' }, { status: 500 });
    }
}
