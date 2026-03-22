import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

// Topic detection patterns and corresponding responses by sentiment
const TOPIC_PATTERNS: {
    keywords: RegExp;
    positive: string;
    negative: string;
    neutral: string;
}[] = [
    {
        keywords: /\b(staff|team|employee|employees|service|server|waiter|waitress|crew|manager)\b/i,
        positive: "We're glad you noticed our team's dedication.",
        negative: "We'll be addressing this with our team immediately.",
        neutral: "We'll share your feedback with our team.",
    },
    {
        keywords: /\b(food|meal|dish|dishes|menu|cuisine|cook|chef|taste|flavor|delicious)\b/i,
        positive: "We're happy you enjoyed our food!",
        negative: "We'll share your feedback with our kitchen team.",
        neutral: "We appreciate your thoughts on our menu.",
    },
    {
        keywords: /\b(price|prices|cost|expensive|value|cheap|afford|overpriced|pricey)\b/i,
        positive: "We strive to provide great value.",
        negative: "We understand value is important and will review our pricing.",
        neutral: "We strive to provide great value.",
    },
    {
        keywords: /\b(clean|dirty|hygiene|filthy|spotless|sanitary|mess|tidy|neat)\b/i,
        positive: "We take pride in maintaining a clean environment.",
        negative: "We take cleanliness very seriously and will address this right away.",
        neutral: "We appreciate your feedback on our cleanliness standards.",
    },
    {
        keywords: /\b(wait|slow|fast|quick|long time|forever|speedy|prompt|delay|delayed|rushing)\b/i,
        positive: "We're glad the experience was smooth and timely!",
        negative: "We understand your time is valuable and will work on improving our speed.",
        neutral: "We appreciate your feedback regarding our timing.",
    },
];

function extractTopicReference(text: string | null, sentiment: 'positive' | 'negative' | 'neutral'): string {
    if (!text) return '';
    for (const pattern of TOPIC_PATTERNS) {
        if (pattern.keywords.test(text)) {
            return pattern[sentiment];
        }
    }
    return '';
}

type TemplateDef = { tone: string; template: string };

const TEMPLATES_5_STAR: TemplateDef[] = [
    {
        tone: 'grateful',
        template: "Thank you so much for your wonderful review, {reviewerName}! We're thrilled to hear {topic_reference}. Your support means the world to us at {businessName}!",
    },
    {
        tone: 'personal',
        template: "Hi {reviewerName}, your kind words made our day! {topic_reference} We truly appreciate you taking the time to share your experience.",
    },
    {
        tone: 'invite-back',
        template: "{reviewerName}, thank you for the amazing feedback! {topic_reference} We look forward to welcoming you back soon.",
    },
];

const TEMPLATES_4_STAR: TemplateDef[] = [
    {
        tone: 'appreciative',
        template: "Thank you for the great review, {reviewerName}! {topic_reference} We're always working to improve and would love to earn that 5th star next time!",
    },
    {
        tone: 'open-to-feedback',
        template: "Hi {reviewerName}, we appreciate your feedback! {topic_reference} If there's anything we can do better, we'd love to hear about it.",
    },
    {
        tone: 'striving',
        template: "Thanks for sharing your experience, {reviewerName}! {topic_reference} We value your honest feedback and will keep striving for excellence.",
    },
];

const TEMPLATES_3_STAR: TemplateDef[] = [
    {
        tone: 'constructive',
        template: "Thank you for your honest feedback, {reviewerName}. {topic_reference} We take your comments seriously and would love the opportunity to improve your next experience.",
    },
    {
        tone: 'reach-out',
        template: "Hi {reviewerName}, we appreciate you taking the time to share your thoughts. {topic_reference} Please reach out to us directly so we can address your concerns.",
    },
    {
        tone: 'committed',
        template: "{reviewerName}, thanks for letting us know. {topic_reference} We're committed to doing better and hope to exceed your expectations next time.",
    },
];

const TEMPLATES_NEGATIVE: TemplateDef[] = [
    {
        tone: 'apologetic',
        template: "We're truly sorry about your experience, {reviewerName}. {topic_reference} This is not the standard we hold ourselves to. Please contact us at {businessName} so we can make this right.",
    },
    {
        tone: 'resolution',
        template: "Hi {reviewerName}, thank you for bringing this to our attention. {topic_reference} We sincerely apologize and would like the chance to resolve this. Please reach out to us directly.",
    },
    {
        tone: 'improvement',
        template: "{reviewerName}, we're disappointed to hear about your experience. {topic_reference} Your feedback helps us improve, and we'd appreciate the opportunity to discuss this further.",
    },
];

function getTemplatesForRating(rating: number): TemplateDef[] {
    if (rating >= 5) return TEMPLATES_5_STAR;
    if (rating === 4) return TEMPLATES_4_STAR;
    if (rating === 3) return TEMPLATES_3_STAR;
    return TEMPLATES_NEGATIVE;
}

function sentimentFromRating(rating: number): 'positive' | 'negative' | 'neutral' {
    if (rating >= 4) return 'positive';
    if (rating === 3) return 'neutral';
    return 'negative';
}

function fillTemplate(template: string, vars: Record<string, string>): string {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
        result = result.replaceAll(`{${key}}`, value);
    }
    // Clean up double spaces from empty topic_reference
    return result.replace(/  +/g, ' ').trim();
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const review = await prisma.review.findUnique({ where: { id } });
        if (!review) {
            return NextResponse.json({ error: 'Review not found' }, { status: 404 });
        }

        const analysis = await prisma.reviewAnalysis.findUnique({
            where: { id: review.analysisId },
        });
        const businessName = analysis?.businessName ?? 'our business';

        const sentiment = sentimentFromRating(review.rating);
        const topicRef = extractTopicReference(review.text, sentiment);
        const templateDefs = getTemplatesForRating(review.rating);

        const templates = templateDefs.map((def) => ({
            tone: def.tone,
            text: fillTemplate(def.template, {
                reviewerName: review.reviewerName,
                businessName,
                topic_reference: topicRef,
            }),
        }));

        return NextResponse.json({
            reviewId: review.id,
            reviewerName: review.reviewerName,
            rating: review.rating,
            businessName,
            hasExistingResponse: review.responseText != null,
            templates,
        });
    } catch (error: any) {
        logger.error('Review templates GET error', 'REVIEWS', { error: error.message });
        return NextResponse.json(
            { error: 'Failed to generate templates', details: error.message },
            { status: 500 }
        );
    }
}
