import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
        return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    try {
        // Using Nominatim (OpenStreetMap) for free geocoding
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
            {
                headers: {
                    'User-Agent': 'GBPRankTracker/1.0',
                },
            }
        );

        const data = await response.json();

        if (data && data.length > 0) {
            return NextResponse.json({
                lat: parseFloat(data[0].lat),
                lng: parseFloat(data[0].lon),
                display_name: data[0].display_name,
            });
        }

        return NextResponse.json({ error: 'Address not found' }, { status: 404 });
    } catch (error) {
        console.error('Geocoding error:', error);
        return NextResponse.json({ error: 'Geocoding failed' }, { status: 500 });
    }
}
