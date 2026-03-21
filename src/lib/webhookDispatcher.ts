import { createHmac } from 'crypto';
import { prisma } from './prisma';
import { logger } from './logger';

const WEBHOOK_TIMEOUT_MS = 5000;

export async function dispatchWebhook(
    event: string,
    payload: Record<string, any>
): Promise<void> {
    let webhooks;
    try {
        webhooks = await prisma.webhook.findMany({
            where: { enabled: true },
        });
    } catch (error) {
        logger.error('Failed to fetch webhooks for dispatch', 'WEBHOOK', {
            event,
            error: String(error),
        });
        return;
    }

    // Filter to webhooks whose events JSON array contains this event type
    const matching = webhooks.filter((w) => {
        try {
            const events: string[] = JSON.parse(w.events);
            return events.includes(event);
        } catch {
            return false;
        }
    });

    if (matching.length === 0) {
        return;
    }

    const results = await Promise.allSettled(
        matching.map(async (webhook) => {
            const body = JSON.stringify({
                event,
                payload,
                timestamp: new Date().toISOString(),
            });

            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };

            if (webhook.secret) {
                const signature = createHmac('sha256', webhook.secret)
                    .update(body)
                    .digest('hex');
                headers['X-Webhook-Signature'] = signature;
            }

            const controller = new AbortController();
            const timeout = setTimeout(
                () => controller.abort(),
                WEBHOOK_TIMEOUT_MS
            );

            try {
                const response = await fetch(webhook.url, {
                    method: 'POST',
                    headers,
                    body,
                    signal: controller.signal,
                });

                logger.info(
                    `Webhook dispatched: ${webhook.id} -> ${webhook.url} (${response.status})`,
                    'WEBHOOK',
                    { event, webhookId: webhook.id, status: response.status }
                );
            } catch (error) {
                logger.error(
                    `Webhook dispatch failed: ${webhook.id} -> ${webhook.url}`,
                    'WEBHOOK',
                    {
                        event,
                        webhookId: webhook.id,
                        error: String(error),
                    }
                );
            } finally {
                clearTimeout(timeout);
            }
        })
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    logger.info(
        `Webhook dispatch complete for "${event}": ${succeeded} succeeded, ${failed} failed out of ${matching.length}`,
        'WEBHOOK',
        { event, total: matching.length, succeeded, failed }
    );
}
