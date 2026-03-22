import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search')?.trim();

        const businesses = await prisma.savedBusiness.findMany({
            where: search
                ? { name: { contains: search } }
                : undefined,
            orderBy: { name: 'asc' },
        });

        return NextResponse.json({ businesses });
    } catch (error) {
        logger.error('Businesses GET error', 'BUSINESSES', { error: String(error) });
        return NextResponse.json({ businesses: [], error: 'Failed to fetch businesses' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const name = typeof body.name === 'string' ? body.name.trim() : '';

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        const business = await prisma.savedBusiness.create({
            data: {
                name,
                placeId: body.placeId ?? null,
                address: body.address ?? null,
                phone: body.phone ?? null,
                website: body.website ?? null,
                category: body.category ?? null,
                googleUrl: body.googleUrl ?? null,
                lat: body.lat ?? null,
                lng: body.lng ?? null,
                notes: body.notes ?? null,
            },
        });

        return NextResponse.json(business, { status: 201 });
    } catch (error) {
        logger.error('Business create failed', 'BUSINESSES', { error: String(error) });
        return NextResponse.json({ error: 'Failed to create business' }, { status: 500 });
    }
}

export async function PUT(req: Request) {
    try {
        const body = await req.json();
        const { id, ...fields } = body;

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        // Only include fields that were explicitly provided
        const data: Record<string, unknown> = { updatedAt: new Date() };
        const allowed = ['name', 'placeId', 'address', 'phone', 'website', 'category', 'googleUrl', 'lat', 'lng', 'notes'];
        for (const key of allowed) {
            if (key in fields) {
                data[key] = fields[key];
            }
        }

        if (data.name !== undefined && (typeof data.name !== 'string' || !(data.name as string).trim())) {
            return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
        }

        const business = await prisma.savedBusiness.update({
            where: { id },
            data,
        });

        return NextResponse.json(business);
    } catch (error) {
        logger.error('Business update failed', 'BUSINESSES', { error: String(error) });
        return NextResponse.json({ error: 'Failed to update business' }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'ID is required' }, { status: 400 });
        }

        const existing = await prisma.savedBusiness.findUnique({ where: { id } });
        if (!existing) {
            return NextResponse.json({ error: 'Business not found' }, { status: 404 });
        }

        await prisma.savedBusiness.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error('Business delete failed', 'BUSINESSES', { error: String(error) });
        return NextResponse.json({ error: 'Failed to delete business' }, { status: 500 });
    }
}
