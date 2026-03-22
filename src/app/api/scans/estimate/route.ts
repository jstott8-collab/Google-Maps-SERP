import { NextResponse } from 'next/server';

// Estimates scan duration based on grid configuration
// No DB access needed — pure calculation
export async function POST(req: Request) {
    try {
        const { gridSize, radius, shape } = await req.json();

        const parsedGridSize = Math.min(Math.max(parseInt(gridSize) || 3, 1), 15);
        const parsedRadius = Math.min(Math.max(parseFloat(radius) || 5, 0.5), 100);

        // Calculate total grid points based on shape
        let totalPoints: number;
        switch (shape) {
            case 'CIRCLE': {
                // Circle inscribed in square grid — pi/4 ratio
                const squarePoints = parsedGridSize * parsedGridSize;
                totalPoints = Math.round(squarePoints * 0.785);
                break;
            }
            case 'SMART': {
                // Ring-based: center + 3 rings with increasing point counts
                totalPoints = 1 + 6 + 12 + 18; // 37 points for standard SMART
                if (parsedRadius > 10) totalPoints += 24; // Extra ring for large radius
                break;
            }
            default: // SQUARE
                totalPoints = parsedGridSize * parsedGridSize;
        }

        // Time estimates based on observed scraping performance
        const avgSecondsPerPoint = 4; // ~4s per point (scrape + delay)
        const delayBetweenPoints = 3.5; // avg random delay (2-5s)
        const browserSetupSeconds = 5;
        const completionProcessingSeconds = 3;

        const totalSeconds = browserSetupSeconds
            + (totalPoints * (avgSecondsPerPoint + delayBetweenPoints))
            + completionProcessingSeconds;

        const minutes = Math.ceil(totalSeconds / 60);

        // Format human-readable estimate
        let estimate: string;
        if (minutes <= 1) estimate = 'Less than a minute';
        else if (minutes < 60) estimate = `About ${minutes} minutes`;
        else {
            const hrs = Math.floor(minutes / 60);
            const mins = minutes % 60;
            estimate = mins > 0 ? `About ${hrs}h ${mins}m` : `About ${hrs} hour${hrs > 1 ? 's' : ''}`;
        }

        return NextResponse.json({
            totalPoints,
            estimatedSeconds: Math.round(totalSeconds),
            estimatedMinutes: minutes,
            estimate,
            breakdown: {
                pointsPerSide: parsedGridSize,
                shape: shape || 'SQUARE',
                radius: parsedRadius,
                avgTimePerPoint: `${(avgSecondsPerPoint + delayBetweenPoints).toFixed(1)}s`,
            }
        });
    } catch {
        return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }
}
