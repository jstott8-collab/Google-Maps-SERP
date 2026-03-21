import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const DEFAULTS: Record<string, string> = {
  wl_company_name: 'GeoRanker',
  wl_logo_url: '',
  wl_brand_color: '#3B82F6',
  wl_favicon_url: '',
  wl_support_email: '',
  wl_custom_domain: '',
};

const WL_KEYS = Object.keys(DEFAULTS);

const HEX_COLOR_RE = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export async function GET() {
  try {
    const rows = await prisma.globalSetting.findMany({
      where: { key: { in: WL_KEYS } },
    });

    const settings: Record<string, string> = { ...DEFAULTS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({ settings });
  } catch (error) {
    logger.error('White-label GET error', 'WHITELABEL', { error: String(error) });
    return NextResponse.json({ settings: {}, error: 'Failed to fetch white-label settings' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();

    if (body.brand_color !== undefined && !HEX_COLOR_RE.test(body.brand_color)) {
      return NextResponse.json({ error: 'Invalid hex color for brand_color' }, { status: 400 });
    }

    const updates: Record<string, string> = {};
    for (const shortKey of Object.keys(DEFAULTS).map((k) => k.replace('wl_', ''))) {
      if (body[shortKey] !== undefined) {
        updates[`wl_${shortKey}`] = String(body[shortKey]);
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 });
    }

    const results = await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        prisma.globalSetting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    );

    const settings: Record<string, string> = { ...DEFAULTS };
    for (const row of results) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({ settings });
  } catch (error) {
    logger.error('White-label PUT error', 'WHITELABEL', { error: String(error) });
    return NextResponse.json({ error: 'Failed to update white-label settings' }, { status: 500 });
  }
}
