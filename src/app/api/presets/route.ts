import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET() {
    try {
        const presets = await prisma.gridPreset.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json({ presets });
    } catch (error) {
        logger.error('Presets GET error', 'PRESETS', { error: String(error) });
        return NextResponse.json({ presets: [], error: 'Failed to fetch presets' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { name, centerLat, centerLng, radius, description, gridSize, shape, customPoints, locationName } = body;

        if (!name || typeof name !== 'string' || !name.trim()) {
            return NextResponse.json({ error: 'name is required and must be a non-empty string' }, { status: 400 });
        }
        if (centerLat == null || centerLng == null || radius == null) {
            return NextResponse.json({ error: 'centerLat, centerLng, and radius are required' }, { status: 400 });
        }

        const preset = await prisma.gridPreset.create({
            data: {
                name: name.trim(),
                description: description ?? null,
                centerLat: Number(centerLat),
                centerLng: Number(centerLng),
                radius: Number(radius),
                gridSize: gridSize != null ? Number(gridSize) : undefined,
                shape: shape ?? undefined,
                customPoints: customPoints != null
                    ? (typeof customPoints === 'object' ? JSON.stringify(customPoints) : String(customPoints))
                    : null,
                locationName: locationName ?? null,
            }
        });

        logger.info(`Preset created: ${preset.name}`, 'PRESETS', { id: preset.id });
        return NextResponse.json({ preset }, { status: 201 });
    } catch (error) {
        logger.error('Preset creation failed', 'PRESETS', { error: String(error) });
        return NextResponse.json({ error: 'Failed to create preset' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'id query param is required' }, { status: 400 });
        }

        const existing = await prisma.gridPreset.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Preset not found' }, { status: 404 });
        }

        await prisma.gridPreset.delete({ where: { id } });
        logger.info(`Preset deleted: ${existing.name}`, 'PRESETS', { id });
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Preset delete failed', 'PRESETS', { error: String(error) });
        return NextResponse.json({ error: 'Failed to delete preset' }, { status: 500 });
    }
}
