'use client';

import { AlertCircle, Camera, CheckCircle2, RotateCcw, ScanLine, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ScanState } from '@/hooks/useCredentialVerification';

export const QR_READER_ID = 'credential-qr-reader';

const FAILED_SCAN_STATES: ScanState[] = [
    'permission-denied',
    'no-camera',
    'invalid',
    'unsupported',
    'error',
];

/**
 * The state before a token is known: enter an ID, or scan a QR code.
 *
 * Extracted from the page so the report states no longer share a file with two
 * hundred lines of scanner handling (ACREDIA-STELLAR#226).
 */
export function VerifyEntry({
    manualToken,
    setManualToken,
    onVerify,
    scanMode,
    setScanMode,
    scanState,
    scanMessage,
    startScanner,
}: {
    manualToken: string;
    setManualToken: (value: string) => void;
    onVerify: () => void;
    scanMode: boolean;
    setScanMode: (value: boolean) => void;
    scanState: ScanState;
    scanMessage: string;
    startScanner: () => void;
}) {
    const failed = FAILED_SCAN_STATES.includes(scanState);

    return (
        <div className="space-y-4">
            <Card className="p-5 sm:p-6">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Check a credential
                </h2>

                <div className="mt-4 space-y-3">
                    <label
                        htmlFor="manual-token"
                        className="block text-sm font-medium text-foreground"
                    >
                        Credential token ID
                    </label>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Input
                            id="manual-token"
                            value={manualToken}
                            onChange={(event) => setManualToken(event.target.value)}
                            onKeyDown={(event) => event.key === 'Enter' && onVerify()}
                            placeholder="e.g. 1"
                            className="sm:flex-1"
                        />
                        <Button
                            onClick={onVerify}
                            disabled={!manualToken.trim()}
                            className="sm:w-auto"
                        >
                            <Shield className="h-4 w-4" />
                            Verify
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        The token ID appears on the credential itself and inside its QR code.
                    </p>
                </div>
            </Card>

            <Card className="p-5 sm:p-6">
                {!scanMode ? (
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                <Camera className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                                <h2 className="text-sm font-semibold text-foreground">
                                    Scan a QR code
                                </h2>
                                <p className="mt-1 max-w-prose text-sm text-muted-foreground">
                                    Camera permission is requested only when you start scanning.
                                </p>
                            </div>
                        </div>
                        <Button onClick={startScanner} variant="outline" className="shrink-0">
                            <ScanLine className="h-4 w-4" />
                            Start scan
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="text-sm font-semibold text-foreground">
                                    Scan credential QR
                                </h2>
                                <p className="mt-1 text-sm text-muted-foreground">{scanMessage}</p>
                            </div>
                            <Button
                                onClick={() => setScanMode(false)}
                                variant="outline"
                                size="sm"
                                className="shrink-0"
                            >
                                Stop
                            </Button>
                        </div>

                        <div className="relative overflow-hidden rounded-xl border border-border bg-foreground">
                            <div
                                id={QR_READER_ID}
                                className="min-h-[280px] w-full sm:min-h-[340px]"
                            />
                            {scanState === 'requesting' && (
                                <div className="absolute inset-x-0 bottom-0 bg-foreground/80 px-4 py-3 text-center text-sm font-medium text-background">
                                    Requesting camera access…
                                </div>
                            )}
                        </div>

                        <div
                            className={cn(
                                'rounded-xl border px-4 py-3 text-sm',
                                failed
                                    ? 'border-destructive/30 bg-destructive/8 text-foreground'
                                    : scanState === 'success'
                                      ? 'border-success/30 bg-success/8 text-foreground'
                                      : 'border-border bg-secondary/50 text-foreground',
                            )}
                            role="status"
                            aria-live="polite"
                            aria-atomic="true"
                        >
                            <span className="flex items-start gap-2">
                                {scanState === 'success' ? (
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                                ) : failed ? (
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                ) : (
                                    <ScanLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                )}
                                <span className="min-w-0">{scanMessage}</span>
                            </span>
                        </div>

                        {failed && (
                            <Button onClick={startScanner} variant="outline" className="w-full">
                                <RotateCcw className="h-4 w-4" />
                                Try scanner again
                            </Button>
                        )}
                    </div>
                )}
            </Card>
        </div>
    );
}
