'use client';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <html>
            <body>
                <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
                    <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#111827', marginBottom: '1rem' }}>Something went wrong</h2>
                        <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.5rem' }}>
                            A critical error occurred. Please try again.
                        </p>
                        <button
                            onClick={reset}
                            style={{ padding: '0.5rem 1rem', backgroundColor: '#2563eb', color: 'white', fontSize: '0.875rem', fontWeight: 700, borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}
                        >
                            Try Again
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
